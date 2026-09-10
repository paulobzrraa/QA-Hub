import { percent } from '@qahub/shared'
import { useOverview } from '../lib/queries'
import { Empty, ErrorBanner, Loading, ProgressBar, Stat, StatusPill, statusTone } from '../components/ui'

/**
 * Dashboard executivo (US-3.1) — visão consolidada pra apresentar status à
 * liderança sem montar slide. Cenários × automação por plataforma, squad e
 * responsável, sempre nas mesmas quatro colunas, pra comparar igual.
 *
 * A planilha usava pizza 3D para distribuição de status; aqui a mesma
 * informação vira uma barra proporcional com rótulo direto, que compara
 * fatias com muito mais precisão do que setores em perspectiva — mesma
 * técnica usada para bugs em aberto por severidade.
 *
 * Nenhum número aqui é digitado à mão: tudo vem de `computeMetrics` sobre
 * os cenários e bugs reais.
 */
export function OverviewPage() {
  const overview = useOverview()

  if (overview.isLoading) return <Loading />
  if (overview.isError) return <div className="content"><ErrorBanner error={overview.error} /></div>
  if (!overview.data) return null

  const { totals, byPlatform, bySquad, statusCounts, byPerson, bugsBySeverity } = overview.data

  const statusEntries = Object.entries(statusCounts).sort((a, b) => b[1] - a[1])
  const statusTotal = statusEntries.reduce((sum, [, count]) => sum + count, 0)

  const openSeverityEntries = bugsBySeverity.filter((item) => item.count > 0)
  const openBugsTotal = openSeverityEntries.reduce((sum, item) => sum + item.count, 0)

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Visão Geral</h1>
          <p className="subtitle">Consolidado calculado a partir dos cenários e bugs reais</p>
        </div>
      </header>

      <div className="content stack">
        <div className="stat-grid">
          <Stat label="Ciclos" value={totals.suites} />
          <Stat label="Cenários" value={totals.total} hint={totals.removed ? `${totals.removed} removidos` : undefined} />
          <Stat label="Execução" value={percent(totals.executionRate)} hint={`${totals.executed} executados`} />
          <Stat label="Automação" value={percent(totals.automationRate)} hint={`${totals.automated} automatizados`} />
          <Stat label="Aprovação" value={percent(totals.passRate)} hint={`${totals.failed} falhas`} />
        </div>

        <BreakdownTable title="Por plataforma" columnLabel="Plataforma" rows={byPlatform.map((row) => ({
          key: row.platform, label: row.platform, suites: row.suites, metrics: row.metrics,
        }))} />

        <BreakdownTable title="Por squad" columnLabel="Squad" rows={bySquad.map((row) => ({
          key: row.squad, label: row.squad, suites: row.suites, metrics: row.metrics,
        }))} />

        <div className="card">
          <div className="card-head">
            <h2>Ciclos por status</h2>
            <span className="small muted">{statusTotal} ciclos</span>
          </div>
          <div className="card-body stack">
            {/* Barra proporcional: 2px de respiro entre segmentos, como manda a
                anatomia de marcas — sem isso as fatias vizinhas se fundem.
                Cada fatia também revela status e contagem num tooltip com a
                cara da pill de status, já no hover — a legenda abaixo continua
                a leitura fixa, sem depender de passar o mouse. */}
            <div style={{ display: 'flex', gap: 2 }}>
              {statusEntries.map(([status, count]) => (
                <div key={status} className="seg-wrap" style={{ flex: count, minWidth: 10 }}>
                  <div className={`seg ${statusTone(status)}`} />
                  <div className={`seg-tip pill ${statusTone(status)}`} role="tooltip">
                    {status} · {count}
                  </div>
                </div>
              ))}
            </div>
            <div className="status-legend">
              {statusEntries.map(([status, count]) => (
                <span key={status} className="status-legend-item">
                  <StatusPill status={status} />
                  <span className="small muted">{count}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h2>Bugs em aberto por severidade</h2>
            <span className="small muted">{openBugsTotal} bugs</span>
          </div>
          <div className="card-body stack">
            {!openSeverityEntries.length ? (
              <Empty title="Nenhum bug em aberto">Web e App estão com os bugs em dia.</Empty>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 2 }}>
                  {openSeverityEntries.map(({ severity, count }) => (
                    <div key={severity} className="seg-wrap" style={{ flex: count, minWidth: 10 }}>
                      <div className={`seg ${statusTone(severity)}`} />
                      <div className={`seg-tip pill ${statusTone(severity)}`} role="tooltip">
                        {severity} · {count}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="status-legend">
                  {openSeverityEntries.map(({ severity, count }) => (
                    <span key={severity} className="status-legend-item">
                      <StatusPill status={severity} />
                      <span className="small muted">{count}</span>
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <BreakdownTable title="Carga por responsável" columnLabel="Responsável" rows={byPerson.map((row) => ({
          key: row.name, label: row.name, suites: row.suites, metrics: row.metrics,
        }))} />
      </div>
    </>
  )
}

/**
 * Tabela de cenários × automação — mesma forma pras três quebras (plataforma,
 * squad, responsável), pra dar pra comparar uma com a outra sem reaprender a
 * leitura a cada seção.
 */
function BreakdownTable({
  title, columnLabel, rows,
}: {
  title: string
  columnLabel: string
  rows: { key: string; label: string; suites: number; metrics: { total: number; executionRate: number; automationRate: number } }[]
}) {
  return (
    <div className="card">
      <div className="card-head"><h2>{title}</h2></div>
      {!rows.length ? (
        <Empty title="Sem dados" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{columnLabel}</th>
                <th className="num">Ciclos</th>
                <th className="num">Cenários</th>
                <th>Execução</th>
                <th>Automação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="cell-title">{row.label}</td>
                  <td className="num">{row.suites}</td>
                  <td className="num">{row.metrics.total}</td>
                  <td style={{ minWidth: 180 }}><ProgressBar value={row.metrics.executionRate} /></td>
                  <td style={{ minWidth: 180 }}><ProgressBar value={row.metrics.automationRate} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
