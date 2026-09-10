import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  bugInput, bugUpdate, computeBugLeadTime, PLATFORM, BUG_SEVERITY, BUG_STATUS,
} from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import { recordChanges, BUG_FIELDS } from '../lib/changelog.js'

const listQuery = z.object({
  platform: z.enum(PLATFORM).optional(),
  severity: z.enum(BUG_SEVERITY).optional(),
  status: z.enum(BUG_STATUS).optional(),
  affectedAreaId: z.string().optional(),
  responsibleId: z.string().optional(),
  /** Busca livre por descrição ou chave do Jira. */
  q: z.string().trim().optional(),
  sort: z.enum(['reportedDate', 'severity', 'leadTime']).default('reportedDate'),
  order: z.enum(['asc', 'desc']).default('desc'),
})

/** Ordem de gravidade — não é alfabética ("Critical" < "High" < "Low"...). */
const SEVERITY_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3, Highest: 4 }

/** Anexa o lead time calculado — nunca vem do banco, sempre derivado. */
function withLeadTime<T extends { reportedDate: Date | null; fixedDate: Date | null; status: string }>(bug: T) {
  const leadTime = computeBugLeadTime(bug)
  return { ...bug, leadTimeDays: leadTime.days, leadTimeOpen: leadTime.open }
}

export function bugRoutes(app: FastifyInstance) {
  /**
   * Lista única de bugs, cruzando App e Web — substitui as duas abas de
   * tracking. Severidade e lead time não dão para ordenar no banco (severidade
   * não é alfabética, lead time não é uma coluna), então a ordenação final é
   * feita aqui, depois de aplicar os filtros.
   */
  app.get('/api/bugs', async (request, reply) => {
    try {
      const filters = parse(listQuery, request.query)

      const bugs = await prisma.bug.findMany({
        where: {
          platform: filters.platform,
          severity: filters.severity,
          status: filters.status,
          affectedAreaId: filters.affectedAreaId,
          responsibleId: filters.responsibleId,
          ...(filters.q
            ? {
                OR: [
                  { description: { contains: filters.q } },
                  { jiraKey: { contains: filters.q } },
                ],
              }
            : {}),
        },
        include: { responsible: true, affectedArea: true },
      })

      const withLead = bugs.map(withLeadTime)
      const direction = filters.order === 'asc' ? 1 : -1

      withLead.sort((a, b) => {
        if (filters.sort === 'severity') {
          return (SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]) * direction
        }
        if (filters.sort === 'leadTime') {
          return ((a.leadTimeDays ?? -1) - (b.leadTimeDays ?? -1)) * direction
        }
        const aTime = a.reportedDate ? new Date(a.reportedDate).getTime() : 0
        const bTime = b.reportedDate ? new Date(b.reportedDate).getTime() : 0
        return (aTime - bTime) * direction
      })

      return withLead
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.get('/api/bugs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const bug = await prisma.bug.findUnique({
        where: { id },
        include: { responsible: true, affectedArea: true },
      })
      if (!bug) throw new HttpError(404, 'Bug não encontrado')
      return withLeadTime(bug)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Cria um bug. O `number` é sugerido automaticamente por plataforma quando
   * não informado, seguindo o padrão das antigas abas de tracking.
   */
  app.post('/api/bugs', async (request, reply) => {
    try {
      const body = { ...(request.body as Record<string, unknown>) }
      if (!body.number && body.platform) {
        const count = await prisma.bug.count({ where: { platform: body.platform as string } })
        body.number = String(count + 1)
      }

      const data = parse(bugInput, body)
      const bug = await prisma.bug.create({
        data,
        include: { responsible: true, affectedArea: true },
      })
      return reply.status(201).send(withLeadTime(bug))
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const target = (error as { meta?: { target?: string[] } }).meta?.target ?? []
        const message = target.includes('jiraKey')
          ? 'Já existe um bug com essa chave do Jira'
          : 'Já existe um bug com esse número nessa plataforma'
        return sendError(reply, new HttpError(409, message))
      }
      return sendError(reply, error)
    }
  })

  /**
   * Ao transicionar o status para `Resolved` (US-2.5), a resposta inclui os
   * cenários ligados a este bug — quem chama decide se sugere o reteste,
   * o backend só aponta quais cenários acharam este bug.
   */
  app.patch('/api/bugs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = parse(bugUpdate, request.body)

      const before = await prisma.bug.findUnique({
        where: { id },
        include: {
          cases: { select: { id: true, code: true, scenario: true, suiteId: true, suite: { select: { name: true } } } },
        },
      })
      if (!before) throw new HttpError(404, 'Bug não encontrado')

      const bug = await prisma.bug.update({
        where: { id },
        data,
        include: { responsible: true, affectedArea: true },
      })

      await recordChanges({
        entity: 'bug',
        entityId: id,
        before,
        after: data,
        fields: BUG_FIELDS,
        actorId: request.viewer?.id ?? null,
      })

      const justResolved = data.status === 'Resolved' && before.status !== 'Resolved'
      const retestSuggested = justResolved
        ? before.cases.map((item) => ({
            id: item.id,
            code: item.code,
            scenario: item.scenario,
            suiteId: item.suiteId,
            suiteName: item.suite.name,
          }))
        : []

      return { ...withLeadTime(bug), retestSuggested }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        const target = (error as { meta?: { target?: string[] } }).meta?.target ?? []
        const message = target.includes('jiraKey')
          ? 'Já existe um bug com essa chave do Jira'
          : 'Já existe um bug com esse número nessa plataforma'
        return sendError(reply, new HttpError(409, message))
      }
      return sendError(reply, error)
    }
  })

  app.delete('/api/bugs/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      await prisma.bug.delete({ where: { id } })
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
