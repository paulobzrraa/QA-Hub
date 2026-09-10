import type { FastifyInstance } from 'fastify'
import { affectedAreaInput } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError } from '../lib/http.js'

/**
 * Catálogo de áreas afetadas por bug. É uma tabela (e não um enum fixo em
 * `@qahub/shared`) porque a lista precisa crescer sem alterar código.
 */
export function affectedAreaRoutes(app: FastifyInstance) {
  app.get('/api/affected-areas', async () =>
    prisma.affectedArea.findMany({ orderBy: { name: 'asc' } }),
  )

  /** Idempotente por nome: pedir a mesma área duas vezes não duplica a linha. */
  app.post('/api/affected-areas', async (request, reply) => {
    try {
      const data = parse(affectedAreaInput, request.body)
      const area = await prisma.affectedArea.upsert({
        where: { name: data.name },
        create: data,
        update: {},
      })
      return reply.status(201).send(area)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
