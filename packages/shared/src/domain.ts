/**
 * Domínio do QA Hub.
 *
 * Todos os valores abaixo foram extraídos dos `dataValidation` da planilha
 * "Gerenciamento de Testes - Swift.xlsx". Onde as abas divergiam entre si,
 * consolidamos a UNIÃO dos valores e registramos o alias na tabela de
 * normalização (ver `normalize.ts`), para que nenhum dado histórico se perca
 * na importação.
 */

/** Status de execução de um ciclo de teste (aba "2. Progress", coluna E). */
export const SUITE_STATUS = [
  'To Do',
  'In progress',
  'Blocked',
  'Bugfix',
  'Failed',
  'Postponed',
  'Completed',
] as const
export type SuiteStatus = (typeof SUITE_STATUS)[number]

/**
 * Status de um cenário de teste (colunas "QA" e "Stage" das abas de cenário).
 * A planilha usa duas variantes: uma com `Choose`/`Backlog` como valor inicial
 * e outra com `Testing`. Mantemos ambos os conceitos.
 */
export const CASE_STATUS = [
  'Backlog',
  'In progress',
  'Testing',
  'Blocked',
  'Failed',
  'Retested',
  'Postponed',
  'Removed',
  'Approved',
] as const
export type CaseStatus = (typeof CASE_STATUS)[number]

/** Ambiente de execução (coluna "Environment"). */
export const ENVIRONMENT = ['Web', 'APP', 'Mobile Android', 'Mobile iOS', 'API'] as const
export type Environment = (typeof ENVIRONMENT)[number]

/** Plataforma do projeto — separa os dois blocos da aba "2. Progress". */
export const PLATFORM = ['Web', 'App'] as const
export type Platform = (typeof PLATFORM)[number]

/** Squad responsável (coluna "Squad"). */
export const SQUAD = ['Storefront', 'Checkout', 'App'] as const
export type Squad = (typeof SQUAD)[number]

/** Papel da pessoa. QAs executam cenários; DEVs aparecem como responsáveis por bugs. */
export const PERSON_ROLE = ['QA', 'DEV'] as const
export type PersonRole = (typeof PERSON_ROLE)[number]

/** Severidade de bug (Fase 2). */
export const BUG_SEVERITY = ['Low', 'Medium', 'High', 'Critical', 'Highest'] as const
export type BugSeverity = (typeof BUG_SEVERITY)[number]

/** Status de bug (Fase 2) — união das variantes App (`Done`) e Web (`Resolved`). */
export const BUG_STATUS = [
  'Open',
  'In progress',
  'Testing',
  'Blocked',
  'Resolved',
  'Canceled',
] as const
export type BugStatus = (typeof BUG_STATUS)[number]

/**
 * Área afetada por um bug (Fase 2) NÃO tem constante aqui, de propósito:
 * a planilha tinha 25 valores no App e 10 no Web, com sobreposição parcial,
 * e a lista precisa crescer sem alterar código. Vive na tabela `AffectedArea`
 * do banco, exposta via `/api/affected-areas`.
 */

/** Tipo de conta da massa de teste (abas "Users QA" / "Users PRD"). */
export const USER_KIND = ['PF', 'PJ'] as const
export type UserKind = (typeof USER_KIND)[number]

/** Ambiente da massa de teste — uma aba da planilha para cada valor. */
export const USER_ENV = ['QA', 'PRD'] as const
export type UserEnv = (typeof USER_ENV)[number]

/** Situação da conta de teste. */
export const USER_STATUS = ['Ativo', 'Suspenso', 'Excluída'] as const
export type UserStatus = (typeof USER_STATUS)[number]

/**
 * O perfil da conta (`Não Sócio`, `limpo`, `sem givex`...) NÃO tem constante
 * aqui: diferente das colunas acima, aquela coluna da planilha nunca teve
 * `dataValidation`, então é texto livre de verdade e a lista de valores sai
 * do próprio banco, via `/api/test-users/profiles`.
 */

/**
 * Papel de ACESSO (US-5.1) — o que a pessoa pode fazer no sistema.
 *
 * Deliberadamente separado de `PERSON_ROLE` (`QA`/`DEV`), que descreve a
 * FUNÇÃO no time. São eixos diferentes: um DEV pode precisar de administração
 * e um QA pode ter só leitura. Misturar os dois deixaria "quem é" e "o que
 * pode" amarrados sem motivo.
 */
export const ACCESS_ROLE = ['viewer', 'editor', 'admin'] as const
export type AccessRole = (typeof ACCESS_ROLE)[number]

/** Rótulos em pt-BR, na ordem crescente de poder. */
export const ACCESS_ROLE_LABEL: Record<AccessRole, string> = {
  viewer: 'Leitura',
  editor: 'Execução',
  admin: 'Administração',
}

/** Poder relativo: `rank(a) >= rank(b)` significa "a atende a exigência b". */
const ACCESS_RANK: Record<AccessRole, number> = { viewer: 0, editor: 1, admin: 2 }

export function hasAccess(role: AccessRole, required: AccessRole): boolean {
  return ACCESS_RANK[role] >= ACCESS_RANK[required]
}

/**
 * Status que contam como "cenário já executado" para efeito de métrica.
 * `Removed` fica de fora: cenário removido não entra no denominador.
 */
export const EXECUTED_STATUSES: readonly CaseStatus[] = [
  'Approved',
  'Failed',
  'Retested',
]

/** Status que encerram um ciclo de teste. */
export const CLOSED_SUITE_STATUSES: readonly SuiteStatus[] = ['Completed']
