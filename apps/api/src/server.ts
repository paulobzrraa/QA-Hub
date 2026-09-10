import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import cookie from '@fastify/cookie'
import { metaRoutes } from './routes/meta.js'
import { peopleRoutes } from './routes/people.js'
import { suiteRoutes } from './routes/suites.js'
import { caseRoutes } from './routes/cases.js'
import { overviewRoutes } from './routes/overview.js'
import { bugRoutes } from './routes/bugs.js'
import { affectedAreaRoutes } from './routes/affected-areas.js'
import { metricsRoutes, ensureTodaySnapshot } from './routes/metrics.js'
import { reportRoutes } from './routes/reports.js'
import { testUserRoutes, ensureEncryptedCredentials } from './routes/test-users.js'
import { evidenceRoutes, MAX_FILE_BYTES } from './routes/evidence.js'
import { exportRoutes } from './routes/export.js'
import { authRoutes } from './routes/auth.js'
import { accountRoutes } from './routes/accounts.js'
import { historyRoutes } from './routes/history.js'
import { pruneHistory } from './lib/changelog.js'
import { pruneLoginAttempts } from './lib/login-guard.js'
import { registerGate } from './lib/gate.js'
import { pruneSessions } from './lib/auth.js'
import { disconnect } from './lib/db.js'

const app = Fastify({ logger: { transport: undefined, level: 'info' } })

// `credentials: true` + origem refletida: sem isso o navegador não manda o
// cookie de sessão nas chamadas do front em dev (portas diferentes).
await app.register(cors, { origin: true, credentials: true })
await app.register(cookie)

// O gate entra ANTES das rotas: rota nova nasce protegida (US-5.1).
registerGate(app)

// Upload de evidência (US-4.3) — vídeo de teste passa fácil de 10 MB.
await app.register(multipart, { limits: { fileSize: MAX_FILE_BYTES, files: 1 } })

app.get('/api/health', async () => ({ status: 'ok', at: new Date().toISOString() }))

metaRoutes(app)
peopleRoutes(app)
suiteRoutes(app)
caseRoutes(app)
overviewRoutes(app)
bugRoutes(app)
affectedAreaRoutes(app)
metricsRoutes(app)
reportRoutes(app)
testUserRoutes(app)
evidenceRoutes(app)
exportRoutes(app)
authRoutes(app)
accountRoutes(app)
historyRoutes(app)

const port = Number(process.env.PORT ?? 3333)

try {
  // Sem cron: garante que o snapshot de hoje exista assim que o servidor
  // sobe, mesmo que ninguém abra a tela de Métricas nesse dia.
  await ensureTodaySnapshot()

  // Senhas em texto puro anteriores à US-4.2 são cifradas no boot — sem passo
  // manual de migração, do mesmo jeito que o snapshot diário se garante.
  const encrypted = await ensureEncryptedCredentials()
  if (encrypted) app.log.info(`${encrypted} senha(s) da massa de teste cifradas em repouso.`)

  // Sem cron, como os snapshots: sessões vencidas saem no boot.
  const pruned = await pruneSessions()
  if (pruned) app.log.info(`${pruned} sessão(ões) vencida(s) removida(s).`)

  const oldHistory = await pruneHistory()
  if (oldHistory) app.log.info(`${oldHistory} registro(s) de histórico além da retenção removido(s).`)

  const oldAttempts = await pruneLoginAttempts()
  if (oldAttempts) app.log.info(`${oldAttempts} tentativa(s) de entrada antiga(s) removida(s).`)

  await app.listen({ port, host: '0.0.0.0' })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    await disconnect()
    process.exit(0)
  })
}
