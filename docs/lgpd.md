# LGPD

Como o FrequenciApp trata dados pessoais à luz da Lei Geral de Proteção de Dados. O objetivo é documentar de forma transparente o que existe, por que existe e como o titular pode exercer direitos.

## Dados tratados

| Dado                                                                  | Finalidade                                                                        | Retenção                                                                            |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Nome do aluno                                                         | Identificar o aluno na chamada e nos relatórios.                                  | Enquanto a escola mantiver o cadastro; exclusão a pedido.                           |
| Turma atual e de origem                                               | Organizar chamadas e a consulta agrupada.                                         | Idem.                                                                               |
| Registro de faltas por dia (e por aula, quando ligado)                | Registrar a chamada, finalidade do sistema.                                       | Idem, junto com as chamadas.                                                        |
| Presença parcial: aluno, dia, turno ou aulas e turma histórica        | Apoiar o lançamento separado da frequência no sistema da Seduc.                   | Conforme a política de guarda dos registros escolares.                              |
| Confirmação manual da Seduc: estado, data e nome da conta responsável | Lembrar e identificar qual revisão foi lançada pela equipe.                       | Com o registro parcial; correção ou reabertura limpa a confirmação atual.           |
| Saída antecipada: momento, justificativa e observação                 | Registrar quem saiu antes do fim do dia e por quê.                                | Idem, junto com as saídas; quem liberou sai do catálogo de pessoas da escola.       |
| E-mail e hash de senha da equipe                                      | Autenticar o acesso pessoal.                                                      | Conta ativa; sessões expiram em 30 dias quando lembradas e em 12 horas sem a opção. |
| Nome da administração e da coordenação                                | Tratamento e saudação; identificação da equipe.                                   | Conta ativa.                                                                        |
| Identificador e hash da palavra-chave do diretor de turma             | Autenticar o acesso individual de leitura das estatísticas.                       | Até a revogação ou exclusão da conta; sessão de horas, com cookie de sessão.        |
| Vínculo do diretor com turmas, com início e fim                       | Limitar o que cada diretor vê e registrar quem via o quê.                         | O fim é registrado, nunca apagado, junto com a conta.                               |
| Trilha de auditoria (quem, o quê, quando)                             | Prestar contas de ações administrativas.                                          | Conforme política da escola; sem dados de alunos.                                   |
| Frequência enviada à planilha da escola                               | Reorganizar por turma de origem, quando a integração está ligada.                 | Na planilha da própria escola, sob controle dela.                                   |
| Chamadas parciais enviadas ao terceiro arquivo Google                 | Conferir lançamentos por turno ou aulas, com estado e data da confirmação manual. | No arquivo escolhido pela escola, sob controle dela.                                |
| Saídas enviadas à planilha da escola                                  | Registrar as saídas antecipadas em outra planilha, quando ligada.                 | Idem, com justificativa e observação sob controle da escola.                        |

O cadastro não solicita CPF, matrícula, telefone ou endereço. Nomes e textos livres devem conter somente o necessário à rotina escolar; motivos e observações podem conter dados sensíveis se preenchidos dessa forma, por isso exigem cuidado na coleta e no compartilhamento.

## Fundamentos

- **Necessidade**: cada campo existe para a finalidade do sistema, que é o registro de frequência (art. 6º, III).
- **Minimização**: apenas o estritamente necessário. A chamada normal usa presença implícita; a Chamada Parcial guarda presença explícita somente dos alunos que precisam do registro separado (art. 6º, III).
- **Finalidade**: dados usados pela equipe da escola e pelos diretores de turma no escopo autorizado. Downloads e integração opcional com a planilha da escola mantêm a finalidade escolar e exigem controle do destino pela escola.
- **Segurança**: senha com scrypt, sessões opacas com hash no banco, tráfego protegido por HTTPS no deploy, autoria anulável e trilha de auditoria sem dados de alunos.
- **Transparência**: este documento e a interface avisam o que é armazenado.

## Direitos do titular

A escola é a controladora dos dados dos alunos que cadastra. O aplicativo oferece os meios:

- **Acesso e portabilidade**: a grade por turma de origem e o relatório por aluno exibem o histórico completo; a cópia de segurança em JSON, na Gestão, entrega os dados escolares em formato aberto, e o `pg_dump` cobre o banco inteiro.
- **Correção**: edição do nome e das turmas na área de Gestão; correção da chamada, dos registros parciais e remoção da saída antecipada pela própria coordenação. Nomes históricos dos registros parciais permanecem como retrato do registro original; retificação desse retrato exige tratamento administrativo conforme a política da escola.
- **Eliminação**: a exclusão do aluno apaga o cadastro, as faltas, as frequências parciais, as saídas antecipadas e as entradas; a desativação retira o aluno das chamadas futuras preservando o histórico, escolha da escola conforme a necessidade.
- **Eliminação da conta**: excluir uma conta remove o acesso e as sessões; os registros escolares permanecem, com as referências de autoria anuladas. O nome histórico de quem confirmou na Seduc permanece no registro parcial; sua retenção segue a finalidade de prestação de contas da escola. Para eliminar dados de aluno, usar a exclusão do aluno. Arquivos já exportados e planilhas externas precisam de tratamento separado pela escola.

```sql
-- excluir a conta de uma pessoa da equipe (irreversível)
delete from usuarios where id = '<id da conta>';
```

## Segurança das exportações

