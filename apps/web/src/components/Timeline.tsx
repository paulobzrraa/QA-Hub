import { History } from 'lucide-react'
import { useHistory } from '../lib/queries'
import { Empty, ErrorBanner, Loading } from './ui'

/** Data e hora curtas em pt-BR. */
function moment(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
      })
}

/** Campo esvaziado aparece como "vazio", não como um espaço em branco mudo. */
function value(text: string | null) {
  return text === null || text === ''
    ? <em className="subtle">vazio</em>
    : <span className="tl-value">{text}</span>
}

/**
 * Linha do tempo de alterações (US-5.2).
 *
 * Uma entrada por CAMPO alterado, com quem mudou e quando — que é a pergunta
 * real do time: "por que este status mudou". Só o que mudou de valor aparece;
 * salvar o formulário sem alterar nada não gera linha.
 */
export function Timeline({ entity, id }: { entity: 'case' | 'bug' | 'suite' | 'account'; id: string }) {
  const history = useHistory(entity, id)

  if (history.isLoading) return <Loading label="Carregando histórico…" />
  if (history.isError) return <ErrorBanner error={history.error} />

  const entries = history.data?.entries ?? []
  if (!entries.length) {
    return <Empty title="Sem alterações registradas">O histórico começa na primeira edição feita pelo sistema.</Empty>
  }

  return (
    <>
      <ol className="timeline">
        {entries.map((entry) => (
          <li key={entry.id}>
            <div className="tl-head">
              <strong>{entry.label}</strong>
              <span className="tl-when">{moment(entry.createdAt)}</span>
            </div>
            <div className="tl-change">
              {/* Evento não tem valor anterior — a seta partindo de "vazio"
                  seria ruído, não informação. */}
              {entry.kind === 'event' ? (
                <span className="tl-event">{entry.newValue}</span>
              ) : (
                <>
                  {value(entry.oldValue)}
                  <span className="tl-arrow" aria-label="mudou para">→</span>
                  {value(entry.newValue)}
                </>
              )}
            </div>
            <div className="cell-sub">
              {entry.actor ? entry.actor.name : 'Importação da planilha'}
            </div>
          </li>
        ))}
      </ol>
      <p className="small muted" style={{ marginTop: 8 }}>
        <History size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
        Histórico guardado por {history.data?.retentionMonths} meses.
      </p>
    </>
  )
}
