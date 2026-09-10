import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateSuite, useMeta, usePeople } from '../lib/queries'
import { ApiError } from '../lib/api'
import { Field, Select } from './ui'

/** Criação de ciclo de teste. As opções vêm de `/api/meta`; os erros vêm do backend. */
export function NewSuiteDialog({ onClose }: { onClose: () => void }) {
  const meta = useMeta()
  const people = usePeople({ active: 'true' })
  const create = useCreateSuite()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    name: '',
    jiraKey: '',
    platform: 'Web',
    squad: '',
    status: 'To Do',
    responsibleId: '',
  })

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((current) => ({ ...current, [key]: value }))

  const fieldErrors =
    create.error instanceof ApiError
      ? Object.fromEntries(create.error.fields.map((item) => [item.field, item.message]))
      : {}

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const suite = await create.mutateAsync({
      name: form.name,
      jiraKey: form.jiraKey || null,
      platform: form.platform as 'Web' | 'App',
      squad: (form.squad || null) as never,
      status: form.status as never,
      responsibleId: form.responsibleId || null,
    })
    navigate(`/suites/${suite.id}`)
  }

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <form
        className="drawer"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="drawer-head">
          <h2>Novo ciclo de teste</h2>
          <button type="button" className="btn ghost" onClick={onClose}>Fechar</button>
        </div>

        <div className="drawer-body">
          <div className="form-grid">
            <Field label="Nome" error={fieldErrors.name} span>
              <input
                className="input"
                autoFocus
                value={form.name}
                onChange={(event) => set('name')(event.target.value)}
                placeholder="[Home] Flash Sale 28/08"
              />
            </Field>
            <Field label="Jira">
              <input
                className="input"
                value={form.jiraKey}
                onChange={(event) => set('jiraKey')(event.target.value)}
                placeholder="TDI-0000"
              />
            </Field>
            <Field label="Plataforma">
              <Select
                options={meta.data?.platform ?? []}
                value={form.platform}
                onChange={(event) => set('platform')(event.target.value)}
              />
            </Field>
            <Field label="Squad">
              <Select
                options={meta.data?.squad ?? []}
                emptyLabel="Sem squad"
                value={form.squad}
                onChange={(event) => set('squad')(event.target.value)}
              />
            </Field>
            <Field label="Status">
              <Select
                options={meta.data?.suiteStatus ?? []}
                value={form.status}
                onChange={(event) => set('status')(event.target.value)}
              />
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
          </div>

          {create.isError && !Object.keys(fieldErrors).length && (
            <div className="banner danger">{(create.error as Error).message}</div>
          )}
        </div>

        <div className="drawer-foot">
          <button type="button" className="btn ghost" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={create.isPending}>
            {create.isPending ? 'Criando…' : 'Criar ciclo'}
          </button>
        </div>
      </form>
    </div>
  )
}
