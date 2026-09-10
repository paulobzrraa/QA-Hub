import { useState } from 'react'
import { LogIn, ShieldCheck } from 'lucide-react'
import { ApiError } from '../lib/api'
import { useAuth, useLogin, useSetup } from '../lib/auth'
import { Field } from '../components/ui'

/**
 * Porta de entrada do QA Hub (US-5.1).
 *
 * Enquanto não existir conta nenhuma, a tela é a criação do primeiro acesso —
 * quem cria vira administrador. Depois disso a rota de setup fecha sozinha no
 * servidor e esta tela passa a ser só o login.
 */
export function LoginPage() {
  const { status } = useAuth()
  const login = useLogin()
  const setup = useSetup()

  const firstRun = status?.needsSetup ?? false

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const pending = login.isPending || setup.isPending
  const error = login.error ?? setup.error
  const fieldErrors =
    error instanceof ApiError
      ? Object.fromEntries(error.fields.map((item) => [item.field, item.message]))
      : {}
  const generalError =
    error instanceof Error && !Object.keys(fieldErrors).length ? error.message : null

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (firstRun) await setup.mutateAsync({ name, email, password })
    else await login.mutateAsync({ email, password })
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/swift-icon.svg" alt="" className="brand-icon" />
          <strong>QA Hub</strong>
        </div>

        <h1>{firstRun ? 'Criar o primeiro acesso' : 'Entrar'}</h1>
        <p className="subtitle">
          {firstRun
            ? 'Ainda não existe nenhuma conta. Quem criar a primeira fica com o perfil de administração.'
            : 'Use seu e-mail corporativo.'}
        </p>

        {firstRun && (
          <Field label="Nome" error={fieldErrors.name}>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
            />
          </Field>
        )}

        <Field label="E-mail" error={fieldErrors.email}>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="username"
            required
          />
        </Field>

        <Field label="Senha" error={fieldErrors.password}>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={firstRun ? 'new-password' : 'current-password'}
            required
          />
        </Field>

        {firstRun && <p className="small muted">Mínimo de 10 caracteres.</p>}
        {generalError && <div className="banner danger">{generalError}</div>}

        <button type="submit" className="btn primary login-submit" disabled={pending}>
          {firstRun ? <ShieldCheck size={15} /> : <LogIn size={15} />}
          {pending ? 'Aguarde…' : firstRun ? 'Criar acesso' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
