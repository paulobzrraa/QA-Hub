import type { FastifyInstance } from 'fastify'
import { accountInput, accountUpdate } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import {
  assertAllowedEmail, generateProvisionalPassword, hashPassword, requireRole, revokeSessions,
} from '../lib/auth.js'
import { recordChanges, recordEvent, ACCOUNT_FIELDS } from '../lib/changelog.js'

const ACCOUNT_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  personId: true,
  person: { select: { id: true, name: true } },
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  _count: { select: { sessions: true } },
} as const

/** Administração de contas de acesso (US-5.1). Só para administradores. */
export function accountRoutes(app: FastifyInstance) {
  app.get('/api/accounts', async (request, reply) => {
    try {
      requireRole(request, 'admin')
      return await prisma.account.findMany({
        select: ACCOUNT_SELECT,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/accounts', async (request, reply) => {
    try {
      requireRole(request, 'admin')
      const data = parse(accountInput, request.body)
      assertAllowedEmail(data.email)

      const account = await prisma.account.create({
        data: {
          email: data.email,
          name: data.name,
          passwordHash: await hashPassword(data.password),
          role: data.role,
          personId: data.personId ?? null,
        },
        select: ACCOUNT_SELECT,
      })
      return reply.status(201).send(account)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return sendError(reply, new HttpError(409, 'Já existe uma conta com esse e-mail'))
      }
      return sendError(reply, error)
    }
  })

  app.patch('/api/accounts/:id', async (request, reply) => {
    try {
      const viewer = requireRole(request, 'admin')
      const { id } = request.params as { id: string }
      const data = parse(accountUpdate, request.body)

      // Um admin que se rebaixa ou se desativa sozinho pode deixar o sistema
      // sem ninguém capaz de administrar. Barramos os dois casos.
      if (id === viewer.id) {
        if (data.role && data.role !== 'admin') {
          throw new HttpError(422, 'Você não pode remover a própria administração — peça a outro administrador')
        }
        if (data.active === false) {
          throw new HttpError(422, 'Você não pode desativar a própria conta')
        }
      }

      if (data.role && data.role !== 'admin') {
        const admins = await prisma.account.count({ where: { role: 'admin', active: true } })
        const target = await prisma.account.findUnique({ where: { id }, select: { role: true } })
        if (target?.role === 'admin' && admins <= 1) {
          throw new HttpError(422, 'Este é o último administrador ativo — promova outra pessoa antes')
        }
      }

      const before = await prisma.account.findUnique({ where: { id } })
      if (!before) throw new HttpError(404, 'Conta não encontrada')

      const account = await prisma.account.update({
        where: { id },
        data,
        select: ACCOUNT_SELECT,
      })

      // Promover alguém a administrador é exatamente o tipo de mudança que
      // alguém vai querer explicar depois — o histórico não pode ter esse
      // buraco só porque a US pedia apenas o registro da redefinição.
      await recordChanges({
        entity: 'account',
        entityId: id,
        before,
        after: data,
        fields: ACCOUNT_FIELDS,
        actorId: viewer.id,
      })

      // Desativar ou rebaixar tem que valer agora, não quando a sessão vencer.
      if (data.active === false || data.role) await revokeSessions(id)

      return account
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return sendError(reply, new HttpError(404, 'Conta não encontrada'))
      }
      return sendError(reply, error)
    }
  })

  /**
   * Redefine a senha de uma conta (US-6.1).
   *
   * Devolve a senha provisória UMA vez, na resposta — ela não é guardada em
   * texto em lugar nenhum e não há como recuperá-la depois. Quem redefiniu
   * anota, entrega, e a pessoa troca no primeiro acesso.
   */
  app.post('/api/accounts/:id/reset-password', async (request, reply) => {
    try {
      const viewer = requireRole(request, 'admin')
      const { id } = request.params as { id: string }

      const account = await prisma.account.findUnique({
        where: { id },
        select: { id: true, name: true, email: true },
      })
      if (!account) throw new HttpError(404, 'Conta não encontrada')

      const provisional = generateProvisionalPassword()

      await prisma.account.update({
        where: { id },
        data: {
          passwordHash: await hashPassword(provisional),
          mustChangePassword: true,
        },
      })

      // A senha antiga deixou de valer: sessão aberta com ela também.
      await revokeSessions(id)

      await recordEvent({
        entity: 'account',
        entityId: id,
        field: 'password',
        label: 'Senha',
        description: `redefinida por ${viewer.name}`,
        actorId: viewer.id,
      })

      return {
        account: { id: account.id, name: account.name, email: account.email },
        provisionalPassword: provisional,
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/accounts/:id', async (request, reply) => {
    try {
      const viewer = requireRole(request, 'admin')
      const { id } = request.params as { id: string }
      if (id === viewer.id) throw new HttpError(422, 'Você não pode excluir a própria conta')

      const target = await prisma.account.findUnique({ where: { id }, select: { role: true } })
      if (!target) throw new HttpError(404, 'Conta não encontrada')
      if (target.role === 'admin') {
        const admins = await prisma.account.count({ where: { role: 'admin', active: true } })
        if (admins <= 1) throw new HttpError(422, 'Este é o último administrador ativo')
      }

      await prisma.account.delete({ where: { id } })
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
