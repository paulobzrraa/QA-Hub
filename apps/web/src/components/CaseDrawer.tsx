import { useEffect, useState } from 'react'
import type { Platform } from '@qahub/shared'
import { useBugs, useDeleteCase, useLinkBug, useMeta, usePeople, useUnlinkBug, useUpdateCase } from '../lib/queries'
import { ApiError } from '../lib/api'
import type { TestCase } from '../lib/types'
import { Field, Select, StatusPill } from './ui'
import { ReportBugDialog } from './ReportBugDialog'
import { EvidenceField } from './EvidenceField'
import { Timeline } from './Timeline'
import { Accordion } from './ui'

/** Campos editáveis do cenário, no formato do formulário (strings). */
type FormState = {
  code: string
  jiraKey: string
  scenario: string
  objective: string
  bdd: string
  testData: string
  environment: string
  automated: boolean
  responsibleId: string
  qaStatus: string
  stageStatus: string
  notes: string
}

function toForm(item: TestCase): FormState {
  return {
    code: item.code,
    jiraKey: item.jiraKey ?? '',
    scenario: item.scenario ?? '',
    objective: item.objective ?? '',
    bdd: item.bdd ?? '',
    testData: item.testData ?? '',
    environment: item.environment ?? '',
    automated: item.automated,
    responsibleId: item.responsibleId ?? '',
    qaStatus: item.qaStatus,
    stageStatus: item.stageStatus,
    notes: item.notes ?? '',
  }
}

export function CaseDrawer({
  testCase, suiteId, platform, onClose,
}: { testCase: TestCase; suiteId: string; platform: Platform; onClose: () => void }) {
  const meta = useMeta()
  const people = usePeople({ active: 'true' })
  const update = useUpdateCase(suiteId)
  const remove = useDeleteCase(suiteId)

  const [form, setForm] = useState<FormState>(() => toForm(testCase))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [reporting, setReporting] = useState(false)

  // US-2.6: reprovar oferece a criação do bug — só enquanto não houver um já vinculado.
  const failed = form.qaStatus === 'Failed' || form.stageStatus === 'Failed'
  const offerReport = failed && !testCase.bugs.length

  // Ao trocar de cenário sem fechar o painel, recarrega o formulário.
  useEffect(() => setForm(toForm(testCase)), [testCase.id])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = <K extends keyof FormState>(key: K) => (value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const fieldErrors =
    update.error instanceof ApiError
      ? Object.fromEntries(update.error.fields.map((item) => [item.field, item.message]))
      : {}

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    await update.mutateAsync({
      id: testCase.id,
      data: {
        code: form.code,
        jiraKey: form.jiraKey || null,
        scenario: form.scenario || null,
        objective: form.objective || null,
        bdd: form.bdd || null,
        testData: form.testData || null,
        environment: (form.environment || null) as never,
        automated: form.automated,
        responsibleId: form.responsibleId || null,
        qaStatus: form.qaStatus as never,
        stageStatus: form.stageStatus as never,
        notes: form.notes || null,
      },
    })
    onClose()
  }

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} role="presentation">
        <form className="drawer" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
          <div className="drawer-head">
            <div>
              <h2>{testCase.code}</h2>
              <p className="subtitle">{testCase.scenario ?? 'Cenário sem título'}</p>
            </div>
            <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
          </div>

          <div className="drawer-body">
            {offerReport && (
              <div className="banner">
                Cenário reprovado sem bug reportado.{' '}
                <button type="button" className="btn ghost" onClick={() => setReporting(true)}>
                  Reportar bug
                </button>
              </div>
            )}

            <div className="form-grid">
              <Field label="Código" error={fieldErrors.code}>
                <input className="input" value={form.code} onChange={(e) => set('code')(e.target.value)} />
              </Field>
              <Field label="Jira">
                <input className="input" value={form.jiraKey} onChange={(e) => set('jiraKey')(e.target.value)} />
              </Field>
            </div>

            <Field label="Cenário" error={fieldErrors.scenario}>
              <input className="input" value={form.scenario} onChange={(e) => set('scenario')(e.target.value)} />
            </Field>

            <Field label="Objetivo">
              <textarea className="input" value={form.objective} onChange={(e) => set('objective')(e.target.value)} />
            </Field>

            <Field label="Descrição do teste (BDD)">
              <textarea
                className="input"
                style={{ minHeight: 120 }}
                value={form.bdd}
                onChange={(e) => set('bdd')(e.target.value)}
                placeholder={'Given …\nWhen …\nThen …'}
              />
            </Field>

            <div className="form-grid">
              <Field label="Ambiente">
                <Select
                  options={meta.data?.environment ?? []}
                  emptyLabel="Não definido"
                  value={form.environment}
                  onChange={(e) => set('environment')(e.target.value)}
                />
              </Field>
              <Field label="Automação">
                <select
                  className="select"
                  value={form.automated ? 'Yes' : 'No'}
                  onChange={(e) => set('automated')(e.target.value === 'Yes')}
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </Field>
              <Field label="Status QA">
                <Select
                  options={meta.data?.caseStatus ?? []}
                  value={form.qaStatus}
                  onChange={(e) => set('qaStatus')(e.target.value)}
                />
              </Field>
              <Field label="Status Stage">
                <Select
                  options={meta.data?.caseStatus ?? []}
                  value={form.stageStatus}
                  onChange={(e) => set('stageStatus')(e.target.value)}
                />
              </Field>
              <Field label="Responsável">
                <select
                  className="select"
                  value={form.responsibleId}
                  onChange={(e) => set('responsibleId')(e.target.value)}
                >
                  <option value="">Sem responsável</option>
                  {(people.data ?? []).map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
              </Field>
            </div>

            <LinkedBugsField testCase={testCase} suiteId={suiteId} platform={platform} />

            <Field label="Massa de teste">
              <textarea className="input" value={form.testData} onChange={(e) => set('testData')(e.target.value)} />
            </Field>

            <EvidenceField
              caseId={testCase.id}
              suiteId={suiteId}
              evidences={testCase.evidences}
            />

            <Field label="Notas">
              <textarea className="input" value={form.notes} onChange={(e) => set('notes')(e.target.value)} />
            </Field>

            {/* Recolhido: a linha do tempo responde "por que mudou", que é uma
                pergunta ocasional — não pode empurrar o formulário para baixo. */}
            <Accordion title="Histórico de alterações" defaultOpen={false}>
              <Timeline entity="case" id={testCase.id} />
            </Accordion>

            {update.isError && !Object.keys(fieldErrors).length && (
              <div className="banner danger">{(update.error as Error).message}</div>
            )}
          </div>

          <div className="drawer-foot">
            {confirmDelete ? (
              <div className="toolbar">
                <span className="small muted">Excluir este cenário?</span>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => { await remove.mutateAsync(testCase.id); onClose() }}
                >
                  Confirmar
                </button>
                <button type="button" className="btn ghost" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="toolbar">
                <button type="button" className="btn ghost danger" onClick={() => setConfirmDelete(true)}>
                  Excluir
                </button>
                <button type="button" className="btn ghost" onClick={() => setReporting(true)}>
                  Reportar bug
                </button>
              </div>
            )}
            <button type="submit" className="btn primary" disabled={update.isPending}>
              {update.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>

      {reporting && (
        <ReportBugDialog
          testCase={testCase}
          suiteId={suiteId}
          platform={platform}
          onClose={() => setReporting(false)}
        />
      )}
    </>
  )
}

