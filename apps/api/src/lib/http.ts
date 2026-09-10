import type { FastifyReply } from 'fastify'
import { ZodError, type ZodTypeAny, type z } from 'zod'

/** Erro de domínio com status HTTP próprio. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
  }
}

/**
 * Valida a entrada e devolve 422 com a lista de campos inválidos.
 * As mensagens vêm dos schemas de @qahub/shared, que replicam as regras
 * de validação das células da planilha.
 */
export function parse<T extends ZodTypeAny>(schema: T, payload: unknown): z.infer<T> {
  try {
    return schema.parse(payload)
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues.map((issue) => ({
        field: issue.path.join('.') || '(raiz)',
        message: issue.message,
      }))
      throw new HttpError(422, JSON.stringify(details))
    }
    throw error
  }
}

function parseDetails(error: HttpError): unknown {
  if (error.status !== 422) return error.message
  try {
    return JSON.parse(error.message)
  } catch {
    return error.message
  }
}

export function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof HttpError) {
    // O 422 do `parse` acima carrega a lista de campos em JSON, mas nem todo
    // 422 vem de lá — um erro de domínio pode subir 422 com mensagem simples.
    // Sem este fallback, essa mensagem virava um 500 de "JSON inválido".
    return reply.status(error.status).send({ error: parseDetails(error) })
  }
  reply.log.error(error)
  return reply.status(500).send({ error: 'Erro interno' })
}
