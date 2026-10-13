# ADR-044: retratos da chamada

## Status

Aceita.

## Contexto

As marcas de um dia (P, F, FJ e S) eram derivadas da grade atual da turma. Quando a grade ganha aulas depois de a chamada ser salva, faltas que cobriam o dia inteiro passam a cobrir parte delas e viram S; como o Painel e os Relatórios contam apenas F e FJ, os indicadores ficam zerados sem que nenhum registro tenha sido perdido. A lista de alunos já tinha retrato próprio (ADR-022) pelo mesmo motivo: o histórico não pode depender do cadastro de hoje.

## Decisão

Cada chamada grava também o retrato das aulas previstas no dia, na tabela `aulas_chamada`:

- o retrato é gravado no primeiro salvamento, com as aulas do dia segundo a grade vigente, incluindo a regra do sábado letivo, e fica congelado; edições posteriores não o ampliam nem reduzem;
- um retrato vazio, de chamada gravada antes desta versão, é curado no próximo salvamento;
- a migração reconstrói o retrato das chamadas existentes com as aulas que já têm falta registrada mais as aulas ativas do dia da semana criadas até a chamada; aulas criadas depois não entram;
- `marcaDoAluno` usa o retrato da chamada quando existe: falta parcial é só quando a falta cobre parte das aulas do retrato, falta fora do retrato continua valendo como integral e, sem retrato, a derivação mantém a grade atual;
- as presenças parciais passam a aparecer no Painel e no Resumo dos Relatórios, para nenhum caso voltar a zerar em silêncio.

## Consequências

- Mudar a grade não reclassifica o histórico; aulas novas valem apenas para as próximas chamadas.
- Aula excluída sai do retrato em cascata; desativada, permanece no retrato do dia em que foi registrada.
- O retrato das chamadas antigas é aproximado pela data de criação da chamada: uma correção feita depois de a grade ganhar aulas não adota a aula nova.
- `aulas` passa a fazer parte da resposta das rotas de frequência e, com isso, da derivação de marcas no aplicativo, no BI, nos indicadores externos e no painel do diretor de turma.
- A aula nova não aparece em faltas antigas, mas continua disponível para marcação nos dias seguintes.
