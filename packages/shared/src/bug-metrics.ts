export interface BugLike {
  reportedDate: Date | string | null
  fixedDate: Date | string | null
  status: string
}

export interface BugLeadTime {
  /** Dias corridos. `null` quando não há data de criação. */
  days: number | null
  /** `true` enquanto não há data de correção — os dias contam até hoje. */
  open: boolean
}

const MS_PER_DAY = 1000 * 60 * 60 * 24

/**
 * Lead time de um bug, sem os `#NUM!` da planilha (fórmula de data menos
 * célula vazia). Versão mínima, para ordenar a listagem (US-2.3):
 * - cancelado: `null` — nunca foi corrigido, não entra na conta.
 * - fechado (tem `fixedDate`): dias entre criação e correção.
 * - aberto (sem `fixedDate`): dias corridos desde a criação até hoje.
 * - sem `reportedDate`: `null`, nunca erro.
 *
 * A US-2.4 é quem define a semântica completa (bug cancelado sem data de
 * correção, média por severidade) — esta função cobre só o que a
 * ordenação precisa.
 */
export function computeBugLeadTime(bug: BugLike): BugLeadTime {
  // Cancelado nunca foi corrigido: não conta como "em aberto" acumulando dias
  // para sempre, nem como lead time de correção real.
  if (bug.status === 'Canceled') return { days: null, open: false }

  const open = !bug.fixedDate
  if (!bug.reportedDate) return { days: null, open }

  const reported = new Date(bug.reportedDate).getTime()
  const end = bug.fixedDate ? new Date(bug.fixedDate).getTime() : Date.now()
  const days = Math.max(0, Math.round((end - reported) / MS_PER_DAY))
  return { days, open }
}
