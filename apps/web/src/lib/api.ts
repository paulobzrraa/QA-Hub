/** Erro vindo da API, com os campos inválidos quando a validação falha (422). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly fields: { field: string; message: string }[] = [],
  ) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    // Sem isto o cookie de sessão (US-5.1) não acompanha as chamadas.
    credentials: 'same-origin',
    headers: {
      // Só declara JSON quando existe corpo. O Fastify recusa com 400
      // (FST_ERR_CTP_EMPTY_JSON_BODY) uma requisição que diz enviar JSON e
      // chega vazia — era isso que quebrava TODO DELETE do app (excluir
      // cenário, desvincular bug, remover evidência). Não aparecia em teste
      // com curl, que não manda esse cabeçalho sozinho; só no navegador.
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (response.status === 204) return undefined as T

  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const detail = payload?.error
    if (Array.isArray(detail)) {
      throw new ApiError(
        response.status,
        detail.map((item) => `${item.field}: ${item.message}`).join('; '),
        detail,
      )
    }
    throw new ApiError(response.status, typeof detail === 'string' ? detail : 'Falha na requisição')
  }

  return payload as T
}

/** Monta a query string ignorando filtros vazios. */
function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: 'DELETE' }),
  query,
}
