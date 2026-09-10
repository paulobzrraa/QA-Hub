/**
 * Massa de usuários de teste (US-4.1).
 *
 * O CPF chega da planilha em três formas — com máscara (`123.456.789-09`),
 * só dígitos (`12345678909`) e, quando a célula estava formatada como número,
 * com os zeros à esquerda comidos pelo Excel (`1234567890`, `123456789`).
 * Guardamos sempre só os dígitos e formatamos na exibição, para que a busca
 * funcione digitando com ou sem máscara.
 */

const CPF_LENGTH = 11

/** Remove máscara e espaços. `null` quando não sobra dígito nenhum. */
export function digitsOnly(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  const digits = String(raw).replace(/\D/g, '')
  return digits || null
}

/**
 * Valida CPF pelos dois dígitos verificadores. Usado para decidir se um CPF
 * curto perdeu zeros à esquerda — e não para rejeitar dado da planilha.
 */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  // Sequências repetidas (`111...`) passam no cálculo mas não são CPFs.
  if (/^(\d)\1{10}$/.test(digits)) return false
  for (const length of [9, 10]) {
    let sum = 0
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (length + 1 - index)
    }
    const rest = (sum * 10) % 11
    if ((rest === 10 ? 0 : rest) !== Number(digits[length])) return false
  }
  return true
}

/**
 * Normaliza o CPF para 11 dígitos.
 *
 * O zero à esquerda só é restaurado quando o resultado fecha os dígitos
 * verificadores — aí a perda é comprovada, não suposta. Um CPF curto que não
 * fecha a conta é devolvido como veio: pode ser erro de digitação na planilha,
 * e inventar um zero transformaria um dado suspeito em dado aparentemente bom.
 */
export function normalizeCpf(raw: unknown): string | null {
  const digits = digitsOnly(raw)
  if (!digits) return null
  if (digits.length >= CPF_LENGTH) return digits
  const padded = digits.padStart(CPF_LENGTH, '0')
  return isValidCpf(padded) ? padded : digits
}

/** `01234567890` -> `012.345.678-90`. Comprimento inesperado sai como está. */
export function formatCpf(digits: string | null): string {
  if (!digits) return ''
  if (digits.length !== CPF_LENGTH) return digits
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}
