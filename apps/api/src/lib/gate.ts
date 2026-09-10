import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { AccessRole } from '@qahub/shared'
import { resolveViewer } from './auth.js'
import { HttpError, sendError } from './http.js'

/**
 * Controle de acesso das rotas (US-5.1).
 *
 * A regra vive AQUI, num hook global, e não espalhada por rota: uma rota nova
 * nasce protegida por padrão e precisa ser liberada de propósito. O caminho
 * inverso — proteger rota a rota — deixa o esquecimento silencioso, que é
 * exatamente como buraco de autorização aparece.
 *
 * Esconder botão na tela não é controle de acesso: sem este hook, bastaria
 * chamar a API direto.
 */

/** Rotas que respondem sem sessão. Tudo o mais exige login. */
const PUBLIC = new Set([
  'GET /api/health',
  'GET /api/auth/status',
  'POST /api/auth/login',
  'POST /api/auth/setup',
])

/** Rotas que qualquer pessoa logada usa, mesmo sem poder editar nada. */
const ANY_VIEWER = new Set([
  'POST /api/auth/logout',
  'POST /api/auth/password',
  'GET /api/auth/me',
])

/**
 * Exigências acima do padrão. A senha da massa de teste é leitura, mas é
 * leitura de credencial: quem só consulta relatório não precisa dela.
 */
const EXTRA: { method: string; pattern: RegExp; role: AccessRole }[] = [
  { method: 'GET', pattern: /^\/api\/test-users\/[^/]+\/password$/, role: 'editor' },
  { method: 'GET', pattern: /^\/api\/test-users\/credential-accesses$/, role: 'admin' },
  // Administrar o time é administração, não execução: o papel `editor` é
  // definido como "edita cenários e bugs", e mexer no diretório de pessoas
  // (inclusive mesclar, que é irreversível) está fora disso.
  { method: 'POST', pattern: /^\/api\/people(\/|$)/, role: 'admin' },
  { method: 'PATCH', pattern: /^\/api\/people(\/|$)/, role: 'admin' },
  { method: 'DELETE', pattern: /^\/api\/people(\/|$)/, role: 'admin' },
]

function routeKey(request: FastifyRequest): string {
  return `${request.method} ${new URL(request.url, 'http://localhost').pathname}`
}

export function registerGate(app: FastifyInstance) {
  app.addHook('onRequest', async (request, reply) => {
    request.viewer = await resolveViewer(request)

    const path = new URL(request.url, 'http://localhost').pathname

    // Fora de /api é o front (assets do Vite em dev): não é a API que protege.
    if (!path.startsWith('/api/')) return

    const key = routeKey(request)
    if (PUBLIC.has(key)) return

    try {
      if (!request.viewer) throw new HttpError(401, 'Faça login para continuar')

      if (ANY_VIEWER.has(key)) return

      const extra = EXTRA.find((rule) => rule.method === request.method && rule.pattern.test(path))
      if (extra) {
        requireOrThrow(request.viewer.role, extra.role)
        return
      }

      // Qualquer escrita exige execução; leitura basta para quem só consulta.
      // Rotas de administração exigem `admin` por conta própria, em cima disto.
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        requireOrThrow(request.viewer.role, 'editor')
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}

function requireOrThrow(role: AccessRole, required: AccessRole) {
  const rank: Record<AccessRole, number> = { viewer: 0, editor: 1, admin: 2 }
  if (rank[role] < rank[required]) {
    throw new HttpError(403, 'Seu perfil de acesso não permite essa ação')
  }
}
