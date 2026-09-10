# Backlog — Fases 2 a 5

Cada US é fechada em si: dá para implementar, testar e parar ali sem deixar o
sistema quebrado. A ordem dentro da fase é a sugerida.

Legenda de tamanho: **P** ≈ meio dia · **M** ≈ 1–2 dias · **G** ≈ 3–5 dias

---

## Fase 2 — Bugs

Origem: abas `App Bugs and Fixes` (236 bugs), `Web Bugs and Fixes` (59),
`App Bug tracking` e `Web Bug tracking`.

### US-2.1 — Modelo de bugs · M
**Como** QA lead, **quero** que bugs sejam uma entidade do sistema **para** parar
de manter duas abas separadas por plataforma.

Critérios:
- Modelo `Bug` com: número, chave Jira, US relacionada, descrição, severidade,
  status, responsável, data de criação, data de correção, área afetada, notas.
- Severidade validada: `Low, Medium, High, Critical, Highest`.
- Status validado: `Open, In progress, Testing, Blocked, Resolved, Canceled`
  (união das variantes App `Done` e Web `Resolved`).
- Área afetada vira tabela, não enum fixo — a planilha tinha 25 valores no App e
  10 no Web, com sobreposição parcial.
- `platform` distingue App de Web; a listagem é única.

### US-2.2 — Importar os bugs da planilha · M
**Como** QA lead, **quero** importar os 295 bugs existentes **para** não recomeçar
o histórico do zero.

Critérios:
- Importa as duas abas mapeando coluna por título, como no importador de cenários.
- `Done` (App) e `Resolved` (Web) convergem para `Resolved`.
- Responsáveis viram registros em `Person` com papel `DEV`, reaproveitando os já
  existentes.
- Importação idempotente pela chave do Jira.
- Relatório final com contagem e avisos.

### US-2.3 — Listagem com filtros · M
**Como** QA, **quero** filtrar bugs por severidade, status, área e responsável
**para** achar o que é meu sem rolar 236 linhas.

Critérios:
- Filtros combináveis + busca livre por descrição e chave Jira.
- Ordenação por severidade, data de criação e lead time.
- Contadores por status no topo (substitui as abas de tracking com `COUNTIF`).

### US-2.4 — Lead time calculado · P
**Como** QA lead, **quero** o lead time correto **para** medir tempo de correção
sem `#NUM!` em toda linha aberta.

Critérios:
- Bug fechado: dias entre criação e correção.
- Bug aberto: dias corridos desde a criação, marcado como "em aberto".
- Sem data de criação: campo vazio, nunca erro.
- Média de lead time por severidade exibida no topo da listagem.

### US-2.5 — Vínculo bug ↔ cenário · M
**Como** QA, **quero** ligar um bug ao cenário que o encontrou **para** saber o
que retestar quando ele for corrigido.

Critérios:
- Relação N:N entre `Bug` e `TestCase`.
- Na suíte, cenário com bug aberto recebe indicador visual.
- Ao marcar o bug como `Resolved`, os cenários ligados são sugeridos para reteste.
- Substitui a coluna `Bugs` de texto livre, preservando o conteúdo atual.

### US-2.6 — Cadastro e edição de bug · M
**Como** QA, **quero** abrir bug direto do cenário reprovado **para** não trocar
de ferramenta no meio da execução.

Critérios:
- Botão "Reportar bug" no cenário, já preenchendo suíte, cenário e responsável.
- Formulário com as mesmas validações do backend.
- Reprovar um cenário oferece a criação do bug.

---

## Fase 3 — Métricas e gráficos

Origem: abas `1. Summary`, `2. Progress`, `3. Timeline`, `4. Final Report` e os
9 gráficos (pizza 3D e barras 3D).

### US-3.1 — Dashboard executivo · G
**Como** QA lead, **quero** uma visão consolidada **para** apresentar status à
liderança sem montar slide.

Critérios:
- Cenários × automação por plataforma, squad e responsável.
- Distribuição de status como barra proporcional com rótulo direto — não pizza:
  setores em perspectiva impedem comparar fatias próximas.
- Bugs abertos por severidade.
- Nenhum número digitado à mão; tudo derivado dos dados.

### US-3.2 — Evolução no tempo · G
**Como** QA lead, **quero** ver a evolução semanal **para** mostrar tendência, e
não só a foto de hoje.

