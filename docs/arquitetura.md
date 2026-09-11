# Arquitetura do QA Hub

Documento descritivo: registra a arquitetura **como ela é hoje**, lida do
código em 11/09/2026 (commit `95dd2cf`). Não propõe mudanças. O que falta
construir está em [`backlog.md`](backlog.md) e
[`backlog-melhorias.md`](backlog-melhorias.md); o estado de entrega, em
[`estado-atual.md`](estado-atual.md); as regras de trabalho, em
[`../CLAUDE.md`](../CLAUDE.md).

---

## 1. Visão geral

Aplicação cliente-servidor clássica em um monorepo npm workspaces, com três
pacotes e um banco em arquivo:

```
┌──────────────────────────────────────────────────────────────┐
│ apps/web — SPA React 18 (Vite, porta 5173)                    │
│   páginas → hooks (TanStack Query) → lib/api.ts (fetch)       │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTP/JSON + cookie de sessão
                            │ (em dev, proxy /api do Vite)
┌───────────────────────────▼──────────────────────────────────┐
│ apps/api — Fastify 5 (porta 3333, rodando em tsx)             │
│   hook global do gate → rotas → Prisma                        │
│   lib/ (auth, gate, changelog, crypto, login-guard, http)     │
│   import/ (xlsx → banco)     export/ (banco → xlsx)           │
└───────────────────────────┬──────────────────────────────────┘
                            │ Prisma Client
┌───────────────────────────▼──────────────────────────────────┐
│ data/qahub.db (SQLite)  +  data/evidence/ (arquivos enviados) │
└──────────────────────────────────────────────────────────────┘

        packages/shared — importado pelos dois lados
        enums do domínio · schemas Zod · métricas · normalização
```

Três características definem o desenho:

1. **O domínio é compartilhado de verdade.** `packages/shared` não é um pacote
   de tipos: é o código que valida e calcula, executado tanto na API quanto no
   front. Os enums saíram dos `dataValidation` da planilha de origem.
2. **Não existe camada de serviço ou repositório.** As rotas do Fastify são a
   camada de aplicação e falam direto com o Prisma Client. O que é transversal
   (autenticação, autorização, histórico, cifragem, freio de login) mora em
   `apps/api/src/lib/`; o que é domínio puro mora em `packages/shared`.
3. **Não há processos em segundo plano.** Sem cron, sem fila, sem worker. As
   rotinas de manutenção são idempotentes e rodam no boot do servidor.

## 2. Frontend

`apps/web` — SPA React 18 servida pelo Vite. Sem SSR, sem roteamento de
arquivos, sem biblioteca de componentes, sem CSS-in-JS, sem Tailwind.

**Composição da raiz** (`src/main.tsx`):

```
StrictMode
└── QueryClientProvider   (refetchOnWindowFocus: false, retry: 1)
    └── BrowserRouter
        └── AuthProvider  (único Context da aplicação)
            └── App
```

**`App.tsx`** é o portão da interface, nesta ordem: enquanto a sessão não
resolve mostra `Loading`; sem conta, `LoginPage`; com `mustChangePassword`
pendente, `ForcePasswordChange`; caso contrário, o `Shell` — sidebar com
navegação, contadores vindos de `/api/overview`, submenu de bugs por plataforma,
`UserMenu` no rodapé e `<Routes>` no `<main>`.

**Estilo:** um único arquivo, `src/styles/global.css` (1.110 linhas), com tokens
CSS no vocabulário Untitled UI (`--accent`, `--text`, `--ok`, `--radius`,
`--shadow`…). A paleta escura existe completa, inclusive
`@media (prefers-color-scheme: dark)`, mas está travada por
`data-theme="light"` no `index.html`. Ícones: `lucide-react`. Fontes: Inter e
Poppins, via Google Fonts no `index.html`.

**Build:** `npm run build` compila apenas o front. A API não tem etapa de build.

## 3. Backend / API

`apps/api` — Fastify 5 em ESM, executado por `tsx` (sem transpilação prévia).

**Montagem** (`src/server.ts`), nesta ordem exata:

```
cors (origin: true, credentials: true)
cookie
registerGate(app)              ← hook onRequest global, ANTES das rotas
multipart (limite de 50 MB, 1 arquivo)
GET /api/health
15 módulos de rota: meta, people, suites, cases, overview, bugs,
   affected-areas, metrics, reports, test-users, evidence, export,
   auth, accounts, history
```

