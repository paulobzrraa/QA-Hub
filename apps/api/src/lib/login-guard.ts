import { prisma } from './db.js'
import { HttpError } from './http.js'

/**
 * Freio de força bruta no login (US-6.2).
 *
 * A US-5.1 já fazia o login não distinguir e-mail inexistente de senha errada
 * e gastar o mesmo tempo nos dois. Faltava o resto: nada impedia dez mil
 * tentativas. Aqui as tentativas seguidas passam a custar tempo e, a partir de
 * certo ponto, param de ser respondidas.
 *
 * A contagem é feita nos DOIS eixos, porque eles cobrem ataques diferentes:
 * por endereço de origem, para quem varre muitas contas de uma mesma máquina;
 * e por e-mail, para quem martela uma conta só a partir de vários endereços.
 * Vale sempre o eixo mais estourado.
 *
 * O estado mora no banco, e não em memória, por dois motivos: o critério pede
 * que as tentativas fiquem registradas de qualquer forma, e um reinício do
 * servidor não pode zerar um bloqueio em curso.
 */

/** Janela em que uma falha ainda pesa na contagem. */
const WINDOW_MINUTES = 15

/** A partir daqui a resposta começa a demorar. */
const SOFT_THRESHOLD = 3

/** A partir daqui a tentativa nem é avaliada. */
const HARD_THRESHOLD = 8

const BLOCK_MINUTES = 15

/** Teto do atraso: manter conexão aberta por muito tempo é custo nosso, não do atacante. */
const MAX_DELAY_MS = 5000

/** Tentativa recusada fica guardada por este tempo, para consulta. */
const RETENTION_DAYS = 30

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60_000)
}

/**
 * Falhas recentes num eixo, contadas só a partir do último acerto: quem errou
 * três vezes, acertou e voltou a errar não começa do três.
 */
async function recentFailures(where: { email: string } | { ipAddress: string }): Promise<{
  count: number
  lastAt: Date | null
}> {
  const since = windowStart()

  const lastSuccess = await prisma.loginAttempt.findFirst({
    where: { ...where, success: true, createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  const from = lastSuccess ? lastSuccess.createdAt : since
  const failures = await prisma.loginAttempt.findMany({
    where: { ...where, success: false, createdAt: { gt: from } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })

  return { count: failures.length, lastAt: failures[0]?.createdAt ?? null }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface AttemptContext {
  email: string
  ipAddress: string
  userAgent: string | null
}

/**
 * Roda ANTES de conferir a senha.
 *
 * Bloqueia mesmo que a senha esteja certa — do contrário a trava seria
 * contornável pelo próprio acerto, que é justamente o que se quer impedir.
 * O admin tem como destravar redefinindo a senha da pessoa (US-6.1).
 */
export async function guardLoginAttempt(context: AttemptContext): Promise<void> {
  const [byEmail, byIp] = await Promise.all([
    recentFailures({ email: context.email }),
    recentFailures({ ipAddress: context.ipAddress }),
  ])

  const worst = byEmail.count >= byIp.count ? byEmail : byIp
  const failures = worst.count

  if (failures >= HARD_THRESHOLD && worst.lastAt) {
    const until = new Date(worst.lastAt.getTime() + BLOCK_MINUTES * 60_000)
    const minutes = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 60_000))
    if (until.getTime() > Date.now()) {
      // Mensagem idêntica para conta existente e inexistente: dizer "essa
      // conta está bloqueada" confirmaria que ela existe.
      throw new HttpError(
        429,
        `Muitas tentativas de entrada. Tente novamente em ${minutes} minuto${minutes > 1 ? 's' : ''}.`,
      )
    }
  }

  if (failures >= SOFT_THRESHOLD) {
    // Dobra a cada falha a partir do limite brando. O atraso depende só da
    // contagem — nunca de a conta existir —, então não vaza nada por tempo.
    const delay = Math.min(500 * 2 ** (failures - SOFT_THRESHOLD), MAX_DELAY_MS)
    await sleep(delay)
  }
}

export async function recordAttempt(context: AttemptContext, success: boolean): Promise<void> {
  await prisma.loginAttempt.create({
    data: {
      email: context.email,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success,
    },
  })
}

/**
 * Destrava um e-mail apagando as falhas que ainda pesam na janela. Usado
 * quando o administrador redefine a senha de alguém: se ele está justamente
 * ajudando a pessoa a voltar, deixá-la bloqueada seria absurdo.
 */
export async function clearFailures(email: string): Promise<number> {
  const result = await prisma.loginAttempt.deleteMany({
    where: { email, success: false, createdAt: { gte: windowStart() } },
  })
  return result.count
}

/** Remove tentativas antigas. Chamado no boot, sem cron. */
export async function pruneLoginAttempts(): Promise<number> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000)
  const result = await prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } })
  return result.count
}

export const LOGIN_GUARD = { WINDOW_MINUTES, SOFT_THRESHOLD, HARD_THRESHOLD, BLOCK_MINUTES }
