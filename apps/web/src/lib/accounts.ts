import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Account } from './types'

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
