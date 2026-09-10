#!/usr/bin/env bash
#
# Cria as 14 issues do backlog de melhorias e as adiciona a um GitHub Project.
#
# Precisa do gh autenticado:
#   brew install gh && gh auth login
#
# Uso:
#   ./scripts/backlog-para-github.sh                 # cria issues + project
#   ./scripts/backlog-para-github.sh --dry-run       # só mostra o que faria
#
# É seguro rodar de novo: issue com o mesmo título não é recriada, e item já
# no project não é duplicado.

set -euo pipefail

REPO="${REPO:-paulobzrraa/QA-Hub}"
OWNER="${OWNER:-paulobzrraa}"
PROJECT_TITLE="${PROJECT_TITLE:-QA Hub — melhorias}"
DOC="docs/backlog-melhorias.md"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

command -v gh >/dev/null || { echo "gh não encontrado. Instale com: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "gh não autenticado. Rode: gh auth login"; exit 1; }
[[ -f "$DOC" ]] || { echo "Rode a partir da raiz do repositório ($DOC não encontrado)."; exit 1; }

run() { $DRY_RUN && echo "  [dry-run] $*" || "$@"; }

# ---------------------------------------------------------------- etiquetas
# Tamanho no vocabulário que o backlog já usava (P/M/G) e a marca de dívida,
# que separa "lacuna do que entregamos" de "evolução natural".
declare -a LABELS=(
  "tamanho: P|0E8A16|Pequeno"
  "tamanho: M|1D76DB|Médio"
  "tamanho: G|D93F0B|Grande"
  "dívida|B60205|Lacuna do que já foi entregue, não funcionalidade nova"
  "dívidas-no-ar|5319E7|Grupo: dívidas do que já está no ar"
  "ciclo-de-qualidade|5319E7|Grupo: fechar o ciclo de qualidade"
  "uso-em-time|5319E7|Grupo: uso diário em time"
)

echo "→ etiquetas"
for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  # --force atualiza cor/descrição se a etiqueta já existir.
  run gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" --force
done

# ------------------------------------------------------------------- issues
# id | grupo | tamanho | dívida | título
declare -a ITEMS=(
  "US-6.1|dívidas-no-ar|P|sim|Recuperar o acesso perdido"
  "US-6.2|dívidas-no-ar|P|sim|Frear tentativa em massa no login"
  "US-6.3|dívidas-no-ar|M|sim|Reimportação que não desfaz edição manual"
  "US-6.4|dívidas-no-ar|M|nao|Evidência no bug"
  "US-6.5|dívidas-no-ar|P|nao|Destravar o tema escuro"
  "US-6.6|dívidas-no-ar|M|nao|Massa de teste editável"
  "US-7.1|ciclo-de-qualidade|M|nao|Reteste como estado, não como aviso"
  "US-7.2|ciclo-de-qualidade|M|sim|Squad no bug"
  "US-7.3|ciclo-de-qualidade|M|sim|Reconstruir os vínculos bug ↔ cenário"
  "US-7.4|ciclo-de-qualidade|P|nao|Histórico também das relações"
  "US-8.1|uso-em-time|P|nao|O que é meu"
  "US-8.2|uso-em-time|M|nao|Tendência por squad e plataforma"
  "US-8.3|uso-em-time|M|nao|Paginação e busca global"
  "US-8.4|uso-em-time|P|sim|Convite por link, não senha provisória"
)

# Extrai do markdown o bloco de um item: da linha "### US-x.y" até a próxima
# "###" ou "---". É a mesma fonte que o documento — o corpo da issue não pode
# divergir do backlog versionado.
corpo() {
  awk -v id="$1" '
    $0 ~ "^### " id " " { found=1; next }
    found && (/^### / || /^---$/) { exit }
    found { print }
  ' "$DOC"
}

echo "→ issues"
declare -a URLS=()
for entry in "${ITEMS[@]}"; do
  IFS='|' read -r id grupo tamanho divida titulo <<< "$entry"
  full="$id — $titulo"

  existing=$(gh issue list --repo "$REPO" --state all --search "\"$id\" in:title" \
             --json number,title,url --jq ".[] | select(.title | startswith(\"$id\")) | .url" | head -1)
  if [[ -n "$existing" ]]; then
    echo "  = $id já existe: $existing"
    URLS+=("$existing")
    continue
  fi

  labels="$grupo,tamanho: $tamanho"
  [[ "$divida" == "sim" ]] && labels="$labels,dívida"

  if $DRY_RUN; then
    echo "  [dry-run] criaria: $full  [$labels]"
    continue
  fi

  url=$(corpo "$id" | gh issue create --repo "$REPO" --title "$full" --label "$labels" --body-file -)
  echo "  + $url"
  URLS+=("$url")
done

# ------------------------------------------------------------------ project
echo "→ project"
number=$(gh project list --owner "$OWNER" --format json \
         --jq ".projects[] | select(.title == \"$PROJECT_TITLE\") | .number" 2>/dev/null | head -1)

if [[ -z "$number" ]]; then
  if $DRY_RUN; then
    echo "  [dry-run] criaria o project \"$PROJECT_TITLE\""
  else
    number=$(gh project create --owner "$OWNER" --title "$PROJECT_TITLE" --format json --jq '.number')
    echo "  + project #$number criado"
  fi
else
  echo "  = project #$number já existe"
fi

if [[ -n "${number:-}" ]] && ! $DRY_RUN; then
  for url in "${URLS[@]}"; do
    gh project item-add "$number" --owner "$OWNER" --url "$url" >/dev/null && echo "  → $url"
  done
  echo
  echo "Pronto: https://github.com/users/$OWNER/projects/$number"
fi
