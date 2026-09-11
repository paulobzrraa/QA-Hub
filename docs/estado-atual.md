# Estado atual do QA Hub

**Foto de 11/09/2026.** Último commit: `95dd2cf — US-6.2: freio de força bruta
no login` (10/09/2026), branch `development`, árvore de trabalho limpa.

Este documento é a resposta rápida para "em que pé está o projeto?". O contexto
permanente (arquitetura, convenções, regras) está em [`../CLAUDE.md`](../CLAUDE.md);
o que ainda falta fazer, com critérios de aceite, está em
[`backlog.md`](backlog.md) e [`backlog-melhorias.md`](backlog-melhorias.md).

**Atualize este arquivo ao concluir cada US.**

---

## Números do sistema

| Código | |
|---|---|
| Linhas de código | ~12.000 (TS/TSX/CSS/Prisma) |
| Endpoints da API | 52 — 51 em 15 módulos de rota, mais `/api/health` |
| Telas | 10 páginas + 8 componentes de composição |
| Modelos no banco | 13 |

**Acervo no banco local (`data/qahub.db`) em 11/09/2026:**

| Entidade | Quantidade |
|---|---|
| Ciclos de teste | 90 (89 importados, 1 criado no sistema) |
| Cenários | 1.600 |
| Bugs | 286 (15 em aberto) |
| **Vínculos bug ↔ cenário** | **0** |
| Evidências | 264 — todas do tipo `reference` vindas da importação; nenhum arquivo em `data/evidence/` |
| Contas de massa de teste | 46 (100% cifradas, nenhuma em texto puro) |
| Áreas afetadas | 30 |
| Pessoas | 27 |
| Contas de acesso | 2 |
| Registros de histórico | 5 |
| Snapshots de métricas | 3 |
| Acessos a credencial registrados | 5 |

Os números de histórico, snapshots e acessos são baixos porque o sistema ainda
roda só na máquina de desenvolvimento, sem uso pelo time.

---

## 1. Funcionalidades concluídas

**Fase 1 — Cenários de teste**
- Importação da planilha "Gerenciamento de Testes - Swift.xlsx" (`npm run import`),
  idempotente por `sourceSheet`, com relatório de avisos ao final.
- CRUD de ciclos de teste e cenários, com filtros por plataforma, squad, status,
  responsável e busca livre.
- Métricas por ciclo calculadas dos cenários reais (`computeMetrics`), com o
  status consolidado de QA + Stage (`effectiveStatus`).
- `/api/meta` como fonte única dos dropdowns, e validação Zod compartilhada
  devolvendo 422 com campo e motivo.

**Fase 2 — Bugs**
- Modelo `Bug` com severidade, status, área afetada (tabela, não enum),
  responsável, datas de negócio e plataforma; listagem única para Web e App.
- Importação dos bugs das duas abas, com `Done`/`Resolved` convergindo.
- Filtros combináveis, busca livre, ordenação por severidade, data e lead time,
  contadores por status.
- Lead time calculado sem `#NUM!` (`computeBugLeadTime`), com média por severidade.
- Relação N:N bug ↔ cenário implementada na API e na tela
  (`POST/DELETE /api/cases/:caseId/bugs`) — **sem nenhum dado, ver seção 4**.
- "Reportar bug" a partir do cenário (`ReportBugDialog`).

**Fase 3 — Métricas**
- Panorama consolidado (`/api/overview`): cenários × automação por plataforma,
  squad e responsável, distribuição de status e bugs abertos por severidade.
- Evolução no tempo com snapshot diário idempotente (`MetricSnapshot`,
  `ensureTodaySnapshot`) e gráfico de linha próprio (`LineChart`).
- Cobertura de automação com ranking e cortes por squad e plataforma.
- Relatório final exportável em **PDF e xlsx**, com seleção de período,
  plataforma, squad e ciclos específicos.

**Fase 4 — Massa de teste, evidências e exportação**
- Massa de usuários de teste importada das abas `Users QA` e `Users PRD`, com
  busca por e-mail e CPF (normalizado para dígitos) e filtros.
- Credenciais cifradas em repouso (AES-256-GCM), reveladas só sob ação explícita
  e sempre com registro em `CredentialAccess` gravado **antes** de a senha sair.
  O boot cifra automaticamente qualquer senha em texto puro e roda `VACUUM`.
