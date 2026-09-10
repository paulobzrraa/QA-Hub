import type {
  CaseStatus, SuiteStatus, Environment, Platform, Squad, SuiteMetrics,
  BugSeverity, BugStatus, UserKind, UserEnv, UserStatus, AccessRole,
} from '@qahub/shared'

export interface Person {
  id: string
  name: string
  role: 'QA' | 'DEV'
  active: boolean
  /** Quanto trabalho está atribuído — decide se dá para excluir (US-4.5). */
  _count?: { suites: number; cases: number; bugs: number }
}

/** Resultado de uma mescla de pessoas duplicadas (US-4.5). */
export interface MergeResult {
  person: Person
  absorbed: string
  moved: { suites: number; cases: number; bugs: number }
}

/** Bug o bastante pra mostrar o vínculo no cenário — não o registro inteiro. */
export interface LinkedBug {
  id: string
  number: string
  jiraKey: string | null
  description: string | null
  severity: BugSeverity
  status: BugStatus
}

/** Evidência de um cenário (US-4.3): arquivo enviado ou referência externa. */
export interface Evidence {
  id: string
  caseId: string
  kind: 'image' | 'video' | 'link' | 'reference'
  /** URL externa (`link`) ou o texto original da planilha (`reference`). */
  url: string | null
  originalName: string | null
  mimeType: string | null
  sizeBytes: number | null
  caption: string | null
  /** Veio da planilha — regenerada a cada importação, não editada à mão. */
  imported: boolean
  position: number
  createdAt: string
}

export interface TestCase {
  id: string
  suiteId: string
  code: string
  jiraKey: string | null
  scenario: string | null
  objective: string | null
  bdd: string | null
  automated: boolean
  environment: Environment | null
  testData: string | null
  qaStatus: CaseStatus
  stageStatus: CaseStatus
  /** Substitui a antiga coluna de texto livre — vínculo de verdade (US-2.5). */
  bugs: LinkedBug[]
  /** Substitui a antiga coluna de texto livre — registros de verdade (US-4.3). */
  evidences: Evidence[]
  notes: string | null
  position: number
  responsibleId: string | null
  responsible: Person | null
  suite?: { id: string; name: string; platform: Platform }
}

export interface TestSuite {
  id: string
  name: string
  jiraKey: string | null
  platform: Platform
  squad: Squad | null
  status: SuiteStatus
  startDate: string | null
  endDate: string | null
  notes: string | null
  sourceSheet: string | null
  position: number
  responsibleId: string | null
  responsible: Person | null
  metrics: SuiteMetrics
}

export interface SuiteDetail extends TestSuite {
  cases: TestCase[]
}

export interface AffectedArea {
  id: string
  name: string
}

export interface Bug {
  id: string
  number: string
  platform: Platform
  jiraKey: string | null
  relatedUs: string | null
  description: string | null
  severity: BugSeverity
  status: BugStatus
  responsibleId: string | null
  responsible: Person | null
  affectedAreaId: string | null
  affectedArea: AffectedArea | null
  reportedDate: string | null
  fixedDate: string | null
  notes: string | null
  /** Calculado pela API a cada leitura — nunca vem armazenado. */
  leadTimeDays: number | null
  leadTimeOpen: boolean
}

/** Cenário sugerido para reteste quando um bug vira `Resolved` (US-2.5). */
export interface RetestSuggestion {
  id: string
  code: string
  scenario: string | null
  suiteId: string
  suiteName: string
}

/**
 * Conta da massa de teste (US-4.1). Sem `password` de propósito: a senha não
 * vem na listagem, só pelo endpoint de revelação, sob ação explícita.
 */
export interface TestUser {
  id: string
  email: string | null
  /** Somente dígitos — formate com `formatCpf` na exibição. */
  cpf: string | null
  kind: UserKind | null
  environment: UserEnv
  status: UserStatus
  profile: string | null
  notes: string | null
  sourceSheet: string | null
  sourceRow: number | null
}

