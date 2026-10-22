# Benefícios e frequência mínima

Regras de frequência mínima dos benefícios que dependem da presença do aluno, como o incentivo-frequência do Pé-de-Meia. A administração cadastra cada benefício na Gestão, com o percentual mínimo de frequência das aulas do mês, e a Chamada mostra um botão de alerta ao lado do acumulado do mês de cada aluno cujas faltas já passam do que a regra permite. Nenhum nome de benefício nem percentual vive no código: tudo está em configuração, editável sem novo deploy (ADR-049).

O cálculo está em `src/domain/beneficios-frequencia.ts`, os casos de uso em `src/application/beneficios-frequencia.ts` e a tela em Gestão, Configurações, Benefícios e frequência mínima. As rotas estão em [api.md](api.md).

## A configuração de cada benefício

| Campo                        | Tipo            | Observação                                                                                         |
| ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------- |
| `nome`                       | texto           | De 2 a 60 caracteres, único sem diferenciar caixa.                                                 |
| `percentualMinimoFrequencia` | inteiro         | De 1 a 100: percentual das aulas do mês em que o aluno precisa estar presente.                     |
| `aulasPorDia`                | inteiro ou nulo | De 1 a 30 para a projeção diária; nulo segue a grade. Chamadas salvas mantêm as aulas registradas. |
| `faltasJustificadasContam`   | booleano        | Falso por padrão: só as faltas sem justificativa entram na conta.                                  |
| `ativo`                      | booleano        | Inativo deixa de gerar alerta, sem perder a regra.                                                 |

A migração que criou a tabela insere uma linha inicial para o incentivo-frequência do Pé-de-Meia, com 80% e sem contar faltas justificadas. É dado de configuração como qualquer outro: a administração edita, desativa ou exclui na Gestão. Sem benefício ativo, a Chamada não mostra alerta.

## Quantidade diária de aulas

Em Gestão, Configurações, Benefícios e frequência mínima, a edição de cada benefício tem o campo Aulas por dia. Informar 9 projeta nove aulas em cada dia útil com aulas ativas na grade e sem feriado. Deixar vazio volta à grade da turma. Novos formulários sugerem 9; benefícios existentes continuam seguindo a grade até a administração salvar uma quantidade.

A configuração vale para o mês consultado inteiro, incluindo dias passados sem chamada e dias futuros. Sábados entram apenas com chamada salva. Dias em que o aluno não constava na chamada e dias de desistência não recebem projeção. A quantidade de aulas e as faltas das chamadas salvas permanecem como registradas; uma chamada antiga sem retrato usa a carga diária configurada como estimativa. Não há alteração da grade nem das frequências no banco.

Exemplo: 22 dias letivos sem chamadas salvas, com nove aulas por dia, totalizam 198 aulas e limite de 39 aulas com falta para 80%. Um feriado em dia de aula reduz a projeção para 189. Com seis dias já salvos com sete aulas e 16 dias projetados com nove, o total é 186, e não 22 vezes 9: os seis retratos continuam respeitados. O painel avisa essa diferença.

## O cálculo

Para um aluno em um mês, com `H` aulas no mês, `P` o percentual mínimo do benefício e `F` as aulas de falta que a regra manda contar:

- Limite de faltas: `L = floor(H * (100 - P) / 100)`. Exatamente `P`% de frequência ainda é permitido.
- Há alerta quando `F > L`.
- `F` soma as aulas de falta sem justificativa e, quando `faltasJustificadasContam` está ligado, também as justificadas. As horas do mês `H` não mudam com isso.

Exemplo: um mês com 22 dias úteis e 5 aulas por dia tem `H = 110`. Com `P = 80`, `L = 22`: 22 faltas sem justificativa ainda estão no limite e a 23ª dispara o alerta. Com `P = 90`, `L = 11`. Com `P = 100`, `L = 0`: qualquer falta dispara.

Os círculos F e FJ da linha contam dias com falta; o alerta conta aulas. Quatro dias de falta integral com sete aulas cada somam 28 aulas perdidas. Duas ocorrências justificadas em apenas uma aula de cada dia somam duas aulas justificadas. Por isso, os números da linha não precisam coincidir com os do alerta. Com `H = 124` e `P = 80`, o limite é 24 aulas com falta; 28 aulas com falta equivalem a 77,4% de frequência projetada, `(H - F) / H`.

O painel lê a conta em voz corrente. Com 28 faltas, 186 aulas previstas em 22 dias letivos e carga de 9:

> Faltou 28 aulas (≈ 3,1 dias de 9 aulas) de 186 aulas previstas em 22 dias letivos. Limite para 80%: 37 aulas (≈ 4,1 dias). Ainda restam 9 aulas até o limite. Frequência projetada: 84,9%.

