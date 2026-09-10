import '@fastify/cookie'
import type { Viewer } from '../lib/auth.js'

/**
 * `request.viewer` é preenchido pelo hook global de autenticação (US-5.1) e
 * lido pelos gates de papel. O `import '@fastify/cookie'` acima traz junto a
 * augmentação de `request.cookies` / `reply.setCookie` do plugin.
 */
declare module 'fastify' {
  interface FastifyRequest {
    viewer: Viewer | null
  }
}
