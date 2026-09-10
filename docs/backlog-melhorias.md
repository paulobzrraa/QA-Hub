# Backlog de melhorias — QA Hub

Catorze itens tirados do que o sistema já é hoje. Cada um nasceu de uma lacuna
que apareceu construindo as Fases 1 a 5. Os marcados como **dívida** existem por
decisão tomada no caminho, não por evolução natural.

Estado do acervo quando este backlog foi escrito: 90 ciclos, 1.568 cenários,
286 bugs, 46 contas de teste, 264 evidências e **0 vínculos bug ↔ cenário**.

Não estão repetidas aqui as US-5.3 (Postgres e deploy) e US-5.4 (Jira), que
seguem valendo no [backlog original](backlog.md) e vêm antes de tudo desta lista.

---

## Dívidas do que já está no ar

Lacunas do que foi entregue, não funcionalidades novas. São as primeiras porque
cada uma deixa alguém sem saída ou desfaz trabalho já feito.

### US-6.1 — Recuperar o acesso perdido · P · dívida
**Como** QA lead, **quero** redefinir a senha de alguém **para** que esquecer a
senha não signifique perder o acesso ao sistema.

- Administrador redefine a senha de qualquer conta, gerando uma provisória de uso único.
- Redefinição encerra as sessões abertas daquela conta.
- Fica registrada no histórico: quem redefiniu e quando.

> A US-5.1 criou o login mas não a volta. Hoje uma senha esquecida só se resolve
> mexendo no banco — inclusive a do administrador.

### US-6.2 — Frear tentativa em massa no login · P · dívida
**Como** QA lead, **quero** limite de tentativas de entrada **para** que a senha
de alguém não seja descoberta na força bruta.

- Tentativas seguidas de um mesmo endereço passam a ser atrasadas e depois bloqueadas.
- Bloqueio temporário e com aviso claro, sem revelar se o e-mail existe.
- Tentativas recusadas ficam registradas.

> O login não distingue e-mail inexistente de senha errada e gasta o mesmo tempo
> nos dois — o que já era proposital. Mas nada impede tentar dez mil vezes.

### US-6.3 — Reimportação que não desfaz edição manual · M · dívida
**Como** QA, **quero** que a reimportação da planilha preserve o que eu corrigi
no sistema **para** não ter que corrigir a mesma coisa toda vez.

- Campo editado no QA Hub depois da última importação não é sobrescrito.
- Divergência entre planilha e sistema aparece no relatório de importação.
- Quem importa decide, por campo, qual valor vale.

> Na US-4.3 o importador parou de apagar e recriar os cenários, o que salvou
> evidências e vínculos. Mas ele ainda sobrescreve *valor de campo*: corrigir um
> título no sistema e reimportar devolve o título antigo.

### US-6.4 — Evidência no bug · M
**Como** QA, **quero** anexar print e vídeo direto no bug **para** que quem for
corrigir veja o defeito sem procurar o cenário que o encontrou.

- Mesmo upload e link externo que o cenário já tem.
- Miniatura na listagem de bugs e visualização no painel do bug.
- Reportar bug a partir de um cenário reprovado leva junto as evidências dele.

> A US-4.3 pendurou evidência só em cenário, e é no bug que o print faz mais
> falta — é o que o desenvolvedor abre primeiro.

### US-6.5 — Destravar o tema escuro · P
**Como** QA, **quero** que o sistema acompanhe o tema do meu computador **para**
não levar um clarão no meio de um dia inteiro de execução.

- Segue o tema do sistema operacional por padrão.
- Alternador manual para quem quiser fixar claro ou escuro.
- Revisão de contraste da paleta escura nos gráficos e nas pills de status.

> A paleta escura inteira já existe nos tokens desde a Fase 1 — está apenas
> travada por um `data-theme="light"` no HTML. É o item de menor custo.

### US-6.6 — Massa de teste editável · M
**Como** QA, **quero** cadastrar e editar conta de teste no sistema **para** não
ter que voltar à planilha toda vez que crio uma.

- Criar, editar e desativar conta de teste pela tela.
- Senha cadastrada já entra cifrada, como as importadas.
- Conta criada à mão nunca é sobrescrita por reimportação.

> A US-4.1 pedia *consultar*, e foi o que foi entregue. Na prática, conta nova
> ainda nasce na planilha — o que mantém viva a dependência que o QA Hub veio
> eliminar.

---

## Fechar o ciclo de qualidade

O sistema registra bem cada peça isolada. Estes itens ligam as peças: bug ao
cenário, bug ao squad, e a correção de volta ao reteste.

### US-7.1 — Reteste como estado, não como aviso · M
**Como** QA lead, **quero** acompanhar os retestes pendentes **para** saber o que
falta validar antes de fechar a release.

- Marcar um bug como resolvido coloca os cenários ligados em "aguardando reteste".
- Lista de retestes pendentes, por ciclo e por responsável.
- Reteste concluído registra quem validou e quando.

