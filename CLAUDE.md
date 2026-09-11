# CLAUDE.md — contexto permanente do QA Hub

Este arquivo é o contexto de entrada para qualquer sessão nova do Claude Code
neste repositório. Tudo aqui foi verificado no código; quando uma informação
mudar, **atualize este arquivo junto com a alteração**.

Idioma do projeto: **português do Brasil, corretamente acentuado** — em
comentários, mensagens de erro, textos de tela, commits e documentação.

---

## 1. Objetivo do projeto

O QA Hub substitui a planilha **"Gerenciamento de Testes - Swift.xlsx"** na
gestão de cenários de teste, bugs e métricas de um time de QA. Todo o domínio
do sistema foi extraído dos `dataValidation` daquela planilha, e o importador
traz o acervo histórico para dentro do banco.

Duas consequências que explicam boa parte das decisões do código:

- Onde a planilha produzia erro (`#DIV/0!`, `#NUM!`, progresso de 140%), o
  sistema produz um valor correto (0%, campo vazio, taxa limitada a 100%).
- Onde a planilha divergia entre abas (`Choose`/`Backlog`, `Done`/`Resolved`,
  `Murilo`/`Murillo`), o sistema consolida na união dos valores e converte os
  antigos na importação (`packages/shared/src/normalize.ts`).

**Terminologia de produto:** o que no código se chama `TestSuite` é chamado de
**"Ciclo de teste"** / **"Ciclos de testes"** em toda tela e mensagem ao
usuário. Nunca escreva "suíte" em texto visível.

## 2. Stack tecnológica

Monorepo npm workspaces (`packages/*`, `apps/*`), Node ≥ 20, TypeScript estrito
em todos os pacotes, ESM (`"type": "module"`).

| Camada | Tecnologia |
|---|---|
| Front | React 18.3, Vite 5.4, TanStack Query 5, react-router-dom 6, lucide-react |
| API | Fastify 5, @fastify/cookie, @fastify/cors, @fastify/multipart, tsx (sem build) |
| Banco | SQLite via Prisma 5.22 |
| Validação | Zod 3, compartilhado entre front e back |
| Arquivos | exceljs (importação e exportação xlsx), pdfkit (relatório final) |
| Estilo | CSS puro com tokens em `apps/web/src/styles/global.css` (vocabulário Untitled UI), fontes Inter e Poppins |

Não há ESLint, Prettier, Docker, CI ou runner de testes configurados.

## 3. Arquitetura

**Contrato único de domínio.** `packages/shared` é a fonte da verdade:
`domain.ts` declara os enums, `schemas.ts` os transforma em schemas Zod,
`metrics.ts` e `bug-metrics.ts` calculam métricas, `normalize.ts` converte
valores legados do Excel. API e front importam exatamente o mesmo código.

**Fluxo de uma requisição:**

```
front (hook em lib/queries.ts) → fetch em lib/api.ts → proxy do Vite → Fastify
  → hook global do gate (lib/gate.ts): resolve sessão + autoriza
  → rota (routes/*.ts): parse(schema, body) → Prisma → recordChanges()
  → resposta JSON  |  erro via sendError() (422 com {field, message}, 401, 403…)
```

**API** (`apps/api/src/server.ts`): registra cors → cookie → **gate** →
multipart → rotas. O gate entra **antes** das rotas de propósito: rota nova
nasce protegida e precisa ser liberada explicitamente.

**Sem cron.** As rotinas de manutenção são idempotentes e rodam no boot do
servidor: `ensureTodaySnapshot()`, `ensureEncryptedCredentials()`,
`pruneSessions()`, `pruneHistory()`, `pruneLoginAttempts()`. O snapshot do dia
também é garantido a cada leitura do histórico de métricas.

**Front** (`apps/web/src/App.tsx`): decide entre `Loading` → `LoginPage` →
`ForcePasswordChange` → shell com sidebar e rotas. Todo dado passa por hooks do
TanStack Query em `lib/queries.ts`; nenhum componente chama `fetch` direto.

## 4. Estrutura principal de pastas