O gate entra antes das rotas de propósito: rota nova nasce protegida e precisa
ser liberada conscientemente.

**Padrão de um módulo de rota:** cada arquivo em `routes/` exporta uma função
`xRoutes(app: FastifyInstance)` que registra seus endpoints. Dentro de cada
handler, sempre:

```ts
app.patch('/api/cases/:id', async (request, reply) => {
  try {
    const data = parse(caseUpdate, request.body)      // Zod de @qahub/shared
    const before = await prisma.testCase.findUnique(…) // antes do update
    const updated = await prisma.testCase.update(…)
    await recordChanges({ entity: 'case', …, actorId: request.viewer?.id ?? null })
    return updated
  } catch (error) {
    return sendError(reply, error)                     // 422/409/404/500
  }
})
```

**Rotinas de boot** (idempotentes, substituem o cron que não existe):
`ensureTodaySnapshot()` grava/atualiza o snapshot de métricas do dia;
`ensureEncryptedCredentials()` cifra senhas de massa em texto puro e roda
`VACUUM` se converteu algo; `pruneSessions()`, `pruneHistory()` e
`pruneLoginAttempts()` limpam o que passou da retenção. `SIGINT`/`SIGTERM`
fecham o app e desconectam o Prisma.

## 4. Banco de dados

SQLite em `data/qahub.db`, acessado por Prisma 5.22. Uma única instância de
`PrismaClient` exportada por `src/lib/db.ts`.

- **Schema aplicado com `prisma db push`** — não há migrations versionadas.
- **Sem enums no Prisma** (limitação do SQLite): campos de domínio são `String`
  e a validação acontece na borda da API, via Zod.
- **Integridade declarada no schema:** `@@unique([suiteId, code])`,
  `@@unique([platform, number])`, `@@unique([sourceSheet, sourceRow])`,
  `Bug.jiraKey` e `TestSuite.sourceSheet` únicos; `onDelete: Cascade` de ciclo
  para cenários, de cenário para evidências e de conta para sessões;
  `onDelete: SetNull` nos responsáveis, para que remover uma pessoa não apague
  trabalho.
- **Índices** nos pares mais consultados: `[platform, status]`, `[qaStatus]`,
  `[automated]`, `[severity]`, `[entity, entityId, createdAt]`,
  `[email, createdAt]`, `[ipAddress, createdAt]`.
- **Relação N:N** `Bug` ↔ `TestCase` é implícita (tabela `_BugToTestCase`
  gerenciada pelo Prisma), manipulada por `connect`/`disconnect`.
- **Arquivos** não vão para o banco: evidências enviadas ficam em
  `data/evidence/` com nome gerado (`randomUUID`), e o banco guarda o ponteiro.

As respostas da API são objetos do Prisma serializados diretamente pelo
Fastify — não há camada de DTO. `Date` vira string ISO no JSON, e o front
formata na exibição (`formatDate` em `components/ui.tsx`).

## 5. Autenticação

Implementada em `src/lib/auth.ts` (credenciais e sessão), `src/lib/gate.ts`
(autorização) e `src/lib/login-guard.ts` (freio de força bruta).

- **Senha:** `scrypt` nativo do Node, formato `scrypt:<salt base64>:<hash
  base64>`, comparação com `timingSafeEqual`.
- **Sessão:** token aleatório de 32 bytes em cookie httpOnly `qahub_session`
  (`sameSite: 'lax'`, `secure` só em produção, 30 dias). O banco guarda apenas
  o SHA-256 do token, na tabela `Session`. `resolveViewer()` valida expiração,
  recusa conta inativa e faz renovação deslizante gravando no máximo 1x/hora.
- **Autorização:** papéis `viewer` < `editor` < `admin`, comparados por
  `hasAccess()` de `@qahub/shared` — a mesma função usada pelo `can()` do front.
  O gate decide na ordem: rota pública → exige sessão → rota de qualquer
  logado → `mustChangePassword` bloqueia tudo → regras extras por método+regex
  → regra geral "escrita exige `editor`".
- **Freio de login:** conta falhas dos últimos 15 minutos por e-mail **e** por
  IP (vale o eixo pior), atrasa exponencialmente a partir de 3 falhas (teto de
  5 s) e bloqueia por 15 minutos a partir de 8, com mensagem idêntica para
  e-mail existente e inexistente. Tudo persistido em `LoginAttempt`, para
  sobreviver a restart.
- **Primeiro acesso:** `POST /api/auth/setup` só responde enquanto não existir
  nenhuma conta, e cria um `admin`.
