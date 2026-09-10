import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { Platform } from '@qahub/shared'
import {
  useAffectedAreas, useBugs, useMeta, usePeople, useUpdateBug, type BugFilters,
} from '../lib/queries'
import type { RetestSuggestion } from '../lib/types'
import {
  Accordion, Empty, ErrorBanner, Loading, Select, Stat, StatusPill, StatusSelect, formatDate,
} from '../components/ui'
import { useAuth } from '../lib/auth'
import { BugDrawer } from '../components/BugDrawer'

type SortValue = `${NonNullable<BugFilters['sort']>}:${NonNullable<BugFilters['order']>}`

const SORT_OPTIONS: { value: SortValue; sort: NonNullable<BugFilters['sort']>; order: NonNullable<BugFilters['order']>; label: string }[] = [
  { value: 'reportedDate:desc', sort: 'reportedDate', order: 'desc', label: 'Mais recentes' },
  { value: 'reportedDate:asc', sort: 'reportedDate', order: 'asc', label: 'Mais antigos' },
  { value: 'severity:desc', sort: 'severity', order: 'desc', label: 'Maior severidade' },
  { value: 'leadTime:desc', sort: 'leadTime', order: 'desc', label: 'Maior lead time' },
]

const DEFAULT_FILTERS: BugFilters = { sort: 'reportedDate', order: 'desc' }

/** Slug da URL (`/bugs/web`, `/bugs/app`) -> valor canônico de `Platform`. */
const PLATFORM_BY_SLUG: Record<string, Platform> = { web: 'Web', app: 'App' }

/**
 * Listagem de bugs de uma plataforma — Web e App viraram páginas distintas
 * (`/bugs/web`, `/bugs/app`), submenus do menu "Bugs", em vez de um filtro
 * dentro da mesma tela. Severidade e lead time não dão pra ordenar no banco;
 * a API já devolve a lista ordenada, aqui só listamos.
 */