> A US-2.5 já sugere os cenários a retestar — mas a sugestão é um aviso que some
> ao recarregar a página. Nada garante que o reteste aconteceu.

### US-7.2 — Squad no bug · M · dívida
**Como** QA lead, **quero** filtrar bugs por squad **para** que o relatório de
uma squad fale só dos bugs dela.

- Campo squad no bug, herdado do cenário quando o bug nasce de uma reprovação.
- Recorte por squad passa a valer no relatório final e na exportação xlsx.
- Bugs importados sem squad ficam explicitamente "sem squad", não escondidos.

> Avisado na entrega da US-3.4: o relatório com escopo de squad recorta os
> cenários mas não os bugs — e quem lê não tem como saber disso olhando o PDF.

### US-7.3 — Reconstruir os vínculos bug ↔ cenário · M · dívida
**Como** QA lead, **quero** reconstruir a ligação entre bugs e cenários **para**
que as colunas de bug do relatório parem de sair zeradas.

- Rotina que reconstrói os vínculos a partir das chaves do Jira da coluna original.
- Sugestão de vínculo provável, com confirmação humana — nunca ligação automática silenciosa.
- Relatório do que foi religado e do que não teve correspondência.

> Hoje são **zero** vínculos. O importador antigo os apagava a cada execução, e o
> estrago já estava feito quando isso foi descoberto na US-4.3. Sem eles, as
> colunas "Bugs" e "Fixed" da exportação saem zeradas e a US-7.1 não tem em que
> se apoiar.

### US-7.4 — Histórico também das relações · P
**Como** QA lead, **quero** ver no histórico quando uma evidência ou um vínculo
entrou e saiu **para** entender o cenário inteiro, não só os campos dele.

- Anexar e remover evidência entram na linha do tempo.
- Vincular e desvincular bug entram na linha do tempo.
- Mesma retenção e o mesmo formato do histórico de campos.

> A US-5.2 cobre alteração de campo. Remover a evidência de um cenário reprovado
> é exatamente o tipo de coisa que alguém vai querer explicar depois — e hoje não
> deixa rastro.

---

## Uso diário em time

Até aqui o sistema foi construído para um acervo. Com login funcionando, ele
passa a ser usado por várias pessoas ao mesmo tempo — e isso muda o que falta.

### US-8.1 — O que é meu · P
**Como** QA, **quero** abrir o sistema e ver o que é meu **para** começar o dia
sem filtrar tudo na mão.

- Visão pessoal com meus ciclos, meus cenários pendentes e meus bugs em aberto.
- Usa o vínculo entre conta de acesso e pessoa do time, que já existe.
- É a tela inicial de quem tem perfil de execução.

> Desde a US-5.1 o sistema sabe quem está logado, mas ainda mostra a todo mundo
> exatamente a mesma coisa.

### US-8.2 — Tendência por squad e plataforma · M
**Como** QA lead, **quero** a evolução no tempo recortada por squad **para**
mostrar a cada squad a curva dela, e não a média de todas.

- Snapshot diário passa a guardar também o recorte por squad e plataforma.
- Seletor de recorte no gráfico de evolução.
- Snapshots antigos continuam válidos como total, sem reescrita de histórico.

> O snapshot da US-3.2 é global. Uma squad que melhorou muito e outra que piorou
> aparecem como uma linha reta — a leitura mais enganosa possível.

### US-8.3 — Paginação e busca global · M
**Como** QA, **quero** encontrar um cenário sem saber em qual ciclo ele está
**para** parar de abrir ciclo por ciclo procurando.

- Busca única que atravessa ciclos, cenários e bugs.
- Listagens longas paginadas, em vez de renderizadas inteiras.
- Atalho de teclado para abrir a busca.

> A busca global já existe na API desde a Fase 1 e nenhuma tela a usa. E as
> listagens hoje renderizam tudo — 1.568 cenários e 286 bugs aguentam, o dobro
> provavelmente não.

### US-8.4 — Convite por link, não senha provisória · P · dívida
**Como** QA lead, **quero** convidar alguém por link **para** não ter que
escolher e enviar a senha dessa pessoa por fora do sistema.

- Criar conta gera um link de convite de uso único e com validade.
- Quem recebe define a própria senha; ninguém mais a conhece.
- Convite pendente e expirado visíveis na tela de contas.

> É uma ironia do próprio sistema: a US-4.2 tirou senha em texto puro da planilha
> porque ela circulava por e-mail, e a US-5.1 criou um fluxo em que o
> administrador digita a senha de alguém e a envia por algum canal. Mesmo hábito,
> outro lugar.

---

## Se for pegar só três

**US-6.1** (ninguém pode ficar trancado para fora), **US-7.3** (destrava
relatório, exportação e reteste) e **US-6.5** (custa quase nada e o time percebe
no primeiro dia).
