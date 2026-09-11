# Backlog do QA Hub

Backlog único do projeto, em User Stories. Substitui a versão anterior deste
arquivo (que cobria só as Fases 2 a 5) e absorve, no mesmo formato, as US-6 a
US-8 de [`backlog-melhorias.md`](backlog-melhorias.md).

**Sobre os dois arquivos:** `backlog-melhorias.md` continua existindo e **não
deve ser apagado** — ele é o documento de origem das US-6 a US-8, guarda a
narrativa de por que cada lacuna existe, e é lido por
`scripts/backlog-para-github.sh`, que publica aquelas 14 US como issues. Este
arquivo é o backlog **vivo**: é aqui que o status é atualizado.

**Sobre as US-1.x:** as funcionalidades da Fase 1 foram construídas antes de
existir backlog escrito. Elas estão registradas abaixo como concluídas, com
objetivo e critérios **derivados do código realmente implementado**, para que o
backlog represente o sistema inteiro. Não são documento original.

**Status possíveis:** `Backlog` · `Em desenvolvimento` · `Em validação` ·
`Concluída`. Hoje nenhuma US está em desenvolvimento ou em validação — a árvore
de trabalho está limpa no commit `95dd2cf`.

Tamanho: **P** ≈ meio dia · **M** ≈ 1–2 dias · **G** ≈ 3–5 dias.
Estado de entrega detalhado: [`estado-atual.md`](estado-atual.md).

---

## Índice

| US | Título | Tam. | Status |
|---|---|---|---|
| US-1.1 | Domínio validado e fonte única de opções | M | Concluída |
| US-1.2 | Importar os cenários da planilha | G | Concluída |
| US-1.3 | Ciclos de teste e cenários no sistema | G | Concluída |
| US-1.4 | Filtros e busca de ciclos e cenários | M | Concluída |
| US-1.5 | Métricas do ciclo sem erro de planilha | M | Concluída |
| US-2.1 | Modelo de bugs | M | Concluída |
| US-2.2 | Importar os bugs da planilha | M | Concluída |
| US-2.3 | Listagem de bugs com filtros | M | Concluída |
| US-2.4 | Lead time calculado | P | Concluída |
| US-2.5 | Vínculo bug ↔ cenário | M | Concluída (sem dados — ver US-7.3) |
| US-2.6 | Cadastro e edição de bug | M | Concluída |
| US-3.1 | Dashboard executivo | G | Concluída |
| US-3.2 | Evolução no tempo | G | Concluída |
| US-3.3 | Cobertura de automação | M | Concluída |
| US-3.4 | Relatório final exportável | M | Concluída |
| US-4.1 | Massa de usuários de teste | M | Concluída |
| US-4.2 | Proteger as credenciais | M | Concluída |
| US-4.3 | Evidências | M | Concluída |
| US-4.4 | Exportar para xlsx | M | Concluída |
| US-4.5 | Gestão de pessoas | P | Concluída |
| US-5.1 | Autenticação | G | Concluída |
| US-5.2 | Histórico de alterações | M | Concluída |
| **US-5.3** | **Postgres e deploy** | **M** | **Backlog** |
| US-5.4 | Integração com o Jira | G | Backlog |
| US-6.1 | Recuperar o acesso perdido | P | Concluída |
| US-6.2 | Frear tentativa em massa no login | P | Concluída |
| US-6.3 | Reimportação que não desfaz edição manual | M | Backlog |
| US-6.4 | Evidência no bug | M | Backlog |
| US-6.5 | Destravar o tema escuro | P | Backlog |
| US-6.6 | Massa de teste editável | M | Backlog |
| US-7.1 | Reteste como estado, não como aviso | M | Backlog |
| US-7.2 | Squad no bug | M | Backlog |
| **US-7.3** | **Reconstruir os vínculos bug ↔ cenário** | **M** | **Backlog** |
| US-7.4 | Histórico também das relações | P | Backlog |
| US-8.1 | O que é meu | P | Backlog |
| US-8.2 | Tendência por squad e plataforma | M | Backlog |
| US-8.3 | Paginação e busca global | M | Backlog |
| US-8.4 | Convite por link, não senha provisória | P | Backlog |

**24 concluídas · 14 em backlog.** Se for pegar só três: **US-5.3**, **US-7.3**
e **US-6.5**.

---

**Fase 1 — Cenários de teste** · registrada retroativamente a partir do código.

## US-1.1 — Domínio validado e fonte única de opções

### Objetivo
Como QA lead, quero que o sistema use exatamente os valores que a planilha
permitia em cada célula, para que nenhum dado histórico se perca e nenhum valor
inválido entre.

### Critérios de aceite
- [x] Enums extraídos dos `dataValidation` da planilha, num único lugar.
- [x] Onde as abas divergiam, o sistema consolida a união dos valores.
- [x] Valores legados são convertidos na importação (`Choose` → `Backlog`,
      `Done` → `Approved`/`Resolved`, `Murilo` → `Murillo`).
- [x] A mesma validação roda na API e no front.
- [x] Valor inválido recebe HTTP 422 com campo e motivo.
- [x] O front consome as listas de `/api/meta` e nunca declara opções próprias.

### Status
Concluída

### Dependências
Nenhuma. É a base de todas as demais US.

### Fora do escopo
Área afetada de bug e perfil de conta de teste, que são texto livre vindo do
banco porque a planilha não tinha `dataValidation` nessas colunas.

### Observações técnicas
`packages/shared/src/domain.ts`, `schemas.ts` e `normalize.ts`;
`apps/api/src/routes/meta.ts`; `parse()` em `apps/api/src/lib/http.ts`.