```
packages/shared/src/
  domain.ts        enums do domínio + ACCESS_ROLE e hasAccess()
  schemas.ts       validação Zod usada na API e no front
  normalize.ts     conversão de valores legados da planilha
  metrics.ts       effectiveStatus() e computeMetrics()
  bug-metrics.ts   computeBugLeadTime()
  test-users.ts    CPF: digitsOnly, isValidCpf, normalizeCpf, formatCpf

apps/api/
  prisma/schema.prisma
  src/server.ts    composição da aplicação e rotinas de boot
  src/lib/         auth, gate, changelog, crypto, login-guard, http, db
  src/routes/      meta, people, suites, cases, overview, bugs, affected-areas,
                   metrics, reports, test-users, evidence, export, auth,
                   accounts, history
  src/import/      leitor do xlsx (run.ts é o executável)
  src/export/      gerador do xlsx no formato da planilha original

apps/web/src/
  App.tsx          shell, navegação e rotas
  pages/           Overview, Suites, SuiteDetail, Bugs, Metrics, TestUsers,
                   People, Accounts, Login, ForcePasswordChange
  components/      ui.tsx (primitivas) + drawers, dialogs, LineChart, Timeline
  lib/             api.ts, auth.tsx, queries.ts, accounts.ts, types.ts
  styles/global.css

data/              qahub.db e evidence/ — fora do controle de versão
docs/            arquitetura.md  — arquitetura real, fluxos e pontos de extensão
                 backlog.md      — backlog vivo: 38 US com status
                 estado-atual.md — o que está pronto, parcial, pendente e quebrado
                 decisoes-tecnicas.md — o porquê de cada decisão estrutural
                 backlog-melhorias.md — origem narrativa das US-6 a US-8 (lido
                                        por scripts/backlog-para-github.sh)
scripts/           backlog-para-github.sh
```

## 5. Como executar o projeto

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:push     # cria/atualiza data/qahub.db (prisma db push + generate)
npm run import      # opcional: importa a planilha de ~/Downloads
npm run dev         # API em :3333, front em :5173
```

Outros scripts: `npm run dev:api`, `npm run dev:web`, `npm run build` (constrói
**só** o front — a API roda em `tsx`, sem etapa de build).

Importar outra planilha: `npm run import -- "/caminho/para/planilha.xlsx"`.
A importação é idempotente (ver seção 7).

No primeiro acesso a `http://localhost:5173`, a tela pede a criação do
**primeiro acesso**, que nasce administrador; as demais contas são criadas em
*Contas de acesso*.

Variáveis de `apps/api/.env`: `DATABASE_URL`, `PORT`, `CREDENTIALS_KEY`
(gerada sozinha na primeira execução), `ALLOWED_EMAIL_DOMAINS` (opcional),
`HISTORY_RETENTION_MONTHS` (padrão 24, piso de 12 aplicado no código).

## 6. Como executar testes

**Não existe nenhum teste automatizado no projeto hoje** — nenhum arquivo
`*.test.*` / `*.spec.*`, nenhum vitest, jest ou playwright, nenhum CI. Não
afirme que "os testes passaram" apoiado em algo que não existe.

A única verificação disponível é a checagem de tipos, e ela passa limpa nos
dois pacotes:

```bash
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
```

**Rode as duas depois de qualquer alteração de código** e relate o resultado.
Quando a mudança for de comportamento, verifique também na aplicação rodando
(`npm run dev`).

Se for introduzir testes, alinhe a ferramenta antes com o Paulo. O melhor ponto
de partida são as funções puras de `packages/shared`, que sustentam todos os
números exibidos: `effectiveStatus`, `computeMetrics`, `computeBugLeadTime`,
`normalizeCpf`, `toDate` e os matchers de `normalize.ts`.

## 7. Banco de dados e persistência

SQLite em `data/qahub.db`, acessado por Prisma. O schema é gerenciado por
`prisma db push` — **não há migrations versionadas**.

Modelos (`apps/api/prisma/schema.prisma`, fortemente comentado):

`Person`, `Account`, `Session`, `TestSuite`, `TestCase`, `Bug`, `AffectedArea`,
`Evidence`, `TestUser`, `CredentialAccess`, `ChangeLog`, `MetricSnapshot`,
`LoginAttempt`.

Pontos que valem lembrar antes de mexer:

- **Sem enums no Prisma** (SQLite não suporta): os campos de domínio são
  `String` e quem valida é o Zod de `@qahub/shared`, na borda da API.
