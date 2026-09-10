import ExcelJS from 'exceljs'
import {
  toText, toDate, toBoolean, toCaseStatus, toSuiteStatus,
  toEnvironment, toSquad, toPersonNames, toBugSeverity, toBugStatus, fold,
  toUserKind, toUserStatus, normalizeCpf, digitsOnly,
  type Platform, type UserEnv,
} from '@qahub/shared'
import { resolveHeader, matchSheetsToProgress, type FieldKey } from './columns.js'
import { resolveBugHeader, type BugFieldKey } from './bug-columns.js'
import { resolveUserHeader, USER_SHEETS, type UserFieldKey } from './user-columns.js'

/** Abas que não contêm cenários de teste. */
const NON_SCENARIO_SHEETS = new Set(
  [
    '1. Summary', '2. Progress', '3. Timeline', '4. Final Report',
    'Users QA', 'Users PRD',
    'App Bugs and Fixes', 'App Bug tracking',
    'Web Bugs and Fixes', 'Web Bug tracking',
  ].map(fold),
)

export interface ParsedCase {
  code: string
  jiraKey: string | null
  scenario: string | null
  objective: string | null
  bdd: string | null
  automated: boolean
  environment: string | null
  testData: string | null
  responsible: string | null
  qaStatus: string
  stageStatus: string
  evidence: string | null
  notes: string | null
  position: number
}

export interface ParsedSuite {
  sourceSheet: string
  name: string
  jiraKey: string | null
  platform: Platform
  squad: string | null
  status: string
  startDate: Date | null
  endDate: Date | null
  responsible: string | null
  notes: string | null
  position: number
  cases: ParsedCase[]
}

export interface ImportReport {
  suites: ParsedSuite[]
  people: string[]
  warnings: string[]
}

/**
 * Extrai o valor útil de uma célula do ExcelJS.
 *
 * Uma célula pode ser fórmula (`{formula, result}`), texto rico
 * (`{richText: [...]}`) ou link (`{text, hyperlink}`) — e o texto de um link
 * pode ele próprio ser texto rico, por isso a função é recursiva.
 */
function cellValue(cell: ExcelJS.Cell | undefined): unknown {
  return unwrap(cell?.value)
}

function unwrap(value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value
  if (typeof value !== 'object') return value

  const record = value as Record<string, unknown>
  if ('error' in record) return null
  if ('richText' in record) {
    return (record.richText as { text: string }[]).map((part) => part.text).join('')
  }
  if ('result' in record) return unwrap(record.result)
  if ('text' in record) return unwrap(record.text)
  return null
}

interface ProgressRow {
  name: string
  jiraKey: string | null
  platform: Platform
  squad: string | null
  status: string
  startDate: Date | null
  endDate: Date | null
  responsible: string | null
  notes: string | null
}

/**
 * Lê a aba "2. Progress", que traz os metadados de cada ciclo.
 * A aba tem dois blocos empilhados — `Mobile` e `Web` — cada um com seu
 * próprio cabeçalho e uma linha de `Total:` ao final.
 */
function readProgress(workbook: ExcelJS.Workbook, warnings: string[]): ProgressRow[] {
  const sheet = workbook.getWorksheet('2. Progress')
  if (!sheet) {
    warnings.push('Aba "2. Progress" não encontrada; ciclos ficarão sem metadados.')
    return []
  }

  const rows: ProgressRow[] = []
  let platform: Platform = 'Web'

  sheet.eachRow((row) => {
    const b = toText(cellValue(row.getCell('B')))
    const c = toText(cellValue(row.getCell('C')))
    const e = toText(cellValue(row.getCell('E')))

    // As faixas "Mobile" e "Web" que separam os blocos são células mescladas:
    // o ExcelJS repete o mesmo texto em todas as colunas da linha. Detectar só
    // por "B preenchido e C vazio" não funciona.
    const marker = fold(b ?? '')
    const isBanner = Boolean(b) && (!c || fold(c) === marker)
    if (isBanner && ['mobile', 'app', 'web'].includes(marker)) {
      platform = marker === 'web' ? 'Web' : 'App'
      return
    }
    if (fold(b ?? '') === 'jira') return          // cabeçalho do bloco
    if (fold(e ?? '') === 'total:') return        // linha de totais
    if (!c) return

    rows.push({
      name: c,
      jiraKey: b,
      platform,
      squad: toSquad(cellValue(row.getCell('D'))),
      status: toSuiteStatus(cellValue(row.getCell('E'))) ?? 'To Do',
      startDate: toDate(cellValue(row.getCell('F'))),
      endDate: toDate(cellValue(row.getCell('G'))),
      responsible: toText(cellValue(row.getCell('M'))),
      notes: toText(cellValue(row.getCell('P'))),
    })
  })

  return rows
}

