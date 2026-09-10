import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from './api'
import type {
  AffectedArea, AutomationCoverageRow, Bug, MetricSnapshot, Meta, Overview, Person, RetestSuggestion,
  SuiteDetail, TestCase, TestSuite, TestUser, CredentialAccess, Evidence, MergeResult,
  HistoryResult,
} from './types'

export interface SuiteFilters {
  platform?: string
  squad?: string
  status?: string
  responsibleId?: string
  q?: string
  /** Permite montar a query string sem enumerar cada campo. */
  [key: string]: string | undefined
}

export interface CoverageFilters {
  squad?: string
  platform?: string
  [key: string]: string | undefined
}

export interface BugFilters {
  platform?: string
  severity?: string
  status?: string
  affectedAreaId?: string
  responsibleId?: string
  q?: string
  sort?: 'reportedDate' | 'severity' | 'leadTime'
  order?: 'asc' | 'desc'
  [key: string]: string | undefined
}

export interface TestUserFilters {
  environment?: string
  status?: string
  kind?: string
  profile?: string
  q?: string
  [key: string]: string | undefined
}

export function useMeta() {
  return useQuery({
    queryKey: ['meta'],
    queryFn: () => api.get<Meta>('/api/meta'),
    staleTime: Infinity,
  })
}

export interface PeopleFilters {
  role?: string
  /** `'true'` devolve só quem está ativo — use nos seletores de atribuição. */
  active?: string
  [key: string]: string | undefined
}

/**
 * Pessoas do time (US-4.5).
 *
 * Seletor que ATRIBUI trabalho pede `{ active: 'true' }`: não faz sentido
 * escalar quem saiu do time. Seletor que FILTRA listagem consulta todo mundo,
 * porque o histórico de quem saiu continua existindo e precisa ser
 * consultável — a pessoa some de onde se escolhe, não de onde se procura.
 */
export function usePeople(filters: PeopleFilters = {}) {
  return useQuery({
    queryKey: ['people', filters],
    queryFn: () => api.get<Person[]>(`/api/people${api.query(filters)}`),
  })
}

function usePeopleRefresh() {
  const client = useQueryClient()
  return () => {
    client.invalidateQueries({ queryKey: ['people'] })
    // Nome e responsável aparecem em ciclos, cenários, bugs e no panorama.
    client.invalidateQueries({ queryKey: ['suites'] })
    client.invalidateQueries({ queryKey: ['suite'] })
    client.invalidateQueries({ queryKey: ['bugs'] })
    client.invalidateQueries({ queryKey: ['overview'] })
  }
}

export function useCreatePerson() {
  const refresh = usePeopleRefresh()
  return useMutation({
    mutationFn: (data: Partial<Person>) => api.post<Person>('/api/people', data),
    onSuccess: refresh,
  })
}

export function useUpdatePerson() {
  const refresh = usePeopleRefresh()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Person> }) =>
      api.patch<Person>(`/api/people/${id}`, data),
    onSuccess: refresh,
  })
}

export function useDeletePerson() {
  const refresh = usePeopleRefresh()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/people/${id}`),
    onSuccess: refresh,
  })
}

/** Mescla `id` em `intoId`: quem some é `id`, quem permanece é `intoId`. */
export function useMergePeople() {
  const refresh = usePeopleRefresh()
  return useMutation({
    mutationFn: ({ id, intoId }: { id: string; intoId: string }) =>
      api.post<MergeResult>(`/api/people/${id}/merge`, { intoId }),
    onSuccess: refresh,
  })
}

export function useSuites(filters: SuiteFilters) {
  return useQuery({
    queryKey: ['suites', filters],
    queryFn: () => api.get<TestSuite[]>(`/api/suites${api.query(filters)}`),
  })
}

export function useSuite(id: string | undefined) {
  return useQuery({
    queryKey: ['suite', id],
    queryFn: () => api.get<SuiteDetail>(`/api/suites/${id}`),
    enabled: Boolean(id),
  })
}

export function useOverview() {
  return useQuery({ queryKey: ['overview'], queryFn: () => api.get<Overview>('/api/overview') })
}

/** Histórico inteiro — o recorte de período (30/90/tudo) é feito no front. */
export function useMetricHistory() {
  return useQuery({
    queryKey: ['metric-history'],
    queryFn: () => api.get<MetricSnapshot[]>('/api/metrics/history'),
  })
}

/** Ranking de cobertura de automação (US-3.3) — já vem ordenado do backend. */
export function useAutomationCoverage(filters: CoverageFilters) {
  return useQuery({
    queryKey: ['automation-coverage', filters],
    queryFn: () => api.get<AutomationCoverageRow[]>(`/api/metrics/automation-coverage${api.query(filters)}`),
  })
}

export function useAffectedAreas() {
  return useQuery({
    queryKey: ['affected-areas'],
    queryFn: () => api.get<AffectedArea[]>('/api/affected-areas'),
  })
}

export function useBugs(filters: BugFilters) {
  return useQuery({
    queryKey: ['bugs', filters],
    queryFn: () => api.get<Bug[]>(`/api/bugs${api.query(filters)}`),
  })
}

/**
 * Invalida o ciclo aberto, a listagem e o panorama — as métricas de todas as
 * três mudam quando um único cenário muda de status.
 */
function useRefresh(suiteId?: string) {
  const client = useQueryClient()
  return () => {
    if (suiteId) client.invalidateQueries({ queryKey: ['suite', suiteId] })
    client.invalidateQueries({ queryKey: ['suites'] })
    client.invalidateQueries({ queryKey: ['overview'] })
  }
}

export function useUpdateCase(suiteId?: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TestCase> }) =>
      api.patch<TestCase>(`/api/cases/${id}`, data),
    onSuccess: refresh,
  })
}

export function useCreateCase(suiteId: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (data: Partial<TestCase>) =>
      api.post<TestCase>(`/api/suites/${suiteId}/cases`, data),
    onSuccess: refresh,
  })
}

export function useDeleteCase(suiteId: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/cases/${id}`),
    onSuccess: refresh,
  })
}