Critérios:
- Snapshot diário de cenários executados, automatizados e bugs abertos.
- Gráfico de linha com seletor de período (30/90 dias, tudo).
- Um eixo só — duas medidas de escala diferente viram dois gráficos.
- Exige tabela de histórico; começar a coletar já na Fase 2 acelera esta US.

### US-3.3 — Cobertura de automação · M
**Como** QA lead, **quero** saber onde a automação está atrasada **para** priorizar
o backlog do time.

Critérios:
- Ranking de suítes por menor taxa de automação, ponderado por volume.
- Corte por squad e plataforma.
- Destaque para suítes concluídas com 0% de automação.

### US-3.4 — Relatório final exportável · M
**Como** QA lead, **quero** exportar o relatório de um ciclo **para** anexar na
entrega da release.

Critérios:
- Seleção de período e escopo (squad, plataforma, suítes).
- Exporta PDF e xlsx com métricas, lista de bugs e cenários reprovados.
- Reproduz o conteúdo da aba `4. Final Report`.

---

## Fase 4 — Massa de teste, evidências e exportação

### US-4.1 — Massa de usuários de teste · M
**Como** QA, **quero** consultar as contas de teste no sistema **para** parar de
abrir a planilha durante a execução.

Critérios:
- Modelo com e-mail, CPF, tipo (`PF`/`PJ`), ambiente (`QA`/`PRD`), status
  (`Ativo`/`Suspenso`/`Excluída`) e perfil (ex.: `Não Sócio`).
- Importa as abas `Users QA` e `Users PRD`.
- Busca por e-mail, CPF e filtro por status e ambiente.
- Botão de copiar credencial.

### US-4.2 — Proteger as credenciais · M
**Como** QA lead, **quero** que as senhas não fiquem em texto puro **para** não
repetir o risco que a planilha já tem hoje.

Critérios:
- Senha exibida só sob ação explícita ("mostrar"), com registro de quem exibiu.
- Campo cifrado em repouso.
- Nunca aparece em listagem, log ou exportação.

> A planilha atual guarda senhas em texto puro e circula por e-mail. Vale tratar
> isso antes da Fase 4 se a massa de PRD tiver conta real.

### US-4.3 — Evidências · M
**Como** QA, **quero** anexar evidência ao cenário **para** não depender de link
de Drive que expira.

Critérios:
- Upload de imagem e vídeo, ou link externo.
- Miniatura na listagem, visualização no painel do cenário.
- Preserva os links já importados da coluna `Evidence`.

### US-4.4 — Exportar para xlsx · M
**Como** QA lead, **quero** exportar no formato da planilha **para** atender quem
ainda depende dela.

Critérios:
- Gera xlsx com a estrutura de abas original.
- Aplica os `dataValidation` correspondentes nas colunas.
- Exporta seleção filtrada ou base completa.

### US-4.5 — Gestão de pessoas · P
**Como** QA lead, **quero** administrar o time no sistema **para** corrigir os
nomes divergentes que vieram da planilha.

Critérios:
- CRUD de pessoas com papel `QA`/`DEV` e flag de ativo.
- Mesclar duas pessoas duplicadas, reatribuindo suítes, cenários e bugs.
- Pessoa inativa some dos seletores mas continua no histórico.

---

## Fase 5 — Operação em time

### US-5.1 — Autenticação · G
**Como** QA lead, **quero** login **para** saber quem alterou o quê.

Critérios:
- Login por e-mail corporativo (ou SSO, se disponível).
- Papéis: leitura, execução (edita cenários/bugs) e administração.
- Sessão persistente.

### US-5.2 — Histórico de alterações · M
**Como** QA lead, **quero** ver o histórico de um cenário **para** entender por que
um status mudou.

Critérios:
- Registro de alteração com autor, data, campo, valor anterior e novo.
- Linha do tempo no painel do cenário e do bug.
- Retenção mínima de 12 meses.

### US-5.3 — Postgres e deploy · M
**Como** QA lead, **quero** o sistema num servidor **para** o time acessar sem
rodar nada na própria máquina.

Critérios:
- Troca de SQLite para Postgres (só o `datasource` do Prisma muda).
- Migrations versionadas.
- Backup diário automatizado.
- Deploy com variáveis de ambiente, sem segredo em código.

### US-5.4 — Integração com o Jira · G
**Como** QA, **quero** que a chave do Jira puxe os dados da issue **para** não
digitar título e status duas vezes.

Critérios:
- Ao informar a chave, busca título, status e responsável.
- Status do Jira exibido junto ao da suíte, sem sobrescrever.
- Link direto para a issue.
- Falha de integração não bloqueia o cadastro.
