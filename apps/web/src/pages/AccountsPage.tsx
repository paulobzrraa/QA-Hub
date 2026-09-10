import { useState } from 'react'
import { UserPlus, Trash2 } from 'lucide-react'
import { ACCESS_ROLE, ACCESS_ROLE_LABEL, type AccessRole } from '@qahub/shared'
import { useAccounts, useCreateAccount, useDeleteAccount, useUpdateAccount } from '../lib/accounts'
import { useAuth } from '../lib/auth'
import { usePeople } from '../lib/queries'
import { Empty, ErrorBanner, Field, Loading, Stat, formatDate } from '../components/ui'

/**
 * Contas de acesso (US-5.1).
 *
 * Separada de "Pessoas": lá está o time todo, inclusive quem nunca vai logar;
 * aqui está quem entra no sistema. O vínculo opcional entre os dois é o que
 * faz o histórico apontar para uma pessoa, e não para um e-mail solto.
 */
export function AccountsPage() {
  const { account: me } = useAuth()
  const accounts = useAccounts()
  const people = usePeople({ active: 'true' })
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const remove = useDeleteAccount()

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer', personId: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const error = create.error ?? update.error ?? remove.error

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    await create.mutateAsync({
      name: form.name.trim(),
      email: form.email.trim(),
      password: form.password,
      role: form.role,
      personId: form.personId || null,
    })
    setForm({ name: '', email: '', password: '', role: 'viewer', personId: '' })
  }

  const list = accounts.data ?? []

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Contas de acesso</h1>
          <p className="subtitle">Quem entra no sistema e com qual perfil</p>
        </div>
      </header>

      <div className="content stack">
        {error && <ErrorBanner error={error} />}

        <div className="stat-grid">
          {ACCESS_ROLE.map((role) => (
            <Stat
              key={role}
              label={ACCESS_ROLE_LABEL[role]}
              value={list.filter((item) => item.role === role).length}
              hint={role === 'viewer' ? 'só consulta' : role === 'editor' ? 'edita cenários e bugs' : 'tudo, incluindo contas'}
            />
          ))}
        </div>

        <form className="card" onSubmit={submit}>
          <div className="card-head"><h2>Nova conta</h2></div>
          <div className="card-body stack">
            <div className="form-grid">
              <Field label="Nome">
                <input className="input" value={form.name} required
                  onChange={(event) => setForm({ ...form, name: event.target.value })} />
              </Field>
              <Field label="E-mail corporativo">
                <input className="input" type="email" value={form.email} required
                  onChange={(event) => setForm({ ...form, email: event.target.value })} />
              </Field>
              <Field label="Senha provisória">
                <input className="input" type="password" value={form.password} required minLength={10}
                  onChange={(event) => setForm({ ...form, password: event.target.value })} />
              </Field>
              <Field label="Perfil de acesso">
                <select className="select" value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  {ACCESS_ROLE.map((role) => (
                    <option key={role} value={role}>{ACCESS_ROLE_LABEL[role]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pessoa do time (opcional)">
                <select className="select" value={form.personId}
                  onChange={(event) => setForm({ ...form, personId: event.target.value })}>
                  <option value="">Sem vínculo</option>
                  {(people.data ?? []).map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="small muted">
              A senha é provisória: quem receber a conta troca em “Minha conta”. Mínimo de 10 caracteres.
            </p>
            <div className="toolbar">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                <UserPlus size={15} /> Criar conta
              </button>
            </div>
          </div>
        </form>

        <div className="card">
          <div className="card-head"><h2>Contas</h2></div>
          {accounts.isLoading ? (
            <Loading />
          ) : !list.length ? (
            <Empty title="Nenhuma conta" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th style={{ width: 170 }}>Perfil</th>
                    <th style={{ width: 110 }}>Ativa</th>
                    <th style={{ width: 130 }}>Último acesso</th>
                    <th style={{ width: 120 }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((item) => {
                    const isMe = item.id === me?.id
                    return (
                      <tr key={item.id} className={item.active ? undefined : 'row-muted'}>
                        <td>
                          <span className="cell-title">
                            {item.name}{isMe && <span className="tag" style={{ marginLeft: 6 }}>você</span>}
                          </span>
                          <div className="cell-sub">
                            {item.email}
                            {item.person && ` · ${item.person.name}`}
                          </div>
                        </td>
                        <td className="tight">
                          <select
                            className="select select-inline"
                            value={item.role}
                            disabled={isMe}
                            title={isMe ? 'Você não pode alterar o próprio perfil' : undefined}
                            onChange={(event) =>
                              update.mutate({ id: item.id, data: { role: event.target.value as AccessRole } })
                            }
                          >
                            {ACCESS_ROLE.map((role) => (
                              <option key={role} value={role}>{ACCESS_ROLE_LABEL[role]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="tight">
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={item.active}
                              disabled={isMe}
                              onChange={(event) =>
                                update.mutate({ id: item.id, data: { active: event.target.checked } })
                              }
                            />
                            <span>{item.active ? 'Ativa' : 'Inativa'}</span>
                          </label>
                        </td>
                        <td className="tight small muted">{formatDate(item.lastLoginAt)}</td>
                        <td className="tight">
                          {confirmDelete === item.id ? (
                            <div className="toolbar">
                              <button type="button" className="btn danger"
                                onClick={async () => {
                                  await remove.mutateAsync(item.id).catch(() => null)
                                  setConfirmDelete(null)
                                }}>
                                Confirmar
                              </button>
                              <button type="button" className="btn ghost" onClick={() => setConfirmDelete(null)}>
                                Cancelar
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="btn ghost danger"
                              disabled={isMe}
                              title={isMe ? 'Você não pode excluir a própria conta' : 'Excluir conta'}
                              onClick={() => setConfirmDelete(item.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