## US-1.2 — Importar os cenários da planilha

### Objetivo
Como QA lead, quero importar a planilha "Gerenciamento de Testes - Swift.xlsx",
para começar com o acervo real em vez de uma base vazia.

### Critérios de aceite
- [x] `npm run import [caminho]` lê o arquivo local (padrão: `~/Downloads`).
- [x] Colunas mapeadas por título, não por posição.
- [x] Cada aba de cenários vira um ciclo de teste, cruzado com a linha
      correspondente da aba "2. Progress".
- [x] Importação idempotente por `sourceSheet`: reimportar substitui os
      cenários daquela aba sem duplicar.
- [x] Ciclo criado dentro do sistema (sem `sourceSheet`) nunca é tocado.
- [x] Código de cenário repetido dentro da mesma aba é desambiguado por sufixo.
- [x] Pessoas citadas viram registros em `Person`, reaproveitando as existentes.
- [x] Relatório final com contagens e avisos no terminal.

### Status
Concluída

### Dependências
US-1.1 (normalização e enums).

### Fora do escopo
Preservar edição manual feita no sistema — o importador ainda sobrescreve valor
de campo. É a **US-6.3**.

### Observações técnicas
`apps/api/src/import/` (`run.ts`, `xlsx.ts`, `columns.ts`). Evidências vindas da
coluna `Evidence` são recriadas a cada importação, mas só as marcadas
`imported: true` — as enviadas por pessoas sobrevivem.

## US-1.3 — Ciclos de teste e cenários no sistema

### Objetivo
Como QA, quero criar e editar ciclos e cenários na ferramenta, para parar de
abrir a planilha para registrar execução.

### Critérios de aceite
- [x] CRUD de ciclo de teste com nome, Jira, plataforma, squad, status, datas,
      responsável e notas.
- [x] CRUD de cenário com código, Jira, cenário, objetivo, BDD, automação,
      ambiente, massa de teste, responsável, status QA, status Stage e notas.
- [x] Código do cenário sugerido automaticamente (`CT1`, `CT2`…) quando não
      informado.
- [x] Troca de status direto na tabela, sem abrir formulário.
- [x] Detalhe do ciclo lista todos os cenários com suas métricas.
- [x] Nome de ciclo sem o limite de 31 caracteres das abas do Excel.

### Status
Concluída

### Dependências
US-1.1.

### Fora do escopo
Paginação da listagem (**US-8.3**) e edição concorrente por duas pessoas.

### Observações técnicas
`apps/api/src/routes/suites.ts` e `cases.ts`; `apps/web/src/pages/SuitesPage.tsx`,
`SuiteDetailPage.tsx` e `components/CaseDrawer.tsx`.

## US-1.4 — Filtros e busca de ciclos e cenários

### Objetivo
Como QA, quero filtrar e buscar, para achar o que é meu sem rolar a lista
inteira.

### Critérios de aceite
- [x] Ciclos filtráveis por plataforma, squad, status e responsável.
- [x] Busca livre por nome do ciclo e chave do Jira.
- [x] Cenários filtráveis por status, ambiente, automação e responsável.
- [x] Busca livre de cenário por código, cenário, objetivo, BDD e Jira,
      atravessando todos os ciclos (`GET /api/cases`).
- [x] Filtros combináveis, aplicados no backend.

### Status
Concluída

### Dependências
US-1.3.

### Fora do escopo
Levar a busca global de cenários para a interface e atalho de teclado — está na
**US-8.3**.

### Observações técnicas
`GET /api/cases` existe, funciona e **nenhuma tela o consome hoje**. As buscas
usam `contains`, cujo comportamento muda ao migrar para Postgres (ver US-5.3).

## US-1.5 — Métricas do ciclo sem erro de planilha

### Objetivo
Como QA lead, quero métricas calculadas dos cenários reais, para parar de
depender de totais digitados à mão e de fórmulas que quebram.

### Critérios de aceite
- [x] Total, automatizados, manuais, executados, aprovados, reprovados e
      bloqueados por ciclo.
- [x] Taxas de execução, automação e aprovação, nunca acima de 100%.
- [x] Denominador zero devolve 0%, não `#DIV/0!`.
- [x] Cenário `Removed` sai do denominador.
- [x] Status consolidado de QA + Stage, com reprovação e bloqueio prevalecendo
      sobre aprovação no outro ambiente.
- [x] O mesmo cálculo roda no front e no back.

### Status
Concluída

### Dependências
US-1.1, US-1.3.

### Fora do escopo
Panorama consolidado do portfólio (**US-3.1**) e evolução no tempo (**US-3.2**).

### Observações técnicas
`packages/shared/src/metrics.ts` — `effectiveStatus()` e `computeMetrics()`.
Alterar essas funções reescreve simultaneamente tela, snapshot diário, PDF e
exportação xlsx.

---

**Fase 2 — Bugs** · origem: abas `App Bugs and Fixes` (236 bugs),
`Web Bugs and Fixes` (59), `App Bug tracking` e `Web Bug tracking`.

## US-2.1 — Modelo de bugs

### Objetivo
Como QA lead, quero que bugs sejam uma entidade do sistema, para parar de manter
duas abas separadas por plataforma.

### Critérios de aceite
- [x] Modelo `Bug` com número, chave Jira, US relacionada, descrição,
      severidade, status, responsável, data de criação, data de correção, área
      afetada e notas.
- [x] Severidade validada: `Low, Medium, High, Critical, Highest`.
- [x] Status validado: `Open, In progress, Testing, Blocked, Resolved, Canceled`.
- [x] Área afetada é tabela, não enum fixo.
- [x] `platform` distingue App de Web; a listagem é única.

