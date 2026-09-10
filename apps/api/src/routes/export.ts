import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { PLATFORM, SQUAD, SUITE_STATUS } from '@qahub/shared'
import { buildWorkbook } from '../export/xlsx.js'
import { parse, sendError } from '../lib/http.js'

/**
 * Exportação no formato da planilha original (US-4.4).
 *
 * Sem filtro nenhum, exporta a base completa; com filtro, exporta só o
 * recorte — é o mesmo conjunto de filtros da tela de Ciclos de testes, para o
 * botão exportar exatamente o que a pessoa está vendo.
 */
const exportQuery = z.object({
  platform: z.enum(PLATFORM).optional(),
  squad: z.enum(SQUAD).optional(),
  status: z.enum(SUITE_STATUS).optional(),
  responsibleId: z.string().optional(),
  /** Busca livre por nome do ciclo ou chave do Jira — igual à listagem. */
  q: z.string().trim().optional(),
  /** Lista separada por vírgula, como no relatório final. */
  suiteIds: z.string().optional(),
  includeBugs: z.enum(['true', 'false']).default('true'),
  includeUsers: z.enum(['true', 'false']).default('true'),
})

export function exportRoutes(app: FastifyInstance) {
  app.get('/api/export/xlsx', async (request, reply) => {
    try {
      const query = parse(exportQuery, request.query)

      const workbook = await buildWorkbook({
        platform: query.platform,
        squad: query.squad,
        status: query.status,
        responsibleId: query.responsibleId,
        q: query.q,
        suiteIds: query.suiteIds?.split(',').map((id) => id.trim()).filter(Boolean),
        includeBugs: query.includeBugs === 'true',
        includeUsers: query.includeUsers === 'true',
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const stamp = new Date().toISOString().slice(0, 10)

      reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      reply.header('Content-Disposition', `attachment; filename="gerenciamento-de-testes-${stamp}.xlsx"`)
      return reply.send(Buffer.from(buffer))
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
