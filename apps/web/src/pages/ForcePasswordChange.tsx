import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useAuth, useChangePassword, useLogout } from '../lib/auth'
import { Field } from '../components/ui'

/**
 * Troca obrigatória da senha provisória (US-6.1).
 *
 * Ocupa a tela inteira, no lugar do sistema: a conta entrou, mas a senha atual
 * foi escolhida por outra pessoa e vale uma vez só. O servidor recusa qualquer
 * outra rota enquanto isso — esta tela é a forma honesta de dizer isso, e não
 * a proteção em si.
 */
export function ForcePasswordChange() {
  const { account } = useAuth()
  const change = useChangePassword()
  const logout = useLogout()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')

  const fieldErrors =
    change.error instanceof ApiError
      ? Object.fromEntries(change.error.fields.map((item) => [item.field, item.message]))
      : {}
  const generalError =
    change.error instanceof Error && !Object.keys(fieldErrors).length ? change.error.message : null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    await change.mutateAsync({ currentPassword: current, newPassword: next })
    // A resposta limpa a marca no servidor; recarregar traz o sistema liberado.
    window.location.reload()
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/swift-icon.svg" alt="" className="brand-icon" />
          <strong>QA Hub</strong>
        </div>

        <h1>Defina sua senha</h1>
        <p className="subtitle">
          A senha que você usou é provisória e vale só para esta entrada. Escolha uma sua para
          continuar.
        </p>

        <Field label="Senha provisória" error={fieldErrors.currentPassword}>
          <input
            className="input"
            type="password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <Field label="Nova senha" error={fieldErrors.newPassword}>
          <input
            className="input"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            required
          />
        </Field>

        <p className="small muted">Mínimo de 10 caracteres.</p>
        {generalError && <div className="banner danger">{generalError}</div>}

        <button type="submit" className="btn primary login-submit" disabled={change.isPending}>
          <KeyRound size={15} />
          {change.isPending ? 'Salvando…' : 'Definir senha e entrar'}
        </button>

        <button
          type="button"
          className="btn ghost login-submit"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Sair sem definir
        </button>

        {account && <p className="small muted" style={{ textAlign: 'center' }}>{account.email}</p>}
      </form>
    </div>
  )
}
