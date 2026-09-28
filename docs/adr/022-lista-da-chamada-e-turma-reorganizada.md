# ADR-022: lista da chamada e turma reorganizada

## Status

Aceita.

## Contexto

As turmas da 3ª série foram reorganizadas: cada aluno tem a turma atual, onde a chamada acontece, e a turma original, pela qual a escola consolida a frequência na Grade e na planilha. A frequência guardava apenas a turma da chamada e as faltas, e a marca de cada dia era recalculada com a turma atual do aluno no momento da consulta. Mover um aluno de turma reinterpretava o histórico:

- o dia em que ele esteve presente na turma anterior sumia ou virava presença por coincidência com a chamada da turma nova;
- a falta parcial (S) virava falta integral, porque as aulas usadas no cálculo passavam a ser as da turma nova;
- dias da turma nova anteriores à mudança viravam presença;
- ao reabrir uma chamada antiga, o aluno movido saía da lista.

## Decisão

- **Cada chamada guarda a própria lista.** A tabela `alunos_chamada` registra quem estava na chamada, presente ou ausente. Na primeira gravação, a lista é a relação atual da turma; depois, a lista gravada continua, e só o dia corrente recebe quem entrou na turma. Um aluno movido não aparece em chamadas antigas da turma nova e continua nas da turma anterior.
- **A marca do dia vem da chamada que tinha o aluno na lista**, em qualquer turma, com as aulas dessa turma. A falta registrada continua prevalecendo.
- **A turma original é atributo do aluno.** A frequência não copia a turma original: a consolidação usa `alunos.turma_original_id`, e corrigir a origem recalcula a consolidação de todo o histórico.
- **Painel e Chamada pela turma atual; Grade, CSV, planilha e diretor de turma pela turma original.** Na turma reorganizada (com algum aluno de outra turma original), a Chamada mostra a turma original de cada aluno em um círculo ao lado do nome.
- **Histórico existente.** A migração preenche a lista das chamadas já salvas com quem tem falta nelas e com os alunos ativos que hoje estão na turma da chamada e já existiam no dia. Ela precisa rodar antes de mover alunos entre turmas.

## Alternativas

- Copiar a turma original para cada falta: não resolve a presença, que não gera linha, e congelaria um valor que a escola precisa poder corrigir.
- Recalcular a partir de um histórico de mudanças de turma: exige registrar cada movimentação com data e reconstruir a turma de cada dia, com mais pontos de falha que gravar a lista no momento da chamada.

## Consequências

- A frequência na API ganha `alunos`, a lista da chamada. Dados sem lista, como cópias antigas, seguem a regra anterior pela turma atual.
- A cópia de segurança exporta a lista; ao importar uma cópia antiga, a lista é deduzida da turma e das faltas.
- A regra da marca continua única em `src/domain/frequencia.ts`, compartilhada pelo servidor e pela interface.
