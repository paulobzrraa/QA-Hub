import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { hasAccess, type AccessRole } from '@qahub/shared'
import { prisma } from './db.js'
import { HttpError } from './http.js'

const scryptAsync = promisify(scrypt) as (
  password: string, salt: Buffer, keylen: number,
) => Promise<Buffer>

/**
 * Autenticação do QA Hub (US-5.1).
 *
 * Senha com scrypt do próprio Node — sem dependência nova, e é uma KDF
 * deliberadamente cara, o que é o ponto: um vazamento do banco não vira lista
 * de senhas. Diferente da cifragem reversível das credenciais de teste
 * (US-4.2), aqui o hash é de mão única: ninguém, nem o admin, lê a senha.
 */

const KEY_LENGTH = 64
const SALT_BYTES = 16

export const SESSION_COOKIE = 'qahub_session'
/** Sessão persistente: 30 dias, renovados a cada uso. */
const SESSION_DAYS = 30

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const derived = await scryptAsync(password, salt, KEY_LENGTH)
  return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split(':')
  if (scheme !== 'scrypt' || !salt || !expected) return false

  const derived = await scryptAsync(password, Buffer.from(salt, 'base64'), KEY_LENGTH)
  const expectedBuffer = Buffer.from(expected, 'base64')
  if (derived.length !== expectedBuffer.length) return false
  // Comparação em tempo constante: comparar com `===` vazaria, pelo tempo,
  // quantos bytes iniciais estavam certos.
  return timingSafeEqual(derived, expectedBuffer)
}

/**
 * O cookie leva o token; o banco guarda só o hash dele.
 * Assim um dump do banco não permite forjar sessão de ninguém.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createSession(
  accountId: string,
  request: FastifyRequest,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000)

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      accountId,
      expiresAt,
      userAgent: request.headers['user-agent'] ?? null,
      ipAddress: request.ip,
    },
  })
  return { token, expiresAt }
}

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    // `secure` só sob HTTPS: ligado sempre, o cookie não sobreviveria ao
    // acesso local por http, que é como o time roda hoje.
    secure: process.env.NODE_ENV === 'production',
    expires: expiresAt,
  })
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export interface Viewer {
  id: string
  email: string
  name: string
  role: AccessRole
  personId: string | null
}

/**
 * Resolve a sessão do cookie. Devolve `null` em vez de lançar: rota pública
 * também passa por aqui, e é o gate que decide se a ausência é problema.
 */
export async function resolveViewer(request: FastifyRequest): Promise<Viewer | null> {
  const token = request.cookies?.[SESSION_COOKIE]
  if (!token) return null

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { account: true },
  })
  if (!session) return null

  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => null)
    return null
  }
  // Conta desativada perde o acesso na hora, sem esperar a sessão vencer.
  if (!session.account.active) return null

  // Renovação deslizante: quem usa todo dia nunca é deslogado. Só grava
  // quando passou de uma hora, para não escrever no banco a cada requisição.
  if (Date.now() - session.lastSeenAt.getTime() > 3600_000) {
    await prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date(), expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000) },
    }).catch(() => null)
  }

  return {
    id: session.account.id,
    email: session.account.email,
    name: session.account.name,
    role: session.account.role as AccessRole,
    personId: session.account.personId,
  }
}

/** Revoga todas as sessões de uma conta (troca de senha, desativação). */
export async function revokeSessions(accountId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { accountId } })
}

/** Remove sessões vencidas. Chamado no boot, sem cron — como os snapshots. */
export async function pruneSessions(): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  return result.count
}

export function requireViewer(request: FastifyRequest): Viewer {
  const viewer = request.viewer
  if (!viewer) throw new HttpError(401, 'Faça login para continuar')
  return viewer
}

export function requireRole(request: FastifyRequest, required: AccessRole): Viewer {
  const viewer = requireViewer(request)
  if (!hasAccess(viewer.role, required)) {
    throw new HttpError(403, 'Seu perfil de acesso não permite essa ação')
  }
  return viewer
}

/**
 * Domínios de e-mail aceitos no cadastro (US-5.1, "e-mail corporativo").
 *
 * Vazio = qualquer domínio, que é o padrão para o QA Hub não travar quem está
 * subindo o sistema pela primeira vez. Restringir é uma linha no `.env`:
 *   ALLOWED_EMAIL_DOMAINS=rethink.dev
 */
export function assertAllowedEmail(email: string): void {
  const raw = process.env.ALLOWED_EMAIL_DOMAINS?.trim()
  if (!raw) return

  const allowed = raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean)
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain || !allowed.includes(domain)) {
    throw new HttpError(422, `Use um e-mail corporativo (${allowed.join(', ')})`)
  }
}