export function BugsPage() {
  const { platform: slug } = useParams<{ platform: string }>()
  const platform = PLATFORM_BY_SLUG[slug?.toLowerCase() ?? '']

  const [filters, setFilters] = useState<BugFilters>(DEFAULT_FILTERS)

  const { can } = useAuth()
  const meta = useMeta()
  const areas = useAffectedAreas()
  const people = usePeople()
  const bugs = useBugs({ ...filters, platform })
  const updateBug = useUpdateBug()

  const [retestNotice, setRetestNotice] = useState<RetestSuggestion[] | null>(null)
  const [openBug, setOpenBug] = useState<string | null>(null)

  // Trocar de Web para App (ou vice-versa) é ir para outra página: os
  // filtros da página anterior não fazem sentido carregados na nova.
  useEffect(() => setFilters(DEFAULT_FILTERS), [platform])

  const set = (key: keyof BugFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }))

  const setSort = (value: string) => {
    const option = SORT_OPTIONS.find((item) => item.value === value)
    if (option) setFilters((current) => ({ ...current, sort: option.sort, order: option.order }))
  }

  const hasFilters = ['severity', 'status', 'affectedAreaId', 'responsibleId', 'q'].some(
    (key) => filters[key],
  )

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const bug of bugs.data ?? []) counts.set(bug.status, (counts.get(bug.status) ?? 0) + 1)
    return counts
  }, [bugs.data])

  /**
   * Média de lead time por severidade — só sobre bugs fechados de verdade
   * (tem `fixedDate`). Bug aberto ainda não tem um tempo de correção final, e
   * Cancelado nunca teve um (por isso `computeBugLeadTime` já devolve `null`
   * pros dois); misturar os três na mesma média mudaria o número todo dia
   * sem nenhum bug ter sido corrigido mais rápido.
   */
  const leadTimeBySeverity = useMemo(() => {
    const sums = new Map<string, { total: number; count: number }>()
    for (const bug of bugs.data ?? []) {
      if (bug.leadTimeDays === null || bug.leadTimeOpen) continue
      const entry = sums.get(bug.severity) ?? { total: 0, count: 0 }
      entry.total += bug.leadTimeDays
      entry.count += 1
      sums.set(bug.severity, entry)
    }
    return sums
  }, [bugs.data])

  const openBugData = openBug ? bugs.data?.find((item) => item.id === openBug) ?? null : null

  // Só depois de TODOS os hooks — nunca antes, ou o React perde a contagem
  // de hooks entre este render (slug inválido) e o próximo (`/bugs/web`).
  if (!platform) return <Navigate to="/bugs/web" replace />

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Bugs — {platform}</h1>
          <p className="subtitle">
            {bugs.data?.length ?? 0} bugs {hasFilters ? 'nesse filtro' : 'no total'}
          </p>
        </div>
      </header>

      <div className="content stack">
        {retestNotice && (
          <div className="banner">
            Bug marcado como Resolved. Cenário{retestNotice.length > 1 ? 's' : ''} para retestar:{' '}
            {retestNotice.map((item, index) => (
              <span key={item.id}>
                {index > 0 && ', '}
                <Link to={`/suites/${item.suiteId}`}>{item.code} ({item.suiteName})</Link>
              </span>
            ))}
            {' — '}
            <button type="button" className="btn ghost" onClick={() => setRetestNotice(null)}>
              Dispensar
            </button>
          </div>
        )}

        <div className="stat-grid">
          {(meta.data?.bugStatus ?? []).map((status) => (
            <Stat key={status} label={status} value={statusCounts.get(status) ?? 0} />
          ))}
        </div>

        <Accordion title="Lead time médio por severidade">
          <div className="stat-grid">
            {(meta.data?.bugSeverity ?? []).map((severity) => {
              const entry = leadTimeBySeverity.get(severity)
              return (
                <Stat
                  key={severity}
                  label={severity}
                  value={entry ? `${Math.round(entry.total / entry.count)}d` : '—'}
                  hint={entry ? `${entry.count} resolvido${entry.count === 1 ? '' : 's'}` : 'sem resolvidos'}
                />
              )
            })}
          </div>
        </Accordion>

        <div className="toolbar">
          <input
            className="input search"
            placeholder="Buscar por descrição ou chave do Jira…"
            value={filters.q ?? ''}
            onChange={(event) => set('q')(event.target.value)}
          />
          <Select
            options={meta.data?.bugSeverity ?? []}
            emptyLabel="Severidade"
            value={filters.severity ?? ''}
            onChange={(event) => set('severity')(event.target.value)}
          />
          <Select
            options={meta.data?.bugStatus ?? []}
            emptyLabel="Status"
            value={filters.status ?? ''}
            onChange={(event) => set('status')(event.target.value)}
          />
          <select
            className="select"
            value={filters.affectedAreaId ?? ''}
            onChange={(event) => set('affectedAreaId')(event.target.value)}
          >
            <option value="">Área</option>
            {(areas.data ?? []).map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
          <select
            className="select"
            value={filters.responsibleId ?? ''}
            onChange={(event) => set('responsibleId')(event.target.value)}
          >
            <option value="">Responsável</option>
            {/* O filtro lista todo mundo, inclusive quem saiu: o histórico
                dessa pessoa continua existindo e precisa ser consultável. */}
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}{person.active ? '' : ' (inativo)'}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button type="button" className="btn ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Limpar
            </button>
          )}
          <select
            className="select sort"
            value={`${filters.sort ?? 'reportedDate'}:${filters.order ?? 'desc'}`}
            onChange={(event) => setSort(event.target.value)}
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>

        {bugs.isError && <ErrorBanner error={bugs.error} />}

        <div className="card">
          {bugs.isLoading ? (
            <Loading />
          ) : !bugs.data?.length ? (
            <Empty title="Nenhum bug encontrado">
              {hasFilters ? 'Ajuste os filtros para ver mais resultados.' : 'Nenhum bug importado ainda.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Bug</th>
                    <th>Severidade</th>
                    <th>Status</th>
                    <th>Área</th>
                    <th>Responsável</th>
                    <th>Criado em</th>
                    <th>Lead time</th>
                  </tr>
                </thead>
                <tbody>
                  {bugs.data.map((bug) => (
                    <tr key={bug.id}>
                      <td>
                        <button
                          type="button"
                          onClick={() => setOpenBug(bug.id)}
                          style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                        >
                          <div className="cell-title">
                            {bug.description ?? <span className="subtle">Sem descrição</span>}
                          </div>
                          <div className="cell-sub">
                            {bug.jiraKey && <span className="code">{bug.jiraKey}</span>}
                            {bug.relatedUs && <span className="code"> · {bug.relatedUs}</span>}
                          </div>
                        </button>
                      </td>
                      <td className="tight"><StatusPill status={bug.severity} /></td>
                      <td className="tight">
                        <StatusSelect
                          disabled={!can('editor')}
                          options={meta.data?.bugStatus ?? []}
                          value={bug.status}
                          onChange={(value) =>
                            updateBug.mutate(
                              { id: bug.id, data: { status: value as never } },
                              {
                                onSuccess: (result) =>
                                  setRetestNotice(result.retestSuggested.length ? result.retestSuggested : null),
                              },
                            )
                          }
                        />
                      </td>
                      <td className="tight small muted">{bug.affectedArea?.name ?? '—'}</td>
                      <td className="tight">
                        {bug.responsible?.name ?? <span className="subtle">—</span>}
                      </td>
                      <td className="tight small muted">{formatDate(bug.reportedDate)}</td>
                      <td className="tight small muted">
                        {bug.leadTimeDays === null
                          ? '—'
                          : `${bug.leadTimeDays}d${bug.leadTimeOpen ? ' (em aberto)' : ''}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* `find` sem `!`: se o filtro mudar com o painel aberto, o bug pode
          sair da lista — e um `!` aqui derrubaria a tela inteira. */}
      {openBugData && (
        <BugDrawer
          bug={openBugData}
          onClose={() => setOpenBug(null)}
          onRetest={(items) => setRetestNotice(items.length ? items : null)}
        />
      )}
    </>
  )
}
