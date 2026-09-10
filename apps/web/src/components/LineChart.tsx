import { useMemo, useRef, useState, type PointerEvent } from 'react'

export interface LineChartSeries {
  key: string
  label: string
  color: string
  points: { date: string; value: number }[]
}

interface Margin { top: number; right: number; bottom: number; left: number }

const MARGIN: Margin = { top: 12, right: 16, bottom: 24, left: 44 }
const VIEW_WIDTH = 640

/** Teto do eixo Y arredondado pra um número "redondo" (0, 25, 50…, nunca 47). */
function niceMax(value: number): number {
  if (value <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const normalized = value / magnitude
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * magnitude
}

function formatDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
}

/**
 * Gráfico de linha construído à mão em SVG — mesma filosofia das barras
 * proporcionais já usadas no resto do app, sem trazer uma lib de gráficos
 * só pra isso. Um eixo Y só: quem chama decide o que entra numa mesma
 * instância (nunca duas medidas de escala diferente juntas).
 */
export function LineChart({
  series, height = 220, areaFill = false, valueFormat = String,
}: {
  series: LineChartSeries[]
  height?: number
  /** Faz sentido só com uma série — com duas, os preenchimentos se sobrepõem. */
  areaFill?: boolean
  valueFormat?: (value: number) => string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const dates = series[0]?.points.map((point) => point.date) ?? []
  const innerWidth = VIEW_WIDTH - MARGIN.left - MARGIN.right
  const innerHeight = height - MARGIN.top - MARGIN.bottom

  const maxValue = niceMax(Math.max(1, ...series.flatMap((item) => item.points.map((point) => point.value))))

  const xAt = (index: number) =>
    dates.length <= 1 ? MARGIN.left : MARGIN.left + (index / (dates.length - 1)) * innerWidth
  const yAt = (value: number) => MARGIN.top + innerHeight - (value / maxValue) * innerHeight

  const linePath = (points: { value: number }[]) =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index)} ${yAt(point.value)}`).join(' ')

  const areaPath = (points: { value: number }[]) =>
    `${linePath(points)} L ${xAt(points.length - 1)} ${yAt(0)} L ${xAt(0)} ${yAt(0)} Z`

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((fraction) => Math.round(maxValue * fraction))

  // No máximo 5 rótulos no eixo X, por mais denso que seja o histórico.
  const xTickIndexes = useMemo(() => {
    if (dates.length === 0) return []
    if (dates.length === 1) return [0]
    const count = Math.min(5, dates.length)
    return Array.from({ length: count }, (_, i) => Math.round((i / (count - 1)) * (dates.length - 1)))
  }, [dates.length])

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const svg = svgRef.current
    if (!svg || dates.length === 0) return
    const rect = svg.getBoundingClientRect()
    const pointerX = ((event.clientX - rect.left) / rect.width) * VIEW_WIDTH
    let closest = 0
    let closestDistance = Infinity
    for (let index = 0; index < dates.length; index += 1) {
      const distance = Math.abs(xAt(index) - pointerX)
      if (distance < closestDistance) {
        closestDistance = distance
        closest = index
      }
    }
    setHoverIndex(closest)
  }

  if (dates.length < 2) {
    return (
      <div className="chart-empty">
        {dates.length === 1
          ? 'Só um dia de histórico até agora — a tendência aparece a partir de amanhã.'
          : 'Sem histórico ainda.'}
      </div>
    )
  }

  return (
    <div className="line-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        className="line-chart-svg"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={MARGIN.left} x2={VIEW_WIDTH - MARGIN.right} y1={yAt(tick)} y2={yAt(tick)} className="chart-grid" />
            <text x={MARGIN.left - 8} y={yAt(tick)} className="chart-axis-label" textAnchor="end" dy="0.32em">
              {valueFormat(tick)}
            </text>
          </g>
        ))}

        {xTickIndexes.map((index) => (
          <text key={index} x={xAt(index)} y={height - 6} className="chart-axis-label" textAnchor="middle">
            {formatDayMonth(dates[index])}
          </text>
        ))}

        {series.map((item) => {
          const last = item.points[item.points.length - 1]
          return (
            <g key={item.key}>
              {areaFill && <path d={areaPath(item.points)} fill={item.color} fillOpacity={0.1} stroke="none" />}
              <path
                d={linePath(item.points)}
                fill="none"
                stroke={item.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx={xAt(item.points.length - 1)} cy={yAt(last.value)} r={5} className="chart-end-ring" />
              <circle cx={xAt(item.points.length - 1)} cy={yAt(last.value)} r={4} fill={item.color} />
            </g>
          )
        })}

        {hoverIndex !== null && (
          <>
            <line
              x1={xAt(hoverIndex)} x2={xAt(hoverIndex)}
              y1={MARGIN.top} y2={height - MARGIN.bottom}
              className="chart-crosshair"
            />
            {series.map((item) => (
              <circle
                key={item.key}
                cx={xAt(hoverIndex)}
                cy={yAt(item.points[hoverIndex as number].value)}
                r={4}
                fill={item.color}
                className="chart-hover-dot"
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </svg>

      {hoverIndex !== null && (
        <div
          className="chart-tooltip"
          style={{ left: `${Math.min(90, Math.max(10, (xAt(hoverIndex) / VIEW_WIDTH) * 100))}%` }}
        >
          <div className="chart-tooltip-date">{formatFullDate(dates[hoverIndex])}</div>
          {series.map((item) => (
            <div key={item.key} className="chart-tooltip-row">
              <span className="chart-legend-key" style={{ background: item.color }} />
              <span className="small muted">{item.label}</span>
              <strong>{valueFormat(item.points[hoverIndex as number].value)}</strong>
            </div>
          ))}
        </div>
      )}

      {series.length > 1 && (
        <div className="chart-legend">
          {series.map((item) => (
            <span key={item.key} className="chart-legend-item">
              <span className="chart-legend-key" style={{ background: item.color }} />
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
