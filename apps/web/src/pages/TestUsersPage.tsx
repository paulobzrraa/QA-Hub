import { useEffect, useMemo, useRef, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { formatCpf } from '@qahub/shared'
import {
  useCredentialAccesses, useMeta, useRevealPassword, useTestUserProfiles, useTestUsers,
  type TestUserFilters,
} from '../lib/queries'
import {
  Accordion, CopyButton, Empty, ErrorBanner, Loading, Select, Stat, StatusPill,
} from '../components/ui'

const DEFAULT_FILTERS: TestUserFilters = {}

const FILTER_KEYS = ['environment', 'status', 'kind', 'profile', 'q'] as const

/**
 * Por quanto tempo a senha fica na tela depois de "Mostrar".
 * Ela some sozinha porque a tela de quem executa teste costuma estar
 * compartilhada — deixar a senha visível até alguém lembrar de escondê-la
 * é justamente o risco que a planilha aberta já tinha.
 */
const REVEAL_MS = 15000

function formatMoment(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      })
}

/**
 * Célula de credencial: copiar sem ver, ou mostrar por alguns segundos.
 * As duas ações batem no mesmo endpoint e as duas geram registro (US-4.2).
 */
function CredentialCell({ id }: { id: string }) {
  const reveal = useRevealPassword()
  const [shown, setShown] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(timer.current), [])

  const show = async () => {
    clearTimeout(timer.current)
    setFailed(false)
    try {
      const result = await reveal.mutateAsync({ id, action: 'reveal' })
      setShown(result.password)
      timer.current = setTimeout(() => setShown(null), REVEAL_MS)
    } catch {
      setFailed(true)
    }
  }

  const hide = () => {
    clearTimeout(timer.current)
    setShown(null)
  }

  return (
    <div className="credential-cell">
      {shown ? (
        <>
          <code className="revealed">{shown}</code>
          <button type="button" className="copy-btn" onClick={hide} title="Ocultar agora">
            <EyeOff size={13} />
          </button>
        </>
      ) : (
        <button
          type="button"
          className={`copy-btn${failed ? ' failed' : ''}`}
          onClick={show}
          disabled={reveal.isPending}
          title="Mostrar a senha por alguns segundos"
        >
          <Eye size={13} />
          <span>{failed ? 'Falhou' : 'Mostrar'}</span>
        </button>
      )}
      <CopyButton
        label="Copiar"
        title="Copiar a senha sem exibi-la"
        value={async () => {
          const result = await reveal.mutateAsync({ id, action: 'copy' })
          return result.password
        }}
      />
    </div>
  )
}