- **No front:** `AuthProvider` (`lib/auth.tsx`) consulta `/api/auth/status` e
  `/api/auth/me`, trata 401 como "ainda não entrou" e expõe
  `{ account, status, loading, can }`. `can()` serve para não oferecer o que a
  pessoa não pode fazer — quem barra é o gate.

## 6. Comunicação entre frontend e backend

REST sobre JSON, mesmo host.

- **Em desenvolvimento** o Vite faz proxy de `/api` para `http://localhost:3333`
  (`vite.config.ts`), então o navegador enxerga uma origem só. É por isso que
  `lib/api.ts` usa `credentials: 'same-origin'`.
- **`lib/api.ts`** concentra todo `fetch`: trata `204` sem corpo, envia
  `Content-Type: application/json` **apenas quando há corpo** (sem isso o
  Fastify recusa DELETE com `FST_ERR_CTP_EMPTY_JSON_BODY`), e converte erro em
  `ApiError` com `status`, `message` e `fields`.
- **Erros de validação** voltam como `422` com `{ error: [{ field, message }] }`,
  produzidos por `parse()` em `lib/http.ts`; o front transforma isso em erro por
  campo no formulário. Outros códigos em uso: 401, 403, 404, 409, 413, 415, 429.
- **Upload** de evidência é a exceção ao `lib/api.ts`: vai por `FormData` em um
  `fetch` próprio, porque o `Content-Type` de JSON quebraria o multipart.
- **Download** não passa por JavaScript: exportação xlsx
  (`/api/export/xlsx`) e relatório final (`/api/reports/final?format=pdf|xlsx`)
  são `<a href>` diretos, com os filtros da tela na query string; o arquivo de
  evidência é servido por `GET /api/evidence/:id/file`, que devolve um
  `createReadStream` com `Content-Type` e `Content-Disposition: inline`.
- **Não há WebSocket, SSE ou polling**, com uma exceção: a tela de contas
  atualiza as tentativas de login a cada 15 s (`refetchInterval`), para observar
  um ataque em andamento.

## 7. Principais serviços

**Serviços transversais da API** (`apps/api/src/lib/`):

| Arquivo | Responsabilidade |
|---|---|
| `db.ts` | instância única do `PrismaClient` e `disconnect()` |
| `http.ts` | `HttpError`, `parse()` (Zod → 422 estruturado) e `sendError()` |
| `auth.ts` | hash e verificação de senha, sessão, cookie, `Viewer`, `requireViewer`/`requireRole`, senha provisória, domínios de e-mail permitidos |
| `gate.ts` | hook global de autenticação e autorização de rotas |
| `changelog.ts` | `recordChanges()` (uma linha por campo), `recordEvent()`, mapas de campos por entidade, retenção |
| `crypto.ts` | AES-256-GCM das senhas da massa de teste, chave em `.env`, prefixo `enc:v1:` |
| `login-guard.ts` | contagem de falhas, atraso, bloqueio, `clearFailures()`, poda |

**Subsistemas de arquivo:**

- `src/import/` — leitura do xlsx com exceljs. `xlsx.ts` mapeia coluna por
  título (`columns.ts`, `bug-columns.ts`, `user-columns.ts`) e `run.ts` é o
  executável de `npm run import`: importa pessoas, ciclos, cenários, bugs,
  áreas afetadas, massa de teste e evidências, de forma idempotente.
- `src/export/` — `buildWorkbook()` remonta a planilha original: aba de
  progresso, uma aba por ciclo, bugs e massa de teste, aplicando os
  `dataValidation` correspondentes e deixando a coluna `Senha` vazia.
- `routes/reports.ts` — `buildReportData()` monta o recorte e alimenta dois
  renderizadores independentes, `renderPdf()` (pdfkit) e `renderXlsx()`
  (exceljs).

**Domínio compartilhado** (`packages/shared/src/`): `domain.ts` (enums e
papéis), `schemas.ts` (Zod), `normalize.ts` (valores legados do Excel),
`metrics.ts` (`effectiveStatus`, `computeMetrics`, `percent`),
`bug-metrics.ts` (`computeBugLeadTime`), `test-users.ts` (CPF).

## 8. Principais componentes

