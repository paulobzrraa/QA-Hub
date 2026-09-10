import type { FastifyInstance } from 'fastify'
import { computeMetrics, BUG_SEVERITY, type CaseLike, type CaseStatus, type Platform } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { sendError } from '../lib/http.js'

/** Agrupa suítes por uma chave (squad, responsável...) somando métricas. */
function groupSuites<T extends { cases: CaseLike[] }>(
  suites: T[],
  keyOf: (suite: T) => string,
) {
  const groups = new Map<string, { suites: number; cases: CaseLike[] }>()
  for (const suite of suites) {
    const key = keyOf(suite)
    const entry = groups.get(key) ?? { suites: 0, cases: [] }
    entry.suites += 1
    entry.cases.push(...suite.cases)
    groups.set(key, entry)
  }
  return [...groups.entries()]
    .map(([key, { suites: count, cases }]) => ({ key, suites: count, metrics: computeMetrics(cases) }))
    .sort((a, b) => b.metrics.total - a.metrics.total)
}

/**
 * Consolidado do portfólio — o que a aba "2. Progress" mostrava nos totais,
 * porém calculado a partir dos cenários reais, e não de somas manuais.
 * Cenários × automação por plataforma, squad e responsável, distribuição de
 * status e bugs em aberto por severidade: a base do dashboard executivo
 * (US-3.1) — nenhum número aqui é digitado à mão.
 */
export function overviewRoutes(app: FastifyInstance) {
  app.get('/api/overview', async (_request, reply) => {
    try {
      const suites = await prisma.testSuite.findMany({
        include: {
          responsible: { select: { id: true, name: true } },
          cases: { select: { automated: true, qaStatus: true, stageStatus: true } },
        },
      })

      const roll = (item: { automated: boolean; qaStatus: string; stageStatus: string }): CaseLike => ({
        automated: item.automated,
        qaStatus: item.qaStatus as CaseStatus,
        stageStatus: item.stageStatus as CaseStatus,
      })

      const rolled = suites.map((suite) => ({ ...suite, cases: suite.cases.map(roll) }))
      const all = rolled.flatMap((suite) => suite.cases)

      // Bugs por plataforma: total (painel) e só os "Open" (contador dos
      // submenus "Web"/"App" do menu Bugs — Resolved/Canceled não pedem ação).
      const [webBugsTotal, appBugsTotal, webBugsOpen, appBugsOpen] = await Promise.all([
        prisma.bug.count({ where: { platform: 'Web' } }),
        prisma.bug.count({ where: { platform: 'App' } }),
        prisma.bug.count({ where: { platform: 'Web', status: 'Open' } }),
        prisma.bug.count({ where: { platform: 'App', status: 'Open' } }),
      ])
      const openBugsByPlatform: Record<Platform, number> = { Web: webBugsOpen, App: appBugsOpen }

      const byPlatform = (['Web', 'App'] as Platform[]).map((platform) => {
        const scoped = rolled.filter((suite) => suite.platform === platform)
        return {
          platform,
          suites: scoped.length,
          openBugs: openBugsByPlatform[platform],
          metrics: computeMetrics(scoped.flatMap((suite) => suite.cases)),
        }
      })

      // Squad é opcional na suíte; sem valor, entra como "Sem squad".
      const bySquad = groupSuites(rolled, (suite) => suite.squad ?? 'Sem squad')
        .map(({ key, ...rest }) => ({ squad: key, ...rest }))

      const byPerson = groupSuites(rolled, (suite) => suite.responsible?.name ?? 'Sem responsável')
        .map(({ key, ...rest }) => ({ name: key, ...rest }))

      const statusCounts = suites.reduce<Record<string, number>>((acc, suite) => {
        acc[suite.status] = (acc[suite.status] ?? 0) + 1
        return acc
      }, {})

      // Bugs em aberto por severidade: mesma régua de "aberto" do indicador
      // visual na suíte (US-2.5) — Resolved/Canceled não contam.
      const openBugsBySeverityRaw = await prisma.bug.groupBy({
        by: ['severity'],
        where: { status: { notIn: ['Resolved', 'Canceled'] } },
        _count: { _all: true },
      })
      const openBugsBySeverityMap = new Map(
        openBugsBySeverityRaw.map((item) => [item.severity, item._count._all]),
      )
      const bugsBySeverity = BUG_SEVERITY.map((severity) => ({
        severity,
        count: openBugsBySeverityMap.get(severity) ?? 0,
      }))

      return {
        totals: { suites: suites.length, bugs: webBugsTotal + appBugsTotal, ...computeMetrics(all) },
        byPlatform,
        bySquad,
        statusCounts,
        byPerson,
        bugsBySeverity,
      }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
