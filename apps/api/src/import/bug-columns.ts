import { fold } from '@qahub/shared'

/**
 * Mapa de colunas próprio das abas de bug — deliberadamente separado do
 * `HEADER_MAP` de `columns.ts`. Os títulos se repetem ("Status", "US",
 * "Responsible") mas significam campos diferentes em cada contexto: em
 * cenário, "US" é alias de `jiraKey`; em bug, "US" é a US relacionada
 * (`relatedUs`), um campo à parte da chave do Jira do próprio bug.
 */
export type BugFieldKey =
  | 'jiraKey' | 'relatedUs' | 'description' | 'severity' | 'status'
  | 'responsible' | 'reportedDate' | 'fixedDate' | 'affectedArea' | 'notes'

const BUG_HEADER_MAP: Record<string, BugFieldKey> = {}

function alias(field: BugFieldKey, ...titles: string[]) {
  for (const title of titles) BUG_HEADER_MAP[fold(title)] = field
}

alias('jiraKey', 'Jira')
alias('relatedUs', 'US')
alias('description', 'Bug Description', 'Description', 'Descrição', 'Descricao')
alias('severity', 'Severity', 'Severidade')
alias('status', 'Status')
alias('responsible', 'Responsible', 'Responsável', 'Responsavel')
alias('reportedDate', 'Creation Date', 'Data de Criação', 'Data de Criacao')
alias('fixedDate', 'Fix date', 'Fix Date', 'Data de Correção', 'Data de Correcao')
alias('affectedArea', 'Affected Area', 'Área Afetada', 'Area Afetada')
alias('notes', 'Notes', 'Notas', 'Observações', 'Observacoes')

/**
 * Título conhecido -> campo do modelo. `null` quando a coluna é extra.
 *
 * De propósito, não há alias para o número do bug nem para "Lead Time":
 * o número é gerado pelo próprio importador (sequencial por plataforma, na
 * ordem das linhas) e o lead time é recalculado por nós — a planilha tem a
 * fórmula quebrada (`#NUM!`) em toda linha ainda aberta.
 */
export function resolveBugHeader(title: string): BugFieldKey | null {
  return BUG_HEADER_MAP[fold(title)] ?? null
}