/** Registro de acessos às senhas — o que torna a exigência de auditoria real. */
function AccessLog() {
  const accesses = useCredentialAccesses()

  if (accesses.isLoading) return <Loading />
  if (accesses.isError) return <ErrorBanner error={accesses.error} />
  if (!accesses.data?.length) {
    return <Empty title="Nenhum acesso registrado">Copiar ou mostrar uma senha deixa registro aqui.</Empty>
  }

  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Conta</th>
              <th>Ação</th>
              <th>Origem</th>
            </tr>
          </thead>
          <tbody>
            {accesses.data.map((access) => (
              <tr key={access.id}>
                <td className="tight small muted">{formatMoment(access.createdAt)}</td>
                <td>
                  <span className="cell-title">{access.testUser.email ?? 'conta sem e-mail'}</span>
                  <div className="cell-sub">{access.testUser.environment}</div>
                </td>
                <td className="tight">
                  <span className={`pill ${access.action === 'reveal' ? 'warn' : 'neutral'}`}>
                    {access.action === 'reveal' ? 'Exibida' : 'Copiada'}
                  </span>
                </td>
                <td className="tight small muted">{access.ipAddress ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        O registro guarda quando, de qual origem e por qual ação. <strong>Quem</strong> fica em
        branco porque o QA Hub ainda não tem login (US-5.1) — um nome auto-declarado daria
        aparência de responsabilização sem nenhuma verificação, o que num registro de auditoria é
        pior que o branco.
      </p>
    </>
  )
}

/**
 * Massa de usuários de teste (US-4.1) com as credenciais protegidas (US-4.2).
 *
 * A senha está cifrada em repouso, não aparece na listagem e só sai por ação
 * explícita — copiar sem ver, ou mostrar por alguns segundos —, sempre com
 * registro. É o oposto da planilha de origem, que traz a senha em texto puro
 * em toda linha e circula por e-mail.
 */
export function TestUsersPage() {
  const [filters, setFilters] = useState<TestUserFilters>(DEFAULT_FILTERS)

  const meta = useMeta()
  const profiles = useTestUserProfiles()
  const users = useTestUsers(filters)

  const set = (key: keyof TestUserFilters) => (value: string) =>
    setFilters((current) => ({ ...current, [key]: value || undefined }))

  const hasFilters = FILTER_KEYS.some((key) => filters[key])

  /** Contadores do topo — substituem os COUNTIF que viviam ao lado das abas. */
  const counts = useMemo(() => {
    const byEnv = new Map<string, number>()
    const byStatus = new Map<string, number>()
    for (const user of users.data ?? []) {
      byEnv.set(user.environment, (byEnv.get(user.environment) ?? 0) + 1)
      byStatus.set(user.status, (byStatus.get(user.status) ?? 0) + 1)
    }
    return { byEnv, byStatus }
  }, [users.data])

  return (
    <>
      <header className="topbar">
        <div>
          <h1>Massa de teste</h1>
          <p className="subtitle">
            {users.data?.length ?? 0} conta{users.data?.length === 1 ? '' : 's'}{' '}
            {hasFilters ? 'nesse filtro' : 'cadastradas'} — senhas cifradas, com registro de acesso
          </p>
        </div>
      </header>

      <div className="content stack">
        <div className="stat-grid">
          {(meta.data?.userEnv ?? []).map((environment) => (
            <Stat key={environment} label={environment} value={counts.byEnv.get(environment) ?? 0} />
          ))}
          {(meta.data?.userStatus ?? []).map((status) => (
            <Stat key={status} label={status} value={counts.byStatus.get(status) ?? 0} />
          ))}
        </div>

        <div className="toolbar">
          <input
            className="input search"
            placeholder="Buscar por e-mail ou CPF…"
            value={filters.q ?? ''}
            onChange={(event) => set('q')(event.target.value)}
          />
          <Select
            options={meta.data?.userEnv ?? []}
            emptyLabel="Ambiente"
            value={filters.environment ?? ''}
            onChange={(event) => set('environment')(event.target.value)}
          />
          <Select
            options={meta.data?.userStatus ?? []}
            emptyLabel="Status"
            value={filters.status ?? ''}
            onChange={(event) => set('status')(event.target.value)}
          />
          <Select
            options={meta.data?.userKind ?? []}
            emptyLabel="Tipo"
            value={filters.kind ?? ''}
            onChange={(event) => set('kind')(event.target.value)}
          />
          <Select
            options={profiles.data ?? []}
            emptyLabel="Perfil"
            value={filters.profile ?? ''}
            onChange={(event) => set('profile')(event.target.value)}
          />
          {hasFilters && (
            <button type="button" className="btn ghost" onClick={() => setFilters(DEFAULT_FILTERS)}>
              Limpar
            </button>
          )}
        </div>

        {users.isError && <ErrorBanner error={users.error} />}

        <div className="card">
          {users.isLoading ? (
            <Loading />
          ) : !users.data?.length ? (
            <Empty title="Nenhuma conta encontrada">
              {hasFilters
                ? 'Ajuste os filtros para ver mais resultados.'
                : 'Nenhuma conta importada ainda — rode a importação da planilha.'}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>E-mail</th>
                    <th>CPF</th>
                    <th>Tipo</th>
                    <th>Ambiente</th>
                    <th>Status</th>
                    <th>Perfil</th>
                    <th>Senha</th>
                  </tr>
                </thead>
                <tbody>
                  {users.data.map((user) => (
                    <tr key={user.id}>
                      <td>
                        {user.email ? (
                          <span className="copy-cell">
                            <span className="cell-title">{user.email}</span>
                            <CopyButton value={user.email} title="Copiar e-mail" />
                          </span>
                        ) : (
                          <span className="subtle">sem e-mail</span>
                        )}
                      </td>
                      <td className="tight">
                        {user.cpf ? (
                          <span className="copy-cell">
                            <span className="code">{formatCpf(user.cpf)}</span>
                            <CopyButton value={user.cpf} title="Copiar CPF (só dígitos)" />
                          </span>
                        ) : (
                          <span className="subtle">—</span>
                        )}
                      </td>
                      <td className="tight small muted">{user.kind ?? '—'}</td>
                      <td className="tight small muted">{user.environment}</td>
                      <td className="tight"><StatusPill status={user.status} /></td>
                      <td className="tight small muted">{user.profile ?? '—'}</td>
                      <td className="tight"><CredentialCell id={user.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <Accordion title="Registro de acesso às senhas" defaultOpen={false}>
          <AccessLog />
        </Accordion>

        <p className="small muted">
          <ShieldCheck size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
          As senhas estão cifradas em repouso (AES-256-GCM) com a chave fora do banco. Não aparecem
          na listagem, no log do servidor nem no relatório exportável — só sob ação explícita, e a
          exibida some da tela em {REVEAL_MS / 1000} segundos.
        </p>
      </div>
    </>
  )
}
