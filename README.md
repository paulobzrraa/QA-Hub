# QA Hub

Sistema web que substitui a planilha **"Gerenciamento de Testes - Swift.xlsx"** na
gestão de cenários de teste, bugs e métricas do time de QA.

## Status

Fases 1 a 4 concluídas, mais as US-5.1 e 5.2 da Fase 5:

| Fase | Entrega |
|---|---|
| 1 | Cenários de teste — importação, CRUD, filtros e métricas |
| 2 | Bugs — modelo, importação, lead time e vínculo com o cenário |
| 3 | Métricas — panorama, evolução no tempo, cobertura e relatório exportável |
| 4 | Massa de teste com credenciais cifradas, evidências, exportação xlsx e gestão de pessoas |
| 5 | Autenticação com papéis e histórico de alterações (faltam Postgres/deploy e Jira) |

O que ainda não foi feito está em [`docs/backlog.md`](docs/backlog.md), e as
melhorias propostas sobre o que já existe em
[`docs/backlog-melhorias.md`](docs/backlog-melhorias.md) — que
`scripts/backlog-para-github.sh` transforma em issues e num GitHub Project.

## Stack

| Camada | Tecnologia |
|---|---|
| Front | React 18 + Vite + TypeScript + TanStack Query |
| API | Fastify 5 + Prisma 5 |
| Banco | SQLite (troca para Postgres alterando só o `datasource` do Prisma) |
| Regras | Zod, compartilhado entre front e back via `@qahub/shared` |
| Acesso | Sessão em cookie httpOnly, senha com scrypt (sem dependência externa) |

## Rodando

```bash
npm install
cp apps/api/.env.example apps/api/.env   # configura o banco e a política de e-mail
npm run db:push                          # cria o banco em data/qahub.db
npm run import                           # importa a planilha de ~/Downloads
npm run dev                              # API em :3333, front em :5173
```

Na primeira vez que abrir `http://localhost:5173`, a tela pede a criação do
**primeiro acesso** — essa conta nasce como administradora e, a partir dela, as
demais são criadas em *Contas de acesso*.

Para importar outra planilha:

```bash
npm run import -- "/caminho/para/planilha.xlsx"
```

A importação é **idempotente**: cada suíte é identificada pela aba de origem
(`sourceSheet`), então rodar de novo depois de atualizar o xlsx substitui os
cenários daquela aba sem duplicar nada. Suítes criadas dentro do sistema nunca
são tocadas pelo importador.

## Estrutura

```
packages/shared/     regras de domínio compartilhadas
  domain.ts          enums extraídos dos dataValidation da planilha
  normalize.ts       normalização de valores legados do Excel
  schemas.ts         validação Zod (usada na API e no front)
  metrics.ts         cálculo de métricas
apps/api/
  prisma/schema.prisma
  src/routes/        ciclos, cenários, bugs, evidências, massa de teste,
                     métricas, relatórios, exportação, contas e histórico
  src/lib/           autenticação, gate de acesso, cifragem e histórico
  src/import/        leitor do xlsx
  src/export/        gerador do xlsx no formato da planilha original
apps/web/
  src/pages/         Visão Geral, Ciclos, Bugs, Métricas, Massa de teste,
                     Pessoas e Contas de acesso
  src/components/    primitivas de UI, painéis e formulários
```

## Segredos

Nada sensível fica no repositório. O `.gitignore` exclui `apps/api/.env` e a
pasta `data/` inteira — banco e evidências enviadas.

A chave `CREDENTIALS_KEY` cifra as senhas da massa de teste (AES-256-GCM) e é
gerada sozinha na primeira execução, gravada no `.env`. **Perder essa chave
torna as senhas irrecuperáveis** — ela não fica no banco de propósito, para que
uma cópia solta do `qahub.db` não baste para lê-las.

## As regras das células

Todos os dropdowns vêm dos `dataValidation` da planilha. A planilha tinha
variações entre abas (`Choose` vs `Backlog`, `Done` vs `Resolved`,
`Murilo` vs `Murillo`); o sistema consolida na união dos valores e converte os
antigos na importação — ver `normalize.ts`.

O front nunca declara listas próprias: ele consome `/api/meta`, que expõe
exatamente os mesmos enums usados na validação do backend. Um valor inválido
recebe **HTTP 422** com o campo e o motivo.

## Diferenças em relação à planilha

| Planilha | QA Hub |
|---|---|
| `#DIV/0!` em suíte sem cenários | taxa 0% |
| `#NUM!` no lead time de bug aberto | campo vazio até haver data de correção |
| Progresso de automação de 140% | taxas limitadas a 100% |
| Totais digitados à mão | métricas calculadas dos cenários reais |
| Status só na coluna `QA` | consolida `QA` + `Stage` (ver `effectiveStatus`) |
| Nome de aba truncado em 31 caracteres | nome completo, sem limite |

### Sobre `QA` e `Stage`

São dois ambientes, e o time nem sempre preenche os dois — é comum o cenário
ficar `Choose` em QA e `Approved` em Stage. Por isso a métrica considera os dois:
qualquer reprovação ou bloqueio prevalece sobre uma aprovação no outro ambiente,
porque é o que exige ação. A regra está em `packages/shared/src/metrics.ts`.
