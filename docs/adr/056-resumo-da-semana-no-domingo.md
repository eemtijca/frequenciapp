# ADR-056: resumo da semana no domingo

- Status: aceita
- Data: 2026-10-25

## Contexto

Domingo não tem aula nem chamada. A Chamada, a Chamada Parcial e o Painel escondem o domingo no calendário e, quando hoje caía num domingo, abriam no sábado anterior. Voltar para hoje fazia o mesmo salto. A coordenação via uma chamada editável de ontem no lugar de um fechamento da semana que acabou de terminar.

Horários consulta o dia da semana civil, inclusive domingo. Saídas e entradas usam o dia civil. Esses fluxos não registram chamada e não precisam saltar para o sábado.

## Decisão

- Quando o dia corrente no fuso da escola é domingo, a abertura da Chamada, da Chamada Parcial e do Painel mostra o resumo somente leitura da semana encerrada, da segunda ao sábado imediatamente anteriores.
- Voltar para hoje e o atalho Hoje desses calendários voltam ao resumo. Escolher uma data ou usar as setas continua abrindo o dia, para registrar ou consultar a chamada.
- Na Chamada e no Painel, a seta seguinte fica desabilitada a partir do resumo, porque a segunda ainda é futura. Na Chamada Parcial, a seta seguinte abre a segunda, dentro do limite de agendamento.
- O resumo reaproveita as consultas de frequência e de saída por período e os contadores já usados na chamada. Não cria tabela, migração nem gravação.
- O recorte é a turma selecionada na Chamada e na Chamada Parcial, e as turmas visíveis no Painel. A permissão continua sendo a da sessão.
- Dia letivo previsto é dia sem feriado, com aula ativa na grade e com aluno ativo da turma que não está desistente naquela data. Pendência é dia previsto sem chamada salva. Sábado sem aula na grade só aparece como chamada salva quando já existe frequência. Feriado não é pendência.
- As contagens de falta, falta justificada, presença e presença parcial usam as mesmas marcas da chamada. O ranking segue o critério padrão de faltas mais faltas justificadas.
- Saídas antecipadas entram só quando o recurso está ligado e há registro de aluno da turma atual.
- Um atalho de histórico continua abrindo o dia pedido. Se a data cair num domingo, abre o sábado anterior, porque domingo não tem chamada.
- O calendário de justificativa antecipada, que não recebe o atalho do resumo, deixa Hoje desabilitado quando o dia corrente é domingo. Não escolhe o sábado.
- Horários e Saídas e entradas permanecem no dia civil.

## Consequências

- No domingo, a primeira tela deixa de parecer uma chamada de sábado esquecida e passa a mostrar o que ficou pendente na semana.
- A navegação manual por data não muda: sábado, sexta e os demais dias letivos continuam acessíveis.
- A suíte que precisa da lista ou dos gráficos do dia sai do resumo pela seta anterior quando a execução cai num domingo.
- Não há migração nem alteração de frequência já salva.