### Status
Concluída

### Dependências
US-1.1.

### Fora do escopo
Squad no bug — é a **US-7.2**.

### Observações técnicas
Modelos `Bug` e `AffectedArea` em `schema.prisma`. Unicidade por
`[platform, number]` e por `jiraKey`.

## US-2.2 — Importar os bugs da planilha

### Objetivo
Como QA lead, quero importar os bugs existentes, para não recomeçar o histórico
do zero.

### Critérios de aceite
- [x] Importa as duas abas mapeando coluna por título.
- [x] `Done` (App) e `Resolved` (Web) convergem para `Resolved`.
- [x] Responsáveis viram `Person` com papel `DEV`, reaproveitando os existentes.
- [x] Importação idempotente pela chave do Jira.
- [x] Relatório final com contagem e avisos.

### Status
Concluída — 286 bugs no banco.

### Dependências
US-2.1.

### Fora do escopo
Reconstruir o vínculo com os cenários a partir da coluna original — é a
**US-7.3**.

### Observações técnicas
Etapa 3 de `apps/api/src/import/run.ts`; mapa de colunas em `bug-columns.ts`.

## US-2.3 — Listagem de bugs com filtros

### Objetivo
Como QA, quero filtrar bugs por severidade, status, área e responsável, para
achar o que é meu sem rolar 236 linhas.

### Critérios de aceite
- [x] Filtros combináveis mais busca livre por descrição e chave Jira.
- [x] Ordenação por severidade, data de criação e lead time.
- [x] Contadores por status no topo, substituindo as abas de tracking.

### Status
Concluída

### Dependências
US-2.1, US-2.2.

### Fora do escopo
Paginação (**US-8.3**) e recorte por squad (**US-7.2**).

### Observações técnicas
`apps/api/src/routes/bugs.ts`; `apps/web/src/pages/BugsPage.tsx`, separada por
plataforma nas rotas `/bugs/web` e `/bugs/app`.

## US-2.4 — Lead time calculado

### Objetivo
Como QA lead, quero o lead time correto, para medir tempo de correção sem
`#NUM!` em toda linha aberta.

### Critérios de aceite
- [x] Bug fechado: dias entre criação e correção.
- [x] Bug aberto: dias corridos desde a criação, marcado como "em aberto".
- [x] Sem data de criação: campo vazio, nunca erro.
- [x] Bug cancelado não entra na conta.
- [x] Média de lead time por severidade exibida no topo da listagem.

### Status
Concluída

### Dependências
US-2.1.

### Fora do escopo
Tendência de lead time no tempo — o snapshot diário guarda apenas a contagem de
bugs abertos (ver US-3.2 e US-8.2).

### Observações técnicas
`packages/shared/src/bug-metrics.ts` — `computeBugLeadTime()`.

## US-2.5 — Vínculo bug ↔ cenário

### Objetivo
Como QA, quero ligar um bug ao cenário que o encontrou, para saber o que
retestar quando ele for corrigido.

### Critérios de aceite
- [x] Relação N:N entre `Bug` e `TestCase`.
- [x] Cenário com bug vinculado recebe indicador visual no ciclo.
- [x] Ao marcar o bug como `Resolved`, os cenários ligados são devolvidos como
      sugestão de reteste.
- [x] Substitui a coluna `Bugs` de texto livre.

### Status
Concluída — **a funcionalidade está inteira, mas há 0 vínculos no banco.**

### Dependências
US-2.1, US-1.3.

### Fora do escopo
Transformar a sugestão em estado acompanhável (**US-7.1**) e reconstruir os
vínculos perdidos na importação (**US-7.3**).

### Observações técnicas
`POST`/`DELETE /api/cases/:caseId/bugs`; tabela implícita `_BugToTestCase`. O
importador antigo apagava os vínculos a cada execução — por isso o acervo está
zerado, e as colunas "Bugs" e "Fixed" da exportação saem vazias.

## US-2.6 — Cadastro e edição de bug

### Objetivo
Como QA, quero abrir bug direto do cenário reprovado, para não trocar de
ferramenta no meio da execução.

### Critérios de aceite
- [x] Botão "Reportar bug" no cenário, já com plataforma e contexto preenchidos.
- [x] Formulário com as mesmas validações do backend.
- [x] Reprovar um cenário oferece a criação do bug.

### Status
Concluída

### Dependências
US-2.1, US-2.5.

### Fora do escopo
Anexar evidência ao bug no momento do registro — é a **US-6.4**.

### Observações técnicas
`apps/web/src/components/ReportBugDialog.tsx`; a oferta aparece em
`CaseDrawer.tsx` quando o cenário está `Failed` e ainda não tem bug vinculado.

---

**Fase 3 — Métricas e gráficos** · origem: abas `1. Summary`, `2. Progress`,
`3. Timeline`, `4. Final Report` e os 9 gráficos (pizza 3D e barras 3D).

## US-3.1 — Dashboard executivo

### Objetivo
Como QA lead, quero uma visão consolidada, para apresentar status à liderança
sem montar slide.

### Critérios de aceite
- [x] Cenários × automação por plataforma, squad e responsável.
- [x] Distribuição de status como barra proporcional com rótulo direto — não
      pizza, porque setores em perspectiva impedem comparar fatias próximas.
- [x] Bugs abertos por severidade.
- [x] Nenhum número digitado à mão; tudo derivado dos dados.

### Status
Concluída

### Dependências
US-1.5 (métricas), US-2.1 (bugs).

### Fora do escopo
Visão pessoal por pessoa logada — é a **US-8.1**.

