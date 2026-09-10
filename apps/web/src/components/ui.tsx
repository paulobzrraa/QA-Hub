import { useEffect, useRef, useState, type ReactNode, type SelectHTMLAttributes } from 'react'
import { Check, ChevronDown, Copy } from 'lucide-react'
import { percent, type CaseStatus, type SuiteStatus } from '@qahub/shared'

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent'

/**
 * Cor por status. Segue a leitura do time: verde só para o que passou,
 * vermelho para o que falhou, âmbar para o que está parado esperando alguém.
 */
const STATUS_TONE: Record<string, Tone> = {
  Approved: 'ok',
  Completed: 'ok',
  Failed: 'danger',
  Blocked: 'danger',
  'In progress': 'accent',
  Testing: 'accent',
  Bugfix: 'warn',
  Retested: 'info',
  Postponed: 'warn',
  Removed: 'neutral',
  Backlog: 'neutral',
  'To Do': 'neutral',
  // Status de bug — Open é o que precisa de atenção; Canceled não conta.
  Open: 'warn',
  Resolved: 'ok',
  Canceled: 'neutral',
  // Severidade de bug — reaproveita as mesmas pills, cores por gravidade.
  Low: 'neutral',
  Medium: 'info',
  High: 'warn',
  Critical: 'danger',
  Highest: 'danger',
  // Situação da conta de massa de teste (US-4.1).
  Ativo: 'ok',
  Suspenso: 'warn',
  Excluída: 'neutral',
}

/** Tom de um status, para reusar a mesma cor fora da pill (barras, legendas). */
export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral'
}

export function StatusPill({ status }: { status: CaseStatus | SuiteStatus | string }) {
  return <span className={`pill ${STATUS_TONE[status] ?? 'neutral'}`}>{status}</span>
}

export function Tag({ children }: { children: ReactNode }) {
  return <span className="tag">{children}</span>
}

/** Status na tabela: pill visível, select por cima para trocar em um clique. */
export function StatusSelect({
  options, value, onChange, disabled,
}: {
  options: readonly string[]
  value: string
  onChange: (value: string) => void
  /** Sem permissão de execução (US-5.1): a pill continua legível, sem editar. */
  disabled?: boolean
}) {
  if (disabled) return <StatusPill status={value} />
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <StatusPill status={value} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label="Alterar status"
        style={{
          position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer',
        }}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </div>
  )
}

/** Barra de progresso 0..1. Vira verde ao completar e âmbar quando nada andou. */
export function ProgressBar({ value, showLabel = true }: { value: number; showLabel?: boolean }) {
  const tone = value >= 1 ? 'ok' : value === 0 ? 'warn' : ''
  return (
    <div className="bar-row">
      <div className={`bar ${tone}`} role="progressbar" aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
        <i style={{ width: `${Math.min(value, 1) * 100}%` }} />
      </div>
      {showLabel && <span className="pct">{percent(value)}</span>}
    </div>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

/** Seção recolhível — mesma casca de `.card`, com o corpo escondido a um clique. */
export function Accordion({
  title, defaultOpen = true, children,
}: { title: ReactNode; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="card">
      <button
        type="button"
        className="card-head accordion-head"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
      >
        <h2>{title}</h2>
        <ChevronDown size={16} className={`accordion-chevron${open ? ' open' : ''}`} />
      </button>
      {open && <div className="card-body">{children}</div>}
    </div>
  )
}

/**
 * Copia um valor para a área de transferência e confirma na própria etiqueta.
 *
 * `value` pode ser uma função assíncrona: é assim que a senha é copiada sem
 * nunca ter estado na tela nem na listagem — ela é buscada no clique, vai
 * direto para a área de transferência e não fica guardada em estado.
 */
export function CopyButton({
  value, label, title,
}: { value: string | (() => Promise<string>); label?: string; title: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'error'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>()

  // Se a linha sair da tela antes dos 2s, o timer não pode tentar atualizar
  // um componente que já foi desmontado.
  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    clearTimeout(timer.current)
    try {
      const text = typeof value === 'function' ? await value() : value
      await navigator.clipboard.writeText(text)
      setState('done')
    } catch {
      setState('error')
    }
    timer.current = setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      type="button"
      className={`copy-btn${state === 'done' ? ' done' : ''}${state === 'error' ? ' failed' : ''}`}
      onClick={copy}
      title={state === 'error' ? 'Não foi possível copiar' : title}
      aria-label={title}
    >
      {state === 'done' ? <Check size={13} /> : <Copy size={13} />}
      {label && <span>{state === 'done' ? 'Copiado' : state === 'error' ? 'Falhou' : label}</span>}
    </button>
  )
}

export function Field({
  label, error, children, span,
}: { label: string; error?: string; children: ReactNode; span?: boolean }) {
  return (
    <div className={`field${span ? ' span-2' : ''}`}>
      <label>{label}</label>
      {children}
      {error && <span className="error">{error}</span>}
    </div>
  )
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly string[]
  /** Rótulo da opção vazia. Ausente = campo obrigatório. */
  emptyLabel?: string
}

/**
 * Select alimentado pelas listas de `/api/meta`, que são as mesmas usadas na
 * validação do backend — o front nunca declara opções próprias.
 */
export function Select({ options, emptyLabel, ...props }: SelectProps) {
  return (
    <select {...props} className={props.className ?? 'select'}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {options.map((option) => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return <div className="empty">{label}</div>
}

export function ErrorBanner({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : 'Erro inesperado'
  return <div className="banner danger">{message}</div>
}

/** Data curta em pt-BR; `null` vira travessao. */
export function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