O botão só aparece quando `F > L`. A frase da margem passa a ser `Passou do limite em R aulas`. Quando os dias contados não têm a mesma carga, o equivalente em dias some e o painel diz que o total pode não ser o número de dias vezes as aulas de um único dia. Quando há carga de referência e algum dia salvo entra com outra quantidade, o painel avisa que as aulas previstas podem não ser os dias letivos vezes essa carga.

Um aluno pode aparecer uma vez por benefício ativo, e o painel do botão lista cada um com o próprio limite.

## Aulas do mês

- Dias com chamada salva usam o retrato das aulas daquela chamada, e valem zero quando o aluno não constava nela.
- Se uma chamada antiga tem lista de alunos, mas não tem retrato de aulas, a estimativa usa a carga diária configurada ou a grade da turma daquela chamada, inclusive o sábado letivo já salvo. Essa aproximação não recupera a grade histórica nem grava alterações no histórico.
- Os demais dias úteis, sem feriado do calendário e antes de uma eventual desistência, só somam aulas quando a grade da turma atual prevê aulas. Usam a carga diária configurada ou, se vazia, a quantidade da grade. Sábados só contam quando há chamada salva (sábado letivo), e domingos nunca.
- O denominador estima o mês inteiro, incluindo dias passados sem chamada e dias futuros. O alerta indica excesso perante essa estimativa, que pode mudar com a grade e o calendário; não comprova perda do benefício.
- Só alunos ativos entram, e só quem tem alguma falta no mês.

## O Pé-de-Meia como exemplo

O incentivo-frequência do Pé-de-Meia usa horas letivas, não dias de falta. O requisito é frequência mínima mensal de 80% das horas letivas ou média de 80% das horas letivas no ano, até o momento da coleta. A Lei 14.818/2024 e o Decreto 11.901/2024 instituem o programa. A linha inicial do aplicativo repete os 80% como dado de configuração, não como regra do código.

Fontes consultadas:

- [Portaria MEC nº 83, de 7 de fevereiro de 2024](https://mecnormas.mec.gov.br/pesquisa/detalhar/299), norma de operações do Pé-de-Meia, alterada pelas Portarias MEC 210, 364 e 792 de 2024. O texto no MEC Normas não substitui o Diário Oficial.
- [Portaria MEC nº 916, de 12 de setembro de 2024](https://mecnormas.mec.gov.br/pesquisa/detalhar/1626). O anexo do incentivo-frequência escreve o requisito: frequência mínima mensal de 80% das horas letivas ou média de frequência de 80% das horas letivas no ano, até a coleta.
- [Manual do Sistema Gestão Presente](https://www.gov.br/mec/pt-br/media/manual-sgp.pdf), seção 7.3. A frequência mensal pede 80% ou mais das horas cursadas no mês. A média no período é a soma dos registros de frequência do ciclo dividida pela soma das horas ofertadas no ciclo, e também precisa ficar em 80% ou mais. O manual aponta o art. 20 da Portaria 83/2024 como diretriz da aferição em 2024.

Dois pontos que o alerta não resolve sozinho:

- **Média anual.** A norma aceita o mês ou a média do ano. Este alerta só compara o mês. A média anual não é verificada. Um mês abaixo de 80% pode seguir elegível se a média acumulada se mantiver, e essa conta fica no Gestão Presente.
- **Faltas justificadas.** A informação mensal enviada pelas redes observa as regras de justificação ou compensação de ausências de cada rede. A linha inicial desconsidera as faltas justificadas por decisão da coordenação, não como leitura fechada da portaria. O interruptor de cada benefício permite mudar.

## Limites conhecidos

- Suspensões de aula sem feriado cadastrado (greve, recesso) entram na projeção como dias letivos até virarem feriado ou chamada salva.
- Aluno transferido no meio do mês usa a turma atual nos dias sem chamada, o que pode afrouxar o limite.
- A base de cálculo é sempre as horas letivas (aulas). Outras bases, como dias letivos, exigiriam um novo campo na configuração.
- O alerta não verifica a média anual do período letivo nem determina pagamento ou bloqueio. A exclusão de justificadas segue a configuração da escola, por decisão da coordenação na linha inicial, e não comprova abono pela rede ou pelo programa.
- A Chamada relê os alertas ao abrir, ao trocar de mês, depois de salvar e quando a Gestão muda uma regra.

A cópia JSON inclui a quantidade diária por benefício. Cópias antigas sem o campo não apagam a configuração atual, e valores divergentes são conflitos sem sobrescrita.
