import { createContext, useContext, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { hasAccess, type AccessRole } from '@qahub/shared'
import { api, ApiError } from './api'
import type { Account, AuthStatus } from './types'

/**
 * Sessão do QA Hub (US-5.1).
 *
 * O `can()` daqui serve para a TELA não oferecer o que a pessoa não pode
 * fazer. Quem de fato barra é o gate do servidor: esconder botão é conforto,
 * não segurança.
 */
interface AuthValue {
  account: Account | null
  status: AuthStatus | undefined
  loading: boolean
  can: (required: AccessRole) => boolean
}

const AuthContext = createContext<AuthValue>({
  account: null,
  status: undefined,
  loading: true,
  can: () => false,
})

export function useAuth() {
  return useContext(AuthContext)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const status = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => api.get<AuthStatus>('/api/auth/status'),
    staleTime: 30_000,
  })

  const me = useQuery({
    queryKey: ['auth-me'],
    queryFn: async () => {
      try {
        return await api.get<Account>('/api/auth/me')
      } catch (error) {
        // 401 é a resposta normal de quem não entrou ainda — não é falha.
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    retry: false,
  })

  const account = me.data ?? null

  return (
    <AuthContext.Provider
      value={{
        account,
        status: status.data,
        loading: me.isLoading || status.isLoading,
        can: (required) => (account ? hasAccess(account.role, required) : false),
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

/** Depois de entrar ou sair, todo dado em cache tem que ser reavaliado. */
function useAuthRefresh() {
  const client = useQueryClient()
  return () => client.invalidateQueries()
}

export function useLogin() {
  const refresh = useAuthRefresh()
  return useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      api.post<Account>('/api/auth/login', data),
    onSuccess: refresh,
  })
}

export function useSetup() {
  const refresh = useAuthRefresh()
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string }) =>
      api.post<Account>('/api/auth/setup', data),
    onSuccess: refresh,
  })
}

export function useLogout() {
  const refresh = useAuthRefresh()
  return useMutation({
    mutationFn: () => api.post<void>('/api/auth/logout', {}),
    onSuccess: refresh,
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { currentPassword: string; newPassword: string }) =>
      api.post<void>('/api/auth/password', data),
  })
}