export function useUpdateSuite(suiteId?: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<TestSuite> }) =>
      api.patch<TestSuite>(`/api/suites/${id}`, data),
    onSuccess: refresh,
  })
}

export function useCreateSuite() {
  const refresh = useRefresh()
  return useMutation({
    mutationFn: (data: Partial<TestSuite>) => api.post<TestSuite>('/api/suites', data),
    onSuccess: refresh,
  })
}

export function useUpdateBug() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Bug> }) =>
      api.patch<Bug & { retestSuggested: RetestSuggestion[] }>(`/api/bugs/${id}`, data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['bugs'] })
      client.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

export function useCreateBug() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Bug>) => api.post<Bug>('/api/bugs', data),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['bugs'] })
      client.invalidateQueries({ queryKey: ['overview'] })
    },
  })
}

/** Vincula/desvincula um bug existente ao cenário que o encontrou (US-2.5). */
export function useLinkBug(suiteId: string, caseId: string) {
  const client = useQueryClient()
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (bugId: string) => api.post<TestCase>(`/api/cases/${caseId}/bugs`, { bugId }),
    onSuccess: () => {
      refresh()
      client.invalidateQueries({ queryKey: ['bugs'] })
    },
  })
}

export function useUnlinkBug(suiteId: string, caseId: string) {
  const client = useQueryClient()
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (bugId: string) => api.delete(`/api/cases/${caseId}/bugs/${bugId}`),
    onSuccess: () => {
      refresh()
      client.invalidateQueries({ queryKey: ['bugs'] })
    },
  })
}

/** Massa de usuários de teste (US-4.1). A senha nunca vem nesta listagem. */
export function useTestUsers(filters: TestUserFilters) {
  return useQuery({
    queryKey: ['test-users', filters],
    queryFn: () => api.get<TestUser[]>(`/api/test-users${api.query(filters)}`),
  })
}

/** Perfis existentes — sai do banco, porque a coluna de origem é texto livre. */
export function useTestUserProfiles() {
  return useQuery({
    queryKey: ['test-user-profiles'],
    queryFn: () => api.get<string[]>('/api/test-users/profiles'),
    staleTime: Infinity,
  })
}

/**
 * Busca a senha de uma conta, uma por vez e só quando alguém pede.
 *
 * Não é `useQuery` de propósito: revelar senha é uma ação, não um dado que a
 * tela carrega junto com o resto e deixa em cache esperando ser usado — e
 * cada chamada gera uma linha no registro de acesso (US-4.2), então repetir a
 * requisição por conta de cache seria registrar um acesso que não houve.
 */
export function useRevealPassword() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'reveal' | 'copy' }) =>
      api.get<{ password: string }>(`/api/test-users/${id}/password?action=${action}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ['credential-accesses'] }),
  })
}

/** Registro de acessos às senhas (US-4.2) — nunca traz a senha em si. */
export function useCredentialAccesses() {
  return useQuery({
    queryKey: ['credential-accesses'],
    queryFn: () => api.get<CredentialAccess[]>('/api/test-users/credential-accesses'),
  })
}

/**
 * Evidências (US-4.3). Upload vai por `FormData`, não por JSON: o `api`
 * padrão força `Content-Type: application/json`, que quebraria o multipart.
 */
export function useUploadEvidence(suiteId: string, caseId: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      const response = await fetch(`/api/cases/${caseId}/evidence/upload`, { method: 'POST', body })
      const payload = await response.json().catch(() => null)
      if (!response.ok) {
        const detail = payload?.error
        throw new ApiError(
          response.status,
          typeof detail === 'string' ? detail : 'Falha ao enviar a evidência',
        )
      }
      return payload as Evidence
    },
    onSuccess: refresh,
  })
}

export function useAddEvidenceLink(suiteId: string, caseId: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (url: string) => api.post<Evidence>(`/api/cases/${caseId}/evidence/link`, { url }),
    onSuccess: refresh,
  })
}

export function useDeleteEvidence(suiteId: string) {
  const refresh = useRefresh(suiteId)
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/evidence/${id}`),
    onSuccess: refresh,
  })
}

/**
 * Linha do tempo de um cenário, bug ou ciclo (US-5.2).
 *
 * `enabled` evita buscar histórico de painel que nem foi aberto — a lista de
 * cenários renderiza centenas de linhas, e nenhuma delas precisa disso.
 */
export function useHistory(entity: 'case' | 'bug' | 'suite', id: string | undefined) {
  return useQuery({
    queryKey: ['history', entity, id],
    queryFn: () => api.get<HistoryResult>(`/api/history/${entity}/${id}`),
    enabled: Boolean(id),
  })
}