### Observações técnicas
`GET /api/overview` (`routes/overview.ts`) alimenta a tela e também os
contadores do menu lateral; `apps/web/src/pages/OverviewPage.tsx`.

## US-3.2 — Evolução no tempo

### Objetivo
Como QA lead, quero ver a evolução, para mostrar tendência e não só a foto de
hoje.

### Critérios de aceite
- [x] Snapshot diário de cenários totais, executados, automatizados e bugs
      abertos.
- [x] Gráfico de linha com seletor de período (30/90 dias, tudo).
- [x] Um eixo só — duas medidas de escala diferente viram dois gráficos.

### Status
Concluída — 3 snapshots no banco (o sistema ainda não roda diariamente).

### Dependências
US-1.5.

### Fora do escopo
Recorte por squad e plataforma, que exige mudar o formato do snapshot — é a
**US-8.2**.

### Observações técnicas
Modelo `MetricSnapshot`, um registro por dia (meia-noite UTC) como chave de
idempotência. `ensureTodaySnapshot()` roda no boot e a cada leitura do
histórico, sem cron. O recorte de período é feito no front.
**Snapshots já gravados não são recalculados** se a regra de métrica mudar.

## US-3.3 — Cobertura de automação

### Objetivo
Como QA lead, quero saber onde a automação está atrasada, para priorizar o
backlog do time.

### Critérios de aceite
- [x] Ranking de ciclos por menor taxa de automação, ponderado por volume.
- [x] Corte por squad e plataforma.
- [x] Destaque para ciclos concluídos com 0% de automação.

### Status
Concluída

### Dependências
US-1.5.

### Fora do escopo
Meta de automação por squad e alerta automático.

### Observações técnicas
`GET /api/metrics/automation-coverage` — já devolve ordenado.

## US-3.4 — Relatório final exportável

### Objetivo
Como QA lead, quero exportar o relatório de um ciclo, para anexar na entrega da
release.

### Critérios de aceite
- [x] Seleção de período e escopo (plataforma, squad, ciclos específicos).
- [x] Exporta PDF e xlsx com métricas, lista de bugs e cenários reprovados.
- [x] Reproduz o conteúdo da aba `4. Final Report`.

### Status
Concluída — com a ressalva registrada na US-7.2.

### Dependências
US-1.5, US-2.1, US-2.5.

### Fora do escopo
Envio automático do relatório por e-mail ou Slack (não há integração).

### Observações técnicas
`routes/reports.ts`: `buildReportData()` alimenta `renderPdf()` (pdfkit) e
`renderXlsx()` (exceljs). O download é `<a href>` direto, sem JavaScript.
**Atenção:** o escopo por squad recorta os cenários, mas não os bugs
(**US-7.2**), e as colunas de bug saem zeradas por falta de vínculos
(**US-7.3**).

---

**Fase 4 — Massa de teste, evidências e exportação**

## US-4.1 — Massa de usuários de teste

### Objetivo
Como QA, quero consultar as contas de teste no sistema, para parar de abrir a
planilha durante a execução.

### Critérios de aceite
- [x] Modelo com e-mail, CPF, tipo (`PF`/`PJ`), ambiente (`QA`/`PRD`), status
      (`Ativo`/`Suspenso`/`Excluída`) e perfil.
- [x] Importa as abas `Users QA` e `Users PRD`.
- [x] Busca por e-mail e CPF (com ou sem máscara) e filtro por status, ambiente,
      tipo e perfil.
- [x] Botão de copiar credencial.

### Status
Concluída — 46 contas no banco.

### Dependências
US-1.1.

### Fora do escopo
Criar e editar conta de teste pela tela — a US pedia *consultar*. É a **US-6.6**.

### Observações técnicas
CPF guardado só com dígitos; zero à esquerda comido pelo Excel é restaurado
apenas quando fecha os dígitos verificadores (`packages/shared/src/test-users.ts`).
Identidade estável entre importações é `sourceSheet` + `sourceRow`, porque
e-mail e CPF se repetem na planilha.

## US-4.2 — Proteger as credenciais

### Objetivo
Como QA lead, quero que as senhas não fiquem em texto puro, para não repetir o
risco que a planilha já tem hoje.

### Critérios de aceite
- [x] Senha exibida só sob ação explícita, com registro de quem exibiu.
- [x] Campo cifrado em repouso.
- [x] Nunca aparece em listagem, log ou exportação.

### Status
Concluída — 46 de 46 senhas cifradas, nenhuma em texto puro.

### Dependências
US-4.1.

### Fora do escopo
Rotação de chave e cofre externo de segredos.

### Observações técnicas
AES-256-GCM em `lib/crypto.ts`, prefixo `enc:v1:`, chave em `apps/api/.env`
(fora do git e fora do banco de propósito). `ensureEncryptedCredentials()` cifra
no boot o que estiver em texto puro e roda `VACUUM`, porque o SQLite mantém a
página antiga legível. O registro em `CredentialAccess` é gravado **antes** de a
senha ser devolvida. A coluna `Senha` da exportação sai vazia.
**Perder a `CREDENTIALS_KEY` torna as senhas irrecuperáveis.**

## US-4.3 — Evidências

### Objetivo
Como QA, quero anexar evidência ao cenário, para não depender de link de Drive
que expira.

### Critérios de aceite
- [x] Upload de imagem e vídeo, ou link externo.
- [x] Miniatura na listagem e visualização no painel do cenário.
- [x] Preserva os links já importados da coluna `Evidence`.

### Status
Concluída — 264 evidências, todas do tipo `reference` vindas da importação;
nenhum arquivo enviado até hoje.

