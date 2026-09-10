import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, FileSpreadsheet, FileText } from 'lucide-react'
import { api } from '../lib/api'
import {
  useAutomationCoverage, useMeta, useMetricHistory, useSuites, type CoverageFilters,
} from '../lib/queries'
import { Empty, ErrorBanner, Field, Loading, ProgressBar, Select, StatusPill, Tag } from '../components/ui'
import { LineChart, type LineChartSeries } from '../components/LineChart'

type Period = '30' | '90' | 'all'

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: '30', label: '30 dias' },
  { value: '90', label: '90 dias' },
  { value: 'all', label: 'Tudo' },
]

const formatCount = (value: number) => String(Math.round(value))

/**
 * Métricas (Fase 3) — evolução no tempo (US-3.2) e cobertura de automação
 * (US-3.3). Nenhum número nesta página é digitado à mão: tudo deriva dos
 * cenários, bugs e snapshots reais.
 */
export function MetricsPage() {
  const history = useMetricHistory()
  const [period, setPeriod] = useState<Period>('30')

  const meta = useMeta()
  const [coverageFilters, setCoverageFilters] = useState<CoverageFilters>({})
  const coverage = useAutomationCoverage(coverageFilters)

  const [reportSquad, setReportSquad] = useState('')
  const [reportPlatform, setReportPlatform] = useState('')
  const [reportSuiteIds, setReportSuiteIds] = useState<string[]>([])
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const reportSuites = useSuites({ squad: reportSquad || undefined, platform: reportPlatform || undefined })

  const reportQuery = {
    squad: reportSquad || undefined,
    platform: reportPlatform || undefined,
    suiteIds: reportSuiteIds.length ? reportSuiteIds.join(',') : undefined,
    from: reportFrom || undefined,
    to: reportTo || undefined,
  }

  const snapshots = useMemo(() => {
    const all = history.data ?? []
    if (period === 'all') return all
    const days = period === '30' ? 30 : 90
    const cutoff = new Date()
    cutoff.setUTCDate(cutoff.getUTCDate() - days)
    return all.filter((item) => new Date(item.date) >= cutoff)
  }, [history.data, period])

  const setCoverage = (key: keyof CoverageFilters) => (value: string) =>
    setCoverageFilters((current) => ({ ...current, [key]: value || undefined }))
  const hasCoverageFilters = Boolean(coverageFilters.squad || coverageFilters.platform)

  const zeroAutomationCount = coverage.data?.filter((row) => row.zeroAutomationAtCompletion).length ?? 0

  if (history.isLoading) return <Loading />
  if (history.isError) return <div className="content"><ErrorBanner error={history.error} /></div>

  const executionSeries: LineChartSeries[] = [
    {
      key: 'executed',
      label: 'Executados',
      color: 'var(--accent)',
      points: snapshots.map((item) => ({ date: item.date, value: item.executedCases })),
    },
    {
      key: 'automated',
      label: 'Automatizados',
      color: 'var(--ok)',
      points: snapshots.map((item) => ({ date: item.date, value: item.automatedCases })),
    },
  ]

  const bugsSeries: LineChartSeries[] = [
    {
      key: 'openBugs',
      label: 'Bugs em aberto',
      color: 'var(--danger)',
      points: snapshots.map((item) => ({ date: item.date, value: item.openBugs })),
    },
  ]

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Métricas</h1>
          <p className="subtitle">Evolução no tempo e cobertura de automação — nenhum número aqui é digitado à mão</p>
        </div>
      </header>

      <div className="content stack">
        <div className="toolbar">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`btn ghost${period === option.value ? ' active' : ''}`}
              onClick={() => setPeriod(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-head"><h2>Cenários executados × automatizados</h2></div>
          <div className="card-body">
            <LineChart series={executionSeries} valueFormat={formatCount} />
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Bugs em aberto</h2></div>
          <div className="card-body">
            <LineChart series={bugsSeries} areaFill valueFormat={formatCount} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Cobertura de automação</h2>
            <span className="small muted">{coverage.data?.length ?? 0} ciclos</span>
          </div>
          <div className="card-body stack">
            {/* Ranking por menor taxa de automação ponderada por volume: o
                backend já ordena por cenários manuais (não pela taxa crua),
                então uma suíte de 3 cenários nunca disputa o topo com uma de
                300 só por ter 0% também. */}
            <div className="toolbar">
              <Select
                options={meta.data?.squad ?? []}
                emptyLabel="Squad"
                value={coverageFilters.squad ?? ''}
                onChange={(event) => setCoverage('squad')(event.target.value)}
              />
              <Select
                options={meta.data?.platform ?? []}
                emptyLabel="Plataforma"
                value={coverageFilters.platform ?? ''}
                onChange={(event) => setCoverage('platform')(event.target.value)}
              />
              {hasCoverageFilters && (
                <button type="button" className="btn ghost" onClick={() => setCoverageFilters({})}>
                  Limpar
                </button>
              )}
            </div>

            {zeroAutomationCount > 0 && (
              <div className="banner danger">
                <AlertTriangle size={14} style={{ verticalAlign: -2, marginRight: 4 }} />
                {zeroAutomationCount} ciclo{zeroAutomationCount > 1 ? 's' : ''} concluído
                {zeroAutomationCount > 1 ? 's' : ''} sem nenhum cenário automatizado.
              </div>
            )}

            {coverage.isError && <ErrorBanner error={coverage.error} />}

            {coverage.isLoading ? (
              <Loading />
            ) : !coverage.data?.length ? (
              <Empty title="Nenhum ciclo encontrado">Ajuste os filtros para ver mais resultados.</Empty>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ciclo</th>
                      <th>Squad</th>
                      <th>Status</th>
                      <th className="num">Cenários</th>
                      <th className="num">Manuais</th>
                      <th>Automação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coverage.data.map((row) => (
                      <tr key={row.id} className={row.zeroAutomationAtCompletion ? 'row-flagged' : undefined}>
                        <td>
                          <Link to={`/suites/${row.id}`} className="cell-title">{row.name}</Link>
                          <div className="cell-sub">
                            <Tag>{row.platform}</Tag>
                            {row.zeroAutomationAtCompletion && (
                              <span className="flag-inline" title="Concluído sem nenhum cenário automatizado">
                                {' '}<AlertTriangle size={12} /> concluído sem automação
                              </span>
                            )}
                          </div>
                        </td>
                        <td>{row.squad ?? <span className="subtle">—</span>}</td>
                        <td className="tight"><StatusPill status={row.status} /></td>
                        <td className="num">{row.total}</td>
                        <td className="num">{row.manual}</td>
                        <td style={{ minWidth: 160 }}><ProgressBar value={row.automationRate} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h2>Relatório final</h2></div>
          <div className="card-body stack">
            {/* Reproduz a aba "4. Final Report": resumo + bugs + reprovados,
                recalculado na hora pro escopo escolhido — nunca uma cópia
                estática de planilha de release em release. */}
            <div className="form-grid">
              <Field label="Squad">
                <select
                  className="select"
                  value={reportSquad}
                  onChange={(event) => { setReportSquad(event.target.value); setReportSuiteIds([]) }}
                >
                  <option value="">Todos</option>
                  {(meta.data?.squad ?? []).map((squad) => (
                    <option key={squad} value={squad}>{squad}</option>
                  ))}
                </select>
              </Field>
              <Field label="Plataforma">
                <select
                  className="select"
                  value={reportPlatform}
                  onChange={(event) => { setReportPlatform(event.target.value); setReportSuiteIds([]) }}
                >
                  <option value="">Web + App</option>
                  {(meta.data?.platform ?? []).map((platform) => (
                    <option key={platform} value={platform}>{platform}</option>
                  ))}
                </select>
              </Field>
              <Field label="De">
                <input type="date" className="input" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} />
              </Field>
              <Field label="Até">
                <input type="date" className="input" value={reportTo} onChange={(event) => setReportTo(event.target.value)} />
              </Field>
            </div>

            <Field label={`Ciclos específicos (opcional — ${reportSuiteIds.length || 'todos os'} selecionado${reportSuiteIds.length === 1 ? '' : 's'})`}>
              <select
                multiple
                className="select"
                style={{ height: 120 }}
                value={reportSuiteIds}
                onChange={(event) =>
                  setReportSuiteIds(Array.from(event.target.selectedOptions, (option) => option.value))
                }
              >
                {(reportSuites.data ?? []).map((suite) => (
                  <option key={suite.id} value={suite.id}>{suite.name}</option>
                ))}
              </select>
            </Field>
            <p className="small muted">
              Ctrl/Cmd + clique para escolher mais de um ciclo. Deixe em branco para incluir todos os que
              casarem com squad, plataforma e período.
            </p>

            <div className="toolbar">
              <a
                className="btn primary"
                href={`/api/reports/final${api.query({ ...reportQuery, format: 'pdf' })}`}
              >
                <FileText size={15} /> Exportar PDF
              </a>
              <a
                className="btn ghost"
                href={`/api/reports/final${api.query({ ...reportQuery, format: 'xlsx' })}`}
              >
                <FileSpreadsheet size={15} /> Exportar xlsx
              </a>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
