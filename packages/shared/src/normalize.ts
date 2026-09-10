import {
  CASE_STATUS, SUITE_STATUS, ENVIRONMENT, SQUAD, BUG_SEVERITY, BUG_STATUS,
  USER_KIND, USER_ENV, USER_STATUS,
  type CaseStatus, type SuiteStatus, type Environment, type Squad,
  type BugSeverity, type BugStatus, type UserKind, type UserEnv, type UserStatus,
} from './domain.js'

/** Remove acentos, espaços duplicados e normaliza caixa para comparação. */
export function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function matcher<T extends string>(canonical: readonly T[], aliases: Record<string, T>) {
  const byFolded = new Map<string, T>()
  for (const value of canonical) byFolded.set(fold(value), value)
  for (const [alias, value] of Object.entries(aliases)) byFolded.set(fold(alias), value)
  return (raw: unknown): T | null => {
    if (typeof raw !== 'string') return null
    const key = fold(raw)
    if (!key) return null
    return byFolded.get(key) ?? null
  }
}

/**
 * `Choose` era o placeholder de "não preenchido" na planilha; vira `Backlog`.
 * `Done` (App) e `Resolved` (Web) descreviam o mesmo estado de bug.
 */
export const toCaseStatus = matcher<CaseStatus>(CASE_STATUS, {
  Choose: 'Backlog',
  'To start': 'Backlog',
  'To Do': 'Backlog',
  Done: 'Approved',
  Aprovado: 'Approved',
  Reprovado: 'Failed',
  Bloqueado: 'Blocked',
})

export const toSuiteStatus = matcher<SuiteStatus>(SUITE_STATUS, {
  Choose: 'To Do',
  'To start': 'To Do',
  Backlog: 'To Do',
  Done: 'Completed',
  Concluído: 'Completed',
  'Em andamento': 'In progress',
})

export const toEnvironment = matcher<Environment>(ENVIRONMENT, {
  App: 'APP',
  Android: 'Mobile Android',
  iOS: 'Mobile iOS',
  'Web-STG': 'Web',
  'App-PRD': 'APP',
  'App-QA': 'APP',
})

export const toSquad = matcher<Squad>(SQUAD, { Mobile: 'App', APP: 'App' })

/** Severidade de bug — as duas abas já usam os valores canônicos. */
export const toBugSeverity = matcher<BugSeverity>(BUG_SEVERITY, {})

/** `Done` era o status final da aba App; a aba Web já usava `Resolved`. */
export const toBugStatus = matcher<BugStatus>(BUG_STATUS, {
  Done: 'Resolved',
})

/** Tipo de conta da massa de teste. As abas já usam `PF`/`PJ`. */
export const toUserKind = matcher<UserKind>(USER_KIND, {
  'Pessoa Física': 'PF',
  'Pessoa Juridica': 'PJ',
  'Pessoa Jurídica': 'PJ',
})

export const toUserEnv = matcher<UserEnv>(USER_ENV, {
  Prod: 'PRD',
  Produção: 'PRD',
  Homolog: 'QA',
})

/**
 * Situação da conta. `fold` já ignora acento e caixa, então `Excluida` casa
 * com `Excluída` sem alias; os aliases abaixo cobrem as variantes em inglês.
 */
export const toUserStatus = matcher<UserStatus>(USER_STATUS, {
  Active: 'Ativo',
  Suspended: 'Suspenso',
  Deleted: 'Excluída',
  Inativo: 'Suspenso',
})

/**
 * Nomes de pessoas aparecem grafados de formas diferentes entre as abas
 * (`Murilo`/`Murillo`) e às vezes agrupados (`Paulo/Pyetra`).
 * Retorna a lista de nomes canônicos citados.
 */
const PERSON_ALIASES: Record<string, string> = {
  murilo: 'Murillo',
  silvia: 'Sílvia',
  debora: 'Débora',
  marcia: 'Márcia',
  'jonatas pedroso': 'Jonatas Pedroso',
  'ana beatriz': 'Ana Beatriz',
  'perez chamorro, noe isai': 'Noe Isai Perez Chamorro',
  'jeff lima': 'Jeff Lima',
}

export function toPersonNames(raw: unknown): string[] {
  if (typeof raw !== 'string') return []
  const cleaned = raw.trim()
  if (!cleaned || fold(cleaned) === 'choose' || cleaned === '-') return []

  // O apelido é consultado ANTES de dividir: há nome que já contém vírgula
  // ("Perez Chamorro, Noe Isai" é uma pessoa só, no formato sobrenome-vírgula-
  // nome). Dividir primeiro partia essa pessoa em dois registros — e nenhuma
  // mescla feita na tela sobreviveria à próxima importação.
  const whole = PERSON_ALIASES[fold(cleaned)]
  if (whole) return [whole]

  return cleaned
    .split(/\s*[\/,;]\s*|\s+e\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => PERSON_ALIASES[fold(part)] ?? part)
}

/** `Yes`/`No` da coluna Automation. Aceita variações em pt-BR. */
export function toBoolean(raw: unknown): boolean {
  if (typeof raw === 'boolean') return raw
  if (typeof raw === 'number') return raw === 1
  if (typeof raw !== 'string') return false
  return ['yes', 'y', 'sim', 's', 'true', '1'].includes(fold(raw))
}

/**
 * O Excel guarda datas como número serial (dias desde 1899-12-30).
 * Valores fora de 1990..2100 são ruído de célula e viram `null`.
 */
export function toDate(raw: unknown): Date | null {
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  if (typeof raw === 'number' && raw > 0) {
    const ms = Math.round((raw - 25569) * 86400 * 1000)
    const date = new Date(ms)
    const year = date.getUTCFullYear()
    return year >= 1990 && year <= 2100 ? date : null
  }
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = new Date(raw)
    if (!Number.isNaN(parsed.getTime())) return parsed
  }
  return null
}

/** Texto de célula: descarta placeholders (`-`, `Choose`) e normaliza vazio. */
export function toText(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const text = String(raw).replace(/\s+/g, ' ').trim()
  if (!text || text === '-' || fold(text) === 'choose') return null
  return text
}

/** Número de célula, ignorando erros do Excel (`#DIV/0!`, `#NUM!`). */
export function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text || text.startsWith('#')) return null
    const parsed = Number(text.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}