- **Idempotência da importação:** `TestSuite.sourceSheet` (a aba de origem) e
  `TestUser.sourceSheet + sourceRow` são as chaves. Registro criado à mão no
  sistema tem esses campos nulos e **nunca** é tocado pelo importador.
- **`Person` ≠ `Account`:** `Person` é o diretório do time (citado por ciclos,
  cenários e bugs, inclusive de quem nunca vai logar); `Account` é quem entra
  no sistema. O vínculo é opcional.
- **`ChangeLog` grava uma linha por campo alterado**, com os valores já
  resolvidos em texto (nome da pessoa, não o id) para continuar legível depois
  de uma renomeação. `kind: 'event'` cobre o que não tem "valor anterior".
- **Senhas da massa de teste** são cifradas em repouso com AES-256-GCM
  (`lib/crypto.ts`), chave em `.env`, prefixo `enc:v1:`. Senhas de conta de
  acesso usam **scrypt** (hash de mão única) — são coisas diferentes.
- **Evidências enviadas** ficam em `data/evidence/`, com nome gerado por nós
  (`randomUUID`), nunca o nome original.
- **Retenção:** histórico 24 meses (piso de 12), tentativas de login 30 dias.

O `.gitignore` exclui `apps/api/.env`, `data/*.db` e `data/evidence/`.
**Perder a `CREDENTIALS_KEY` torna as senhas da massa de teste irrecuperáveis.**

## 8. Autenticação e autorização

- **Senha** com `scrypt` nativo do Node (`lib/auth.ts`), formato
  `scrypt:<salt>:<derivada>`, comparação em tempo constante.
- **Sessão** persistente de 30 dias em cookie httpOnly (`qahub_session`),
  `sameSite: 'lax'`, `secure` só em produção. O cookie leva o token; o banco
  guarda apenas o SHA-256 dele. Renovação deslizante grava no máximo 1x/hora.
- **Revogação:** trocar a senha, redefinir senha ou desativar/rebaixar a conta
  derruba as sessões na hora.
- **Papéis:** `viewer` (leitura), `editor` (execução), `admin` (administração),
  com `hasAccess()` compartilhado entre front e back.
- **Gate** (`lib/gate.ts`), hook global `onRequest`, nesta ordem:
  1. rotas em `PUBLIC` passam sem sessão (`health`, `auth/status`, `login`, `setup`);
  2. sem sessão em `/api/*` → 401;
  3. rotas em `ANY_VIEWER` (logout, trocar senha, `auth/me`) passam;
  4. `mustChangePassword` pendente → 403 em todo o resto;
  5. regras de `EXTRA` (por método + regex): senha da massa exige `editor`;
     auditorias e `/api/people` exigem `admin`;
  6. regra geral: **qualquer método diferente de GET/HEAD exige `editor`**.
- **Login** não distingue e-mail inexistente de senha errada e gasta o mesmo
  tempo nos dois casos.
- **Freio de força bruta** (`lib/login-guard.ts`): conta falhas em 15 min nos
  eixos e-mail **e** IP, vale o pior; atraso exponencial a partir de 3 falhas
  (teto de 5 s), bloqueio de 15 min a partir de 8, com a mesma mensagem para
  conta existente e inexistente. Redefinir a senha destrava.
- **Senha provisória** de uso único: gerada pelo sistema, devolvida uma única
  vez na resposta, marca `mustChangePassword`.

No front, `can()` de `lib/auth.tsx` serve apenas para **não oferecer** o que a
pessoa não pode fazer. Esconder botão não é controle de acesso.

## 9. Principais módulos

| Tela | Rota | Endpoints principais |
|---|---|---|
| Visão Geral | `/geral` | `GET /api/overview` |
| Ciclos de testes | `/suites`, `/suites/:id` | `/api/suites`, `/api/suites/:suiteId/cases`, `/api/cases` |
| Bugs | `/bugs/web`, `/bugs/app` | `/api/bugs`, `/api/cases/:caseId/bugs`, `/api/affected-areas` |
| Métricas | `/metricas` | `/api/metrics/history`, `/api/metrics/automation-coverage`, `/api/reports/final` |
| Massa de teste | `/massa-de-teste` | `/api/test-users`, `/api/test-users/:id/password` (somente leitura) |
| Pessoas | `/pessoas` (admin) | `/api/people`, `/api/people/:id/merge` |
| Contas de acesso | `/contas` (admin) | `/api/accounts`, `/api/accounts/:id/reset-password`, `/api/accounts/login-attempts` |

