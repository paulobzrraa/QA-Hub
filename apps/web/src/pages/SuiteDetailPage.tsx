import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Bug as BugIcon } from 'lucide-react'
import { percent } from '@qahub/shared'
import {
  useCreateCase, useMeta, usePeople, useSuite, useUpdateCase, useUpdateSuite,
} from '../lib/queries'
import type { LinkedBug, TestCase } from '../lib/types'
import { CaseDrawer } from '../components/CaseDrawer'
import { useAuth } from '../lib/auth'
import { EvidenceThumb } from '../components/EvidenceField'
import {
  Empty, ErrorBanner, Loading, ProgressBar, Select, Stat, StatusSelect, Tag, formatDate,
} from '../components/ui'

/** Um bug ainda "aberto" para efeito do indicador — nem resolvido, nem cancelado. */
function isOpenBug(bug: LinkedBug): boolean {
  return bug.status !== 'Resolved' && bug.status !== 'Canceled'
}

export function SuiteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const suite = useSuite(id)
  const meta = useMeta()
  const people = usePeople({ active: 'true' })
  const { can } = useAuth()
  const canEdit = can('editor')
  const updateCase = useUpdateCase(id)
  const updateSuite = useUpdateSuite(id)
  const createCase = useCreateCase(id ?? '')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [openCase, setOpenCase] = useState<string | null>(null)

  const cases = useMemo(() => {
    const list = suite.data?.cases ?? []
    const term = search.trim().toLowerCase()
    return list.filter((item) => {
      if (statusFilter && item.qaStatus !== statusFilter) return false
      if (!term) return true
      return [item.code, item.scenario, item.objective, item.bdd, item.jiraKey]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    })
  }, [suite.data, search, statusFilter])

  if (suite.isLoading) return <Loading />
  if (suite.isError) return <div className="content"><ErrorBanner error={suite.error} /></div>
  if (!suite.data) return null

  const { metrics } = suite.data
  const selected = suite.data.cases.find((item) => item.id === openCase) ?? null

  /** Edição direta na tabela — o caso de uso mais frequente do time. */
  const patch = (testCase: TestCase, data: Partial<TestCase>) =>
    updateCase.mutate({ id: testCase.id, data })

  return (
    <>
      <header className="topbar">
        <div>
          <Link to="/suites" className="small muted">← Ciclos de testes</Link>
          <h1 style={{ marginTop: 4 }}>{suite.data.name}</h1>
          <p className="subtitle">
            {suite.data.jiraKey && <span className="code">{suite.data.jiraKey} · </span>}
            <Tag>{suite.data.platform}</Tag>
            {suite.data.squad && <> <Tag>{suite.data.squad}</Tag></>}
            {' · '}
            {formatDate(suite.data.startDate)} – {formatDate(suite.data.endDate)}
            {suite.data.sourceSheet && <> · <span className="subtle">aba “{suite.data.sourceSheet}”</span></>}
          </p>
        </div>
        <div className="toolbar">
          <Select
            options={meta.data?.suiteStatus ?? []}
            value={suite.data.status}
            onChange={(event) =>
              updateSuite.mutate({ id: suite.data!.id, data: { status: event.target.value as never } })
            }
          />
          <select
            className="select"
            value={suite.data.responsibleId ?? ''}
            onChange={(event) =>
              updateSuite.mutate({ id: suite.data!.id, data: { responsibleId: event.target.value || null } })
            }
          >
            <option value="">Sem responsável</option>
            {(people.data ?? []).map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </div>
      </header>

      <div className="content stack">
        <div className="stat-grid">
          <Stat label="Cenários" value={metrics.total} hint={metrics.removed ? `${metrics.removed} removidos` : undefined} />
          <Stat
            label="Execução"
            value={percent(metrics.executionRate)}
            hint={`${metrics.executed} de ${metrics.total} executados`}
          />
          <Stat
            label="Automação"
            value={percent(metrics.automationRate)}
            hint={`${metrics.automated} auto · ${metrics.manual} manual`}
          />
          <Stat
            label="Aprovação"
            value={percent(metrics.passRate)}
            hint={`${metrics.approved} aprovados · ${metrics.failed} falhas`}
          />
          <Stat label="Bloqueados" value={metrics.blocked} />
        </div>

        <div className="toolbar">
          <input
            className="input search"
            placeholder="Buscar cenário, objetivo ou BDD…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            options={meta.data?.caseStatus ?? []}
            emptyLabel="Todos os status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          />
          <span className="small muted">{cases.length} de {suite.data.cases.length}</span>
          <div style={{ flex: 1 }} />
          {canEdit && (
            <button
              type="button"
              className="btn primary"
              disabled={createCase.isPending}
              onClick={async () => {
                const created = await createCase.mutateAsync({ scenario: 'Novo cenário' })
                setOpenCase(created.id)
              }}
            >
              Novo cenário
            </button>
          )}
        </div>

        <div className="card">
          {!cases.length ? (
            <Empty title="Nenhum cenário">
              {suite.data.cases.length ? 'Ajuste a busca ou o filtro de status.' : 'Adicione o primeiro cenário do ciclo.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 64 }}>ID</th>
                    <th>Cenário</th>
                    <th style={{ width: 118 }}>Ambiente</th>
                    <th style={{ width: 88 }}>Auto</th>
                    <th style={{ width: 132 }}>QA</th>
                    <th style={{ width: 132 }}>Stage</th>
                    <th style={{ width: 118 }}>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((item) => {
                    const openBugs = item.bugs.filter(isOpenBug)
                    return (
                    <tr key={item.id}>
                      <td className="tight">
                        <button
                          type="button"
                          className="btn ghost"
                          style={{ padding: '2px 6px', minHeight: 0 }}
                          onClick={() => setOpenCase(item.id)}
                        >
                          <span className="code">{item.code}</span>
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => setOpenCase(item.id)}
                          style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                        >
                          <span className="cell-title">
                            {item.scenario ?? 'Sem título'}
                            {openBugs.length > 0 && (
                              <span className="bug-flag" title={`${openBugs.length} bug(s) em aberto`}>
                                <BugIcon size={13} />
                                {openBugs.length > 1 && openBugs.length}
                              </span>
                            )}
                          </span>
                          {(item.objective || item.bdd) && (
                            <div className="cell-sub clamp">{item.objective ?? item.bdd}</div>
                          )}
                          {/* Miniatura das evidências (US-4.3), em linha própria
                              abaixo do resumo — abre o painel como o resto da linha. */}
                          {item.evidences.length > 0 && (
                            <span className="ev-strip">
                              {item.evidences.slice(0, 4).map((ev) => (
                                <EvidenceThumb key={ev.id} item={ev} size={28} />
                              ))}
                              {item.evidences.length > 4 && (
                                <span className="small muted">+{item.evidences.length - 4}</span>
                              )}
                            </span>
                          )}
                        </button>
                      </td>
                      <td>
                        <Select
                          className="select-inline"
                          disabled={!canEdit}
                          options={meta.data?.environment ?? []}
                          emptyLabel="—"
                          value={item.environment ?? ''}
                          onChange={(event) =>
                            patch(item, { environment: (event.target.value || null) as never })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="select-inline"
                          disabled={!canEdit}
                          value={item.automated ? 'Yes' : 'No'}
                          onChange={(event) => patch(item, { automated: event.target.value === 'Yes' })}
                        >
                          <option value="No">No</option>
                          <option value="Yes">Yes</option>
                        </select>
                      </td>
                      <td>
                        <StatusSelect
                          disabled={!canEdit}
                          options={meta.data?.caseStatus ?? []}
                          value={item.qaStatus}
                          onChange={(value) => patch(item, { qaStatus: value as never })}
                        />
                      </td>
                      <td>
                        <StatusSelect
                          disabled={!canEdit}
                          options={meta.data?.caseStatus ?? []}
                          value={item.stageStatus}
                          onChange={(value) => patch(item, { stageStatus: value as never })}
                        />
                      </td>
                      <td>
                        <select
                          className="select-inline"
                          disabled={!canEdit}
                          value={item.responsibleId ?? ''}
                          onChange={(event) => patch(item, { responsibleId: event.target.value || null })}
                        >
                          <option value="">—</option>
                          {(people.data ?? []).map((person) => (
                            <option key={person.id} value={person.id}>{person.name}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {updateCase.isError && <ErrorBanner error={updateCase.error} />}
      </div>

      {selected && id && (
        <CaseDrawer
          testCase={selected}
          suiteId={id}
          platform={suite.data.platform}
          onClose={() => setOpenCase(null)}
        />
      )}
    </>
  )
}
