import { EXECUTED_STATUSES, type CaseStatus } from './domain.js'

export interface CaseLike {
  automated: boolean
  qaStatus: CaseStatus
  stageStatus: CaseStatus
}

export interface SuiteMetrics {
  /** Cenários válidos (exclui `Removed`, que sai do denominador). */
  total: number
  removed: number
  automated: number
  manual: number
  executed: number
  approved: number
  failed: number
  blocked: number
  /** 0..1 — fração de cenários já executados. */
  executionRate: number
  /** 0..1 — fração de cenários automatizados. Nunca passa de 1. */
  automationRate: number
  /** 0..1 — aprovados sobre executados. */
  passRate: number
}

/**
 * Status consolidado de um cenário a partir dos dois ambientes.
 *
 * Na planilha, `QA` e `Stage` são ambientes distintos e o time nem sempre
 * preenche os dois: é comum o cenário ficar `Choose` em QA e `Approved` em
 * Stage. Olhar só a coluna QA subcontaria a execução de forma grosseira.
 *
 * A regra é conservadora: qualquer reprovação ou bloqueio prevalece sobre
 * uma aprovação no outro ambiente, porque é o que exige ação do time.
 */
export function effectiveStatus(qaStatus: CaseStatus, stageStatus: CaseStatus): CaseStatus {
  const both = [qaStatus, stageStatus]
  const has = (status: CaseStatus) => both.includes(status)

  if (has('Failed')) return 'Failed'
  if (has('Blocked')) return 'Blocked'
  if (has('Approved')) return 'Approved'
  if (has('Retested')) return 'Retested'
  if (has('Testing')) return 'Testing'
  if (has('In progress')) return 'In progress'
  if (has('Postponed')) return 'Postponed'
  if (qaStatus === 'Removed' && stageStatus === 'Removed') return 'Removed'
  if (has('Removed')) return 'Removed'
  return 'Backlog'
}

/**
 * Métricas de um ciclo de teste.
 *
 * Diferente da planilha, aqui não existe `#DIV/0!` nem progresso acima de 100%:
 * denominador zero devolve 0 e as taxas são limitadas a 1.
 */
export function computeMetrics(cases: readonly CaseLike[]): SuiteMetrics {
  const rolled = cases.map((item) => ({
    automated: item.automated,
    status: effectiveStatus(item.qaStatus, item.stageStatus),
  }))

  const removed = rolled.filter((item) => item.status === 'Removed').length
  const valid = rolled.filter((item) => item.status !== 'Removed')
  const total = valid.length

  const automated = valid.filter((item) => item.automated).length
  const executed = valid.filter((item) => EXECUTED_STATUSES.includes(item.status)).length
  const approved = valid.filter((item) => item.status === 'Approved').length
  const failed = valid.filter((item) => item.status === 'Failed').length
  const blocked = valid.filter((item) => item.status === 'Blocked').length

  const ratio = (part: number, whole: number) => (whole > 0 ? Math.min(part / whole, 1) : 0)

  return {
    total,
    removed,
    automated,
    manual: total - automated,
    executed,
    approved,
    failed,
    blocked,
    executionRate: ratio(executed, total),
    automationRate: ratio(automated, total),
    passRate: ratio(approved, executed),
  }
}

/** Formata 0..1 como percentual inteiro. */
export function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}
