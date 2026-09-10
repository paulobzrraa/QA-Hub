import type { FastifyInstance } from 'fastify'
import { loginInput, accountInput, passwordChange, ACCESS_ROLE_LABEL } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import {
  assertAllowedEmail, clearSessionCookie, createSession, hashPassword, requireViewer,
  revokeSessions, setSessionCookie, verifyPassword, SESSION_COOKIE,
} from '../lib/auth.js'

/** O que o front precisa saber sobre quem está logado. */
const VIEWER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  personId: true,
  person: { select: { id: true, name: true } },
  /** Entrou com provisória e ainda precisa trocar (US-6.1). */
  mustChangePassword: true,
  lastLoginAt: true,
} as const

export function authRoutes(app: FastifyInstance) {
  /**
   * Estado da instalação. Público de propósito: é o que a tela de login
   * consulta para saber se ainda não existe conta nenhuma e mostrar a criação
   * do primeiro acesso em vez do formulário de entrada.
   */
  app.get('/api/auth/status', async () => {
    const accounts = await prisma.account.count()
    return { needsSetup: accounts === 0, roles: ACCESS_ROLE_LABEL }
  })

  /**
   * Cria o primeiro acesso — administrador, e só enquanto não existir conta
   * nenhuma. Depois disso a rota fecha sozinha, e novas contas passam a ser
   * criadas por quem já é administrador.
   */
  app.post('/api/auth/setup', async (request, reply) => {
    try {
      const accounts = await prisma.account.count()
      if (accounts > 0) throw new HttpError(409, 'O primeiro acesso já foi criado')

      const data = parse(accountInput, request.body)
      assertAllowedEmail(data.email)

      const account = await prisma.account.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: await hashPassword(data.password),
          role: 'admin',
        },
        select: VIEWER_SELECT,
      })

      const session = await createSession(account.id, request)
      setSessionCookie(reply, session.token, session.expiresAt)
      return reply.status(201).send(account)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    try {
      const data = parse(loginInput, request.body)

      const account = await prisma.account.findUnique({ where: { email: data.email } })

      // Mesma mensagem para e-mail inexistente e senha errada: distinguir
      // entregaria de graça a lista de quem tem conta no sistema.
      const invalid = new HttpError(401, 'E-mail ou senha incorretos')
      if (!account) {
        // Gasta o mesmo tempo do caminho válido, senão a diferença de resposta
        // denuncia quais e-mails existem.
        await hashPassword(data.password)
        throw invalid
      }
      if (!(await verifyPassword(data.password, account.passwordHash))) throw invalid
      if (!account.active) throw new HttpError(403, 'Esta conta está desativada')

      await prisma.account.update({
        where: { id: account.id },
        data: { lastLoginAt: new Date() },
      })

      const session = await createSession(account.id, request)
      setSessionCookie(reply, session.token, session.expiresAt)

      return await prisma.account.findUnique({ where: { id: account.id }, select: VIEWER_SELECT })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    try {
      const token = request.cookies?.[SESSION_COOKIE]
      if (token) {
        // Encerra só ESTA sessão: sair no notebook não pode derrubar o celular.
        const { createHash } = await import('node:crypto')
        await prisma.session
          .deleteMany({ where: { tokenHash: createHash('sha256').update(token).digest('hex') } })
          .catch(() => null)
      }
      clearSessionCookie(reply)
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/auth/me', async (request, reply) => {
    try {
      const viewer = requireViewer(request)
      return await prisma.account.findUnique({ where: { id: viewer.id }, select: VIEWER_SELECT })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /** Troca a própria senha. Derruba as outras sessões, mantendo a atual. */
  app.post('/api/auth/password', async (request, reply) => {
    try {
      const viewer = requireViewer(request)
      const data = parse(passwordChange, request.body)

      const account = await prisma.account.findUnique({ where: { id: viewer.id } })
      if (!account) throw new HttpError(404, 'Conta não encontrada')
      if (!(await verifyPassword(data.currentPassword, account.passwordHash))) {
        throw new HttpError(422, JSON.stringify([{ field: 'currentPassword', message: 'Senha atual incorreta' }]))
      }

      await prisma.account.update({
        where: { id: viewer.id },
        data: {
          passwordHash: await hashPassword(data.newPassword),
          // Trocou: a provisória morre aqui e a conta destrava (US-6.1).
          mustChangePassword: false,
        },
      })

      // Trocar a senha tem que expulsar quem estava logado com a antiga.
      await revokeSessions(viewer.id)
      const session = await createSession(viewer.id, request)
      setSessionCookie(reply, session.token, session.expiresAt)

      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
