import { fold } from '@qahub/shared'

/**
 * As 93 abas de cenário da planilha usam 30 layouts de coluna diferentes:
 * a ordem muda, os títulos aparecem em pt-BR e en-US, e algumas abas têm
 * colunas extras criadas para uma necessidade pontual (`Chrome`, `Time (Min)`).
 *
 * Por isso o importador mapeia coluna por TÍTULO, nunca por posição.
 */
export type FieldKey =
  | 'code' | 'jiraKey' | 'scenario' | 'objective' | 'bdd' | 'automated'
  | 'environment' | 'testData' | 'responsible' | 'qaStatus' | 'stageStatus'
  | 'evidence' | 'notes'

const HEADER_MAP: Record<string, FieldKey> = {}

function alias(field: FieldKey, ...titles: string[]) {
  for (const title of titles) HEADER_MAP[fold(title)] = field
}

alias('code', 'ID', 'Nº', 'N°')
alias('jiraKey', 'Jira', 'Jira(US)', 'Jira (US)', 'US')
alias('scenario', 'Scenario', 'Cenário', 'Cenario')
alias('objective', 'Objective', 'Objetivo')
alias('bdd', 'Test Description (BDD)', 'BDD', 'Descrição do Teste (BDD)', 'Test Description')
alias('automated', 'Automation', 'Automação', 'Automacao')
alias('environment', 'Environment', 'Ambiente')
alias('testData', 'Test Data', 'Massa de Teste')
alias('responsible', 'Responsible', 'Responsável', 'Responsavel')
alias('qaStatus', 'QA', 'QA(1)', 'Status')
alias('stageStatus', 'Stage', 'STAGE', 'PRD')
// De propósito, sem alias para "Bugs" (US-2.5): a coluna de texto livre foi
// substituída pelo vínculo N:N de verdade. Sem mapeamento, ela cai no fallback
// de "extra" e o texto ainda vira nota — nenhum dado da planilha se perde.
alias('evidence', 'Evidence', 'Evidencia', 'Evidência')
alias('notes', 'Notes', 'Notas', 'Observações', 'Observacoes')

/** Título conhecido -> campo do modelo. `null` quando a coluna é extra. */
export function resolveHeader(title: string): FieldKey | null {
  return HEADER_MAP[fold(title)] ?? null
}

/**
 * Chave de comparação entre nome de aba e nome na aba "2. Progress".
 * O Excel limita abas a 31 caracteres e proíbe `[]:*?/\`, então
 * "[Home] Flash Sale 28/08" virou a aba "Home Flash Sale 2808".
 */
export function sheetKey(value: string): string {
  return fold(value).replace(/[^a-z0-9]/g, '')
}

/** Limite de caracteres que o Excel impõe ao nome de uma aba. */
const SHEET_NAME_LIMIT = 31

/** Comprimento mínimo para aceitar casamento parcial sem gerar falso positivo. */
const MIN_PARTIAL_LENGTH = 10

/** Remove o prefixo de plataforma que o time adicionou ao nomear as abas. */
function stripPlatform(key: string): string {
  return key.replace(/^(web|app)/, '')
}

/** Variantes de chave de uma aba: com e sem o prefixo de plataforma. */
function keyVariants(sheetName: string): string[] {
  const key = sheetKey(sheetName)
  const bare = stripPlatform(key)
  return bare && bare !== key ? [key, bare] : [key]
}

/** Distância de Levenshtein, para tolerar erros de digitação na planilha. */
function distance(a: string, b: string): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > 2) return 99

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    previous = current
  }
  return previous[b.length]
}

/**
 * Casa nomes de aba com as linhas da aba "2. Progress".
 *
 * O time não usou um padrão único ao nomear as abas: umas repetem o nome da
 * Progress, outras ganharam prefixo (`[Web]Extract-Sócio` para
 * "Extract - Sócio Swift"), outras foram truncadas no limite de 31 caracteres
 * do Excel, e há ao menos um erro de digitação ("Regresion Test - Web").
 *
 * Por isso a resolução acontece em três passes, do mais seguro ao mais tolerante,
 * consumindo as linhas já usadas para que duas abas nunca disputem a mesma.
 * Sem os passes, a aba "Smoke Test" (Web) roubaria a linha "Smoke Test App".
 */
export function matchSheetsToProgress(
  sheetNames: readonly string[],
  progressNames: readonly string[],
): Map<string, number> {
  const result = new Map<string, number>()
  const consumed = new Set<number>()
  const progressKeys = progressNames.map(sheetKey)

  const claim = (sheetName: string, index: number) => {
    result.set(sheetName, index)
    consumed.add(index)
  }

  const pending = (name: string) => !result.has(name)
  const free = (index: number) => !consumed.has(index)

  // Passe 1 — igualdade exata (com ou sem o prefixo de plataforma).
  for (const sheetName of sheetNames) {
    const variants = keyVariants(sheetName)
    const index = progressKeys.findIndex((key, i) => free(i) && variants.includes(key))
    if (index >= 0) claim(sheetName, index)
  }

  // Passe 2 — uma chave contém a outra (nome truncado ou abreviado).
  for (const sheetName of sheetNames.filter(pending)) {
    const truncated = sheetName.length >= SHEET_NAME_LIMIT
    const index = progressKeys.findIndex((key, i) => {
      if (!free(i)) return false
      return keyVariants(sheetName).some((variant) => {
        const shorter = Math.min(variant.length, key.length)
        if (shorter < MIN_PARTIAL_LENGTH) return false
        if (truncated && key.startsWith(variant)) return true
        return key.includes(variant) || variant.includes(key)
      })
    })
    if (index >= 0) claim(sheetName, index)
  }

  // Passe 3 — tolerância a erro de digitação (até 2 caracteres).
  for (const sheetName of sheetNames.filter(pending)) {
    const variants = keyVariants(sheetName).filter((v) => v.length >= MIN_PARTIAL_LENGTH)
    const index = progressKeys.findIndex(
      (key, i) => free(i) && key.length >= MIN_PARTIAL_LENGTH && variants.some((v) => distance(v, key) <= 2),
    )
    if (index >= 0) claim(sheetName, index)
  }

  return result
}