### Dependências
US-1.3.

### Fora do escopo
Evidência no bug — é a **US-6.4**. Histórico de anexar/remover — é a **US-7.4**.

### Observações técnicas
Arquivo em `data/evidence/` com nome gerado (`randomUUID`), limite de 50 MB,
nome original nunca entra no caminho. Foi nesta US que o importador parou de
apagar e recriar cenários. **Qualquer deploy precisa de volume persistente.**

## US-4.4 — Exportar para xlsx

### Objetivo
Como QA lead, quero exportar no formato da planilha, para atender quem ainda
depende dela.

### Critérios de aceite
- [x] Gera xlsx com a estrutura de abas original.
- [x] Aplica os `dataValidation` correspondentes nas colunas.
- [x] Exporta seleção filtrada ou base completa.

### Status
Concluída

### Dependências
US-1.2, US-2.1, US-4.1.

### Fora do escopo
Reimportar o arquivo exportado como fonte de verdade.

### Observações técnicas
`apps/api/src/export/xlsx.ts` — `buildWorkbook()`. Usa os mesmos filtros da tela
de Ciclos. As colunas "Bugs" e "Fixed" saem zeradas por falta de vínculos
(**US-7.3**).

## US-4.5 — Gestão de pessoas

### Objetivo
Como QA lead, quero administrar o time no sistema, para corrigir os nomes
divergentes que vieram da planilha.

### Critérios de aceite
- [x] CRUD de pessoas com papel `QA`/`DEV` e flag de ativo.
- [x] Mesclar duas pessoas duplicadas, reatribuindo ciclos, cenários e bugs.
- [x] Pessoa inativa some dos seletores mas continua no histórico.

### Status
Concluída — 27 pessoas no banco.

### Dependências
US-1.1.

### Fora do escopo
Convidar a pessoa para o sistema — conta de acesso é a **US-5.1**, e o convite
por link é a **US-8.4**.

### Observações técnicas
A mesclagem roda em transação e é irreversível; por isso `/api/people` exige
papel `admin` no gate. Seletor que **atribui** trabalho pede `{ active: 'true' }`;
seletor que **filtra** listagem consulta todo mundo.

---

**Fase 5 — Operação em time**

## US-5.1 — Autenticação

### Objetivo
Como QA lead, quero login, para saber quem alterou o quê.

### Critérios de aceite
- [x] Login por e-mail, com restrição opcional a domínio corporativo.
- [x] Papéis: leitura, execução (edita cenários/bugs) e administração.
- [x] Sessão persistente.

### Status
Concluída

### Dependências
Nenhuma.

### Fora do escopo
SSO (a US admitia "ou SSO, se disponível"), recuperação de senha pela própria
pessoa e convite por link (**US-8.4**).

### Observações técnicas
`scrypt` nativo; sessão em tabela (e não JWT sem estado) para poder ser
revogada; gate global em `lib/gate.ts` — rota nova nasce protegida. O primeiro
acesso cria um `admin` e a rota fecha sozinha depois disso.
`ALLOWED_EMAIL_DOMAINS` vazio aceita qualquer domínio.
**Pendência conhecida:** `POST /api/accounts` não marca `mustChangePassword`,
então a senha escolhida pelo admin para uma conta nova é permanente.

## US-5.2 — Histórico de alterações

### Objetivo
Como QA lead, quero ver o histórico de um cenário, para entender por que um
status mudou.

### Critérios de aceite
- [x] Registro de alteração com autor, data, campo, valor anterior e novo.
- [x] Linha do tempo no painel do cenário e do bug.
- [x] Retenção mínima de 12 meses.

### Status
Concluída — também cobre ciclo e conta de acesso.

### Dependências
US-5.1 (o autor precisa existir).

### Fora do escopo
Histórico de relações — evidência e vínculo de bug são a **US-7.4**.

### Observações técnicas
Uma linha por **campo**, não por requisição. Valores gravados já resolvidos em
texto, para continuar legíveis após renomear ou remover a pessoa. Retenção de 24
meses por padrão, com piso de 12 aplicado no código. Campo novo em entidade
auditada **precisa** entrar no mapa de `lib/changelog.ts`, ou a alteração passa
a acontecer sem rastro.

## US-5.3 — Postgres e deploy

### Objetivo
Como QA lead, quero o sistema num servidor, para o time acessar sem rodar nada
na própria máquina.

### Critérios de aceite
- [ ] Troca de SQLite para Postgres (só o `datasource` do Prisma muda).
- [ ] Migrations versionadas.
- [ ] Backup diário automatizado.
- [ ] Deploy com variáveis de ambiente, sem segredo em código.

### Status
Backlog — **é o gargalo do projeto**: hoje o sistema roda só na máquina de
desenvolvimento.

### Dependências
Nenhuma técnica. Bloqueia, na prática, US-8.1, US-8.2 e US-8.4, que só fazem
sentido com o time usando o sistema.

### Fora do escopo
Alta disponibilidade, réplica de leitura e pipeline de CI/CD completo.

### Observações técnicas
Levantadas na análise do código, todas vencem junto com esta US:
1. **Não há migrations** — `prisma db push` foi o que se usou até aqui; é
   preciso criar um baseline antes de migrar.
2. **`trustProxy` não está configurado** no Fastify: atrás de proxy reverso,
   `request.ip` vira o IP do proxy, o eixo por IP do freio de login (US-6.2)
   bloquearia todo mundo junto e a auditoria registraria o endereço errado.
3. **Buscas com `contains`** mudam de comportamento: o `LIKE` do SQLite é
   case-insensitive em ASCII, o do Postgres não é.
