import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { computeMetrics, PLATFORM, SQUAD, type CaseStatus } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError } from '../lib/http.js'

/** Meia-noite UTC de hoje — chave de idempotência do snapshot do dia. */
function today(): Date {
  const date = new Date()
  date.setUTCHours(0, 0, 0, 0)
  return date
}

function roll(item: { automated: boolean; qaStatus: string; stageStatus: string }) {
  return {
    automated: item.automated,
    qaStatus: item.qaStatus as CaseStatus,
    stageStatus: item.stageStatus as CaseStatus,
  }
}

/**
 * Garante que o snapshot de hoje existe e reflete o estado atual.
 * Sem cron: chamado no boot do servidor e a cada leitura do histórico, então
 * o pior caso é "o de hoje ficou uma leitura atrasado", nunca "não existe".
 */
export async function ensureTodaySnapshot(): Promise<void> {
  const cases = await prisma.testCase.findMany({
    select: { automated: true, qaStatus: true, stageStatus: true },
  })
  const metrics = computeMetrics(cases.map(roll))
  const openBugs = await prisma.bug.count({ where: { status: { notIn: ['Resolved', 'Canceled'] } } })

  const data = {
    totalCases: metrics.total,
    executedCases: metrics.executed,
    automatedCases: metrics.automated,
    openBugs,
  }

  await prisma.metricSnapshot.upsert({
    where: { date: today() },
    create: { date: today(), ...data },
    update: data,
  })
}

const coverageQuery = z.object({
  squad: z.enum(SQUAD).optional(),
  platform: z.enum(PLATFORM).optional(),
})

/**
 * Evolução no tempo (US-3.2) — devolve o histórico inteiro; o período
 * (30/90/tudo) é um recorte simples de datas, feito no front. O volume é
 * baixo por natureza (no máximo um registro por dia), não precisa de
 * paginação nem filtro no banco.
 */
export function metricsRoutes(app: FastifyInstance) {
  app.get('/api/metrics/history', async (_request, reply) => {
    try {
      await ensureTodaySnapshot()
      return await prisma.metricSnapshot.findMany({ orderBy: { date: 'asc' } })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Cobertura de automação (US-3.3) — ranking por MENOR taxa de automação,
   * ponderado por volume. "Ponderado por volume" e "menor taxa" resolvem pro
   * mesmo número: (1 - automationRate) × total = total − automated = manual.
   * Ordenar por manual desc já é a taxa mais baixa pesada pelo tamanho da
   * suíte, sem precisar de um corte arbitrário de "suíte pequena demais pra
   * contar" — uma suíte de 3 cenários nunca disputa o topo com uma de 300.
   */
  app.get('/api/metrics/automation-coverage', async (request, reply) => {
    try {
      const filters = parse(coverageQuery, request.query)
      const suites = await prisma.testSuite.findMany({
        where: { squad: filters.squad, platform: filters.platform },
        include: { cases: { select: { automated: true, qaStatus: true, stageStatus: true } } },
      })

      return suites
        .map((suite) => {
          const metrics = computeMetrics(suite.cases.map(roll))
          return {
            id: suite.id,
            name: suite.name,
            platform: suite.platform,
            squad: suite.squad,
            status: suite.status,
            total: metrics.total,
            automated: metrics.automated,
            manual: metrics.manual,
            automationRate: metrics.automationRate,
            // Ciclo fechado sem nenhuma automação: oportunidade que não volta
            // pra este ciclo, mas aponta um gap sistêmico a investigar.
            zeroAutomationAtCompletion: suite.status === 'Completed' && metrics.total > 0 && metrics.automated === 0,
          }
        })
        .filter((row) => row.total > 0) // nada pra automatizar ainda não é "atraso"
        .sort((a, b) => b.manual - a.manual)
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
