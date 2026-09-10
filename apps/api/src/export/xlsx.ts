import ExcelJS from 'exceljs'
import {
  computeMetrics, formatCpf, type CaseStatus,
  CASE_STATUS, SUITE_STATUS, ENVIRONMENT, SQUAD, BUG_SEVERITY, BUG_STATUS,
  USER_KIND, USER_ENV, USER_STATUS,
} from '@qahub/shared'
import { prisma } from '../lib/db.js'

/**
 * Exportação no formato da planilha original (US-4.4).
 *
 * Reproduz a ESTRUTURA das abas de origem — mesmas colunas, mesma ordem,
 * mesmas larguras — para quem ainda depende do xlsx conseguir usar o arquivo
 * sem reaprender nada.
 *
 * Os `dataValidation`, porém, são gerados a partir do domínio canônico de
 * `@qahub/shared`, e não copiados das listas da planilha: lá cada aba trazia a
 * sua própria lista, desatualizada e divergente — a de bugs do App aceitava
 * `Done` e a do Web `Resolved` para o mesmo estado, a de severidade do Web não
 * tinha `Highest`, e o `Squad` da aba "2. Progress" só listava `App`. Copiar
 * isso de volta reintroduziria justamente a divergência que o QA Hub eliminou.
 */

/**
 * Estreita o cenário do Prisma para o que `computeMetrics` espera. O SQLite
 * não tem enum, então os status chegam como `string`; a validação de domínio
 * acontece na borda da API, não aqui.
 */
function roll(item: { automated: boolean; qaStatus: string; stageStatus: string }) {
  return {
    automated: item.automated,
    qaStatus: item.qaStatus as CaseStatus,
    stageStatus: item.stageStatus as CaseStatus,
  }
}

/** Lista de validação do Excel: valores entre aspas, separados por vírgula. */
function listValidation(values: readonly string[]) {
  return {
    type: 'list' as const,
    allowBlank: true,
    formulae: [`"${values.join(',')}"`],
  }
}

/**
 * Aplica a validação numa coluna inteira de dados.
 *
 * O Excel tem um teto de 255 caracteres para lista literal. A lista de pessoas
 * passa disso com facilidade num time grande, então nesse caso a validação é
 * omitida em vez de gerar um arquivo que o Excel abre reclamando.
 */
function applyValidation(
  sheet: ExcelJS.Worksheet,
  column: number,
  values: readonly string[],
  firstRow: number,
  lastRow: number,
) {
  if (!values.length) return
  const validation = listValidation(values)
  if (validation.formulae[0].length > 255) return
  for (let row = firstRow; row <= lastRow; row += 1) {
    sheet.getRow(row).getCell(column).dataValidation = validation
  }
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true }
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F4F7' } }
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } } }
  })
}

function setWidths(sheet: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width
  })
}

/**
 * Nome de aba válido no Excel: até 31 caracteres, sem `[]:*?/\`, e único no
 * arquivo. A planilha original já sofria esse corte — é por isso que existem
 * abas com nome truncado como "CMSConfigurar módulo de ger...".
 */