4. **Front e API precisam sair no mesmo host** — `lib/api.ts` usa
   `credentials: 'same-origin'` e a API não serve estáticos; revisar também o
   `cors: { origin: true, credentials: true }`.
5. **`data/evidence/` precisa de volume persistente** (US-4.3).
6. **Backup precisa cobrir a `CREDENTIALS_KEY`**, não só o banco: sem ela as
   senhas da massa de teste não voltam (US-4.2).
7. As rotinas de manutenção rodam **no boot**; num servidor que reinicia
   raramente, decidir se isso basta.

## US-5.4 — Integração com o Jira

### Objetivo
Como QA, quero que a chave do Jira puxe os dados da issue, para não digitar
título e status duas vezes.

### Critérios de aceite
- [ ] Ao informar a chave, busca título, status e responsável.
- [ ] Status do Jira exibido junto ao do ciclo, sem sobrescrever.
- [ ] Link direto para a issue.
- [ ] Falha de integração não bloqueia o cadastro.

### Status
Backlog

### Dependências
US-5.3 na prática (credencial de integração exige lugar seguro para segredo em
servidor).

### Fora do escopo
Escrever no Jira a partir do QA Hub (criar issue, mudar status).

### Observações técnicas
Hoje `jiraKey` é texto livre em ciclo, cenário e bug, sem nenhuma chamada
externa — **o sistema não tem integração de runtime com serviço nenhum**. Seria
a primeira: exige cliente HTTP, credencial em `.env`, tratamento de
indisponibilidade e cache.

---

**Fase 6 — Dívidas do que já está no ar** · lacunas do que foi entregue, não
funcionalidades novas. Narrativa completa em
[`backlog-melhorias.md`](backlog-melhorias.md).

## US-6.1 — Recuperar o acesso perdido

### Objetivo
Como QA lead, quero redefinir a senha de alguém, para que esquecer a senha não
signifique perder o acesso ao sistema.

### Critérios de aceite
- [x] Administrador redefine a senha de qualquer conta, gerando uma provisória
      de uso único.
- [x] Redefinição encerra as sessões abertas daquela conta.
- [x] Fica registrada no histórico: quem redefiniu e quando.

### Status
Concluída

### Dependências
US-5.1, US-5.2.

### Fora do escopo
Autoatendimento ("esqueci minha senha" por e-mail) e convite por link
(**US-8.4**) — ambos exigem envio de e-mail, que o sistema não tem.

### Observações técnicas
A provisória é gerada pelo sistema (alfabeto sem `0/O` e `1/l/I`), devolvida
**uma única vez** na resposta e nunca guardada em texto. `mustChangePassword`
trava a conta em tudo menos trocar a senha — é isso que a torna de uso único.
Redefinir também limpa as falhas de login acumuladas (US-6.2).

## US-6.2 — Frear tentativa em massa no login

### Objetivo
Como QA lead, quero limite de tentativas de entrada, para que a senha de alguém
não seja descoberta na força bruta.

### Critérios de aceite
- [x] Tentativas seguidas passam a ser atrasadas e depois bloqueadas.
- [x] Bloqueio temporário e com aviso claro, sem revelar se o e-mail existe.
- [x] Tentativas recusadas ficam registradas.

### Status
Concluída

### Dependências
US-5.1.

### Fora do escopo
CAPTCHA, bloqueio por faixa de rede e notificação ao dono da conta.

### Observações técnicas
Contagem em dois eixos (e-mail e IP), valendo o pior; atraso exponencial a
partir de 3 falhas (teto de 5 s), bloqueio de 15 min a partir de 8, janela de 15
min, retenção de 30 dias. Estado no banco (`LoginAttempt`), não em memória, para
sobreviver a restart. E-mail inexistente também é registrado, senão a própria
trava viraria o vazamento que o login evita.
**Depende de `trustProxy` para funcionar corretamente atrás de proxy (US-5.3).**

## US-6.3 — Reimportação que não desfaz edição manual

### Objetivo
Como QA, quero que a reimportação da planilha preserve o que eu corrigi no
sistema, para não ter que corrigir a mesma coisa toda vez.

### Critérios de aceite
- [ ] Campo editado no QA Hub depois da última importação não é sobrescrito.
- [ ] Divergência entre planilha e sistema aparece no relatório de importação.
- [ ] Quem importa decide, por campo, qual valor vale.

### Status
Backlog

### Dependências
US-1.2, US-5.2 (o histórico é o que diz quando um campo foi editado à mão).

### Fora do escopo
Importação pela interface web — hoje é comando de terminal, e continua sendo.

### Observações técnicas
Na US-4.3 o importador parou de apagar e recriar cenários, o que salvou
evidências e vínculos, mas ele ainda sobrescreve **valor de campo**. O
`ChangeLog` já registra quem alterou o quê e quando, e é a fonte natural para
decidir o que preservar.

## US-6.4 — Evidência no bug

### Objetivo
Como QA, quero anexar print e vídeo direto no bug, para que quem for corrigir
veja o defeito sem procurar o cenário que o encontrou.

### Critérios de aceite
- [ ] Mesmo upload e link externo que o cenário já tem.
- [ ] Miniatura na listagem de bugs e visualização no painel do bug.
- [ ] Reportar bug a partir de um cenário reprovado leva junto as evidências dele.

### Status
Backlog

### Dependências
US-4.3, US-2.6.

### Fora do escopo
Anexar evidência a um ciclo inteiro.

