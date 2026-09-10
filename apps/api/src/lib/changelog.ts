import { prisma } from './db.js'

/**
 * Histórico de alterações (US-5.2).
 *
 * Grava uma linha por CAMPO que mudou de valor. Campo que veio no payload mas
 * chegou igual não gera registro — senão a linha do tempo enche de "mudou de
 * Approved para Approved" a cada save do formulário, e o que interessa some.
 */

export type TrackedEntity = 'case' | 'bug' | 'suite'

/** Como cada campo aparece na linha do tempo. */
export interface FieldSpec {
  label: string
  /** Converte o valor cru no texto que fica congelado no histórico. */
  format?: (value: unknown) => string | null
}

const formatDate = (value: unknown): string | null => {
  if (!value) return null
  const date = new Date(value as string)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

const formatBoolean = (yes: string, no: string) => (value: unknown) => (value ? yes : no)

/** Texto longo entra recortado: a linha do tempo é um resumo, não um diff. */
const formatText = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null
  const text = String(value)
  return text.length > 160 ? `${text.slice(0, 160)}…` : text
}

export const CASE_FIELDS: Record<string, FieldSpec> = {
  code: { label: 'Código' },
  jiraKey: { label: 'Jira' },
  scenario: { label: 'Cenário', format: formatText },
  objective: { label: 'Objetivo', format: formatText },
  bdd: { label: 'Descrição do teste', format: formatText },
  automated: { label: 'Automação', format: formatBoolean('Yes', 'No') },
  environment: { label: 'Ambiente' },
  testData: { label: 'Massa de teste', format: formatText },
  qaStatus: { label: 'Status QA' },
  stageStatus: { label: 'Status Stage' },
  responsibleId: { label: 'Responsável' },
  notes: { label: 'Notas', format: formatText },
}

export const BUG_FIELDS: Record<string, FieldSpec> = {
  number: { label: 'Número' },
  jiraKey: { label: 'Jira' },
  relatedUs: { label: 'US relacionada' },
  description: { label: 'Descrição', format: formatText },
  severity: { label: 'Severidade' },
  status: { label: 'Status' },
  responsibleId: { label: 'Responsável' },
  affectedAreaId: { label: 'Área afetada' },
  reportedDate: { label: 'Data de criação', format: formatDate },
  fixedDate: { label: 'Data de correção', format: formatDate },
  notes: { label: 'Notas', format: formatText },
}

export const SUITE_FIELDS: Record<string, FieldSpec> = {
  name: { label: 'Nome' },
  jiraKey: { label: 'Jira' },
  platform: { label: 'Plataforma' },
  squad: { label: 'Squad' },
  status: { label: 'Status' },
  startDate: { label: 'Início', format: formatDate },
  endDate: { label: 'Fim', format: formatDate },
  responsibleId: { label: 'Responsável' },
  notes: { label: 'Notas', format: formatText },
}

/**
 * Nomes para os campos que são chave estrangeira. Resolvidos na hora da
 * gravação e guardados como texto: o histórico tem que continuar legível
 * mesmo depois de a pessoa ou a área serem renomeadas ou removidas.
 */
async function resolveNames(ids: string[]): Promise<Map<string, string>> {
  const clean = [...new Set(ids.filter(Boolean))]
  if (!clean.length) return new Map()

  const [people, areas] = await Promise.all([
    prisma.person.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } }),
    prisma.affectedArea.findMany({ where: { id: { in: clean } }, select: { id: true, name: true } }),
  ])
  return new Map([...people, ...areas].map((item) => [item.id, item.name]))
}

const FOREIGN_KEYS = new Set(['responsibleId', 'affectedAreaId'])

interface RecordOptions {
  entity: TrackedEntity
  entityId: string
  before: Record<string, unknown>
  after: Record<string, unknown>
  fields: Record<string, FieldSpec>
  actorId: string | null
}

/** Compara antes/depois e grava só o que mudou de fato. */
export async function recordChanges(options: RecordOptions): Promise<number> {
  const { entity, entityId, before, after, fields, actorId } = options

  const foreignIds: string[] = []
  for (const key of Object.keys(fields)) {
    if (!FOREIGN_KEYS.has(key)) continue
    for (const source of [before, after]) {
      const value = source[key]
      if (typeof value === 'string') foreignIds.push(value)
    }
  }
  const names = await resolveNames(foreignIds)

  const render = (key: string, value: unknown): string | null => {
    if (value === null || value === undefined) return null
    if (FOREIGN_KEYS.has(key)) return names.get(String(value)) ?? String(value)
    const format = fields[key]?.format
    return format ? format(value) : String(value)
  }

  const rows: {
    entity: string; entityId: string; field: string; label: string
    oldValue: string | null; newValue: string | null; actorId: string | null
  }[] = []

  for (const [key, spec] of Object.entries(fields)) {
    // Campo ausente do payload não foi tocado — diferente de enviado vazio.
    if (!(key in after)) continue

    const oldValue = render(key, before[key])
    const newValue = render(key, after[key])
    if (oldValue === newValue) continue

    rows.push({
      entity, entityId, field: key, label: spec.label, oldValue, newValue, actorId,
    })
  }

  if (!rows.length) return 0
  await prisma.changeLog.createMany({ data: rows })
  return rows.length
}

/**
 * Retenção (US-5.2). O critério exige no MÍNIMO 12 meses; guardamos 24 por
 * padrão, para que um registro de 12 meses e um dia ainda esteja lá. O piso
 * de 12 é aplicado no código para que uma variável de ambiente mal preenchida
 * não consiga violar o critério.
 */
const MIN_RETENTION_MONTHS = 12
const DEFAULT_RETENTION_MONTHS = 24

export function retentionMonths(): number {
  const raw = Number(process.env.HISTORY_RETENTION_MONTHS)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_RETENTION_MONTHS
  return Math.max(MIN_RETENTION_MONTHS, Math.floor(raw))
}

/** Remove histórico além da retenção. Chamado no boot, sem cron. */
export async function pruneHistory(): Promise<number> {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - retentionMonths())
  const result = await prisma.changeLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return result.count
}
