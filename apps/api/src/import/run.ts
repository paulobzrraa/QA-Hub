import path from 'node:path'
import { existsSync } from 'node:fs'
import { parseWorkbook, parseBugs, parseTestUsers } from './xlsx.js'
import { prisma } from '../lib/db.js'
import { encrypt } from '../lib/crypto.js'

/**
 * Importa a planilha para o banco.
 *
 * A operação é idempotente: o ciclo é identificado por `sourceSheet`, então
 * rodar de novo após atualizar o xlsx substitui os cenários daquela aba sem
 * duplicar nada. Ciclos criados manualmente no sistema (sem `sourceSheet`)
 * nunca são tocados. Bugs usam a chave do Jira como equivalente ao
 * `sourceSheet` — é o identificador estável entre execuções.
 *
 *   npm run import -- "/caminho/para/planilha.xlsx"
 */
async function main() {
  const input = process.argv[2] ?? path.join(process.env.HOME ?? '', 'Downloads', 'Gerenciamento de Testes - Swift.xlsx')

  if (!existsSync(input)) {
    console.error(`Planilha não encontrada: ${input}`)
    process.exit(1)
  }

  console.log(`Lendo ${input}\n`)
  const { suites, people, warnings } = await parseWorkbook(input)

  // 1. Pessoas — cria as que ainda não existem, sem sobrescrever as atuais.
  const personIds = new Map<string, string>()
  for (const name of people) {
    const person = await prisma.person.upsert({
      where: { name },
      update: {},
      create: { name, role: 'QA' },
    })
    personIds.set(name, person.id)
  }

  // 2. Ciclos e cenários.
  let createdSuites = 0
  let updatedSuites = 0
  let totalCases = 0

  for (const suite of suites) {
    const responsibleId = suite.responsible ? personIds.get(suite.responsible) ?? null : null

    const data = {
      name: suite.name,
      jiraKey: suite.jiraKey,
      platform: suite.platform,
      squad: suite.squad,
      status: suite.status,
      startDate: suite.startDate,
      endDate: suite.endDate,
      notes: suite.notes,
      position: suite.position,
      responsibleId,
    }

    const existing = await prisma.testSuite.findUnique({ where: { sourceSheet: suite.sourceSheet } })

    const saved = existing
      ? await prisma.testSuite.update({ where: { id: existing.id }, data })
      : await prisma.testSuite.create({ data: { ...data, sourceSheet: suite.sourceSheet } })

    if (existing) updatedSuites += 1
    else createdSuites += 1

    // Códigos repetidos dentro da mesma aba existem na planilha; o banco tem
    // unicidade (ciclo, code), então desambiguamos com sufixo.
    const seen = new Set<string>()

    for (const item of suite.cases) {
      let code = item.code
      let attempt = 2
      while (seen.has(code)) code = `${item.code}-${attempt++}`
      seen.add(code)

      const data = {
        jiraKey: item.jiraKey,
        scenario: item.scenario,
        objective: item.objective,
        bdd: item.bdd,
        automated: item.automated,
        environment: item.environment,
        testData: item.testData,
        qaStatus: item.qaStatus,
        stageStatus: item.stageStatus,
        notes: item.notes,
        position: item.position,
        responsibleId: item.responsible ? personIds.get(item.responsible) ?? null : null,
      }

      // Atualiza no lugar em vez de apagar e recriar o ciclo inteiro.
      // O cenário mantém o mesmo `id`, e com ele tudo que foi pendurado nele
      // à mão: evidências enviadas (US-4.3) e bugs vinculados (US-2.5).
      // Antes da US-4.3 o importador fazia deleteMany + createMany, o que
      // apagava esses vínculos a cada reimportação — com arquivo de evidência
      // no meio, isso passaria de inconveniente a perda de dado.
      const saved_case = await prisma.testCase.upsert({
        where: { suiteId_code: { suiteId: saved.id, code } },
        update: data,
        create: { ...data, suiteId: saved.id, code },
      })

      // Evidência vinda da planilha é regenerada; a enviada por alguém
      // (`imported: false`) nunca é tocada.
      await prisma.evidence.deleteMany({ where: { caseId: saved_case.id, imported: true } })
      if (item.evidence) {
        await prisma.evidence.create({
          data: {
            caseId: saved_case.id,
            kind: /^https?:\/\//i.test(item.evidence) ? 'link' : 'reference',
            url: item.evidence,
            imported: true,
          },
        })
      }
    }

    // Cenário que sumiu da aba sai do ciclo — antes isso acontecia de graça,
    // pelo deleteMany; agora precisa ser explícito.
    const removed = await prisma.testCase.deleteMany({
      where: { suiteId: saved.id, code: { notIn: [...seen] } },
    })
    if (removed.count) {
      warnings.push(`Ciclo "${suite.name}": ${removed.count} cenário(s) removido(s) por não existirem mais na aba.`)
    }

    totalCases += suite.cases.length
  }

  // 3. Bugs — cada linha das abas "Bugs and Fixes" já é um bug completo.
  const bugReport = await parseBugs(input)
  warnings.push(...bugReport.warnings)

  // Responsáveis por bug reaproveitam pessoas já existentes (ex.: QAs que
  // também aparecem nas suítes); só quem é novo entra como DEV.
  for (const name of bugReport.people) {
    if (personIds.has(name)) continue
    const person = await prisma.person.upsert({
      where: { name },
      update: {},
      create: { name, role: 'DEV' },
    })
    personIds.set(name, person.id)
  }

  const areaIds = new Map<string, string>()
  const areaNames = [...new Set(bugReport.bugs.map((item) => item.affectedArea).filter(Boolean))] as string[]
  for (const name of areaNames) {
    const area = await prisma.affectedArea.upsert({ where: { name }, update: {}, create: { name } })
    areaIds.set(name, area.id)
  }

  let createdBugs = 0
  let updatedBugs = 0

  for (const bug of bugReport.bugs) {
    const data = {
      number: bug.number,
      platform: bug.platform,
      jiraKey: bug.jiraKey,
      relatedUs: bug.relatedUs,
      description: bug.description,
      severity: bug.severity,
      status: bug.status,
      responsibleId: bug.responsible ? personIds.get(bug.responsible) ?? null : null,
      affectedAreaId: bug.affectedArea ? areaIds.get(bug.affectedArea) ?? null : null,
      reportedDate: bug.reportedDate,
      fixedDate: bug.fixedDate,
      notes: bug.notes,
    }

    // Idempotente pela chave do Jira; sem ela, cai no par (plataforma, número).
    const existing = bug.jiraKey
      ? await prisma.bug.findUnique({ where: { jiraKey: bug.jiraKey } })
      : await prisma.bug.findUnique({
          where: { platform_number: { platform: bug.platform, number: bug.number } },
        })

    if (existing) {
      await prisma.bug.update({ where: { id: existing.id }, data })
      updatedBugs += 1
    } else {
      await prisma.bug.create({ data })
      createdBugs += 1
    }
  }

  // 4. Massa de usuários de teste (US-4.1) — abas "Users QA" e "Users PRD".
  const userReport = await parseTestUsers(input)
  warnings.push(...userReport.warnings)

  let createdUsers = 0
  let updatedUsers = 0

  for (const user of userReport.users) {
    const data = {
      email: user.email,
      cpf: user.cpf,
      // Cifrada já na entrada: a senha em texto puro não chega a existir no
      // banco nem por uma importação (US-4.2).
      password: encrypt(user.password),
      kind: user.kind,
      environment: user.environment,
      status: user.status,
      profile: user.profile,
      notes: user.notes,
    }

    // Idempotente pela origem (aba + linha), porque nenhuma coluna da planilha
    // é única. Conta criada à mão no QA Hub tem `sourceSheet` nulo e não entra
    // nessa busca — uma reimportação nunca a sobrescreve.
    const existing = await prisma.testUser.findUnique({
      where: { sourceSheet_sourceRow: { sourceSheet: user.sourceSheet, sourceRow: user.sourceRow } },
    })

    if (existing) {
      await prisma.testUser.update({ where: { id: existing.id }, data })
      updatedUsers += 1
    } else {
      await prisma.testUser.create({
        data: { ...data, sourceSheet: user.sourceSheet, sourceRow: user.sourceRow },
      })
      createdUsers += 1
    }
  }

  console.log('Importação concluída')
  console.log(`  pessoas .......... ${people.length}`)
  console.log(`  ciclos criados ... ${createdSuites}`)
  console.log(`  ciclos atualizados ${updatedSuites}`)
  console.log(`  cenários ......... ${totalCases}`)
  console.log(`  áreas afetadas ... ${areaIds.size}`)
  console.log(`  bugs criados ..... ${createdBugs}`)
  console.log(`  bugs atualizados . ${updatedBugs}`)
  console.log(`  contas criadas ... ${createdUsers}`)
  console.log(`  contas atualizadas ${updatedUsers}`)

  if (warnings.length) {
    console.log(`\nAvisos (${warnings.length}):`)
    for (const warning of warnings) console.log(`  - ${warning}`)
  }

  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