### Observações técnicas
`Evidence` hoje tem `caseId` obrigatório: será preciso torná-lo opcional e
acrescentar `bugId`, ou criar uma relação própria. As rotas de upload e link
(`routes/evidence.ts`) e o componente `EvidenceField` são reaproveitáveis quase
inteiros.

## US-6.5 — Destravar o tema escuro

### Objetivo
Como QA, quero que o sistema acompanhe o tema do meu computador, para não levar
um clarão no meio de um dia inteiro de execução.

### Critérios de aceite
- [ ] Segue o tema do sistema operacional por padrão.
- [ ] Alternador manual para quem quiser fixar claro ou escuro.
- [ ] Revisão de contraste da paleta escura nos gráficos e nas pills de status.

### Status
Backlog — **é o item de menor custo do backlog inteiro.**

### Dependências
Nenhuma.

### Fora do escopo
Temas personalizados ou por usuário no servidor (a preferência pode ficar no
navegador).

### Observações técnicas
A paleta escura já existe completa em `global.css`, inclusive
`@media (prefers-color-scheme: dark)` e `:root[data-theme='dark']`. Está travada
por `data-theme="light"` no `apps/web/index.html`. Atenção ao `LineChart`, que
desenha SVG com cores próprias, e às pills, cujo contraste foi ajustado para o
tema claro.

## US-6.6 — Massa de teste editável

### Objetivo
Como QA, quero cadastrar e editar conta de teste no sistema, para não ter que
voltar à planilha toda vez que crio uma.

### Critérios de aceite
- [ ] Criar, editar e desativar conta de teste pela tela.
- [ ] Senha cadastrada já entra cifrada, como as importadas.
- [ ] Conta criada à mão nunca é sobrescrita por reimportação.

### Status
Backlog

### Dependências
US-4.1, US-4.2.

### Fora do escopo
Gerar massa de teste automaticamente (CPF válido, e-mail descartável).

### Observações técnicas
`/api/test-users` só tem `GET` hoje. O schema `testUserInput` **já existe** em
`packages/shared/src/schemas.ts`, com `testUserUpdate` parcial, e `encrypt()`
já é idempotente. A regra de "criada à mão nunca é sobrescrita" já está no
modelo: `sourceSheet` e `sourceRow` nulos. Escrita exige papel `editor` pelo
gate; considerar se desativar conta de PRD deve exigir `admin`.

---

**Fase 7 — Fechar o ciclo de qualidade** · ligam as peças: bug ao cenário, bug
ao squad, e a correção de volta ao reteste.

## US-7.1 — Reteste como estado, não como aviso

### Objetivo
Como QA lead, quero acompanhar os retestes pendentes, para saber o que falta
validar antes de fechar a release.

### Critérios de aceite
- [ ] Marcar um bug como resolvido coloca os cenários ligados em "aguardando
      reteste".
- [ ] Lista de retestes pendentes, por ciclo e por responsável.
- [ ] Reteste concluído registra quem validou e quando.

### Status
Backlog

### Dependências
**US-7.3 é pré-requisito real:** sem vínculos bug ↔ cenário não há em que apoiar
o estado. Depende também de US-2.5 e US-5.2.

### Fora do escopo
Reteste automatizado ou disparo de suíte de automação.

### Observações técnicas
Hoje `PATCH /api/bugs/:id` devolve `retestSuggested` quando o bug passa a
`Resolved`, e a tela mostra um aviso que **some ao recarregar**. Virar estado
exige campo novo no cenário (ou tabela própria) e entrada no histórico. Já
existe o status `Retested` em `CASE_STATUS`.

## US-7.2 — Squad no bug

### Objetivo
Como QA lead, quero filtrar bugs por squad, para que o relatório de uma squad
fale só dos bugs dela.

### Critérios de aceite
- [ ] Campo squad no bug, herdado do cenário quando o bug nasce de uma
      reprovação.
- [ ] Recorte por squad passa a valer no relatório final e na exportação xlsx.
- [ ] Bugs importados sem squad ficam explicitamente "sem squad", não escondidos.

### Status
Backlog

### Dependências
US-2.1, US-3.4.

### Fora do escopo
Reatribuir squad em massa nos 286 bugs importados.

### Observações técnicas
Avisado na entrega da US-3.4: o relatório com escopo de squad recorta cenários,
mas não bugs — e quem lê o PDF não tem como perceber. O enum `SQUAD` já existe;
o campo entra em `Bug`, em `bugInput` e no mapa `BUG_FIELDS` do changelog.

## US-7.3 — Reconstruir os vínculos bug ↔ cenário

### Objetivo
Como QA lead, quero reconstruir a ligação entre bugs e cenários, para que as
colunas de bug do relatório parem de sair zeradas.

### Critérios de aceite
- [ ] Rotina que reconstrói os vínculos a partir das chaves do Jira da coluna
      original.
- [ ] Sugestão de vínculo provável, com confirmação humana — nunca ligação
      automática silenciosa.
- [ ] Relatório do que foi religado e do que não teve correspondência.

### Status
Backlog — **destrava relatório, exportação e US-7.1 de uma vez.**

### Dependências
US-2.5 (a relação existe e funciona).

### Fora do escopo
Recuperar vínculo que não deixou nenhum rastro na planilha.

### Observações técnicas
Hoje são **0 vínculos** em `_BugToTestCase`. O importador antigo os apagava a
cada execução, e o estrago já estava feito quando isso foi descoberto na US-4.3.
A matéria-prima é a coluna `Bugs` original dos cenários e o `jiraKey` dos bugs.
A confirmação humana é critério, não detalhe: ligação errada em massa é pior que
ausência de ligação.

## US-7.4 — Histórico também das relações

