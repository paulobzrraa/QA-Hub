import { fold, type UserEnv } from '@qahub/shared'

/**
 * Mapa de colunas das abas "Users QA" e "Users PRD" (US-4.1).
 *
 * Separado de `columns.ts` e de `bug-columns.ts` pelo mesmo motivo dos bugs:
 * "Status" e "Ambiente" existem nos três contextos significando coisas
 * diferentes — aqui `Status` é a situação da conta (`Ativo`/`Suspenso`/
 * `Excluída`), não o estado de execução de um cenário.
 */
export type UserFieldKey =
  | 'email' | 'cpf' | 'password' | 'kind' | 'environment' | 'status' | 'profile' | 'balance'

const USER_HEADER_MAP: Record<string, UserFieldKey> = {}

function alias(field: UserFieldKey, ...titles: string[]) {
  for (const title of titles) USER_HEADER_MAP[fold(title)] = field
}

alias('email', 'Email', 'E-mail')
alias('cpf', 'CPF', 'CPF/CNPJ', 'Documento')
alias('password', 'Senha', 'Password')
alias('kind', 'Tipo', 'Type')
alias('environment', 'Ambiente', 'Environment')
alias('status', 'Status', 'Situação', 'Situacao')
alias('profile', 'Perfil', 'Profile')
alias('balance', 'Saldo', 'Balance')

export function resolveUserHeader(title: string): UserFieldKey | null {
  return USER_HEADER_MAP[fold(title)] ?? null
}

/**
 * Layout de cada aba de massa de teste.
 *
 * Ao contrário das abas de cenário, aqui o cabeçalho por título não fecha
 * sozinho — e as falhas são diferentes em cada aba, então cada uma declara as
 * suas colunas posicionais:
 *
 * - "Users QA" não tem título na 7ª coluna, que guarda o perfil da conta
 *   (`Não Sócio`).
 * - "Users PRD" tem o título da 1ª coluna truncado para `i` (era `Email`) e
 *   também não tem título na coluna de perfil, que nela é a 8ª — porque a
 *   aba ganhou uma coluna `Saldo` a mais no meio.
 *
 * `positional` é aplicado depois da resolução por título e só em coluna que o
 * título não resolveu, de modo que corrigir o cabeçalho na planilha no futuro
 * passa a valer automaticamente, sem quebrar nada.
 */
export interface UserSheetLayout {
  name: string
  environment: UserEnv
  positional: Record<number, UserFieldKey>
}

export const USER_SHEETS: UserSheetLayout[] = [
  { name: 'Users QA', environment: 'QA', positional: { 7: 'profile' } },
  { name: 'Users PRD', environment: 'PRD', positional: { 1: 'email', 8: 'profile' } },
]