function sheetNamer() {
  const used = new Set<string>()
  return (raw: string): string => {
    const cleaned = (raw || 'Ciclo').replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31)
    let name = cleaned || 'Ciclo'
    let attempt = 2
    while (used.has(name.toLowerCase())) {
      const suffix = ` (${attempt++})`
      name = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`
    }
    used.add(name.toLowerCase())
    return name
  }
}

/**
 * Referência de aba para hyperlink interno. O apóstrofo precisa ser dobrado:
 * numa referência entre aspas simples, `Paulo's test` só é aceito pelo Excel
 * como `'Paulo''s test'`. Aspas duplas no nome não precisam de tratamento.
 */
function sheetRef(name: string): string {
  return `#'${name.replace(/'/g, "''")}'!A1`
}

export interface ExportScope {
  platform?: string
  squad?: string
  status?: string
  responsibleId?: string
  /** Busca livre por nome do ciclo ou chave do Jira. */
  q?: string
  suiteIds?: string[]
  /** Inclui as abas de massa de teste. Ligado por padrão. */
  includeUsers: boolean
  /** Inclui as abas de bugs. Ligado por padrão. */
  includeBugs: boolean
}

/** Cabeçalho das abas de cenário, na ordem exata da planilha. */
const CASE_HEADERS = [
  'ID', 'Jira', 'Scenario', 'Objective', 'Test Description (BDD)', 'Automation',
  'Environment', 'Test Data', 'Responsible', 'QA', 'Stage', 'Bugs', 'Evidence', 'Notes',
]
const CASE_WIDTHS = [7, 10, 35, 34, 50, 14, 14, 13, 16, 14, 14, 14, 16, 31]

const PROGRESS_HEADERS = [
  '', 'Jira', 'Test Cases', 'Squad', 'Status', 'Start Date', 'End Date', 'Scenarios',
  'Manual', 'Tested', 'Automation', 'Progress', 'Responsible', 'Bugs', 'Fixed', 'Notes',
]
const PROGRESS_WIDTHS = [3, 12, 39, 15, 15, 15, 15, 9, 9, 9, 10, 12, 16, 12, 12, 31]

export async function buildWorkbook(scope: ExportScope): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'QA Hub'
  workbook.created = new Date()

  const suites = await loadSuites(scope)

  const people = await prisma.person.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const personNames = people.map((person) => person.name)

  const nameFor = sheetNamer()
  const sheetNames = new Map<string, string>()
  for (const suite of suites) {
    // Preferimos o nome da aba de origem: quem já usa a planilha procura por ele.
    sheetNames.set(suite.id, nameFor(suite.sourceSheet ?? suite.name))
  }

  writeProgress(workbook, suites, sheetNames, personNames)
  for (const suite of suites) {
    writeCases(workbook, suite, sheetNames.get(suite.id)!, personNames)
  }

  if (scope.includeBugs) await writeBugs(workbook, scope.platform, personNames)
  if (scope.includeUsers) await writeUsers(workbook)

  return workbook
}

/**
 * Carrega os ciclos do escopo com tudo que as abas precisam. O tipo de retorno
 * alimenta `SuiteWithCases`, então mudar a consulta atualiza a tipagem sozinho.
 */
function loadSuites(scope: ExportScope) {
  return prisma.testSuite.findMany({
    where: {
      platform: scope.platform,
      squad: scope.squad,
      status: scope.status,
      responsibleId: scope.responsibleId,
      ...(scope.q
        ? { OR: [{ name: { contains: scope.q } }, { jiraKey: { contains: scope.q } }] }
        : {}),
      ...(scope.suiteIds?.length ? { id: { in: scope.suiteIds } } : {}),
    },
    include: {
      responsible: true,
      cases: {
        include: {
          responsible: true,
          bugs: { select: { id: true, jiraKey: true, number: true, status: true } },
          evidences: { select: { kind: true, url: true, originalName: true } },
        },
        orderBy: { position: 'asc' },
      },
    },
    orderBy: [{ platform: 'asc' }, { position: 'asc' }],
  })
}

type SuiteWithCases = Awaited<ReturnType<typeof loadSuites>>[number]

/** Aba "2. Progress": dois blocos empilhados, Mobile e Web, como no original. */
function writeProgress(
  workbook: ExcelJS.Workbook,
  suites: SuiteWithCases[],
  sheetNames: Map<string, string>,
  personNames: string[],
) {
  const sheet = workbook.addWorksheet('2. Progress')
  setWidths(sheet, PROGRESS_WIDTHS)

  // A planilha chama de "Mobile" o bloco que no QA Hub é a plataforma "App".
  const blocks: { banner: string; platform: string }[] = [
    { banner: 'Mobile', platform: 'App' },
    { banner: 'Web', platform: 'Web' },
  ]

  for (const block of blocks) {
    const rows = suites.filter((suite) => suite.platform === block.platform)
    if (!rows.length) continue

    const bannerRow = sheet.addRow([block.banner])
    sheet.mergeCells(bannerRow.number, 1, bannerRow.number, PROGRESS_HEADERS.length)
    bannerRow.font = { bold: true }
    bannerRow.getCell(1).alignment = { horizontal: 'center' }
    bannerRow.getCell(1).fill = {
      type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAECF0' },
    }

    const headerRow = sheet.addRow(PROGRESS_HEADERS)
    styleHeader(headerRow)
    const firstDataRow = headerRow.number + 1

    for (const suite of rows) {
      const metrics = computeMetrics(suite.cases.map(roll))
      // Contagem por bug DISTINTO: um mesmo bug ligado a dois cenários do
      // ciclo é um bug só. As colunas saem de vínculos bug↔cenário — é a
      // única ligação real entre bug e ciclo, já que `Bug` não tem `suiteId`.
      const suiteBugs = new Map<string, string>()
      for (const item of suite.cases) {
        for (const bug of item.bugs) suiteBugs.set(bug.id, bug.status)
      }
      const openBugs = suiteBugs.size
      const fixedBugs = [...suiteBugs.values()].filter((status) => status === 'Resolved').length
      const row = sheet.addRow([
        '',
        suite.jiraKey ?? '',
        suite.name,
        suite.squad ?? '',
        suite.status,
        suite.startDate ?? '',
        suite.endDate ?? '',
        metrics.total,
        metrics.manual,
        metrics.executionRate,
        metrics.automated,
        metrics.passRate,
        suite.responsible?.name ?? '',
        openBugs,
        fixedBugs,
        suite.notes ?? '',
      ])
      row.getCell(6).numFmt = 'dd/mm/yyyy'
      row.getCell(7).numFmt = 'dd/mm/yyyy'
      // `Tested` e `Progress` eram fração na planilha; mantemos fração + formato.
      row.getCell(10).numFmt = '0%'
      row.getCell(12).numFmt = '0%'

      // Link para a aba do ciclo, como no original.
      const target = sheetNames.get(suite.id)
      if (target) {
        row.getCell(3).value = { text: suite.name, hyperlink: sheetRef(target) }
        row.getCell(3).font = { color: { argb: 'FF175CD3' }, underline: true }
      }
    }

    const lastDataRow = sheet.rowCount
    applyValidation(sheet, 4, SQUAD, firstDataRow, lastDataRow)
    applyValidation(sheet, 5, SUITE_STATUS, firstDataRow, lastDataRow)
    applyValidation(sheet, 13, personNames, firstDataRow, lastDataRow)

    const totalRow = sheet.addRow(['', '', 'Total:', '', '', '', '',
      rows.reduce((sum, item) => sum + computeMetrics(item.cases.map(roll)).total, 0)])
    totalRow.font = { bold: true }
    sheet.addRow([])
  }
}

/** Uma aba por ciclo, com o mesmo layout de 14 colunas das abas de cenário. */
function writeCases(
  workbook: ExcelJS.Workbook,
  suite: SuiteWithCases,
  name: string,
  personNames: string[],
) {
  const sheet = workbook.addWorksheet(name)
  setWidths(sheet, CASE_WIDTHS)

  // Linha 1 é a navegação "Back" da planilha original.
  const backRow = sheet.addRow(['Back'])
  backRow.getCell(1).value = { text: 'Back', hyperlink: sheetRef('2. Progress') }
  backRow.getCell(1).font = { color: { argb: 'FF175CD3' }, underline: true }

  const headerRow = sheet.addRow(CASE_HEADERS)
  styleHeader(headerRow)
  const firstDataRow = headerRow.number + 1

  for (const item of suite.cases) {
    const bugs = item.bugs.map((bug) => bug.jiraKey ?? `#${bug.number}`).join(', ')
    // A coluna Evidence volta a ser texto: no xlsx não há como levar o arquivo
    // junto. Link externo sai como URL, arquivo enviado sai como nome — e a
    // referência original da planilha sai exatamente como entrou.
    const evidence = item.evidences
      .map((ev) => (ev.kind === 'link' || ev.kind === 'reference' ? ev.url : ev.originalName))
      .filter(Boolean)
      .join(', ')

    const row = sheet.addRow([
      item.code,
      item.jiraKey ?? '',
      item.scenario ?? '',
      item.objective ?? '',
      item.bdd ?? '',
      item.automated ? 'Yes' : 'No',
      item.environment ?? '',
      item.testData ?? '',
      item.responsible?.name ?? '',
      item.qaStatus,
      item.stageStatus,
      bugs,
      evidence,
      item.notes ?? '',
    ])
    row.alignment = { vertical: 'top', wrapText: true }
  }

  const lastDataRow = sheet.rowCount
  if (lastDataRow >= firstDataRow) {
    applyValidation(sheet, 6, ['Yes', 'No'], firstDataRow, lastDataRow)
    applyValidation(sheet, 7, ENVIRONMENT, firstDataRow, lastDataRow)
    applyValidation(sheet, 9, personNames, firstDataRow, lastDataRow)
    applyValidation(sheet, 10, CASE_STATUS, firstDataRow, lastDataRow)
    applyValidation(sheet, 11, CASE_STATUS, firstDataRow, lastDataRow)
  }
}

/**
 * Abas de bug. O original tinha layouts diferentes por plataforma — o do App
 * sem as colunas `US` e `Notes`, e com a descrição numa coluna sem título.
 * Aqui as duas saem com o layout completo do Web: manter a lacuna do App só
 * para ser fiel jogaria fora dado que o QA Hub tem.
 */
async function writeBugs(workbook: ExcelJS.Workbook, platform: string | undefined, personNames: string[]) {
  const headers = [
    'N°', 'Jira', 'US', 'Bug Description', 'Severity', 'Status', 'Responsible',
    'Creation Date', 'Fix date', 'Affected Area', 'Lead Time', 'Notes',
  ]
  const widths = [6, 12, 12, 42, 12, 17, 16, 16, 16, 20, 12, 29]

  const areas = await prisma.affectedArea.findMany({ orderBy: { name: 'asc' } })
  const areaNames = areas.map((area) => area.name)

  for (const target of ['App', 'Web']) {
    if (platform && platform !== target) continue

    const bugs = await prisma.bug.findMany({
      where: { platform: target },
      include: { responsible: true, affectedArea: true },
      orderBy: { number: 'asc' },
    })
    if (!bugs.length) continue

    const sheet = workbook.addWorksheet(`${target} Bugs and Fixes`)
    setWidths(sheet, widths)
    const headerRow = sheet.addRow(headers)
    styleHeader(headerRow)
    const firstDataRow = headerRow.number + 1

    for (const bug of bugs) {
      // Lead time recalculado por nós — na planilha essa coluna era uma
      // fórmula que devolvia `#NUM!` em toda linha ainda aberta.
      const lead = bug.reportedDate && bug.fixedDate
        ? Math.max(0, Math.round((bug.fixedDate.getTime() - bug.reportedDate.getTime()) / 86400000))
        : ''
      const row = sheet.addRow([
        bug.number, bug.jiraKey ?? '', bug.relatedUs ?? '', bug.description ?? '',
        bug.severity, bug.status, bug.responsible?.name ?? '',
        bug.reportedDate ?? '', bug.fixedDate ?? '',
        bug.affectedArea?.name ?? '', lead, bug.notes ?? '',
      ])
      row.getCell(8).numFmt = 'dd/mm/yyyy'
      row.getCell(9).numFmt = 'dd/mm/yyyy'
      row.alignment = { vertical: 'top', wrapText: true }
    }

    const lastDataRow = sheet.rowCount
    applyValidation(sheet, 5, BUG_SEVERITY, firstDataRow, lastDataRow)
    applyValidation(sheet, 6, BUG_STATUS, firstDataRow, lastDataRow)
    applyValidation(sheet, 7, personNames, firstDataRow, lastDataRow)
    applyValidation(sheet, 10, areaNames, firstDataRow, lastDataRow)
  }
}

/**
 * Abas de massa de teste.
 *
 * A coluna `Senha` existe na estrutura original e é mantida — mas sai VAZIA,
 * de propósito. A US-4.2 exige que a senha nunca apareça em exportação, e é
 * exatamente esse o risco que ela removeu: a planilha antiga trazia a senha em
 * texto puro em toda linha e circulava por e-mail. Preservar a coluna mantém a
 * estrutura; preencher desfaria a US-4.2.
 */
async function writeUsers(workbook: ExcelJS.Workbook) {
  const headers = ['Email', 'CPF', 'Senha', 'Tipo', 'Ambiente', 'Status', 'Perfil']
  const widths = [30, 18, 16, 8, 12, 12, 20]

  for (const environment of USER_ENV) {
    const users = await prisma.testUser.findMany({
      where: { environment },
      orderBy: { email: 'asc' },
    })
    if (!users.length) continue

    const sheet = workbook.addWorksheet(`Users ${environment}`)
    setWidths(sheet, widths)
    const headerRow = sheet.addRow(headers)
    styleHeader(headerRow)
    const firstDataRow = headerRow.number + 1

    for (const user of users) {
      sheet.addRow([
        user.email ?? '',
        formatCpf(user.cpf),
        '', // Senha: ver o comentário do bloco acima.
        user.kind ?? '',
        user.environment,
        user.status,
        user.profile ?? '',
      ])
    }

    const lastDataRow = sheet.rowCount
    applyValidation(sheet, 4, USER_KIND, firstDataRow, lastDataRow)
    applyValidation(sheet, 5, USER_ENV, firstDataRow, lastDataRow)
    applyValidation(sheet, 6, USER_STATUS, firstDataRow, lastDataRow)

    const note = sheet.addRow([])
    sheet.addRow([
      'As senhas não são exportadas: ficam cifradas no QA Hub e só saem sob ação explícita, com registro de acesso.',
    ])
    sheet.getRow(note.number + 1).font = { italic: true, color: { argb: 'FF667085' } }
  }
}
