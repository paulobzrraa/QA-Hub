import { useState } from 'react'
import type { Platform } from '@qahub/shared'
import { useAffectedAreas, useCreateBug, useLinkBug, useMeta, usePeople } from '../lib/queries'
import { ApiError } from '../lib/api'
import type { TestCase } from '../lib/types'
import { Field, Select, Tag } from './ui'

/**
 * Reportar bug direto do cenário (US-2.6) — suíte, cenário e responsável já
 * vêm preenchidos do contexto; o formulário usa as mesmas validações do
 * backend (os erros exibidos são os que a API devolve, não regra duplicada
 * no front). Ao salvar, o bug já nasce vinculado a este cenário.
 */
export function ReportBugDialog({
  testCase, suiteId, platform, onClose,
}: { testCase: TestCase; suiteId: string; platform: Platform; onClose: () => void }) {
  const meta = useMeta()
  const areas = useAffectedAreas()
  const people = usePeople({ active: 'true' })
  const create = useCreateBug()
  const link = useLinkBug(suiteId, testCase.id)

  const [form, setForm] = useState({
    description: testCase.scenario ?? '',
    jiraKey: '',
    relatedUs: testCase.jiraKey ?? '',
    severity: 'Medium',
    responsibleId: testCase.responsibleId ?? '',
    affectedAreaId: '',
    reportedDate: new Date().toISOString().slice(0, 10),
    notes: '',
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const pending = create.isPending || link.isPending
  const error = create.error ?? link.error
  const fieldErrors =
    error instanceof ApiError
      ? Object.fromEntries(error.fields.map((item) => [item.field, item.message]))
      : {}

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const bug = await create.mutateAsync({
      platform,
      description: form.description || null,
      jiraKey: form.jiraKey || null,
      relatedUs: form.relatedUs || null,
      severity: form.severity as never,
      responsibleId: form.responsibleId || null,
      affectedAreaId: form.affectedAreaId || null,
      reportedDate: (form.reportedDate || null) as never,
      notes: form.notes || null,
    })
    await link.mutateAsync(bug.id)
    onClose()
  }

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <form className="drawer" onClick={(event) => event.stopPropagation()} onSubmit={submit}>
        <div className="drawer-head">
          <div>
            <h2>Reportar bug</h2>
            <p className="subtitle">
              <span className="code">{testCase.code}</span> · {testCase.scenario ?? 'Cenário sem título'}
              {' '}<Tag>{platform}</Tag>
            </p>
          </div>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className="drawer-body">
          <Field label="Descrição" error={fieldErrors.description} span>
            <textarea
              className="input"
              autoFocus
              style={{ minHeight: 90 }}
              value={form.description}
              onChange={(event) => set('description')(event.target.value)}
              placeholder="O que deu errado?"
            />
          </Field>

          <div className="form-grid">
            <Field label="Jira" error={fieldErrors.jiraKey}>
              <input
                className="input"
                value={form.jiraKey}
                onChange={(event) => set('jiraKey')(event.target.value)}
                placeholder="TDI-0000"
              />
            </Field>
            <Field label="US relacionada">
              <input
                className="input"
                value={form.relatedUs}
                onChange={(event) => set('relatedUs')(event.target.value)}
              />
            </Field>
            <Field label="Severidade">
              <Select
                options={meta.data?.bugSeverity ?? []}
                value={form.severity}
                onChange={(event) => set('severity')(event.target.value)}
              />
            </Field>
            <Field label="Área afetada">
              <select
                className="select"
                value={form.affectedAreaId}
                onChange={(event) => set('affectedAreaId')(event.target.value)}
              >
                <option value="">Sem área</option>
                {(areas.data ?? []).map((area) => (
                  <option key={area.id} value={area.id}>{area.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Responsável">
              <select
                className="select"
                value={form.responsibleId}
                onChange={(event) => set('responsibleId')(event.target.value)}
              >
                <option value="">Sem responsável</option>
                {(people.data ?? []).map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Data do reporte">
              <input
                type="date"
                className="input"
                value={form.reportedDate}
                onChange={(event) => set('reportedDate')(event.target.value)}
              />
            </Field>
          </div>

          <Field label="Notas">
            <textarea className="input" value={form.notes} onChange={(event) => set('notes')(event.target.value)} />
          </Field>

          {error && !Object.keys(fieldErrors).length && (
            <div className="banner danger">{(error as Error).message}</div>
          )}
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={pending}>
            {pending ? 'Reportando…' : 'Reportar bug'}
          </button>
        </div>
      </form>
    </div>
  )
}
