# Decisões técnicas do QA Hub

Registro das decisões estruturais já tomadas e do porquê de cada uma. Serve para
que uma sessão nova **não reabra** o que já foi decidido, e para que uma decisão
nova fique registrada onde a próxima pessoa vá procurar.

Todas as decisões abaixo foram **verificadas no código** em 11/09/2026 (commit
`95dd2cf`) e estão justificadas em comentário no arquivo indicado.

**Como usar:** ao tomar uma decisão técnica relevante durante uma
implementação, acrescente uma entrada em "Decisões registradas por US", no
formato descrito no final. Decisão relevante é a que alguém perguntaria "por que
foi feito assim?" seis meses depois: escolha de dependência, formato de dado,
troca de mecanismo, limite arbitrário, abandono de uma alternativa óbvia.
Detalhe de implementação que o código já explica sozinho **não** entra aqui.

---

## Decisões estruturais

| Decisão | Onde | Por quê |
|---|---|---|
| Domínio compartilhado em `@qahub/shared` | `packages/shared` | Front e back validam e calculam com o mesmo código; o front nunca declara lista própria |
| Enums como `String` no Prisma | `schema.prisma` | SQLite não suporta enum; quem valida é o Zod na borda |
| SQLite com troca prevista para Postgres | `schema.prisma` | Ferramenta local primeiro; só o `datasource` muda (US-5.3) |
| Autorização num hook global | `lib/gate.ts` | Rota nova nasce protegida; proteger rota a rota deixa o esquecimento silencioso |
| Sessão em tabela, não JWT sem estado | `lib/auth.ts`, `Session` | Permite revogar na hora ao trocar senha ou desativar conta |
| `scrypt` nativo do Node | `lib/auth.ts` | KDF cara, sem dependência externa; hash de mão única |
| AES-256-GCM com chave em `.env` | `lib/crypto.ts` | Cifragem reversível é requisito da massa de teste; chave fora do banco para que uma cópia do `.db` não baste |
| `Person` separada de `Account` | `schema.prisma` | Diretório do time ≠ quem loga; o vínculo é opcional |
| Histórico com valores resolvidos em texto | `lib/changelog.ts` | Auditoria precisa continuar legível após renomear ou remover a pessoa |
| Uma linha de histórico por campo | `lib/changelog.ts` | A pergunta do time é "por que este status mudou", não "o que aconteceu naquele save" |
| Rotinas idempotentes no boot, sem cron | `server.ts` | Ferramenta local não tem agendador; o pior caso é "uma leitura atrasado", nunca "não existe" |
| `effectiveStatus` consolidando QA + Stage | `metrics.ts` | O time não preenche os dois ambientes; reprovação prevalece porque é o que exige ação |
| Taxas limitadas a 100%, divisão por zero = 0 | `metrics.ts` | Elimina `#DIV/0!` e progresso de 140% da planilha |
| Idempotência por `sourceSheet` | `schema.prisma`, `import/run.ts` | Reimportar não duplica, e o que nasceu no sistema nunca é tocado |
| Sem biblioteca de UI | `styles/global.css` | CSS com tokens próprios (vocabulário Untitled UI); densidade para quem lê tabelas o dia todo |
| Gráficos em SVG próprio | `components/LineChart.tsx` | Barras proporcionais em vez de pizza 3D, que impede comparar fatias próximas |

## Decisões registradas por US

Nenhuma entrada ainda — este registro começou em 11/09/2026, depois da US-6.2.
As decisões das US anteriores estão consolidadas na tabela acima.

<!-- Modelo para novas entradas:

## US-X.Y — Título da decisão

**Decisão:** o que foi decidido, em uma frase.
**Alternativas consideradas:** o que foi descartado e por quê.
**Consequência:** o que essa escolha obriga ou impede daqui para frente.
**Onde:** arquivos afetados.
**Data:** dd/mm/aaaa.

-->

---

## Relação com os outros documentos

- **Este arquivo** responde "por que foi feito assim?".
- [`arquitetura.md`](arquitetura.md) responde "como funciona hoje?".
- [`estado-atual.md`](estado-atual.md) responde "em que pé está?".
- [`backlog.md`](backlog.md) responde "o que falta?".
- [`../CLAUDE.md`](../CLAUDE.md) responde "como trabalhar aqui?".