### Objetivo
Como QA lead, quero ver no histórico quando uma evidência ou um vínculo entrou e
saiu, para entender o cenário inteiro, não só os campos dele.

### Critérios de aceite
- [ ] Anexar e remover evidência entram na linha do tempo.
- [ ] Vincular e desvincular bug entram na linha do tempo.
- [ ] Mesma retenção e o mesmo formato do histórico de campos.

### Status
Backlog

### Dependências
US-5.2, US-4.3, US-2.5.

### Fora do escopo
Versionar o conteúdo do arquivo de evidência.

### Observações técnicas
`recordEvent()` já existe em `lib/changelog.ts` (criado na US-6.1) e cobre
exatamente o caso de "algo aconteceu e não há valor anterior" — é o gancho
natural. O componente `Timeline` já distingue `kind: 'event'` de
`kind: 'field'`.

---

**Fase 8 — Uso diário em time** · com login funcionando, o sistema passa a ser
usado por várias pessoas ao mesmo tempo.

## US-8.1 — O que é meu

### Objetivo
Como QA, quero abrir o sistema e ver o que é meu, para começar o dia sem filtrar
tudo na mão.

### Critérios de aceite
- [ ] Visão pessoal com meus ciclos, meus cenários pendentes e meus bugs em
      aberto.
- [ ] Usa o vínculo entre conta de acesso e pessoa do time, que já existe.
- [ ] É a tela inicial de quem tem perfil de execução.

### Status
Backlog

### Dependências
US-5.1, US-4.5.

### Fora do escopo
Notificação e resumo por e-mail.

### Observações técnicas
`Account.personId` já existe e `Viewer` já o carrega. Os filtros por
`responsibleId` já existem em ciclos, cenários e bugs — a US é mais de
composição de tela que de backend. Atenção: conta sem `personId` precisa de um
estado vazio honesto.

## US-8.2 — Tendência por squad e plataforma

### Objetivo
Como QA lead, quero a evolução no tempo recortada por squad, para mostrar a cada
squad a curva dela, e não a média de todas.

### Critérios de aceite
- [ ] Snapshot diário passa a guardar também o recorte por squad e plataforma.
- [ ] Seletor de recorte no gráfico de evolução.
- [ ] Snapshots antigos continuam válidos como total, sem reescrita de histórico.

### Status
Backlog

### Dependências
US-3.2.

### Fora do escopo
Recalcular retroativamente os snapshots já gravados — o critério proíbe
explicitamente reescrever histórico.

### Observações técnicas
`MetricSnapshot` hoje tem `date` como `@unique`, um registro por dia, global.
Guardar recorte exige mudar a chave de idempotência (por exemplo
`[date, squad, platform]`), mantendo as linhas antigas legíveis como total.

## US-8.3 — Paginação e busca global

### Objetivo
Como QA, quero encontrar um cenário sem saber em qual ciclo ele está, para parar
de abrir ciclo por ciclo procurando.

### Critérios de aceite
- [ ] Busca única que atravessa ciclos, cenários e bugs.
- [ ] Listagens longas paginadas, em vez de renderizadas inteiras.
- [ ] Atalho de teclado para abrir a busca.

### Status
Backlog

### Dependências
US-1.4 (a busca de cenários já existe na API).

### Fora do escopo
Busca com relevância, correção ortográfica ou índice de texto completo.

### Observações técnicas
`GET /api/cases` **já implementa** a busca global, com `limit` de 100 (máx. 500),
e nenhuma tela a consome. `/api/suites`, `/api/bugs` e `/api/test-users` não têm
paginação nenhuma: devolvem tudo, e as telas renderizam tudo. Aguenta o acervo
atual (1.600 cenários, 286 bugs); o dobro provavelmente não.

## US-8.4 — Convite por link, não senha provisória

### Objetivo
Como QA lead, quero convidar alguém por link, para não ter que escolher e enviar
a senha dessa pessoa por fora do sistema.

### Critérios de aceite
- [ ] Criar conta gera um link de convite de uso único e com validade.
- [ ] Quem recebe define a própria senha; ninguém mais a conhece.
- [ ] Convite pendente e expirado visíveis na tela de contas.

### Status
Backlog

### Dependências
US-5.1, US-6.1 (o mecanismo de `mustChangePassword` e a geração de segredo de
uso único já existem e são a base).

### Fora do escopo
Envio automático do e-mail de convite, enquanto não houver integração de e-mail
— o link pode ser copiado e entregue pelo canal que o time já usa.

### Observações técnicas
É uma ironia do próprio sistema: a US-4.2 tirou senha em texto puro da planilha
porque ela circulava por e-mail, e a US-5.1 criou um fluxo em que o
administrador digita a senha de alguém e a envia por algum canal.
**Correção parcial de custo quase zero enquanto esta US não vem:** fazer
`POST /api/accounts` marcar `mustChangePassword`, como o reset-password já faz.

---

## Como manter este arquivo

- Ao concluir uma US: marque os critérios, mude o **Status** para `Concluída`,
  atualize a linha do índice e registre em
  [`estado-atual.md`](estado-atual.md).
- Ao começar: mude para `Em desenvolvimento`; ao terminar o código e antes de
  aceitar, `Em validação`.
- US nova entra na fase a que pertence, com o próximo número livre. Se ela
  nasceu de uma lacuna do que já está no ar, marque-a como **dívida** no texto,
  como fazem as US-6 e US-7.
- Os IDs **não devem ser renumerados**: os commits (`US-6.2: freio de força
  bruta no login`) e as issues criadas por `scripts/backlog-para-github.sh`
  referenciam esses números.
