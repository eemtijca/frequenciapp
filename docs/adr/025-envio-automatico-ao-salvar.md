# ADR-025: Envio automático da chamada à planilha ao salvar

## Estado

Aceita.

## Contexto

Levar o dia à planilha exigia prévia e envio manuais, que a coordenação esquecia ou adiava. Ao mesmo tempo, o envio manual existe para que uma pessoa revise o que será gravado, e a chamada é da turma atual enquanto a planilha consolida por turma original.

## Decisão

- Uma chave `envio_automatico` na integração de frequência, desligada por padrão, controla o envio ao salvar. Só a administração a liga.
- Depois de confirmar o salvamento, a rota agenda o envio com `after()`. O envio nunca atrasa nem derruba o salvamento.
- O envio considera as turmas originais dos alunos da lista daquela chamada e usa a mesma montagem de plano e o mesmo hash do envio manual, para um único dia.
- Sem revisão humana, o plano precisa caber no modo conservador: preencher célula vazia, criar a coluna do dia e vincular aluno. Qualquer outra operação, linha de aluno novo ou ambiguidade deixa o dia pendente para o envio manual.
- Uma tentativa por salvamento. Se o último registro da turma for `PARCIAL`, nenhum envio automático ocorre até um envio manual concluir, o que mantém a regra de não repetir envio sem confirmação.

## Consequências

- Duas chamadas salvas ao mesmo tempo para a mesma turma original podem se sobrepor; o registro `PARCIAL` em curso impede a segunda de começar depois que a primeira registrou, mas não fecha a janela entre as duas leituras. A escrita conservadora só preenche célula vazia, então o pior caso é a coluna do dia ser vista já criada no envio seguinte.
- A cota da Sheets API passa a ser consumida a cada salvamento de chamada com a chave ligada.
- Não altera `gas/Codigo.gs`.
