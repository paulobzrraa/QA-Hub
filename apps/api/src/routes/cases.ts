import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { caseInput, caseUpdate, CASE_STATUS, ENVIRONMENT } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import { EVIDENCE_SELECT } from './evidence.js'
import { recordChanges, CASE_FIELDS } from '../lib/changelog.js'

/** Campos de bug suficientes pra exibir o vínculo no cenário (US-2.5). */
export const LINKED_BUG_SELECT = {
  id: true,
  number: true,
  jiraKey: true,
  description: true,
  severity: true,
  status: true,
} as const

const linkBody = z.object({ bugId: z.string().min(1) })

/** Evidências do cenário, na ordem em que foram anexadas (US-4.3). */
export const EVIDENCE_INCLUDE = {
  select: EVIDENCE_SELECT,
  orderBy: { position: 'asc' },
} as const

const searchQuery = z.object({
  q: z.string().trim().optional(),
  qaStatus: z.enum(CASE_STATUS).optional(),
  environment: z.enum(ENVIRONMENT).optional(),
  automated: z.enum(['true', 'false']).optional(),
  responsibleId: z.string().optional(),
  suiteId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export function caseRoutes(app: FastifyInstance) {
  /** Busca global de cenários, atravessando todos os ciclos. */
  app.get('/api/cases', async (request, reply) => {
    try {
      const filters = parse(searchQuery, request.query)
      return await prisma.testCase.findMany({
        where: {
          suiteId: filters.suiteId,
          qaStatus: filters.qaStatus,
          environment: filters.environment,
          responsibleId: filters.responsibleId,
          ...(filters.automated ? { automated: filters.automated === 'true' } : {}),
          ...(filters.q
            ? {
                OR: [
                  { code: { contains: filters.q } },
                  { scenario: { contains: filters.q } },
                  { objective: { contains: filters.q } },
                  { bdd: { contains: filters.q } },
                  { jiraKey: { contains: filters.q } },
                ],
              }
            : {}),
        },
        // Mesma forma que as outras rotas de cenário devolvem: o tipo
        // `TestCase` do front promete `bugs` e `evidences` em todo cenário.
        include: {
          responsible: true,
          suite: { select: { id: true, name: true, platform: true } },
          bugs: { select: LINKED_BUG_SELECT },
          evidences: EVIDENCE_INCLUDE,
        },
        orderBy: [{ suiteId: 'asc' }, { position: 'asc' }],
        take: filters.limit,
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Cria um cenário no ciclo. O `code` (CT1, CT2...) é sugerido
   * automaticamente quando não informado, seguindo o padrão da planilha.
   */
  app.post('/api/suites/:suiteId/cases', async (request, reply) => {
    try {
      const { suiteId } = request.params as { suiteId: string }
      const suite = await prisma.testSuite.findUnique({ where: { id: suiteId } })
      if (!suite) throw new HttpError(404, 'Ciclo não encontrado')

      const body = (request.body ?? {}) as Record<string, unknown>
      if (!body.code) {
        const count = await prisma.testCase.count({ where: { suiteId } })
        body.code = `CT${count + 1}`
      }

      const data = parse(caseInput, body)
      const last = await prisma.testCase.findFirst({
        where: { suiteId },
        orderBy: { position: 'desc' },
      })

      const created = await prisma.testCase.create({
        data: { ...data, suiteId, position: (last?.position ?? 0) + 1 },
        include: { responsible: true, bugs: { select: LINKED_BUG_SELECT }, evidences: EVIDENCE_INCLUDE },
      })
      return reply.status(201).send(created)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return sendError(reply, new HttpError(409, 'Já existe um cenário com esse código nesse ciclo'))
      }
      return sendError(reply, error)
    }
  })

  app.patch('/api/cases/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = parse(caseUpdate, request.body)

      // Lido ANTES do update: depois não há mais "valor anterior" (US-5.2).
      const before = await prisma.testCase.findUnique({ where: { id } })
      if (!before) throw new HttpError(404, 'Cenário não encontrado')

      const updated = await prisma.testCase.update({
        where: { id },
        data,
        include: { responsible: true, bugs: { select: LINKED_BUG_SELECT }, evidences: EVIDENCE_INCLUDE },
      })

      await recordChanges({
        entity: 'case',
        entityId: id,
        before,
        after: data,
        fields: CASE_FIELDS,
        actorId: request.viewer?.id ?? null,
      })

      return updated
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return sendError(reply, new HttpError(409, 'Já existe um cenário com esse código nesse ciclo'))
      }
      return sendError(reply, error)
    }
  })

  app.delete('/api/cases/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      await prisma.testCase.delete({ where: { id } })
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Vínculo bug ↔ cenário (US-2.5). Substitui a antiga coluna `bugs` de
   * texto livre — o cenário que encontrou um bug fica ligado de verdade,
   * não só citado por texto solto.
   */
  app.post('/api/cases/:caseId/bugs', async (request, reply) => {
    try {
      const { caseId } = request.params as { caseId: string }
      const { bugId } = parse(linkBody, request.body)

      const updated = await prisma.testCase.update({
        where: { id: caseId },
        data: { bugs: { connect: { id: bugId } } },
        include: { responsible: true, bugs: { select: LINKED_BUG_SELECT }, evidences: EVIDENCE_INCLUDE },
      })
      return reply.status(201).send(updated)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return sendError(reply, new HttpError(404, 'Cenário ou bug não encontrado'))
      }
      return sendError(reply, error)
    }
  })

  app.delete('/api/cases/:caseId/bugs/:bugId', async (request, reply) => {
    try {
      const { caseId, bugId } = request.params as { caseId: string; bugId: string }
      await prisma.testCase.update({
        where: { id: caseId },
        data: { bugs: { disconnect: { id: bugId } } },
      })
      return reply.status(204).send()
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return sendError(reply, new HttpError(404, 'Cenário ou bug não encontrado'))
      }
      return sendError(reply, error)
    }
  })
}