- Evidências de cenário: upload de imagem/vídeo (50 MB), link externo,
  miniatura e visualização.
- Exportação xlsx no formato da planilha original, respeitando os filtros da
  tela, com a coluna `Senha` saindo deliberadamente vazia.
- Gestão de pessoas: CRUD, papel QA/DEV, flag de ativo e **mesclagem** de
  duplicatas em transação.

**Fase 5 / 6 — Operação**
- **US-5.1** Autenticação completa: primeiro acesso, login, logout, troca de
  senha, papéis `viewer`/`editor`/`admin`, sessão persistente revogável e gate
  global de autorização.
- **US-5.2** Histórico de alterações campo a campo, com linha do tempo em
  cenário, bug, ciclo e conta, e retenção configurável (24 meses, piso de 12).
- **US-6.1** Redefinição de senha pelo administrador, com provisória de uso
  único, revogação de sessões, destravamento do freio de login e registro no
  histórico.
- **US-6.2** Freio de força bruta no login, por e-mail e por IP, com atraso
  exponencial, bloqueio temporário e tentativas registradas para consulta.

## 2. Funcionalidades em desenvolvimento

**Nada está em curso neste momento** — a árvore de trabalho está limpa e o
último commit fecha a US-6.2 por completo.

O que existe **parcialmente implementado**, entregue assim de propósito ou por
lacuna conhecida:

| Item | O que existe | O que falta | US |
|---|---|---|---|
| Busca global de cenários | `GET /api/cases` com filtros e busca livre, funcionando | **Nenhuma tela consome esse endpoint** | US-8.3 |
| Reteste após correção | `PATCH /api/bugs/:id` devolve `retestSuggested` e a tela mostra um aviso | O aviso some ao recarregar; não vira estado nem lista de pendências | US-7.1 |
| Massa de teste | Consulta, busca, filtros e revelação de senha | Criar, editar e desativar conta pela tela (não há `POST`/`PATCH` em `/api/test-users`) | US-6.6 |
| Tema escuro | Paleta escura completa nos tokens, inclusive `prefers-color-scheme` | Está travada por `data-theme="light"` no `apps/web/index.html` | US-6.5 |
| Evidências | Só em cenário | Anexar em bug | US-6.4 |
| Relatório por squad | Recorta os cenários pelo squad | Não recorta os bugs — quem lê o PDF não tem como perceber | US-7.2 |
| Histórico | Alteração de campo | Anexar/remover evidência e vincular/desvincular bug não deixam rastro | US-7.4 |
| Auditoria de credencial | `actorId` preenchido desde a US-5.1 | Os 5 registros existentes são anteriores ao login e têm ator nulo | — |

## 3. Funcionalidades ainda não implementadas

Nenhuma delas está entregue. Com uma exceção assinalada abaixo (US-8.3), não há
uma linha de código escrita para elas — o que já existe de aproveitável está na
tabela da seção 2.

**Bloqueantes para o uso real pelo time:**
- **US-5.3 — Postgres e deploy.** Troca do `datasource`, migrations versionadas,
  backup diário e deploy com variáveis de ambiente. É o gargalo de tudo: hoje o
  sistema roda apenas na máquina de desenvolvimento.

**Demais itens do backlog:**
- US-5.4 — Integração com o Jira (hoje `jiraKey` é só texto, sem nenhuma chamada).
- US-6.3 — Reimportação que não desfaz edição manual.
- US-7.3 — Reconstruir os vínculos bug ↔ cenário a partir das chaves do Jira.
- US-8.1 — Visão pessoal ("o que é meu").
- US-8.2 — Tendência por squad e plataforma (o snapshot diário é global).
- US-8.3 — Paginação e busca global nas telas. **Parcial:** a busca global de
  cenários já existe e funciona em `GET /api/cases` (ver seção 2); falta levá-la
  à interface e paginar as listagens, que hoje devolvem e renderizam tudo.
- US-8.4 — Convite por link em vez de senha provisória digitada pelo admin.

## 4. Problemas conhecidos

1. **Zero vínculos bug ↔ cenário no banco.** O importador antigo os apagava a
   cada execução e o estrago já estava feito quando foi descoberto. Consequência
   direta: as colunas "Bugs" e "Fixed" da exportação xlsx saem zeradas, o
   relatório final não relaciona bug a cenário, e a US-7.1 não tem base. A
   funcionalidade está inteira — faltam os dados (US-7.3).