Transversais: `GET /api/meta` (todas as listas de dropdown),
`GET /api/history/:entity/:id` (linha do tempo de `case`, `bug`, `suite` e
`account`), `GET /api/export/xlsx`, evidências em `/api/cases/:caseId/evidence/*`
e `/api/evidence/:id`.

## 10. Convenções de código

- **Comentários explicam o porquê, não o quê**, em português, e citam a US que
  originou a decisão quando ela existe (`(US-4.2)`, `(US-6.1)`). Esse é o traço
  mais forte do projeto — mantenha-o em código novo.
- **Rotas:** toda rota é `try { … } catch (error) { return sendError(reply, error) }`.
  Entrada sempre por `parse(schema, request.body | request.query)`. Erros de
  domínio com `throw new HttpError(status, mensagem)`. Códigos Prisma
  traduzidos: `P2002` → 409, `P2025` → 404.
- **Consultas:** `select`/`include` explícitos, declarados como constantes
  reutilizáveis no topo do arquivo (`LIST_SELECT`, `ACCOUNT_SELECT`,
  `EVIDENCE_SELECT`, `LINKED_BUG_SELECT`, `VIEWER_SELECT`).
- **Alterações auditáveis:** todo `PATCH` lê o registro **antes** do update e
  chama `recordChanges({ entity, entityId, before, after, fields, actorId })`.
  Campo novo em entidade auditada precisa entrar no mapa correspondente de
  `lib/changelog.ts` (`CASE_FIELDS`, `BUG_FIELDS`, `SUITE_FIELDS`,
  `ACCOUNT_FIELDS`), com rótulo em pt-BR.
