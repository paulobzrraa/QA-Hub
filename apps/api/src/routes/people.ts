import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { personInput, PERSON_ROLE } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'

const listQuery = z.object({
  role: z.enum(PERSON_ROLE).optional(),
  /** `true` devolve só quem está ativo — é o que alimenta os seletores. */
  active: z.enum(['true', 'false']).optional(),
})

const mergeBody = z.object({
  /** Pessoa que PERMANECE. A da URL é absorvida e deixa de existir. */
  intoId: z.string().min(1, 'Escolha a pessoa que permanece'),
})

/** Quanto trabalho está pendurado numa pessoa — decide se dá para excluir. */
const WITH_COUNTS = {
  _count: { select: { suites: true, cases: true, bugs: true } },
} as const

export function peopleRoutes(app: FastifyInstance) {
  app.get('/api/people', async (request, reply) => {
    try {
      const filters = parse(listQuery, request.query)
      return await prisma.person.findMany({
        where: {
          role: filters.role,
          ...(filters.active ? { active: filters.active === 'true' } : {}),
        },
        include: WITH_COUNTS,
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/api/people', async (request, reply) => {
    try {
      const data = parse(personInput, request.body)
      const person = await prisma.person.create({ data, include: WITH_COUNTS })
      return reply.status(201).send(person)
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return sendError(reply, new HttpError(409, 'Já existe uma pessoa com esse nome'))
      }
      return sendError(reply, error)
    }
  })

  app.patch('/api/people/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = parse(personInput.partial(), request.body)
      return await prisma.person.update({ where: { id }, data, include: WITH_COUNTS })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        return sendError(reply, new HttpError(409, 'Já existe uma pessoa com esse nome'))
      }
      if ((error as { code?: string }).code === 'P2025') {
        return sendError(reply, new HttpError(404, 'Pessoa não encontrada'))
      }
      return sendError(reply, error)
    }
  })

  /**
   * Exclui — só quem não tem nada atribuído.
   *
   * As relações são `SetNull`, então excluir alguém com histórico não daria
   * erro: apagaria o nome de ciclos, cenários e bugs em silêncio. Para quem
   * saiu do time existe a flag de ativo; para nome duplicado existe a mescla.
   */
  app.delete('/api/people/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const person = await prisma.person.findUnique({ where: { id }, include: WITH_COUNTS })
      if (!person) throw new HttpError(404, 'Pessoa não encontrada')

      const { suites, cases, bugs } = person._count
      if (suites + cases + bugs > 0) {
        throw new HttpError(
          409,
          `${person.name} está em ${suites} ciclo(s), ${cases} cenário(s) e ${bugs} bug(s). ` +
            'Marque como inativa para tirar dos seletores sem perder o histórico, ou mescle com outra pessoa.',
        )
      }

      await prisma.person.delete({ where: { id } })
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Mescla duas pessoas duplicadas (US-4.5).
   *
   * A pessoa da URL é absorvida por `intoId`: ciclos, cenários e bugs passam
   * para quem permanece e a duplicata é removida. É a saída para os nomes que
   * a planilha trouxe divididos — `Jonatas`/`Jonatas Pedroso` são a mesma
   * pessoa, e `Noe Isai`/`Perez Chamorro` viraram dois registros porque o nome
   * vinha com vírgula no meio.
   *
   * Tudo numa transação: uma mescla que reatribuísse os ciclos e falhasse
   * antes de mover os bugs deixaria a duplicata meio esvaziada, pior do que
   * não ter começado.
   */
  app.post('/api/people/:id/merge', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { intoId } = parse(mergeBody, request.body)

      if (id === intoId) throw new HttpError(422, 'Escolha duas pessoas diferentes')

      const [source, target] = await Promise.all([
        prisma.person.findUnique({ where: { id } }),
        prisma.person.findUnique({ where: { id: intoId } }),
      ])
      if (!source) throw new HttpError(404, 'Pessoa a mesclar não encontrada')
      if (!target) throw new HttpError(404, 'Pessoa de destino não encontrada')

      const moved = await prisma.$transaction(async (tx) => {
        const suites = await tx.testSuite.updateMany({
          where: { responsibleId: id },
          data: { responsibleId: intoId },
        })
        const cases = await tx.testCase.updateMany({
          where: { responsibleId: id },
          data: { responsibleId: intoId },
        })
        const bugs = await tx.bug.updateMany({
          where: { responsibleId: id },
          data: { responsibleId: intoId },
        })
        await tx.person.delete({ where: { id } })
        return { suites: suites.count, cases: cases.count, bugs: bugs.count }
      })

      const merged = await prisma.person.findUnique({ where: { id: intoId }, include: WITH_COUNTS })
      return { person: merged, absorbed: source.name, moved }
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