2. **Reimportar a planilha sobrescreve correção feita no sistema.** Desde a
   US-4.3 o importador não apaga mais cenários (evidências e vínculos
   sobrevivem), mas ainda sobrescreve **valor de campo**: corrigir um título no
   QA Hub e reimportar devolve o título antigo (US-6.3).
3. **Conta criada pelo administrador não força troca de senha.**
   `POST /api/accounts` não marca `mustChangePassword`, enquanto
   `POST /api/accounts/:id/reset-password` marca. A senha escolhida pelo admin
   para uma conta nova vira permanente e é conhecida por duas pessoas. Correção
   de uma linha; a solução completa é a US-8.4.
4. **Nenhum arquivo de evidência existe.** As 264 evidências são todas do tipo
   `reference` (texto que veio da planilha: chaves do Jira e nomes de `.mov`).
   `data/evidence/` está vazio. O fluxo de upload funciona, mas nunca foi usado
   com volume.
5. **Aviso de reteste é volátil** — recarregar a página perde a informação de
   que havia cenários a retestar (US-7.1).

## 5. Débitos técnicos identificados

Estes são operacionais e **não estão nos backlogs** de produto:

1. **Fastify sem `trustProxy`.** Atrás de um proxy reverso, `request.ip` passa a
   ser o IP do proxy: o eixo por IP do freio de login bloquearia todos os
   usuários juntos, e `CredentialAccess.ipAddress` / `LoginAttempt.ipAddress`
   registrariam o endereço errado. **Resolver junto com a US-5.3**, antes do
   primeiro deploy.
2. **Sem migrations versionadas.** O schema é aplicado com `prisma db push`. A
   migração para Postgres exige criar um baseline antes.
3. **Buscas com `contains` mudam de comportamento no Postgres.** O `LIKE` do
   SQLite é case-insensitive para ASCII; o do Postgres não é. Afeta as buscas de
   ciclo, cenário, bug e massa de teste na migração.
4. **`credentials: 'same-origin'` em `apps/web/src/lib/api.ts`** funciona hoje
   graças ao proxy do Vite. Em produção exige front e API no mesmo host — a API
   não serve estáticos (não há `@fastify/static`) — e revisão do
   `cors: { origin: true, credentials: true }` de `server.ts`.
5. **Sem backup do banco e sem cópia redundante da `CREDENTIALS_KEY`.** A chave
   vive só em `apps/api/.env`, fora do git. Perdê-la torna as 46 senhas da massa
   de teste irrecuperáveis.
6. **`data/evidence/` é disco local** — qualquer deploy precisa de volume
   persistente, ou as evidências se perdem no primeiro restart.
7. **Sem ESLint, Prettier e CI.** O estilo é mantido por convenção e leitura;
   nada verifica automaticamente um PR.
8. **Listagens sem paginação.** `/api/suites`, `/api/bugs` e `/api/test-users`
   devolvem tudo, e as telas renderizam tudo. Aguenta o acervo atual (1.600
   cenários, 286 bugs); o dobro provavelmente não (US-8.3).

## 6. Testes existentes

**Nenhum.** Não existe um único arquivo `*.test.*` ou `*.spec.*` no repositório,
nem vitest, jest ou playwright instalados, nem workflow de CI em `.github/`.

A única verificação automatizada disponível é a checagem de tipos, e ela **passa
limpa nos dois pacotes**:

```bash
npx tsc -p apps/api/tsconfig.json --noEmit
npx tsc -p apps/web/tsconfig.json --noEmit
```

Quando testes forem introduzidos, o melhor ponto de partida são as funções puras
de `packages/shared`, que sustentam todos os números que a liderança vê:
`effectiveStatus`, `computeMetrics`, `computeBugLeadTime`, `normalizeCpf`,
`isValidCpf`, `toDate` e os matchers de `normalize.ts`. Depois delas, o freio de
login (`lib/login-guard.ts`) e o gate (`lib/gate.ts`) são o que mais se paga.

## 7. Limitações atuais

- **Roda só localmente**, em SQLite, iniciado à mão com `npm run dev`. Não há
  servidor, domínio, HTTPS nem acesso para o time.
