import { useState } from 'react'
import { AlertTriangle, History, KeyRound, Trash2, UserPlus } from 'lucide-react'
import { ACCESS_ROLE, ACCESS_ROLE_LABEL, type AccessRole } from '@qahub/shared'
import {
  useAccounts, useCreateAccount, useDeleteAccount, useLoginAttempts, useResetPassword,
  useUpdateAccount,
} from '../lib/accounts'
import { useAuth } from '../lib/auth'
import { usePeople } from '../lib/queries'
import {
  Accordion, CopyButton, Empty, ErrorBanner, Field, Loading, Select, Stat, StatusPill, formatDate,
} from '../components/ui'
import { Timeline } from '../components/Timeline'
import type { Account, PasswordReset } from '../lib/types'

/**
 * Contas de acesso (US-5.1).
 *
 * Separada de "Pessoas": lá está o time todo, inclusive quem nunca vai logar;
 * aqui está quem entra no sistema. O vínculo opcional entre os dois é o que
 * faz o histórico apontar para uma pessoa, e não para um e-mail solto.
 */
/**
 * Tentativas de entrada recentes (US-6.2). Fica recolhida por padrão — é a
 * tela que alguém abre quando desconfia de um ataque, não o uso do dia a dia.
 */
function LoginAttemptsCard() {
  const [onlyFailed, setOnlyFailed] = useState(true)
  const attempts = useLoginAttempts(onlyFailed)

  const limits = attempts.data?.limits

  return (
    <Accordion title="Tentativas de entrada" defaultOpen={false}>
      <div className="stack">
        <p className="small muted" style={{ margin: 0 }}>
          {limits && (
            <>
              A partir de {limits.SOFT_THRESHOLD} falhas seguidas a resposta começa a demorar; a
              partir de {limits.HARD_THRESHOLD}, o endereço ou e-mail fica bloqueado por{' '}
              {limits.BLOCK_MINUTES} minutos. A contagem olha os últimos {limits.WINDOW_MINUTES}{' '}
              minutos e zera a cada entrada bem-sucedida.
            </>
          )}
        </p>

        <Select
          options={['Só recusadas', 'Todas']}
          value={onlyFailed ? 'Só recusadas' : 'Todas'}
          onChange={(event) => setOnlyFailed(event.target.value === 'Só recusadas')}
        />

        {attempts.isError && <ErrorBanner error={attempts.error} />}

        {attempts.isLoading ? (
          <Loading />
        ) : !attempts.data?.attempts.length ? (
          <Empty title="Nenhuma tentativa registrada" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>E-mail tentado</th>
                  <th>Origem</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {attempts.data.attempts.map((item) => (
                  <tr key={item.id}>
                    <td className="tight small muted">{formatDate(item.createdAt)}</td>
                    <td className="small">{item.email || <span className="subtle">(vazio)</span>}</td>
                    <td className="tight small muted">{item.ipAddress}</td>
                    <td className="tight">
                      {item.success ? (
                        <StatusPill status="Approved" />
                      ) : (
                        <span className="pill danger">
                          <AlertTriangle size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                          Recusada
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Accordion>
  )
}

export function AccountsPage() {
  const { account: me } = useAuth()
  const accounts = useAccounts()
  const people = usePeople({ active: 'true' })
  const create = useCreateAccount()
  const update = useUpdateAccount()
  const remove = useDeleteAccount()
  const reset = useResetPassword()

  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer', personId: '' })
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<Account | null>(null)
  const [resetDone, setResetDone] = useState<PasswordReset | null>(null)
  const [historyOf, setHistoryOf] = useState<Account | null>(null)

  const error = create.error ?? update.error ?? remove.error ?? reset.error

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

        <LoginAttemptsCard />

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
                    <th style={{ width: 180 }}>Ações</th>
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
                            {item.mustChangePassword && (
                              <span className="pill warn" style={{ marginLeft: 6 }}>senha provisória</span>
                            )}
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
                          <div className="toolbar" style={{ flexWrap: 'nowrap' }}>
                            <button
                              type="button"
                              className="btn ghost"
                              title="Redefinir a senha desta conta"
                              onClick={() => { setResetDone(null); setConfirmReset(item) }}
                            >
                              <KeyRound size={14} />
                            </button>
                            <button
                              type="button"
                              className="btn ghost"
                              title="Ver o histórico desta conta"
                              onClick={() => setHistoryOf(item)}
                            >
                              <History size={14} />
                            </button>
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
                          </div>
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

      {confirmReset && (
        <div className="drawer-backdrop ev-preview-backdrop"
          onClick={() => { setConfirmReset(null); setResetDone(null) }} role="presentation">
          <div className="ev-preview" style={{ maxWidth: 480 }} onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <h2>{resetDone ? 'Senha redefinida' : 'Redefinir senha'}</h2>
                <p className="subtitle">{confirmReset.name} · {confirmReset.email}</p>
              </div>
              <button type="button" className="btn ghost"
                onClick={() => { setConfirmReset(null); setResetDone(null) }}>Fechar</button>
            </div>

            <div className="drawer-body">
              {resetDone ? (
                <>
                  <Field label="Senha provisória">
                    <div className="provisional">
                      <code>{resetDone.provisionalPassword}</code>
                      <CopyButton
                        value={resetDone.provisionalPassword}
                        label="Copiar"
                        title="Copiar a senha provisória"
                      />
                    </div>
                  </Field>
                  {/* O aviso é literal: a senha não é guardada em texto em
                      lugar nenhum, então recarregar esta tela a perde. */}
                  <div className="banner warn">
                    Copie agora. Esta senha aparece uma única vez e não pode ser recuperada — se
                    perder, basta redefinir de novo.
                  </div>
                  <p className="small muted">
                    {confirmReset.name} entra com ela e o sistema exige a troca imediatamente. Até
                    trocar, a conta não consegue fazer mais nada.
                  </p>
                  {resetDone.clearedAttempts > 0 && (
                    <p className="small muted">
                      {resetDone.clearedAttempts} tentativa(s) de entrada recusada(s) foram
                      apagadas — a conta não fica bloqueada logo depois de você ajudá-la a voltar.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p style={{ marginTop: 0 }}>
                    Isso gera uma senha provisória para <strong>{confirmReset.name}</strong> e
                    invalida a senha atual.
                  </p>
                  <ul className="small muted">
                    <li>As sessões abertas dessa conta são encerradas na hora.</li>
                    <li>A provisória vale para uma entrada e precisa ser trocada em seguida.</li>
                    <li>Fica registrado no histórico da conta quem redefiniu e quando.</li>
                  </ul>
                </>
              )}
            </div>

            <div className="drawer-foot">
              <button type="button" className="btn ghost"
                onClick={() => { setConfirmReset(null); setResetDone(null) }}>
                {resetDone ? 'Concluir' : 'Cancelar'}
              </button>
              {!resetDone && (
                <button type="button" className="btn primary" disabled={reset.isPending}
                  onClick={async () => {
                    const result = await reset.mutateAsync(confirmReset.id)
                    setResetDone(result)
                  }}>
                  {reset.isPending ? 'Redefinindo…' : 'Redefinir senha'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {historyOf && (
        <div className="drawer-backdrop ev-preview-backdrop"
          onClick={() => setHistoryOf(null)} role="presentation">
          <div className="ev-preview" style={{ maxWidth: 520 }} onClick={(event) => event.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <h2>Histórico da conta</h2>
                <p className="subtitle">{historyOf.name} · {historyOf.email}</p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setHistoryOf(null)}>Fechar</button>
            </div>
            <div className="drawer-body">
              <Timeline entity="account" id={historyOf.id} />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
