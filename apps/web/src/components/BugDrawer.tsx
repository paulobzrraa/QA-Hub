import { useEffect } from 'react'
import { useMeta, useUpdateBug } from '../lib/queries'
import type { Bug, RetestSuggestion } from '../lib/types'
import { useAuth } from '../lib/auth'
import { Accordion, Field, StatusPill, StatusSelect, formatDate } from './ui'
import { Timeline } from './Timeline'

/**
 * Painel do bug (US-5.2).
 *
 * Existe porque o critério pede a linha do tempo "no painel do cenário e do
 * bug" — e o bug não tinha painel: até aqui ele só era editável pelo status em
 * linha na listagem. Este painel mostra o registro inteiro e o histórico; a
 * edição continua sendo a do status, agora também daqui.
 */
export function BugDrawer({
  bug, onClose, onRetest,
}: { bug: Bug; onClose: () => void; onRetest: (items: RetestSuggestion[]) => void }) {
  const meta = useMeta()
  const update = useUpdateBug()
  const { can } = useAuth()

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <h2>{bug.jiraKey ?? `#${bug.number}`}</h2>
            <p className="subtitle">{bug.description ?? 'Bug sem descrição'}</p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className="drawer-body">
          <div className="form-grid">
            <Field label="Severidade">
              <div><StatusPill status={bug.severity} /></div>
            </Field>
            <Field label="Status">
              <div>
                <StatusSelect
                  options={meta.data?.bugStatus ?? []}
                  value={bug.status}
                  disabled={!can('editor')}
                  onChange={(value) =>
                    update.mutate(
                      { id: bug.id, data: { status: value as never } },
                      { onSuccess: (result) => onRetest(result.retestSuggested) },
                    )
                  }
                />
              </div>
            </Field>
            <Field label="Plataforma">
              <div className="small muted">{bug.platform}</div>
            </Field>
            <Field label="Área afetada">
              <div className="small muted">{bug.affectedArea?.name ?? '—'}</div>
            </Field>
            <Field label="Responsável">
              <div className="small muted">{bug.responsible?.name ?? '—'}</div>
            </Field>
            <Field label="US relacionada">
              <div className="small muted">{bug.relatedUs ?? '—'}</div>
            </Field>
            <Field label="Criado em">
              <div className="small muted">{formatDate(bug.reportedDate)}</div>
            </Field>
            <Field label="Corrigido em">
              <div className="small muted">{formatDate(bug.fixedDate)}</div>
            </Field>
          </div>

          <Field label="Lead time">
            <div className="small muted">
              {bug.leadTimeDays === null
                ? '—'
                : `${bug.leadTimeDays} dia(s)${bug.leadTimeOpen ? ' — ainda em aberto' : ''}`}
            </div>
          </Field>

          {bug.notes && (
            <Field label="Notas">
              <div className="small muted">{bug.notes}</div>
            </Field>
          )}

          <Accordion title="Histórico de alterações" defaultOpen>
            <Timeline entity="bug" id={bug.id} />
          </Accordion>
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