**Primitivas** — `components/ui.tsx`, usadas em toda a aplicação:
`StatusPill`, `statusTone`, `StatusSelect` (pill com `<select>` invisível por
cima, para trocar status em um clique), `Tag`, `ProgressBar`, `Stat`,
`Accordion`, `CopyButton` (aceita função assíncrona, usada para copiar senha sem
nunca exibi-la), `Field`, `Select` (alimentado por `/api/meta`), `Empty`,
`Loading`, `ErrorBanner` e `formatDate`.

**Componentes de composição:**

| Componente | Papel |
|---|---|
| `CaseDrawer` | painel lateral do cenário: formulário completo, bugs vinculados, evidências, histórico; oferece "Reportar bug" quando o cenário é reprovado e ainda não tem bug |
| `BugDrawer` | painel do bug, com lead time, vínculos e histórico; emite `onRetest` ao resolver |
| `ReportBugDialog` | criação de bug a partir do cenário reprovado |
| `NewSuiteDialog` | criação de ciclo de teste |
| `EvidenceField` | upload, link externo, miniatura e remoção de evidência |
| `Timeline` | linha do tempo de `case`, `bug`, `suite` ou `account`, com a retenção informada |
| `LineChart` | gráfico de linha em SVG próprio, sem biblioteca |
| `UserMenu` | identidade, papel, troca de senha e saída |

**Páginas** (`src/pages/`): `OverviewPage`, `SuitesPage`, `SuiteDetailPage`,
`BugsPage`, `MetricsPage`, `TestUsersPage`, `PeoplePage`, `AccountsPage`,
`LoginPage`, `ForcePasswordChange`.

Estrutura repetida em todas: `<header className="topbar">` com título, subtítulo
e `.toolbar`, depois `<div className="content stack">` com filtros e conteúdo;
os estados de carregamento seguem `Loading` → `ErrorBanner` → `Empty` → dados.

## 9. Gerenciamento de estado

Três camadas, e só três:

1. **Estado de servidor — TanStack Query.** Todo dado remoto passa por hooks de
   `lib/queries.ts` (dados de domínio) e `lib/accounts.ts` (administração de
   contas). Nenhuma página chama `fetch` direto, salvo o upload de evidência.
   Configuração global: `refetchOnWindowFocus: false`, `retry: 1`.
   Chaves em uso: `meta`, `people`, `suites`, `suite`, `overview`,
   `metric-history`, `automation-coverage`, `affected-areas`, `bugs`,
   `test-users`, `test-user-profiles`, `credential-accesses`, `history`,
   `accounts`, `login-attempts`, `auth-status`, `auth-me`.
   `useMeta()` usa `staleTime: Infinity` (o domínio não muda em runtime);
   `useSuite` e `useHistory` usam `enabled` para não buscar o que não está
   aberto.
   **Invalidação é explícita e agrupada:** cada família de mutações tem sua
   função de refresh (`useRefresh(suiteId)`, `usePeopleRefresh`,
   `useAccountsRefresh`), porque mudar um cenário muda também as métricas do
   ciclo, da listagem e do panorama. Login e logout invalidam tudo.
2. **Estado local de tela — `useState`/`useMemo`.** Filtros, formulários,
   painéis abertos, confirmações de exclusão e avisos. Formulário é estado
   controlado convertido do objeto da API (`toForm`) e reconvertido no envio; os
   erros de campo vêm do `ApiError.fields` da própria mutação.
3. **Sessão — um único React Context** (`AuthContext`, em `lib/auth.tsx`).

**Não há** Redux, Zustand, MobX, Jotai nem qualquer store global; **não há**
`localStorage` nem `sessionStorage` em lugar nenhum do front — a sessão vive
exclusivamente no cookie httpOnly, e o resto é cache em memória do Query.

## 10. Estrutura de rotas

**Front** (`react-router-dom`, definidas em `App.tsx`):

| Rota | Página | Observação |
|---|---|---|
| `/` | → `/geral` | redireciona |
| `/geral` | `OverviewPage` | |
| `/suites` · `/suites/:id` | `SuitesPage` · `SuiteDetailPage` | rotuladas "Ciclos de testes" |
| `/bugs` → `/bugs/web` · `/bugs/:platform` | `BugsPage` | `web` e `app` |
| `/metricas` | `MetricsPage` | |
| `/massa-de-teste` | `TestUsersPage` | |
| `/pessoas` | `PeoplePage` | só montada para `admin` |
| `/contas` | `AccountsPage` | só montada para `admin` |
| `*` | → `/geral` | |

Não há rota de login: `App.tsx` troca a árvore inteira quando não há sessão.

**API** — 52 endpoints (51 nos módulos + `/api/health`):

