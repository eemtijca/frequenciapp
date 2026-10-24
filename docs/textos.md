# Textos da interface

Regras para mensagens, rótulos e confirmações do FrequenciApp. O texto faz parte do produto: precisa dizer o que aconteceu, o que fazer agora e o que fica preservado, sem termos técnicos e sem culpar quem usa.

## Princípios

- Frases curtas, em português do Brasil, com voz ativa e presente do indicativo.
- Primeiro o fato, depois a consequência e, quando necessário, o próximo passo.
- A pessoa não é tratada por "você". Use "a administração", "a coordenação", "o diretor de turma" ou uma frase impessoal.
- Nada de stack trace, SQL, nome de tabela, status HTTP ou termo de infraestrutura na tela.
- Erros de regra de negócio não sugerem conferir a internet. A dica de rede fica reservada a falha de conexão ou de servidor.
- Um conflito de catálogo tem título próprio. Nunca reutilize "A chamada foi salva em outro aparelho" para justificativa, responsável ou configurações.
- Toda ação destrutiva diz o que será removido, o que fica preservado e qual é a alternativa segura.
- Rótulos de ação são específicos: "Salvar configurações", "Recarregar tudo e descartar", "Remover feriado", "Revogar chave". Evite "Confirmar" quando a ação puder ser nomeada.

## Tratamento e pessoas

| Evite                        | Prefira                                      |
| ---------------------------- | -------------------------------------------- |
| É preciso salvar             | Salve as alterações antes de continuar       |
| Seu acesso expirou           | Sua sessão expirou. Entre novamente          |
| A exclusão não está liberada | A exclusão não está disponível com histórico |
| Nós não encontramos          | Registro não encontrado                      |

Quando a mensagem for dirigida à administração, use "Apenas a administração pode fazer esta operação." Quando for dirigida à coordenação, use "A coordenação pode consultar, mas não alterar." Quando a ação for da própria pessoa, use o imperativo curto: "Informe a senha do administrador.", "Escolha uma data até hoje.".

## Erros e conflitos

- Erro de rede ou falha do servidor: "Tente de novo em instantes." e, quando houver ação, o botão "Tentar novamente".
- Erro de regra de negócio: mostre a mensagem da API, sem descrição automática de internet.
- Conflito de revisão: "As configurações mudaram em outro acesso. Revise: Notificações." com as opções "Recarregar tudo e descartar" e "Continuar revisando".
- Justificativa em uso: "Justificativa em uso" e a contagem de registros. A saída segura é desativar.
- Responsável em uso: "Responsável em uso" e a contagem de saídas. A saída segura é desativar.
- Chave do BI: a senha é pedida no lote, não em cada seção. Se o lote falhar, nenhuma chave é criada e nenhum segredo aparece.

## Rascunho e lote

- "Alterações não salvas em 1 seção" ou "em 2 seções". O rodapé reúne "Descartar" e "Salvar configurações".
- O diálogo de revisão lista as seções alteradas com um resumo curto: "Recursos da escola, chamada por aula", "Chaves do BI, 1 nova", "Calendário letivo, 1 removido".
- "As alterações valem para toda a escola e são gravadas de uma vez. Se outra pessoa tiver mudado alguma seção, nada é gravado."
- Ao atualizar com rascunho pendente: "Salve ou descarte as alterações antes de atualizar."
- Ao descartar: "Todas as seções voltam ao estado salvo, inclusive catálogos, calendário e chaves."

## Glossário

| Termo             | Sentido na interface                                             |
| ----------------- | ---------------------------------------------------------------- |
| Chamada           | Registro de presença e falta de uma turma em um dia              |
| Frequência        | Conjunto de chamadas salvas de um período                        |
| Falta             | Ausência registrada na chamada                                   |
| Falta justificada | Falta com um motivo do catálogo, identificada por FJ             |
| Saída antecipada  | Saída do aluno antes do fim da aula                              |
| Entrada atrasada  | Chegada do aluno depois do início da aula                        |
| Turma de origem   | Turma em que o aluno estudava antes de uma transferência         |
| Rascunho          | Alterações ainda não gravadas no servidor                        |
| Lote              | Conjunto de seções gravadas em uma única transação               |
| Revisão           | Versão de uma seção, usada para detectar mudança em outro acesso |
| Chave do BI       | Credencial de leitura do FrequenciBI, exibida uma única vez      |
| Benefício         | Regra de frequência mínima que gera alerta na Chamada            |
| Calendário letivo | Feriados e recessos que suspendem a chamada                      |

## Exemplos antes e depois

| Antes                                                                                                                   | Depois                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Este responsável está em uso em 19 saídas. Desative em vez de excluir. Confira a internet e tente de novo em instantes. | Este responsável está em uso em 19 saídas. Desative em vez de excluir para preservar o histórico. |
| A chamada foi salva em outro aparelho. Revise as marcações e salve de novo.                                             | Justificativa em uso. Esta justificativa está em uso em 2 registros. Desative em vez de excluir.  |
| Não foi possível concluir.                                                                                              | Configurações alteradas em outro acesso. Revise: Notificações.                                    |
| Salvar                                                                                                                  | Salvar configurações                                                                              |
| Atualizar lista                                                                                                         | Atualizar tela                                                                                    |
| Chave gerada                                                                                                            | Guarde as chaves do BI                                                                            |
| Excluir                                                                                                                 | Remover feriado                                                                                   |
| Erro 409                                                                                                                | Justificativa em uso                                                                              |

## Pontuação e estilo

- Sem travessão, meia-risca, reticências tipográficas, aspas curvas, setas ou entidades HTML de aspas. Use vírgula, ponto e parênteses.
- "Saídas e Entradas" em rótulos visíveis; "Saídas e entradas" em texto corrido.
- "FrequenciApp" e "FrequenciBI" com a grafia exata. "BI" em maiúsculas.
- Datas civis aparecem como DD/MM/AAAA na tela e trafegam como AAAA-MM-DD na API.
- Horários usam HH:MM, com dois dígitos.
- Percentuais usam o símbolo e vírgula decimal, como 99,5%.
- Números de alunos, faltas e registros concordam com o singular e o plural: "1 aluno", "2 alunos", "1 registro", "2 registros".
- Não use "e/ou". Escolha uma alternativa ou escreva as duas por extenso.