/** Localiza a linha de cabeçalho da aba de cenários (está na linha 1 ou 2). */
function findHeaderRow(sheet: ExcelJS.Worksheet): number | null {
  for (let index = 1; index <= Math.min(6, sheet.rowCount); index += 1) {
    const row = sheet.getRow(index)
    let hits = 0
    row.eachCell((cell) => {
      const title = toText(cellValue(cell))
      if (title && resolveHeader(title)) hits += 1
    })
    if (hits >= 3) return index
  }
  return null
}

export async function parseWorkbook(filePath: string): Promise<ImportReport> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const warnings: string[] = []
  const progress = readProgress(workbook, warnings)
  const people = new Set<string>()

  // Fase 1 — lê os cenários de cada aba, sem ainda decidir a que ciclo pertencem.
  const parsedSheets: { sheetName: string; cases: ParsedCase[] }[] = []

  workbook.eachSheet((sheet) => {
    if (NON_SCENARIO_SHEETS.has(fold(sheet.name))) return

    const headerRowIndex = findHeaderRow(sheet)
    if (headerRowIndex === null) {
      warnings.push(`Aba "${sheet.name}": cabeçalho não reconhecido, ignorada.`)
      return
    }

    // Mapeia coluna -> campo. Colunas não reconhecidas viram "extras",
    // preservadas nas notas para que nenhum dado da planilha se perca.
    const mapped = new Map<number, FieldKey>()
    const extras = new Map<number, string>()
    sheet.getRow(headerRowIndex).eachCell((cell, colNumber) => {
      const title = toText(cellValue(cell))
      if (!title) return
      const field = resolveHeader(title)
      if (field && ![...mapped.values()].includes(field)) mapped.set(colNumber, field)
      else extras.set(colNumber, title)
    })

    if (!mapped.size) {
      warnings.push(`Aba "${sheet.name}": nenhuma coluna reconhecida, ignorada.`)
      return
    }

    const cases: ParsedCase[] = []

    for (let index = headerRowIndex + 1; index <= sheet.rowCount; index += 1) {
      const row = sheet.getRow(index)
      const raw: Partial<Record<FieldKey, unknown>> = {}
      for (const [colNumber, field] of mapped) raw[field] = cellValue(row.getCell(colNumber))

      const scenario = toText(raw.scenario)
      const bdd = toText(raw.bdd)
      const objective = toText(raw.objective)

      // Linha vazia: o código (CT7) vem pré-preenchido, mas não há conteúdo.
      if (!scenario && !bdd && !objective) continue

      const extraNotes: string[] = []
      for (const [colNumber, title] of extras) {
        const value = toText(cellValue(row.getCell(colNumber)))
        if (value) extraNotes.push(`${title}: ${value}`)
      }

      const responsibleNames = toPersonNames(raw.responsible)
      for (const name of responsibleNames) people.add(name)

      const notes = [toText(raw.notes), ...extraNotes].filter(Boolean).join(' | ') || null

      cases.push({
        code: toText(raw.code) ?? `CT${cases.length + 1}`,
        jiraKey: toText(raw.jiraKey),
        scenario,
        objective,
        bdd,
        automated: toBoolean(raw.automated),
        environment: toEnvironment(raw.environment),
        testData: toText(raw.testData),
        responsible: responsibleNames[0] ?? null,
        qaStatus: toCaseStatus(raw.qaStatus) ?? 'Backlog',
        stageStatus: toCaseStatus(raw.stageStatus) ?? 'Backlog',
        evidence: toText(raw.evidence),
        notes,
        position: cases.length + 1,
      })
    }

    if (!cases.length) {
      warnings.push(`Aba "${sheet.name}": sem cenários preenchidos, ignorada.`)
      return
    }

    parsedSheets.push({ sheetName: sheet.name, cases })
  })

  // Fase 2 — resolve, em conjunto, qual linha da Progress pertence a cada aba.
  const matches = matchSheetsToProgress(
    parsedSheets.map((entry) => entry.sheetName),
    progress.map((entry) => entry.name),
  )

  const suites: ParsedSuite[] = parsedSheets.map((entry, index) => {
    const matchedIndex = matches.get(entry.sheetName)
    const meta = matchedIndex === undefined ? undefined : progress[matchedIndex]

    if (!meta) {
      warnings.push(`Aba "${entry.sheetName}": sem linha correspondente na aba "2. Progress".`)
    }

    const responsible = meta?.responsible ? toPersonNames(meta.responsible)[0] ?? null : null
    if (responsible) people.add(responsible)

    return {
      sourceSheet: entry.sheetName,
      name: meta?.name ?? entry.sheetName,
      jiraKey: meta?.jiraKey ?? null,
      platform: meta?.platform ?? inferPlatform(entry.sheetName, entry.cases),
      squad: meta?.squad ?? null,
      status: meta?.status ?? 'To Do',
      startDate: meta?.startDate ?? null,
      endDate: meta?.endDate ?? null,
      responsible,
      notes: meta?.notes ?? null,
      position: index + 1,
      cases: entry.cases,
    }
  })

  return { suites, people: [...people].sort(), warnings }
}