Todos os downloads oferecem ZIP com senha e AES-256 como escolha inicial. A opção de formato original exige escolha explícita e avisa que o conteúdo ficará legível. Nomes de arquivos protegidos são genéricos, pois o diretório de um ZIP permanece visível. A senha do ZIP fica apenas em memória no navegador, sem transmissão nem armazenamento pelo aplicativo. A senha de acesso, exigida separadamente para a cópia completa, é conferida no servidor com limite de tentativas.

CSV de grade e relação registram preparação na auditoria, apenas com conta, tipo, formato e data. A cópia mantém `backup.exportar`, sem senha nem dados de alunos no evento. A administração deve definir destinatários autorizados, prazo de guarda e descarte de arquivos e cópias extraídas. O passo a passo e os limites estão em [downloads.md](downloads.md).

## Repartição de papéis

O desenvolvedor do aplicativo não tem acesso a dados de produção: o software roda na infraestrutura escolhida pela escola, sem telemetria e sem dependência de terceiros contratados. A integração opcional com o Google Planilhas é configurada pela própria escola, na conta Google dela, e só envia o que cada finalidade exige: a frequência por turma de origem, saídas e entradas em outro arquivo e presenças parciais em um terceiro arquivo distinto, com os campos necessários a cada registro. A chave da Seduc é uma confirmação manual da equipe; o aplicativo não transmite dados ao sistema da Seduc. A escola, ao usar o sistema, responde pelos dados que insere, mantendo a caderneta digital dentro da mesma finalidade da caderneta de papel.

## Repositório limpo

- O histórico de versões e os arquivos atuais não contêm dados reais de pessoas.
- A semente de desenvolvimento usa nomes sintéticos e roda por comando opcional.
- Não existem chaves, tokens ou credenciais no controle de versões; o `.env.example` documenta as variáveis vazias.

A verificação de limpeza foi feita na reconstrução: varredura por nomes, e-mails, padrões de documento e segredos, com o histórico auditado commit a commit.

## Papéis e minimização

A administração configura séries, turmas, alunos, aulas e contas; a coordenação registra e consulta a frequência da escola. As duas funções veem os dados escolares, que são o objeto do serviço, e o aplicativo não coleta nada além do necessário. O diretor de turma é um terceiro papel, só de leitura: vê apenas os alunos ativos da turma de origem vinculada a ele, apenas no período do vínculo, e apenas agregados (ausências, dias com chamada, taxa e, quando a administração libera, a separação entre faltas e faltas justificadas e a contagem de saídas). Não vê observação, justificativa escrita, quem liberou uma saída, outras turmas nem ação de escrita. As categorias começam restritas às faltas e só se abrem pelos parâmetros da Gestão; cada consulta fica na auditoria. O roteiro de entrega, vazamento e virada do ano está em [operacao.md](operacao.md#diretores-de-turma).

A trilha de auditoria registra apenas identificadores e nomes de ação: nenhum dado pessoal de aluno entra no log, e as frequências preservam o histórico mesmo quando uma conta é excluída.

## Entradas atrasadas

O registro trata aluno, turma do registro, data, horário, momento, motivo, responsável selecionado e autoria autenticada da chegada. O nome do responsável é preservado como histórico, mesmo depois de renomeação do catálogo. A equipe escolar tem acesso; diretores com acesso apenas a estatísticas não têm permissão para consultar ou registrar entradas. Os dados entram na cópia JSON. O envio opcional à conta Google da escola usa a mesma conexão de saídas, em aba própria e após prévia. O código da linha combina identificador de aluno e data; não inclui credenciais. Motivos devem conter apenas o necessário para a rotina escolar.

## Chamada Parcial

A presença parcial trata identificação do aluno, data, turno ou aulas frequentadas, nome e turma históricos, observação curta, revisão e autoria. A confirmação manual "Registrado na Seduc" acrescenta data e nome da conta que confirmou o lançamento externo. Corrigir presença ou observação limpa a confirmação e exige nova conferência pela equipe. Administração e coordenação operam esses registros; diretores de turma não consultam nem alteram a Chamada Parcial.

Nome do aluno e turma são preservados para interpretar o registro depois de transferência ou renomeação. A exclusão do aluno remove seus registros parciais em cascata. A exclusão da conta anula suas referências, preservando o nome histórico da confirmação conforme a política de retenção da escola. A auditoria recebe somente ação e identificador do registro, sem nomes ou observações de alunos.

A cópia JSON inclui os registros parciais e seus dados históricos e segue a proteção dos demais downloads. Ela não contém credenciais Google. O terceiro arquivo escolhido pela Gestão recebe somente data, aluno, turma, presença parcial, estado e instante da confirmação, observação, UUID e revisão; não recebe senha, token nem identificadores internos de autoria. O nome da conta que confirmou permanece no aplicativo e na cópia JSON. Prévia e opção explícita controlam o envio e a atualização de linhas já enviadas. Desconectar a integração ou excluir registros locais não apaga conteúdo externo; a escola responde pelo acesso, guarda, retificação e descarte dessas planilhas e cópias.

Observações devem conter apenas o necessário ao lançamento escolar. A confirmação manual não autentica nem automatiza o sistema da Seduc; o lançamento nesse sistema continua sendo feito pela equipe responsável.

## Indicadores externos

A integração Looker Studio exporta somente contagens agregadas para arquivo separado, sem nomes, identificadores pessoais, justificativas, motivos ou observações. Totais de grupos pequenos não equivalem a anonimização e precisam de acesso restrito. A gestão controla compartilhamento do arquivo, fontes e relatório. Exclusões no banco alcançam a fonte externa após atualização confirmada; cópias manuais e exportações do relatório seguem controle de retenção separado. Procedimento em [looker-studio.md](looker-studio.md).