/**
 * Bugs vinculados ao cenário (US-2.5) — substitui a antiga coluna de texto
 * livre. Vincular/desvincular é imediato, sem esperar o "Salvar" do
 * formulário: é uma relação à parte, não um campo do cenário.
 */
function LinkedBugsField({
  testCase, suiteId, platform,
}: { testCase: TestCase; suiteId: string; platform: Platform }) {
  const candidates = useBugs({ platform })
  const link = useLinkBug(suiteId, testCase.id)
  const unlink = useUnlinkBug(suiteId, testCase.id)

  const linkedIds = new Set(testCase.bugs.map((bug) => bug.id))
  const options = (candidates.data ?? []).filter((bug) => !linkedIds.has(bug.id))

  return (
    <Field label="Bugs vinculados">
      <div className="linked-bugs">
        {!testCase.bugs.length && <span className="small muted">Nenhum bug vinculado.</span>}
        {testCase.bugs.map((bug) => (
          <span key={bug.id} className="linked-bug-chip">
            <StatusPill status={bug.status} />
            <span className="code">{bug.jiraKey ?? `#${bug.number}`}</span>
            <button
              type="button"
              onClick={() => unlink.mutate(bug.id)}
              disabled={unlink.isPending}
              aria-label={`Desvincular bug ${bug.jiraKey ?? bug.number}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        className="select"
        value=""
        disabled={link.isPending}
        onChange={(event) => event.target.value && link.mutate(event.target.value)}
      >
        <option value="">Vincular bug existente…</option>
        {options.map((bug) => (
          <option key={bug.id} value={bug.id}>
            {bug.jiraKey ?? `#${bug.number}`} — {bug.description?.slice(0, 60) ?? 'Sem descrição'}
          </option>
        ))}
      </select>
    </Field>
  )
}
