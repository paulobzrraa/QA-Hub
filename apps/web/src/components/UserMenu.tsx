import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { ACCESS_ROLE_LABEL } from '@qahub/shared'
import { ApiError } from '../lib/api'
import { useAuth, useChangePassword, useLogout } from '../lib/auth'
import { Field } from './ui'

/** Rodapé da barra lateral: quem está logado, com qual perfil, e a saída. */
export function UserMenu() {
  const { account } = useAuth()
  const logout = useLogout()
  const change = useChangePassword()

  const [open, setOpen] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [done, setDone] = useState(false)

  if (!account) return null

  const fieldErrors =
    change.error instanceof ApiError
      ? Object.fromEntries(change.error.fields.map((item) => [item.field, item.message]))
      : {}

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    await change.mutateAsync({ currentPassword: current, newPassword: next })
    setCurrent(''); setNext(''); setDone(true)
  }

  return (
    <>
      <div className="user-menu">
        <div className="user-info">
          <span className="user-name">{account.name}</span>
          <span className="user-role">{ACCESS_ROLE_LABEL[account.role]}</span>
        </div>
        <div className="toolbar">
          <button
            type="button"
            className="btn ghost"
            title="Trocar minha senha"
            onClick={() => { setOpen(true); setDone(false) }}
          >
            <KeyRound size={14} />
          </button>
          <button
            type="button"
            className="btn ghost"
            title="Sair"
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div className="drawer-backdrop ev-preview-backdrop" onClick={() => setOpen(false)} role="presentation">
          <form className="ev-preview" style={{ maxWidth: 420 }}
            onClick={(event) => event.stopPropagation()} onSubmit={submit}>
            <div className="drawer-head">
              <div>
                <h2>Trocar senha</h2>
                <p className="subtitle">{account.email}</p>
              </div>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>Fechar</button>
            </div>
            <div className="drawer-body">
              {done ? (
                <div className="banner">
                  Senha trocada. As outras sessões abertas foram encerradas.
                </div>
              ) : (
                <>
                  <Field label="Senha atual" error={fieldErrors.currentPassword}>
                    <input className="input" type="password" value={current} required
                      autoComplete="current-password"
                      onChange={(event) => setCurrent(event.target.value)} />
                  </Field>
                  <Field label="Nova senha" error={fieldErrors.newPassword}>
                    <input className="input" type="password" value={next} required minLength={10}
                      autoComplete="new-password"
                      onChange={(event) => setNext(event.target.value)} />
                  </Field>
                  <p className="small muted">
                    Mínimo de 10 caracteres. Trocar a senha derruba as sessões abertas em outros
                    aparelhos — esta continua.
                  </p>
                </>
              )}
            </div>
            <div className="drawer-foot">
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                {done ? 'Fechar' : 'Cancelar'}
              </button>
              {!done && (
                <button type="submit" className="btn primary" disabled={change.isPending}>
                  {change.isPending ? 'Trocando…' : 'Trocar senha'}
                </button>
              )}
            </div>
          </form>
        </div>
      )}
    </>
  )
}
