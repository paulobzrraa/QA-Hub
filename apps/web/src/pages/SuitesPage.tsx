import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { api } from '../lib/api'
import { useMeta, usePeople, useSuites, type SuiteFilters } from '../lib/queries'
import { useAuth } from '../lib/auth'
import { Empty, ErrorBanner, Loading, ProgressBar, Select, StatusPill, Tag, formatDate } from '../components/ui'
import { NewSuiteDialog } from '../components/NewSuiteDialog'

export function SuitesPage() {
  const { can } = useAuth()
  const [filters, setFilters] = useState<SuiteFilters>({})
  const [creating, setCreating] = useState(false)

  const meta = useMeta()
  const people = usePeople()
  const suites = useSuites(filters)

  const set = (key: keyof SuiteFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }))

  const totals = useMemo(() => {
    const list = suites.data ?? []
    return {
      suites: list.length,
      cases: list.reduce((sum, item) => sum + item.metrics.total, 0),
      automated: list.reduce((sum, item) => sum + item.metrics.automated, 0),
    }
  }, [suites.data])

  const hasFilters = Object.values(filters).some(Boolean)

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Ciclos de testes</h1>
          <p className="subtitle">
            {totals.suites} ciclos · {totals.cases} cenários · {totals.automated} automatizados
          </p>
        </div>
        <div className="toolbar">
          {/* Exporta exatamente o recorte que está na tela (US-4.4): sem
              filtro, sai a base completa. */}
          <a className="btn" href={`/api/export/xlsx${api.query(filters)}`} title="Exportar no formato da planilha original">
            <FileSpreadsheet size={15} />
            Exportar xlsx{hasFilters ? ' (filtrado)' : ''}
          </a>
          {can('editor') && (
            <button type="button" className="btn primary" onClick={() => setCreating(true)}>
              Novo ciclo
            </button>
          )}
        </div>
      </header>

      <div className="content stack">
        <div className="toolbar">
          <input
            className="input search"
            placeholder="Buscar por nome ou chave do Jira…"
            value={filters.q ?? ''}
            onChange={(event) => set('q')(event.target.value)}
          />
          <Select
            options={meta.data?.platform ?? []}
            emptyLabel="Plataforma"
            value={filters.platform ?? ''}
            onChange={(event) => set('platform')(event.target.value)}
          />
          <Select
            options={meta.data?.squad ?? []}
            emptyLabel="Squad"
            value={filters.squad ?? ''}
            onChange={(event) => set('squad')(event.target.value)}
          />
          <Select
            options={meta.data?.suiteStatus ?? []}
            emptyLabel="Status"
            value={filters.status ?? ''}
            onChange={(event) => set('status')(event.target.value)}
          />
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
            <button type="button" className="btn ghost" onClick={() => setFilters({})}>
              Limpar
            </button>
          )}
        </div>

        {suites.isError && <ErrorBanner error={suites.error} />}

        <div className="card">
          {suites.isLoading ? (
            <Loading />
          ) : !suites.data?.length ? (
            <Empty title="Nenhum ciclo encontrado">
              {hasFilters ? 'Ajuste os filtros para ver mais resultados.' : 'Crie o primeiro ciclo para começar.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ciclo</th>
                    <th>Status</th>
                    <th>Responsável</th>
                    <th className="num">Cenários</th>
                    <th>Execução</th>
                    <th>Automação</th>
                    <th>Período</th>
                  </tr>
                </thead>
                <tbody>
                  {suites.data.map((suite) => (
                    <tr key={suite.id}>
                      <td>
                        <Link to={`/suites/${suite.id}`} className="cell-title">
                          {suite.name}
                        </Link>
                        <div className="cell-sub">
                          {suite.jiraKey && <span className="code">{suite.jiraKey} · </span>}
                          <Tag>{suite.platform}</Tag>
                          {suite.squad && <> <Tag>{suite.squad}</Tag></>}
                        </div>
                      </td>
                      <td className="tight"><StatusPill status={suite.status} /></td>
                      <td className="tight">{suite.responsible?.name ?? <span className="subtle">—</span>}</td>
                      <td className="num">
                        {suite.metrics.total}
                        {suite.metrics.removed > 0 && (
                          <div className="cell-sub small">+{suite.metrics.removed} removidos</div>
                        )}
                      </td>
                      <td>
                        <ProgressBar value={suite.metrics.executionRate} />
                        <div className="cell-sub small">
                          {suite.metrics.executed}/{suite.metrics.total} · {suite.metrics.failed} falhas
                        </div>
                      </td>
                      <td>
                        <ProgressBar value={suite.metrics.automationRate} />
                        <div className="cell-sub small">
                          {suite.metrics.automated} auto · {suite.metrics.manual} manual
                        </div>
                      </td>
                      <td className="tight small muted">
                        {formatDate(suite.startDate)} – {formatDate(suite.endDate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {creating && <NewSuiteDialog onClose={() => setCreating(false)} />}
    </>
  )
}
