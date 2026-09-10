import type { FastifyInstance } from 'fastify'
import {
  CASE_STATUS, SUITE_STATUS, ENVIRONMENT, PLATFORM, SQUAD, PERSON_ROLE,
  BUG_SEVERITY, BUG_STATUS, USER_KIND, USER_ENV, USER_STATUS,
} from '@qahub/shared'

/**
 * Fonte única das opções de dropdown do front.
 * A UI nunca declara listas próprias — ela consome estas, que são as mesmas
 * usadas na validação do backend.
 */
export function metaRoutes(app: FastifyInstance) {
  app.get('/api/meta', async () => ({
    caseStatus: CASE_STATUS,
    suiteStatus: SUITE_STATUS,
    environment: ENVIRONMENT,
    platform: PLATFORM,
    squad: SQUAD,
    personRole: PERSON_ROLE,
    bugSeverity: BUG_SEVERITY,
    bugStatus: BUG_STATUS,
    userKind: USER_KIND,
    userEnv: USER_ENV,
    userStatus: USER_STATUS,
  }))
}