/** Um acesso a senha da massa de teste (US-4.2). */
export interface CredentialAccess {
  id: string
  action: 'reveal' | 'copy'
  /** Nulo até a US-5.1 existir — o QA Hub ainda não tem login. */
  actorId: string | null
  /** Quem estava logado. Nulo nos acessos anteriores à US-5.1. */
  actor: { id: string; name: string; email: string } | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
  testUser: { id: string; email: string | null; environment: UserEnv }
}

export interface Meta {
  caseStatus: CaseStatus[]
  suiteStatus: SuiteStatus[]
  environment: Environment[]
  platform: Platform[]
  squad: Squad[]
  personRole: ('QA' | 'DEV')[]
  bugSeverity: BugSeverity[]
  bugStatus: BugStatus[]
  userKind: UserKind[]
  userEnv: UserEnv[]
  userStatus: UserStatus[]
}

export interface Overview {
  totals: SuiteMetrics & { suites: number; bugs: number }
  byPlatform: { platform: Platform; suites: number; openBugs: number; metrics: SuiteMetrics }[]
  bySquad: { squad: string; suites: number; metrics: SuiteMetrics }[]
  statusCounts: Record<string, number>
  byPerson: { name: string; suites: number; metrics: SuiteMetrics }[]
  /** Bugs em aberto (nem Resolved, nem Canceled) por severidade. */
  bugsBySeverity: { severity: BugSeverity; count: number }[]
}

/** Snapshot diário de métricas — histórico para "Evolução no tempo" (US-3.2). */
export interface MetricSnapshot {
  id: string
  date: string
  totalCases: number
  executedCases: number
  automatedCases: number
  openBugs: number
}

/** Uma suíte no ranking de cobertura de automação (US-3.3). */
export interface AutomationCoverageRow {
  id: string
  name: string
  platform: Platform
  squad: Squad | null
  status: SuiteStatus
  total: number
  automated: number
  manual: number
  automationRate: number
  /** Ciclo concluído sem nenhum cenário automatizado — oportunidade perdida. */
  zeroAutomationAtCompletion: boolean
}

/** Conta de acesso ao QA Hub (US-5.1) — distinta de `TestUser`, a massa de teste. */
export interface Account {
  id: string
  email: string
  name: string
  role: AccessRole
  active: boolean
  personId: string | null
  person: { id: string; name: string } | null
  /** Entrou com senha provisória e ainda precisa trocá-la (US-6.1). */
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt?: string
  _count?: { sessions: number }
}

export interface AuthStatus {
  /** Ainda não existe conta nenhuma: a tela mostra a criação do primeiro acesso. */
  needsSetup: boolean
  roles: Record<AccessRole, string>
}

/** Uma alteração registrada (US-5.2). */
export interface ChangeEntry {
  id: string
  /** `field` = valor mudou; `event` = algo aconteceu, sem valor anterior. */
  kind: 'field' | 'event'
  field: string
  /** Rótulo em pt-BR congelado no momento da alteração. */
  label: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
  actor: { id: string; name: string; email: string } | null
}

export interface HistoryResult {
  entries: ChangeEntry[]
  retentionMonths: number
}

/** Devolvido UMA vez ao redefinir uma senha (US-6.1) — não é recuperável depois. */
export interface PasswordReset {
  account: { id: string; name: string; email: string }
  provisionalPassword: string
  /** Tentativas recusadas que estavam pesando no bloqueio e foram apagadas. */
  clearedAttempts: number
}

/** Uma tentativa de entrada, recusada ou não (US-6.2). */
export interface LoginAttempt {
  id: string
  email: string
  ipAddress: string
  userAgent: string | null
  success: boolean
  createdAt: string
}

export interface LoginAttemptsResult {
  attempts: LoginAttempt[]
  limits: {
    WINDOW_MINUTES: number
    SOFT_THRESHOLD: number
    HARD_THRESHOLD: number
    BLOCK_MINUTES: number
  }
}