- **Uma instalação, um banco.** Sem multi-tenant e sem noção de projeto ou
  cliente: o recorte é plataforma (Web/App) e squad.
- **Escrita sem controle de concorrência.** Duas pessoas editando o mesmo
  cenário — o último save vence, sem aviso.
- **Sem notificação de qualquer espécie** (e-mail, Slack): a senha provisória,
  por exemplo, é entregue fora do sistema, na mão.
- **Sem recuperação de senha pela própria pessoa** — depende de um
  administrador. E se a única conta admin perder a senha, só o banco resolve.
- **Enums do domínio são fechados no código.** Um status ou squad novo exige
  alterar `packages/shared/src/domain.ts` e publicar. As exceções deliberadas
  são área afetada de bug e perfil de conta de teste, que vêm do banco.
- **O front não tem build de produção testado** — `npm run build` existe e
  constrói o front, mas a API não tem etapa de build (roda em `tsx`).
- **Acessibilidade e responsividade não foram verificadas** além do cuidado com
  contraste registrado nos tokens do CSS.
- **Idioma único** (pt-BR nas telas, identificadores em inglês). Sem i18n.

## 8. Decisões técnicas já tomadas

As 16 decisões estruturais do projeto — com o onde e o porquê de cada uma —
estão em [`decisoes-tecnicas.md`](decisoes-tecnicas.md), que é o registro vivo
delas. **Não reabra nenhuma sem motivo novo.**

As quatro que mais restringem o que se pode fazer daqui para frente:

- **O domínio vive em `@qahub/shared`** e roda nos dois apps — mexer ali afeta
  front e back ao mesmo tempo.
- **A autorização é um hook global** (`lib/gate.ts`): rota nova nasce protegida.
- **A sessão fica em tabela, não em JWT sem estado**, para poder ser revogada.
- **As rotinas de manutenção são idempotentes e rodam no boot**, porque não há
  cron.

## 9. Pontos que precisam de atenção nas próximas implementações

1. **Antes de qualquer deploy (US-5.3):** resolver `trustProxy`, criar o
   baseline de migrations, revisar CORS + `credentials`, definir backup do banco
   e da `CREDENTIALS_KEY`, e prover volume persistente para `data/evidence/`.
   São os débitos 1 a 6 da seção 5, e todos vencem no mesmo dia.
2. **Ao migrar para Postgres:** revisar toda busca com `contains` (sensibilidade
   a maiúsculas muda) e conferir os campos de data — o SQLite guarda `DateTime`
   de forma mais permissiva.
3. **Ao mexer em métricas:** o mesmo código alimenta a tela, o snapshot diário,
   o PDF e a exportação xlsx. Mudar `effectiveStatus` ou `computeMetrics`
   reescreve o significado de tudo isso ao mesmo tempo — e os snapshots já
   gravados não são recalculados.
4. **Ao criar campo em entidade auditada:** ele precisa entrar no mapa de
   `lib/changelog.ts` com rótulo em pt-BR, ou a alteração passa a acontecer sem
   deixar rastro, silenciosamente.
5. **Ao adicionar rota:** ela nasce protegida pelo gate. Escrita exige `editor`
   por padrão; se precisar de `admin` ou de exceção, a regra vai em `gate.ts`,
   nunca solta na rota. Nada entra em `PUBLIC` sem necessidade real.
6. **Ao tocar no importador:** a idempotência por `sourceSheet` e a regra de não
   tocar no que nasceu no sistema são o que impede perda de trabalho. Foi por aí
   que os vínculos bug ↔ cenário se perderam uma vez.
7. **Ao mexer na massa de teste:** senha nunca em listagem, log ou exportação; o
   registro do acesso é gravado antes de a senha ser devolvida.
8. **Antes da US-7.1 (reteste),** faça a US-7.3: sem vínculos bug ↔ cenário não
   há em que apoiar o estado de reteste.
9. **Antes de crescer o acervo** (mais um time, outra planilha), resolva a
   paginação (US-8.3) — as telas renderizam listas inteiras.
10. **Sem testes, a rede de segurança é a checagem de tipos e a leitura do
    código.** Alterações em `packages/shared` afetam os dois apps de uma vez:
    rode os dois `tsc --noEmit` e verifique na aplicação rodando.
