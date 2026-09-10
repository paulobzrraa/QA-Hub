import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { parse, sendError } from '../lib/http.js'
import { retentionMonths } from '../lib/changelog.js'

const params = z.object({
  entity: z.enum(['case', 'bug', 'suite', 'account']),
  id: z.string().min(1),
})

const query = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/** Linha do tempo de um cenário, bug ou ciclo (US-5.2). */
export function historyRoutes(app: FastifyInstance) {
  app.get('/api/history/:entity/:id', async (request, reply) => {
    try {
      const { entity, id } = parse(params, request.params)
      const { limit } = parse(query, request.query)

      const entries = await prisma.changeLog.findMany({
        where: { entity, entityId: id },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          kind: true,
          field: true,
          label: true,
          oldValue: true,
          newValue: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      })

      return { entries, retentionMonths: retentionMonths() }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