/** Sem linha na Progress, deduz a plataforma pelo nome da aba e pelos ambientes. */
function inferPlatform(sheetName: string, cases: ParsedCase[]): Platform {
  const name = fold(sheetName)
  if (name.includes('app') || name.includes('mobile')) return 'App'
  const mobile = cases.filter(
    (item) =>
      item.environment === 'Mobile Android' ||
      item.environment === 'Mobile iOS' ||
      item.environment === 'APP',
  ).length
  return mobile > cases.length / 2 ? 'App' : 'Web'
}

export interface ParsedBug {
  number: string
  platform: Platform
  jiraKey: string | null
  relatedUs: string | null
  description: string | null
  severity: string
  status: string
  responsible: string | null
  reportedDate: Date | null
  fixedDate: Date | null
  affectedArea: string | null
  notes: string | null
}

export interface BugImportReport {
  bugs: ParsedBug[]
  people: string[]
  warnings: string[]
}

const BUG_SHEETS: { name: string; platform: Platform }[] = [
  { name: 'App Bugs and Fixes', platform: 'App' },
  { name: 'Web Bugs and Fixes', platform: 'Web' },
]

/**
 * A aba "App Bugs and Fixes" não tem título na coluna da descrição do bug —
 * a "Web Bugs and Fixes" tem ("Bug Description"). É a única lacuna de título
 * nas duas abas, então caímos na posição fixa só nesse caso pontual.
 */
const APP_DESCRIPTION_FALLBACK_COLUMN = 3

/**
 * Lê "App Bugs and Fixes" e "Web Bugs and Fixes" — cada linha já é um bug
 * completo, sem equivalente à aba "2. Progress" para cruzar depois.
 */
export async function parseBugs(filePath: string): Promise<BugImportReport> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const warnings: string[] = []
  const people = new Set<string>()
  const bugs: ParsedBug[] = []
  /** Chave do Jira -> índice em `bugs`. Global às duas abas (nunca colidiram). */
  const jiraIndex = new Map<string, number>()

  for (const { name, platform } of BUG_SHEETS) {
    const sheet = workbook.getWorksheet(name)
    if (!sheet) {
      warnings.push(`Aba "${name}" não encontrada; bugs de ${platform} não foram importados.`)
      continue
    }

    const mapped = new Map<number, BugFieldKey>()
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const title = toText(cellValue(cell))
      if (!title) return
      const field = resolveBugHeader(title)
      if (field) mapped.set(colNumber, field)
    })
    if (![...mapped.values()].includes('description') && fold(name) === fold('App Bugs and Fixes')) {
      mapped.set(APP_DESCRIPTION_FALLBACK_COLUMN, 'description')
    }

    let counter = 0
    let skippedBlank = 0

    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r)
      const raw: Partial<Record<BugFieldKey, unknown>> = {}
      for (const [colNumber, field] of mapped) raw[field] = cellValue(row.getCell(colNumber))

      const description = toText(raw.description)
      const jiraKey = toText(raw.jiraKey)

      // Linhas em branco no fim da aba (número preenchido, resto vazio).
      if (!description && !jiraKey) {
        skippedBlank += 1
        continue
      }

      const responsibleNames = toPersonNames(raw.responsible)
      for (const responsibleName of responsibleNames) people.add(responsibleName)

      const fields = {
        jiraKey,
        relatedUs: toText(raw.relatedUs),
        description,
        severity: toBugSeverity(raw.severity) ?? 'Medium',
        status: toBugStatus(raw.status) ?? 'Open',
        responsible: responsibleNames[0] ?? null,
        reportedDate: toDate(raw.reportedDate),
        fixedDate: toDate(raw.fixedDate),
        affectedArea: toText(raw.affectedArea),
        notes: toText(raw.notes),
      }

      // Chave do Jira duplicada na própria planilha (raro, mas existe): a
      // segunda ocorrência atualiza os dados da primeira em vez de virar um
      // bug separado, mantendo a numeração e evitando conflito de unicidade.
      if (jiraKey && jiraIndex.has(jiraKey)) {
        const index = jiraIndex.get(jiraKey)!
        warnings.push(
          `Aba "${name}", linha ${r}: chave do Jira "${jiraKey}" duplicada — mantidos os dados mais recentes.`,
        )
        bugs[index] = { ...bugs[index], ...fields }
        continue
      }

      counter += 1
      const bug: ParsedBug = { number: String(counter), platform, ...fields }
      if (jiraKey) jiraIndex.set(jiraKey, bugs.length)
      bugs.push(bug)
    }

    if (skippedBlank) {
      warnings.push(`Aba "${name}": ${skippedBlank} linha(s) em branco ignorada(s).`)
    }
  }

  return { bugs, people: [...people].sort(), warnings }
}

