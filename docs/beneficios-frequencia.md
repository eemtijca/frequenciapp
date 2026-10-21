# Benefícios e frequência mínima

Regras de frequência mínima dos benefícios que dependem da presença do aluno, como o incentivo-frequência do Pé-de-Meia. A administração cadastra cada benefício na Gestão, com o percentual mínimo de frequência das aulas do mês, e a Chamada mostra um botão de alerta ao lado do acumulado do mês de cada aluno cujas faltas já passam do que a regra permite. Nenhum nome de benefício nem percentual vive no código: tudo está em configuração, editável sem novo deploy (ADR-049).

O cálculo está em `src/domain/beneficios-frequencia.ts`, os casos de uso em `src/application/beneficios-frequencia.ts` e a tela em Gestão, Configurações, Benefícios e frequência mínima. As rotas estão em [api.md](api.md).

## A configuração de cada benefício

| Campo                        | Tipo     | Observação                                                                     |
| ---------------------------- | -------- | ------------------------------------------------------------------------------ |
| `nome`                       | texto    | De 2 a 60 caracteres, único sem diferenciar caixa.                             |
| `percentualMinimoFrequencia` | inteiro  | De 1 a 100: percentual das aulas do mês em que o aluno precisa estar presente. |
| `faltasJustificadasContam`   | booleano | Falso por padrão: só as faltas sem justificativa entram na conta.              |
| `ativo`                      | booleano | Inativo deixa de gerar alerta, sem perder a regra.                             |

A migração que criou a tabela insere uma linha inicial para o incentivo-frequência do Pé-de-Meia, com 80% e sem contar faltas justificadas. É dado de configuração como qualquer outro: a administração edita, desativa ou exclui na Gestão. Sem benefício ativo, a Chamada não mostra alerta.

## O cálculo

Para um aluno em um mês, com `H` aulas no mês, `P` o percentual mínimo do benefício e `F` as aulas de falta que a regra manda contar:

- Limite de faltas: `L = floor(H * (100 - P) / 100)`. Exatamente `P`% de frequência ainda é permitido.
- Há alerta quando `F > L`.
- `F` soma as aulas de falta sem justificativa e, quando `faltasJustificadasContam` está ligado, também as justificadas. As horas do mês `H` não mudam com isso.

Exemplo: um mês com 22 dias úteis e 5 aulas por dia tem `H = 110`. Com `P = 80`, `L = 22`: 22 faltas sem justificativa ainda estão no limite e a 23ª dispara o alerta. Com `P = 90`, `L = 11`. Com `P = 100`, `L = 0`: qualquer falta dispara.

Um aluno pode aparecer uma vez por benefício ativo, e o painel do botão lista cada um com o próprio limite.

## Aulas do mês

- Dias com chamada salva usam o retrato das aulas daquela chamada, e valem zero quando o aluno não constava nela.
- Os demais dias úteis, sem feriado do calendário e antes de uma eventual desistência, usam a grade da turma atual. Sábados só contam quando há chamada salva (sábado letivo), e domingos nunca.
- Como o denominador projeta o mês todo, o alerta só dispara quando a perda já é certa pelas faltas registradas, e não por uma sequência curta no começo do mês.
- Só alunos ativos entram, e só quem tem alguma falta no mês.

## O Pé-de-Meia como exemplo

O incentivo-frequência do Pé-de-Meia exige frequência mínima de 80% das horas letivas, apurada por mês (Lei 14.818/2024, Decreto 11.901/2024 e Portaria MEC 83/2024, alterada pelas Portarias 210, 364 e 792 de 2024). Esse é o valor da linha inicial, não uma regra do código. Dois pontos da pesquisa que o alerta não resolve sozinho:

- **Bloqueio.** Segundo o resumo da Portaria 83/2024 obtido na pesquisa, a parcela só fica retida quando a frequência do mês e a média do período letivo até a apuração estão, as duas, abaixo de 80%. O alerta olha só o mês; a média acumulada fica com o MEC.
- **Faltas justificadas.** A portaria manda considerar, na informação mensal enviada pelas redes, as regras de justificação ou compensação de ausências da legislação de cada rede. Não foi encontrada orientação específica da SEDUC-CE. A linha inicial não conta justificadas, por decisão da coordenação, e o interruptor de cada benefício permite mudar.

Limite da pesquisa: a regra foi levantada na web em outubro de 2026, e os textos oficiais (gov.br, Planalto, MEC Normas) não puderam ser abertos nessa sessão, por bloqueio de rede. A conferência com o texto da portaria ficou a cargo de quem revisou a mudança.

## Limites conhecidos

- Suspensões de aula sem feriado cadastrado (greve, recesso) entram na projeção como dias letivos até virarem feriado ou chamada salva.
- Aluno transferido no meio do mês usa a turma atual nos dias sem chamada, o que pode afrouxar o limite.
- A base de cálculo é sempre as horas letivas (aulas). Outras bases, como dias letivos, exigiriam um novo campo na configuração.
- A Chamada relê os alertas ao abrir, ao trocar de mês, depois de salvar e quando a Gestão muda uma regra.
