import { createReadStream, createWriteStream, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import { extname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { parse, sendError, HttpError } from '../lib/http.js'

/**
 * Evidências de cenário (US-4.3).
 *
 * O arquivo fica no disco, ao lado do banco, e não num link de Drive que
 * expira — que é justamente a dor que originou esta US. A coluna `Evidence`
 * da planilha não tinha nenhuma URL: eram chaves do Jira e nomes de arquivo
 * `.mov` cujo conteúdo morava fora de qualquer lugar acessível.
 */

const STORAGE_DIR = fileURLToPath(new URL('../../../../data/evidence/', import.meta.url))

/** Vídeo de teste passa fácil de 10 MB; print não chega perto disso. */
const MAX_FILE_BYTES = 50 * 1024 * 1024

const linkBody = z.object({
  url: z.string().trim().url('Informe uma URL válida (começando com http:// ou https://)'),
  caption: z.string().trim().max(300).optional(),
})

const captionBody = z.object({
  caption: z.string().trim().max(300).nullable().optional(),
})

/** Extensões que podem ser servidas de volta — espelha o que aceitamos subir. */
function kindFor(mimeType: string): 'image' | 'video' | null {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('video/')) return 'video'
  return null
}

function ensureStorage() {
  if (!existsSync(STORAGE_DIR)) mkdirSync(STORAGE_DIR, { recursive: true })
}

export const EVIDENCE_SELECT = {
  id: true,
  caseId: true,
  kind: true,
  url: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  caption: true,
  imported: true,
  position: true,
  createdAt: true,
} as const

export function evidenceRoutes(app: FastifyInstance) {
  /** Envia um print ou vídeo. Campo do formulário: `file`. */
  app.post('/api/cases/:caseId/evidence/upload', async (request, reply) => {
    let storedPath: string | null = null
    try {
      const { caseId } = request.params as { caseId: string }
      const testCase = await prisma.testCase.findUnique({ where: { id: caseId }, select: { id: true } })
      if (!testCase) throw new HttpError(404, 'Cenário não encontrado')

      const upload = await request.file()
      if (!upload) throw new HttpError(422, 'Nenhum arquivo enviado')

      const kind = kindFor(upload.mimetype)
      if (!kind) {
        // 415, não 422: o problema é o tipo da mídia, não o valor de um campo.
        throw new HttpError(415, `Tipo de arquivo não aceito (${upload.mimetype}). Envie imagem ou vídeo.`)
      }

      ensureStorage()
      // O nome no disco é gerado por nós: o nome original nunca entra no
      // caminho, então nome de arquivo malicioso não escapa da pasta.
      const storedName = `${randomUUID()}${extname(upload.filename).slice(0, 10)}`
      storedPath = join(STORAGE_DIR, storedName)
      await pipeline(upload.file, createWriteStream(storedPath))

      // O multipart corta o stream ao passar do limite; sem esta checagem o
      // arquivo ficaria salvo pela metade, parecendo íntegro.
      if (upload.file.truncated) {
        unlinkSync(storedPath)
        storedPath = null
        throw new HttpError(413, `Arquivo maior que o limite de ${MAX_FILE_BYTES / 1024 / 1024} MB`)
      }

      const last = await prisma.evidence.findFirst({
        where: { caseId },
        orderBy: { position: 'desc' },
        select: { position: true },
      })

      const caption = typeof upload.fields?.caption === 'object' && upload.fields.caption
        ? String((upload.fields.caption as { value?: unknown }).value ?? '').trim() || null
        : null

      const created = await prisma.evidence.create({
        data: {
          caseId,
          kind,
          storedName,
          originalName: upload.filename,
          mimeType: upload.mimetype,
          sizeBytes: (upload.file as { bytesRead?: number }).bytesRead ?? null,
          caption,
          position: (last?.position ?? 0) + 1,
        },
        select: EVIDENCE_SELECT,
      })
      return reply.status(201).send(created)
    } catch (error) {
      // Arquivo já gravado + falha depois = lixo no disco sem linha no banco.
      if (storedPath && existsSync(storedPath)) unlinkSync(storedPath)
      return sendError(reply, error)
    }
  })

  /** Anexa um link externo, para o que já vive fora (Drive, Jira, Loom). */
  app.post('/api/cases/:caseId/evidence/link', async (request, reply) => {
    try {
      const { caseId } = request.params as { caseId: string }
      const data = parse(linkBody, request.body)

      const testCase = await prisma.testCase.findUnique({ where: { id: caseId }, select: { id: true } })
      if (!testCase) throw new HttpError(404, 'Cenário não encontrado')

      const last = await prisma.evidence.findFirst({
        where: { caseId },
        orderBy: { position: 'desc' },
        select: { position: true },
      })

      const created = await prisma.evidence.create({
        data: {
          caseId,
          kind: 'link',
          url: data.url,
          caption: data.caption ?? null,
          position: (last?.position ?? 0) + 1,
        },
        select: EVIDENCE_SELECT,
      })
      return reply.status(201).send(created)
    } catch (error) {
      return sendError(reply, error)
    }
  })

  /**
   * Devolve o arquivo. O caminho vem do `storedName` gravado no banco, nunca
   * de algo que o cliente mandou — não há como pedir um arquivo de fora da
   * pasta de evidências.
   */
  app.get('/api/evidence/:id/file', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const evidence = await prisma.evidence.findUnique({ where: { id } })
      if (!evidence?.storedName) throw new HttpError(404, 'Evidência sem arquivo')

      const filePath = join(STORAGE_DIR, evidence.storedName)
      if (!existsSync(filePath)) throw new HttpError(404, 'Arquivo não encontrado no disco')

      reply.header('Content-Type', evidence.mimeType ?? 'application/octet-stream')
      // `inline` para o navegador exibir print e vídeo sem baixar.
      reply.header(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(evidence.originalName ?? evidence.storedName)}"`,
      )
      return reply.send(createReadStream(filePath))
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.patch('/api/evidence/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = parse(captionBody, request.body)
      return await prisma.evidence.update({
        where: { id },
        data: { caption: data.caption ?? null },
        select: EVIDENCE_SELECT,
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return sendError(reply, new HttpError(404, 'Evidência não encontrada'))
      }
      return sendError(reply, error)
    }
  })

  app.delete('/api/evidence/:id', async (request, reply) => {
    try {
      const { id } = request.params as { id: string }
      const evidence = await prisma.evidence.findUnique({ where: { id } })
      if (!evidence) throw new HttpError(404, 'Evidência não encontrada')

      await prisma.evidence.delete({ where: { id } })

      // O arquivo sai junto: linha removida com arquivo órfão no disco só
      // acumula lixo que ninguém mais consegue relacionar a nada.
      if (evidence.storedName) {
        const filePath = join(STORAGE_DIR, evidence.storedName)
        if (existsSync(filePath)) unlinkSync(filePath)
      }
      return reply.status(204).send()
    } catch (error) {
      return sendError(reply, error)
    }
  })
}

export { MAX_FILE_BYTES }