- **Mensagens de erro** são escritas para a pessoa que vai lê-las na tela
  ("Faça login para continuar", "Já existe um cenário com esse código nesse
  ciclo"), não para o desenvolvedor.
- **Imports** entre arquivos da API usam extensão `.js` (ESM).
- **Nomenclatura:** identificadores em inglês (o domínio veio da planilha em
  inglês), textos e comentários em português.
- **Commits:** `US-X.Y: descrição em minúsculas` quando a mudança corresponde a
  uma US do backlog. Branch de trabalho: `development`.

## 11. Padrões de componentes

- **Primitivas em `components/ui.tsx`** — use antes de criar qualquer coisa:
  `StatusPill`, `statusTone`, `StatusSelect`, `Tag`, `ProgressBar`, `Stat`,
  `Accordion`, `CopyButton`, `Field`, `Select`, `Empty`, `Loading`,
  `ErrorBanner`, `formatDate`.
- **Dados só por hooks de `lib/queries.ts`** (`useSuites`, `useBugs`, `useMeta`,
  `usePeople`, `useTestUsers`…). Cada mutação tem sua função de refresh que
  invalida as queries afetadas — siga o padrão ao criar uma nova.
- **Tipos de resposta** vivem em `lib/types.ts`; requisições passam por
  `lib/api.ts` (`api.get/post/patch/delete/query`), que já trata 204, monta o
  `Content-Type` só quando há corpo e transforma erro 422 em `ApiError.fields`.
- **Opções de select vêm de `useMeta()`** — o front nunca declara lista própria.
- **Estrutura de página:** `<header className="topbar">` com título, subtítulo e
  `.toolbar`; depois `<div className="content stack">` com filtros e conteúdo.
  Estados: `Loading` → `ErrorBanner` → `Empty` → dados.
- **Painéis laterais** são `*Drawer` (`CaseDrawer`, `BugDrawer`) e modais são
  `*Dialog` (`NewSuiteDialog`, `ReportBugDialog`); ambos recebem `onClose`.
- **Permissão na tela:** condicione com `can('editor')` / `can('admin')` do
  `useAuth()`, além da proteção no servidor.
- **Estilo:** CSS em `styles/global.css` usando os tokens (`--accent`, `--text`,
  `--ok`, `--radius`…). Sem biblioteca de UI, sem CSS-in-JS. `style` inline só
  para valores calculados (largura de barra, posicionamento).

## 12. Regras importantes que não devem ser quebradas

1. **Validação mora em `packages/shared`.** Nada de declarar enum, lista de
   opções ou regra de validação dentro de `apps/web` ou `apps/api`. Valor novo
   entra em `domain.ts`, é exposto por `/api/meta` e validado pelo Zod.
2. **O gate é o único lugar de autorização de rota.** Não espalhe checagens
   soltas: rota nova nasce protegida, e liberar exige editar `lib/gate.ts`
   conscientemente. Nunca adicione algo a `PUBLIC` sem necessidade real.
3. **Nenhum segredo no repositório.** `.env`, `data/` e evidências ficam fora do
   git. Nunca imprima senha em log, listagem, exportação ou histórico.
4. **A senha da massa de teste só sai pelo endpoint dedicado**, sob ação
   explícita, e o registro em `CredentialAccess` é gravado **antes** de a senha
   ser devolvida.
5. **Importação é idempotente e não toca no que nasceu no sistema.** Registro
   sem `sourceSheet` nunca é sobrescrito pelo importador.
6. **Toda alteração de campo em entidade auditada gera histórico**, com valores
   resolvidos em texto e rótulo em pt-BR.
7. **Métricas nunca produzem erro nem passam de 100%:** denominador zero é 0,
   taxas são limitadas a 1, cenário `Removed` sai do denominador, e o status
   consolidado de QA + Stage é `effectiveStatus` — reprovação ou bloqueio
   prevalece sobre aprovação no outro ambiente.
8. **Rotinas de manutenção continuam idempotentes e no boot.** Não introduza
   cron ou passo manual de migração sem alinhar antes.
9. **"Ciclo de teste"** em todo texto visível; `TestSuite` só no código.
10. **Não troque o modelo de sessão por JWT sem estado:** a sessão fica no
    banco justamente para poder ser revogada na hora.

## 13. Integrações externas

**O sistema não se integra com nenhum serviço externo em tempo de execução.**

- **Jira:** apenas campo de texto (`jiraKey`) em ciclos, cenários e bugs. Não há
  chamada de API — a integração é a US-5.4, ainda não iniciada.
- **Planilha xlsx:** entrada por `npm run import` (exceljs) e saída por
  `GET /api/export/xlsx` e pelo relatório final (pdfkit). É a única troca de
  dados com o mundo.
- **Google Fonts** (Inter e Poppins) carregadas por `<link>` em
  `apps/web/index.html` — única dependência de rede do front.
- **`gh` CLI:** usado apenas por `scripts/backlog-para-github.sh`, que publica o
  backlog de melhorias como issues no repositório `paulobzrraa/QA-Hub`. Fora do
  runtime da aplicação.

## 14. Estado atual do projeto

**Fonte viva:** `docs/estado-atual.md` (números do acervo, problemas conhecidos
e débitos técnicos) e `docs/backlog.md` (status de cada US). O resumo abaixo é
para orientação rápida; quando divergir daqueles dois, eles é que valem.

Branch de trabalho `development`; remoto `git@github.com:paulobzrraa/QA-Hub.git`.

**Entregue:** Fases 1 a 4 completas (cenários, bugs, métricas, massa de teste com
credenciais cifradas, evidências, exportação xlsx e gestão de pessoas), mais
US-5.1 (autenticação com papéis), US-5.2 (histórico de alterações), US-6.1
(redefinição de senha pelo administrador) e US-6.2 (freio de força bruta).

**Parcial ou pendente** (cada uma com critérios e dependências em `docs/backlog.md`):

- **US-5.3 — Postgres e deploy:** não iniciada. É o gargalo de tudo: o sistema
  roda só localmente, em SQLite, sem migrations e sem backup.
- **US-5.4 — Jira:** não iniciada.
- **US-6.3** reimportação sobrescreve edição manual · **US-6.4** evidência no bug
  · **US-6.5** tema escuro travado por `data-theme="light"` no `index.html`
  (a paleta escura já existe nos tokens) · **US-6.6** massa de teste é somente
  leitura (não há `POST`/`PATCH` em `/api/test-users`).
- **US-7.1** reteste é só um aviso volátil · **US-7.2** bug não tem squad, e o
  relatório com escopo de squad recorta cenários mas não bugs · **US-7.3** há
  **zero** vínculos bug ↔ cenário no banco, o que faz colunas do relatório e da
  exportação saírem zeradas.
- **US-8.1** visão pessoal · **US-8.2** tendência por squad · **US-8.3** sem
  paginação em `/api/suites`, `/api/bugs` e `/api/test-users`, e a busca global
  de `/api/cases` não é usada por nenhuma tela · **US-8.4** convite por link.

**Acervo do banco local em 11/09/2026:** 90 ciclos, 1.600 cenários, 286 bugs,
264 evidências (todas do tipo `reference` vindas da importação — nenhum arquivo
em disco), 46 contas de massa de teste (100% cifradas), 27 pessoas, 2 contas de
acesso e **0 vínculos bug ↔ cenário**.

**Dívidas operacionais identificadas em análise, ainda não registradas no backlog:**

1. Fastify sem `trustProxy`: atrás de um proxy reverso, `request.ip` vira o IP
   do proxy — o eixo por IP do freio de login passa a bloquear todo mundo junto
   e a auditoria registra o endereço errado. Resolver junto com a US-5.3.
2. `prisma db push` sem migrations: a ida para Postgres exige criar um baseline.
3. Buscas usam `contains`: o `LIKE` do SQLite é case-insensitive em ASCII, o do
   Postgres não é. O comportamento das buscas muda na migração.
4. `POST /api/accounts` não marca `mustChangePassword`, enquanto
   `reset-password` marca — a senha escolhida pelo admin para uma conta nova
   vira permanente.
5. `credentials: 'same-origin'` em `lib/api.ts` funciona graças ao proxy do
   Vite; em produção exige front e API no mesmo host (a API não serve estáticos)
   e revisão do `cors: { origin: true, credentials: true }`.
6. Não há backup do banco nem cópia redundante da `CREDENTIALS_KEY`.
7. `data/evidence/` no disco local exige volume persistente em qualquer deploy.

## 15. Orientações para futuras implementações

- **Comece pelo backlog.** `docs/backlog.md` é o backlog vivo: 38 US com
  objetivo, critérios de aceite, status, dependências, fora do escopo e
  observações técnicas. Implemente a US como ela está escrita; se discordar do
  recorte, diga antes de mudá-lo.
- **Uma US por vez, fechada em si.** O projeto foi construído assim, e o
  histórico de commits reflete isso.
- **Antes de criar qualquer coisa, procure o que já existe:** primitiva em
  `ui.tsx`, hook em `queries.ts`, helper em `lib/`, função em
  `packages/shared`, `select` reutilizável no topo da rota.
- **Campo novo? O caminho completo é:** `schema.prisma` → `npm run db:push` →
  `domain.ts`/`schemas.ts` (se for de domínio) → `/api/meta` → rota →
  `lib/changelog.ts` (se for auditado) → `lib/types.ts` → tela.
- **Ao mexer em métricas**, lembre que o mesmo código roda nos dois lados e
  alimenta o snapshot diário, o relatório em PDF e a exportação xlsx.
- **Prioridade sugerida hoje:** US-5.3 (destrava o uso em time), US-7.3
  (destrava relatório, exportação e reteste) e US-6.5 (custo baixíssimo, efeito
  imediato).

---

## Processo obrigatório para novas tarefas

Este processo vale para **toda** tarefa neste repositório. Os passos 1 a 5
acontecem antes de qualquer arquivo ser alterado.

**1. Ler este arquivo.** É o contrato do projeto: stack, arquitetura,
convenções e as dez regras que não podem ser quebradas (seção 12).

**2. Identificar a US ou a tarefa.** Localize-a em `docs/backlog.md` pelo
número (`US-6.5`, por exemplo) e leia os seis blocos dela: objetivo, critérios
de aceite, status, dependências, fora do escopo e observações técnicas. Se o
pedido não corresponder a nenhuma US, trate-o como tarefa avulsa e diga isso —
não force um encaixe nem invente uma US nova.

**3. Ler a documentação relacionada em `docs/`:**
- `docs/backlog.md` — a US, seus critérios e suas dependências.
- `docs/estado-atual.md` — o que já está pronto, o que está parcial, os
  problemas conhecidos e os débitos técnicos que podem afetar a tarefa.
- `docs/arquitetura.md` — como a camada que você vai tocar funciona hoje, os
  fluxos de dados e os pontos de extensão.
- `docs/decisoes-tecnicas.md` — por que as coisas são como são. Leia antes de
  propor mudar mecanismo: a decisão pode já ter sido tomada com um motivo que
  continua valendo.
- `docs/backlog-melhorias.md` — a narrativa de origem das US-6 a US-8, quando a
  tarefa for uma delas.

**4. Analisar o código existente antes de alterar qualquer arquivo.** Leia as
rotas, hooks, componentes e schemas que a tarefa toca, e entenda o padrão em
vigor antes de escrever a primeira linha. Procure especificamente o que já
existe e pode ser aproveitado: primitiva em `components/ui.tsx`, hook em
`lib/queries.ts`, helper em `apps/api/src/lib/`, schema ou função em
`packages/shared`, `select` reutilizável no topo da rota.

**5. Identificar dependências e impactos.** Pergunte-se, e responda com o
código na mão:
- A US depende de outra que ainda está em `Backlog`? (Exemplo real: US-7.1
  depende da US-7.3.)
- O que mais consome o que vou mudar? Alterar `packages/shared` afeta os dois
  apps de uma vez; alterar `metrics.ts` reescreve tela, snapshot diário, PDF e
  exportação xlsx ao mesmo tempo.
- A mudança mexe em schema, gate, changelog, importação ou cifragem? Cada um
  desses tem regra própria na seção 12.

**6. Informar o plano antes de executar mudanças relevantes.** Diga em poucas
linhas o que pretende alterar, em quais arquivos e por quê, e espere o aval
quando a mudança for estrutural: schema do banco, regra do gate, contrato de
`packages/shared`, importador, exportação, autenticação ou qualquer coisa que
toque dado existente. Para mudança pequena e localizada, siga e relate no fim.

**7. Implementar somente o escopo solicitado.** Os critérios de aceite da US
são o contorno da entrega. Não altere funcionalidades não relacionadas: nada de
refatoração oportunista, renomeação em massa, reformatação de arquivo ou
atualização de dependência que a tarefa não pediu. Se encontrar um problema
fora do escopo, registre-o (em `docs/estado-atual.md` ou como US nova) em vez
de corrigi-lo por conta própria.

**8. Reutilizar código existente sempre que possível.** Criar algo novo ao lado
de um equivalente já existente é exceção e precisa ser justificado. **Não crie
duplicações** — de código, tipo, constante de domínio, lógica de validação ou
documentação. Regra que precisa valer nos dois lados vai para
`packages/shared`, sempre.

**9. Executar os testes relevantes.** Hoje o projeto **não tem testes
automatizados** (ver seção 6), então a verificação obrigatória é:

```bash
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
```

Quando houver testes no repositório, rode os que cobrem o que foi tocado, além
dos dois acima. Se a mudança for de comportamento, verifique também na
aplicação rodando (`npm run dev`). **Nunca afirme que algo passou sem ter
rodado.**

**10. Corrigir os problemas encontrados.** Erro de tipo, regressão ou critério
de aceite que não fecha é parte da tarefa, não assunto para depois. Se um
problema não puder ser resolvido dentro do escopo, pare e relate com a saída
real do comando — não entregue como se estivesse pronto.

**11. Atualizar a documentação impactada**, seguindo as regras da seção
**"Manutenção da documentação"**, logo abaixo. Isso acontece **antes** de
finalizar a tarefa, não depois.

**12. Informar no final, sempre, nesta ordem:**
- **O que foi alterado** — o comportamento, em uma ou duas frases.
- **Arquivos alterados** — a lista, com o que mudou em cada um.
- **Testes executados** — os comandos exatos que você rodou.
- **Resultado dos testes** — o que aconteceu de fato; se falhou, a saída.
- **Pendências** — o que ficou de fora, o que foi adiado e por quê, e qualquer
  problema que você encontrou mas não corrigiu por estar fora do escopo.

---

## Manutenção da documentação

**Regra obrigatória para todas as implementações futuras.** A documentação deste
projeto é mantida **durante** o desenvolvimento, não depois.

Sempre que uma tarefa ou User Story for implementada, avalie se a alteração
impacta algum destes arquivos:

- `docs/backlog.md`
- `docs/estado-atual.md`
- `docs/arquitetura.md`
- `docs/decisoes-tecnicas.md`
- `CLAUDE.md`

**Se houver impacto, atualize a documentação correspondente antes de finalizar a
tarefa.**

### Regras

1. **Marque a US como concluída somente quando os critérios de aceite tiverem
   sido implementados e validados.** Código escrito não é critério atendido:
   valide cada um, com as verificações do passo 9 e, quando for comportamento,
   na aplicação rodando. Critério que não fecha mantém a US em
   `Em desenvolvimento` ou `Em validação`.
2. **Atualize `docs/backlog.md` com o novo status da US** — marque os critérios
   (`- [ ]` → `- [x]`), mude o bloco **Status** e atualize a linha do índice.
   Os quatro status são `Backlog`, `Em desenvolvimento`, `Em validação` e
   `Concluída`. Nunca renumere IDs: commits e issues apontam para eles.
3. **Atualize `docs/estado-atual.md` quando houver mudança relevante no estado
   do sistema** — US concluída, problema conhecido que surgiu ou deixou de
   existir, débito técnico pago ou criado, limitação removida, ou números do
   acervo que mudaram de forma significativa. Atualize também a data da foto e
   o commit de referência no topo.
4. **Atualize `docs/arquitetura.md` somente quando a arquitetura realmente
   mudar** — entidade, rota, camada, dependência, integração externa, fluxo de
   dados ou ponto de extensão novo. Corrigir um bug ou implementar uma US dentro
   dos padrões existentes **não** muda a arquitetura e não pede alteração ali.
5. **Registre em `docs/decisoes-tecnicas.md` as decisões técnicas relevantes
   tomadas durante a implementação**, no formato do modelo que está no próprio
   arquivo (decisão, alternativas consideradas, consequência, onde, data).
   Relevante é o que alguém perguntaria "por que foi feito assim?" seis meses
   depois: escolha de dependência, formato de dado, troca de mecanismo, limite
   arbitrário, alternativa óbvia que foi descartada. Detalhe que o código já
   explica sozinho não entra.
6. **Não altere documentação sem motivo.** Nada de reescrever seção que não foi
   afetada, reorganizar por gosto ou "melhorar" texto de passagem. Documento
   estável é documento confiável.
7. **Não invente informações.** Tudo o que entrar na documentação tem que ser
   verificável no código, no banco ou no histórico do git. Número conferido,
   caminho de arquivo que existe, comportamento que você leu. Na dúvida,
   verifique antes de escrever — ou não escreva.
8. **Não modifique o `CLAUDE.md` a cada pequena alteração.** Ele só muda quando
   surge regra, convenção ou informação **permanente** que precise ficar
   registrada: um comando novo, uma invariante nova, uma mudança de stack, uma
   convenção que o time passou a seguir. Estado de US, números e progresso
   **não** vão para cá — vão para `docs/estado-atual.md` e `docs/backlog.md`.
9. **Ao finalizar cada US, informe quais arquivos de documentação foram
   atualizados**, junto com a lista de arquivos de código alterados (passo 12 do
   processo).
10. **Se nenhuma documentação precisar ser alterada, diga isso explicitamente** —
    "nenhum documento precisou de atualização, porque a mudança não afeta
    arquitetura, estado nem decisões". Silêncio sobre documentação é
    interpretado como esquecimento, não como ausência de impacto.

### Qual documento responde o quê

| Arquivo | Responde | Muda com que frequência |
|---|---|---|
| `CLAUDE.md` | como trabalhar aqui | raramente |
| `docs/arquitetura.md` | como funciona hoje | quando a estrutura muda |
| `docs/decisoes-tecnicas.md` | por que é assim | quando uma decisão é tomada |
| `docs/estado-atual.md` | em que pé está | a cada US concluída |
| `docs/backlog.md` | o que falta | a cada avanço de US |

A mesma informação **não** deve viver em dois desses arquivos. Quando precisar
aparecer em mais de um, um deles é a fonte viva e o outro aponta para ele.
