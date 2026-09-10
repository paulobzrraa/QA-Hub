import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  suiteInput, suiteUpdate, computeMetrics,
  PLATFORM, SQUAD, SUITE_STATUS, type CaseStatus,
} from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import { LINKED_BUG_SELECT, EVIDENCE_INCLUDE } from './cases.js'
import { recordChanges, SUITE_FIELDS } from '../lib/changelog.js'

const listQuery = z.object({
  platform: z.enum(PLATFORM).optional(),
  squad: z.enum(SQUAD).optional(),
  status: z.enum(SUITE_STATUS).optional(),
  responsibleId: z.string().optional(),
  /** Busca livre por nome do ciclo ou chave do Jira. */
  q: z.string().trim().optional(),
})

export function suiteRoutes(app: FastifyInstance) {
  /** Lista de ciclos já com as métricas agregadas de cada um. */
  app.get('/api/suites', async (request, reply) => {
    try {
      const filters = parse(listQuery, request.query)

      const suites = await prisma.testSuite.findMany({
        where: {
          platform: filters.platform,
          squad: filters.squad,
          status: filters.status,
          responsibleId: filters.responsibleId,
          ...(filters.q
            ? {
                OR: [
                  { name: { contains: filters.q } },
                  { jiraKey: { contains: filters.q } },
                ],
              }
            : {}),
        },
        include: {
          responsible: true,
          cases: { select: { automated: true, qaStatus: true, stageStatus: true } },
        },
        orderBy: [{ position: 'asc' }, { name: 'asc' }],
      })

      return suites.map(({ cases, ...suite }) => ({
        ...suite,
        metrics: computeMetrics(
          cases.map((item) => ({
            ...item,
            qaStatus: item.qaStatus as CaseStatus,
            stageStatus: item.stageStatus as CaseStatus,
          })),
        ),
      }))
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /** Detalhe do ciclo com todos os cenários. */
  app.get('/api/suites/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const suite = await prisma.testSuite.findUnique({
        where: { id },
        include: {
          responsible: true,
          cases: {
            include: {
              responsible: true,
              bugs: { select: LINKED_BUG_SELECT }, evidences: EVIDENCE_INCLUDE,
            },
            orderBy: [{ position: 'asc' }, { code: 'asc' }],
          },
        },
      })
      if (!suite) throw new HttpError(404, 'Ciclo não encontrado')

      return {
        ...suite,
        metrics: computeMetrics(
          suite.cases.map((item) => ({
            automated: item.automated,
            qaStatus: item.qaStatus as CaseStatus,
            stageStatus: item.stageStatus as CaseStatus,
          })),
        ),
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/suites', async (request, reply) => {
    try {
      const data = parse(suiteInput, request.body)
      const last = await prisma.testSuite.findFirst({ orderBy: { position: 'desc' } })
      const suite = await prisma.testSuite.create({
        data: { ...data, position: (last?.position ?? 0) + 1 },
        include: { responsible: true },
      })
      return reply.status(201).send(suite)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.patch('/api/suites/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = parse(suiteUpdate, request.body)

      const before = await prisma.testSuite.findUnique({ where: { id } })
      if (!before) throw new HttpError(404, 'Ciclo não encontrado')

      const updated = await prisma.testSuite.update({
        where: { id },
        data,
        include: { responsible: true },
      })

      await recordChanges({
        entity: 'suite',
        entityId: id,
        before,
        after: data,
        fields: SUITE_FIELDS,
        actorId: request.viewer?.id ?? null,
      })

      return updated
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.delete('/api/suites/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      await prisma.testSuite.delete({ where: { id } })
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
