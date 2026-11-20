# ADR-080: horário de provas bimestrais

## Estado

Aceita.

## Contexto

No período de provas bimestrais, a escola troca a rotina de aulas por um horário de provas, e a equipe precisava consultar quando cada turma faz cada prova. A grade semanal descreve aulas recorrentes por dia da semana; a prova acontece numa data, vale por poucos dias e depois deixa de interessar. A administração precisava cadastrar esse horário sem mexer na grade e apagá-lo ao fim do período.

## Decisão

- Cada prova fica na tabela `provas_bimestrais`, uma linha por turma e data, com início, fim e disciplina de até 80 caracteres. Excluir a turma remove as provas dela.
- `GET /api/provas-bimestrais` vale para qualquer sessão da equipe e devolve só as provas de hoje em diante, no fuso da escola. As datas passadas saem da leitura sem tarefa agendada.
- `POST /api/provas-bimestrais` grava a mesma prova para uma lista de turmas, porque a prova costuma ser da série inteira. A data vale de hoje em diante e fora do domingo, e o fim vem depois do início. Recusa com 409 a turma que já tem prova em janela que se cruza com a nova no mesmo dia; uma prova pode começar no minuto em que a outra termina. Na mesma transação, apaga as provas de datas passadas.
- `DELETE /api/provas-bimestrais/{id}` remove a prova de uma turma, e `POST /api/provas-bimestrais/encerrar`, com `{"confirmar": true}`, encerra o período apagando o horário inteiro. As três escritas exigem administração, origem confiável e auditoria só com data, contagem e identificador.
- Em Gestão, Configurações, Horários, a aba Provas cadastra para uma série inteira ou para turmas escolhidas, lista as provas por data e disciplina, remove e encerra com confirmação. A gravação é imediata, como a das aulas, fora do rascunho único das configurações.
- A aba Horários mostra o cartão Provas bimestrais da turma consultada, por data, e ele some quando a turma não tem prova de hoje em diante.

## Alternativas

- Registrar as provas como aulas da grade: a grade é semanal e recorrente, então a prova de uma data apareceria em todas as semanas e exigiria desfazer a grade depois.
- Guardar o horário por série: a escola pode separar turmas da mesma série em dias diferentes; a gravação para várias turmas de uma vez cobre a série inteira sem perder esse caso.
- Colocar as provas no rascunho único das configurações: o horário muda a cada prova cadastrada durante o período, e a confirmação em lote atrasaria a consulta sem proteger nada.
- Apagar as provas passadas por agenda: a leitura já filtra a data, e a limpeza no cadastro seguinte basta para a tabela não crescer.

## Consequências

- Uma tabela, quatro rotas, uma aba na Gestão e um cartão em Horários a mais para manter.
- O horário de provas é consultivo: não altera a grade, a Chamada, as faltas nem as planilhas.
- As provas são temporárias e não entram na cópia JSON; restaurar uma cópia não traz o horário de provas.
- A migração é aditiva e não reescreve dados existentes.