export interface ParsedTestUser {
  sourceSheet: string
  sourceRow: number
  email: string | null
  cpf: string | null
  password: string | null
  kind: string | null
  environment: UserEnv
  status: string
  profile: string | null
  notes: string | null
}

export interface TestUserImportReport {
  users: ParsedTestUser[]
  warnings: string[]
}

/**
 * Lê "Users QA" e "Users PRD" (US-4.1) — a massa de contas de teste.
 *
 * Nenhuma coluna serve de chave: há e-mail repetido em duas contas com CPFs
 * diferentes, CPF repetido em duas contas de PRD, e os dois vêm em branco em
 * algumas linhas. Então a identidade
 * entre importações é a origem — aba + número da linha — e é ela que vai para
 * `sourceSheet`/`sourceRow`.
 *
 * A coluna `Saldo` da aba de PRD é lida e descartada de propósito: todo valor
 * preenchido é `0`, `-` ou vazio, ou seja, zero informação. Fica um aviso no
 * relatório de importação para a decisão não ficar escondida no código.
 */
export async function parseTestUsers(filePath: string): Promise<TestUserImportReport> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.readFile(filePath)

  const warnings: string[] = []
  const users: ParsedTestUser[] = []

  for (const { name, environment, positional } of USER_SHEETS) {
    const sheet = workbook.getWorksheet(name)
    if (!sheet) {
      warnings.push(`Aba "${name}" não encontrada; a massa de ${environment} não foi importada.`)
      continue
    }

    const mapped = new Map<number, UserFieldKey>()
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const title = toText(cellValue(cell))
      if (!title) return
      const field = resolveUserHeader(title)
      if (field) mapped.set(colNumber, field)
    })

    // Só preenche o que o título não resolveu: se o cabeçalho da planilha for
    // corrigido algum dia, o título volta a mandar sem precisar mexer aqui.
    for (const [column, field] of Object.entries(positional)) {
      const colNumber = Number(column)
      if (!mapped.has(colNumber)) {
        mapped.set(colNumber, field)
        warnings.push(
          `Aba "${name}", coluna ${colNumber}: sem título utilizável, lida por posição como "${field}".`,
        )
      }
    }

    let skippedBlank = 0
    let balanceIgnored = 0
    let paddedCpfs = 0

    for (let r = 2; r <= sheet.rowCount; r += 1) {
      const row = sheet.getRow(r)
      const raw: Partial<Record<UserFieldKey, unknown>> = {}
      for (const [colNumber, field] of mapped) raw[field] = cellValue(row.getCell(colNumber))

      const email = toText(raw.email)?.toLowerCase() ?? null
      const cpf = normalizeCpf(raw.cpf)

      // Linha sem e-mail nem CPF não identifica conta nenhuma — é sobra de
      // preenchimento (senha e ambiente repetidos, o resto vazio).
      if (!email && !cpf) {
        skippedBlank += 1
        continue
      }

      // Zero à esquerda restaurado pelo dígito verificador (célula que a
      // planilha guardou como número). Vale avisar: é dado alterado na entrada.
      const original = digitsOnly(raw.cpf)
      if (cpf && original && cpf !== original) paddedCpfs += 1

      if (toText(raw.balance)) balanceIgnored += 1

      users.push({
        sourceSheet: name,
        sourceRow: r,
        email,
        cpf,
        password: toText(raw.password),
        kind: toUserKind(raw.kind),
        environment,
        status: toUserStatus(raw.status) ?? 'Ativo',
        profile: toText(raw.profile),
        notes: null,
      })
    }

    if (skippedBlank) {
      warnings.push(`Aba "${name}": ${skippedBlank} linha(s) sem e-mail nem CPF ignorada(s).`)
    }
    if (paddedCpfs) {
      warnings.push(
        `Aba "${name}": ${paddedCpfs} CPF(s) tiveram zeros à esquerda restaurados (confirmado pelo dígito verificador).`,
      )
    }
    if (balanceIgnored) {
      warnings.push(
        `Aba "${name}": coluna "Saldo" ignorada em ${balanceIgnored} linha(s) — todo valor preenchido é 0 ou "-".`,
      )
    }
  }

  const duplicateEmails = new Map<string, number>()
  for (const user of users) {
    if (user.email) duplicateEmails.set(user.email, (duplicateEmails.get(user.email) ?? 0) + 1)
  }
  for (const [email, count] of duplicateEmails) {
    if (count > 1) warnings.push(`E-mail "${email}" aparece em ${count} contas — mantidas como contas distintas.`)
  }

  return { users, warnings }
}
