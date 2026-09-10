import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { USER_ENV, USER_STATUS, USER_KIND, digitsOnly } from '@qahub/shared'
import { prisma } from '../lib/db.js'
import { decrypt, encrypt, isEncrypted } from '../lib/crypto.js'
import { parse, sendError, HttpError } from '../lib/http.js'
import { requireViewer } from '../lib/auth.js'

const listQuery = z.object({
  environment: z.enum(USER_ENV).optional(),
  status: z.enum(USER_STATUS).optional(),
  kind: z.enum(USER_KIND).optional(),
  profile: z.string().trim().optional(),
  /** Busca livre por e-mail ou CPF. */
  q: z.string().trim().optional(),
})

const revealQuery = z.object({
  action: z.enum(['reveal', 'copy']).default('copy'),
})

const accessQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

/**
 * Campos que saem numa listagem. `password` fica de fora: a senha só sai pelo
 * endpoint dedicado abaixo, sob ação explícita e com registro (US-4.2).
 */
const LIST_SELECT = {
  id: true,
  email: true,
  cpf: true,
  kind: true,
  environment: true,
  status: true,
  profile: true,
  notes: true,
  sourceSheet: true,
  sourceRow: true,
} as const

/**
 * Cifra as senhas que ainda estiverem em texto puro (US-4.2).
 *
 * Sem migração manual, no mesmo espírito do `ensureTodaySnapshot`: roda no
 * boot do servidor e conserta tanto as 46 contas que vieram da planilha antes
 * desta US quanto qualquer valor que entre em texto puro depois. Devolve
 * quantas foram convertidas.
 */
export async function ensureEncryptedCredentials(): Promise<number> {
  const users = await prisma.testUser.findMany({
    where: { password: { not: null } },
    select: { id: true, password: true },
  })

  let converted = 0
  for (const user of users) {
    if (isEncrypted(user.password)) continue
    await prisma.testUser.update({
      where: { id: user.id },
      data: { password: encrypt(user.password) },
    })
    converted += 1
  }

  // Sem isto a cifragem seria só meia proteção: o SQLite não devolve ao
  // sistema a página onde a linha antiga estava, então o texto puro continua
  // legível com `strings qahub.db` mesmo depois do UPDATE. O VACUUM reconstrói
  // o arquivo e descarta as páginas liberadas. Roda só quando houve conversão
  // — é caro para fazer a cada boot.
  if (converted > 0) await prisma.$executeRawUnsafe('VACUUM')

  return converted
}

/** Massa de usuários de teste (US-4.1) — abas "Users QA" e "Users PRD". */
export function testUserRoutes(app: FastifyInstance) {
  app.get('/api/test-users', async (request, reply) => {
    try {
      const filters = parse(listQuery, request.query)

      // O CPF é guardado só com dígitos, então a busca também procura pelos
      // dígitos do termo: digitar `123.456` encontra `12345678909`.
      const cpfDigits = filters.q ? digitsOnly(filters.q) : null

      return await prisma.testUser.findMany({
        where: {
          environment: filters.environment,
          status: filters.status,
          kind: filters.kind,
          profile: filters.profile,
          ...(filters.q
            ? {
                OR: [
                  { email: { contains: filters.q } },
                  ...(cpfDigits ? [{ cpf: { contains: cpfDigits } }] : []),
                ],
              }
            : {}),
        },
        select: LIST_SELECT,
        orderBy: [{ environment: 'asc' }, { email: 'asc' }],
      })
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Valores de perfil existentes. É uma consulta e não uma constante de
   * domínio porque a coluna de origem nunca teve `dataValidation` — a lista
   * real só existe no dado.
   */
  app.get('/api/test-users/profiles', async (_request, reply) => {
    try {
      const rows = await prisma.testUser.findMany({
        where: { profile: { not: null } },
        select: { profile: true },
        distinct: ['profile'],
        orderBy: { profile: 'asc' },
      })
      return rows.map((row) => row.profile as string)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Revela a senha de uma conta — decifrada na hora, uma conta por vez, sob
   * ação explícita, e sempre deixando registro (US-4.2).
   *
   * `action` distingue exibir na tela de copiar sem exibir: as duas são acesso
   * à credencial e as duas ficam registradas, mas expor a senha num monitor
   * tem um alcance que colar num campo de senha não tem.
   */
  app.get('/api/test-users/:id/password', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const { action } = parse(revealQuery, request.query)
      // A US-4.2 deixou este campo em branco por não haver login. Com a
      // US-5.1 o registro passa a dizer QUEM, não só quando e de onde.
      const viewer = requireViewer(request)

      const user = await prisma.testUser.findUnique({
        where: { id },
        select: { password: true },
      })
      if (!user) throw new HttpError(404, 'Conta de teste não encontrada')
      if (!user.password) throw new HttpError(404, 'Essa conta não tem senha cadastrada')

      // O registro vem antes de devolver a senha: se gravar o acesso falhar,
      // a senha não sai. Um acesso não registrado é pior que um acesso negado.
      await prisma.credentialAccess.create({
        data: {
          testUserId: id,
          action,
          actorId: viewer.id,
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        },
      })

      return { password: decrypt(user.password) }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Registro de acessos às senhas. Sem `password` em lugar nenhum da resposta
   * — o que se audita é o acesso, não a credencial.
   */
  app.get('/api/test-users/credential-accesses', async (request, reply) => {
    try {
      const { limit } = parse(accessQuery, request.query)
      const rows = await prisma.credentialAccess.findMany({
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          action: true,
          actorId: true,
          actor: { select: { id: true, name: true, email: true } },
          ipAddress: true,
          userAgent: true,
          createdAt: true,
          testUser: { select: { id: true, email: true, environment: true } },
        },
      })
      return rows
    } catch (error) {
      return sendError(reply, error)
    }
  })
}
