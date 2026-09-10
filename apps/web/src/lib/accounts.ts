import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Account, LoginAttemptsResult, PasswordReset } from './types'

/** Administração de contas de acesso (US-5.1). Só administradores chegam aqui. */
export function useAccounts() {
  return useQuery({ queryKey: ['accounts'], queryFn: () => api.get<Account[]>('/api/accounts') })
}

function useAccountsRefresh() {
  const client = useQueryClient()
  return () => {
    client.invalidateQueries({ queryKey: ['accounts'] })
    client.invalidateQueries({ queryKey: ['auth-me'] })
  }
}

export function useCreateAccount() {
  const refresh = useAccountsRefresh()
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role: string; personId?: string | null }) =>
      api.post<Account>('/api/accounts', data),
    onSuccess: refresh,
  })
}

export function useUpdateAccount() {
  const refresh = useAccountsRefresh()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Account> }) =>
      api.patch<Account>(`/api/accounts/${id}`, data),
    onSuccess: refresh,
  })
}

export function useDeleteAccount() {
  const refresh = useAccountsRefresh()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/accounts/${id}`),
    onSuccess: refresh,
  })
}

/**
 * Redefine a senha de uma conta (US-6.1).
 *
 * A provisória vem na resposta e só nela — não é guardada em texto em lugar
 * nenhum. Quem chama tem que mostrá-la na hora; recarregar a tela a perde.
 */
export function useResetPassword() {
  const refresh = useAccountsRefresh()
  return useMutation({
    mutationFn: (id: string) => api.post<PasswordReset>(`/api/accounts/${id}/reset-password`, {}),
    onSuccess: refresh,
  })
}

/** Tentativas de entrada recentes (US-6.2). Só administradores chegam aqui. */
export function useLoginAttempts(onlyFailed: boolean) {
  return useQuery({
    queryKey: ['login-attempts', onlyFailed],
    queryFn: () => api.get<LoginAttemptsResult>(`/api/accounts/login-attempts${api.query({ onlyFailed: onlyFailed ? 'true' : undefined })}`),
    // A tela fica aberta observando um ataque em andamento — precisa de dado
    // fresco sem que alguém precise ficar recarregando a página.
    refetchInterval: 15_000,
  })
}