| Módulo | Endpoints |
|---|---|
| `auth` | `GET status`, `POST setup`, `POST login`, `POST logout`, `GET me`, `POST password` |
| `accounts` | `GET /`, `POST /`, `PATCH /:id`, `DELETE /:id`, `POST /:id/reset-password`, `GET /login-attempts` |
| `meta` | `GET /api/meta` |
| `people` | `GET`, `POST`, `PATCH /:id`, `DELETE /:id`, `POST /:id/merge` |
| `suites` | `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` |
| `cases` | `GET /api/cases`, `POST /api/suites/:suiteId/cases`, `PATCH /:id`, `DELETE /:id`, `POST /:caseId/bugs`, `DELETE /:caseId/bugs/:bugId` |
| `bugs` | `GET`, `GET /:id`, `POST`, `PATCH /:id`, `DELETE /:id` |
| `affected-areas` | `GET`, `POST` |
| `overview` | `GET /api/overview` |
| `metrics` | `GET /history`, `GET /automation-coverage` |
| `reports` | `GET /api/reports/final` |
| `test-users` | `GET /`, `GET /profiles`, `GET /:id/password`, `GET /credential-accesses` |
| `evidence` | `POST /:caseId/evidence/upload`, `POST /:caseId/evidence/link`, `PATCH /:id`, `DELETE /:id`, `GET /:id/file` |
| `export` | `GET /api/export/xlsx` |
| `history` | `GET /api/history/:entity/:id` |

Convenção: recurso no plural, sub-recurso aninhado sob o pai
(`/api/cases/:caseId/bugs`), filtros por query string, `PATCH` parcial,
`DELETE` devolvendo 204.

## 11. Integrações externas

**Em runtime, nenhuma.** A aplicação não chama nenhum serviço de terceiros.

- **Jira:** `jiraKey` é campo de texto em ciclo, cenário e bug. Não há chamada
  de API nem link automático — a integração é a US-5.4, não iniciada.
- **Planilha xlsx:** única troca de dados com o mundo. Entrada por
  `npm run import` (exceljs, arquivo local); saída por `/api/export/xlsx` e pelo
  relatório final em PDF/xlsx.
- **Google Fonts:** Inter e Poppins carregadas por `<link>` no `index.html` —
  única dependência de rede do front.
- **GitHub via `gh` CLI:** apenas `scripts/backlog-para-github.sh`, que publica
  o backlog de melhorias como issues. Fora do runtime da aplicação.

Não há SMTP, storage em nuvem, SSO, telemetria, analytics ou webhook.

## 12. Fluxo de dados

**Leitura de tela**

```
página monta → hook do Query (chave + filtros) → lib/api.ts GET
  → proxy do Vite → gate resolve sessão e autoriza
  → rota consulta Prisma (select explícito) → métricas calculadas com
    @qahub/shared quando a resposta as inclui → JSON
  → Query guarda em cache → página renderiza (Loading/Error/Empty/dados)
```

**Edição com histórico**

```
formulário → mutação → PATCH → gate exige `editor`
  → parse(schema) → lê o registro ANTES → prisma.update
  → recordChanges(before, after, FIELDS, actorId) grava uma linha por campo
  → resposta → onSuccess invalida ['suite', id], ['suites'], ['overview']
```

**Importação da planilha**

```
npm run import [caminho] → exceljs lê as abas
  → mapeia colunas por título → normaliza valores legados (normalize.ts)
  1. pessoas (upsert por nome)
  2. ciclos (upsert por sourceSheet) → cenários (código repetido ganha sufixo)
     → evidências `imported` são apagadas e recriadas; as enviadas ficam
  3. bugs (chave do Jira) + áreas afetadas
  4. massa de teste (senha cifrada na entrada, chave sourceSheet+sourceRow)
  → relatório de contagens e avisos no terminal
```

**Exportação e relatório**

```
<a href="/api/export/xlsx?filtros">   → buildWorkbook() → abas + dataValidation
<a href="/api/reports/final?…&format"> → buildReportData() → renderPdf()
                                                          ou renderXlsx()
  → Content-Disposition: attachment → download direto pelo navegador
```

**Revelação de senha da massa de teste**

```
clique → GET /api/test-users/:id/password?action=reveal|copy
  → gate exige `editor` → grava CredentialAccess (quem, quando, IP, agente)
    ANTES de decifrar → decrypt() → { password } na resposta
  → o front mostra ou copia, e invalida ['credential-accesses']
```

**Snapshot de métricas**

```
boot do servidor e cada leitura de /api/metrics/history
  → ensureTodaySnapshot() → upsert em MetricSnapshot pela data (meia-noite UTC)
```

## 13. Principais entidades

13 modelos em `apps/api/prisma/schema.prisma`.

| Entidade | O que é | Relações principais |
|---|---|---|
| `TestSuite` | **Ciclo de teste** — equivale a uma aba de cenários da planilha | tem muitos `TestCase`; responsável é `Person` |
| `TestCase` | Cenário de teste — uma linha da aba | pertence a `TestSuite`; N:N com `Bug`; tem `Evidence` |
| `Bug` | Defeito, com severidade, status e datas de negócio | N:N com `TestCase`; `AffectedArea`; responsável é `Person` |
| `AffectedArea` | Catálogo de áreas afetadas (tabela, não enum) | tem muitos `Bug` |
| `Evidence` | Print, vídeo, link ou referência textual de um cenário | pertence a `TestCase` |
| `Person` | Diretório do time (QA/DEV), inclusive quem não loga | responsável de ciclos, cenários e bugs |
| `Account` | Conta de acesso ao sistema | opcionalmente ligada a `Person`; tem `Session` e `ChangeLog` |
| `Session` | Sessão persistente e revogável | pertence a `Account` |
| `TestUser` | Conta de massa de teste (QA/PRD), senha cifrada | tem `CredentialAccess` |
| `CredentialAccess` | Registro de quem revelou ou copiou uma senha | `TestUser` + `Account` |
| `ChangeLog` | Histórico: uma linha por campo alterado | aponta para `case`/`bug`/`suite`/`account` por `entity`+`entityId` |
| `MetricSnapshot` | Foto diária de cenários, automação e bugs abertos | — |
| `LoginAttempt` | Tentativa de entrada, aceita ou recusada | — |

Duas separações deliberadas: `Person` (quem faz o trabalho) ≠ `Account` (quem
entra no sistema); e `TestUser` (massa **para** testar) não tem nada a ver com
`Account`.

`ChangeLog` aponta para as entidades por par `entity` + `entityId`, sem chave
estrangeira, e guarda os valores já resolvidos em texto — para continuar legível
depois que a pessoa referida for renomeada ou removida.

## 14. Pontos de extensão

Onde o código já prevê que algo novo se encaixe:

| Extensão | Caminho no código |
|---|---|
| Valor novo em um enum de domínio | `packages/shared/src/domain.ts` → aparece automaticamente em `/api/meta`, nos `Select` do front e na validação Zod; se o valor existia com outra grafia na planilha, registrar o alias em `normalize.ts` |
| Campo novo em uma entidade | `schema.prisma` → `npm run db:push` → `schemas.ts` → `select` da rota → mapa de `lib/changelog.ts` (se auditado) → `lib/types.ts` → tela |
| Endpoint novo | arquivo em `routes/` exportando `xRoutes(app)`, registrado em `server.ts`; nasce protegido pelo gate |
| Regra de acesso diferente da padrão | array `EXTRA` em `lib/gate.ts` (método + regex + papel); liberações, em `PUBLIC`/`ANY_VIEWER` |
| Entidade nova no histórico | `TrackedEntity` e um mapa de campos em `lib/changelog.ts`, mais o `z.enum` de `routes/history.ts`; o componente `Timeline` já aceita a entidade por parâmetro |
| Coluna nova na importação | mapa de títulos em `import/columns.ts`, `bug-columns.ts` ou `user-columns.ts` |
| Aba ou coluna nova na exportação | `export/xlsx.ts` (`writeProgress`, `writeCases`, `writeBugs`, `writeUsers`) |
| Seção nova no relatório final | `buildReportData()` e os dois renderizadores de `routes/reports.ts` |
| Métrica nova | `packages/shared/src/metrics.ts` — vale ao mesmo tempo para tela, snapshot, PDF e xlsx |
| Primitiva de UI nova | `components/ui.tsx`, com o tom vindo de `statusTone` e as cores dos tokens do CSS |
| Hook de dados novo | `lib/queries.ts`, com chave própria e uma função de refresh que invalide o que a mudança afeta |
| Tema escuro | os tokens já existem em `global.css`; falta destravar o `data-theme="light"` do `index.html` (US-6.5) |
| Troca para Postgres | `datasource` do `schema.prisma`; ver as ressalvas registradas em `estado-atual.md` (migrations, `contains`, `trustProxy`) |
