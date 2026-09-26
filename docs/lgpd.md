# LGPD

Como o FrequenciApp trata dados pessoais à luz da Lei Geral de Proteção de Dados. O objetivo é documentar de forma transparente o que existe, por que existe e como o titular pode exercer direitos.

## Dados tratados

| Dado                                                   | Finalidade                                                        | Retenção                                                                            |
| ------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Nome do aluno                                          | Identificar o aluno na chamada e nos relatórios.                  | Enquanto a escola mantiver o cadastro; exclusão a pedido.                           |
| Turma atual e de origem                                | Organizar chamadas e a consulta agrupada.                         | Idem.                                                                               |
| Registro de faltas por dia (e por aula, quando ligado) | Registrar a chamada, finalidade do sistema.                       | Idem, junto com as chamadas.                                                        |
| Saída antecipada: momento, justificativa e observação  | Registrar quem saiu antes do fim do dia e por quê.                | Idem, junto com as saídas; a responsável pela liberação fica na equipe.             |
| E-mail e hash de senha da equipe                       | Autenticar o acesso pessoal.                                      | Conta ativa; sessões expiram em 30 dias quando lembradas e em 12 horas sem a opção. |
| Nome da administração e da coordenação                 | Tratamento e saudação; identificação da equipe.                   | Conta ativa.                                                                        |
| Trilha de auditoria (quem, o quê, quando)              | Prestar contas de ações administrativas.                          | Conforme política da escola; sem dados de alunos.                                   |
| Frequência enviada à planilha da escola                | Reorganizar por turma de origem, quando a integração está ligada. | Na planilha da própria escola, sob controle dela.                                   |

Não há coleta de CPF, matrícula, telefone, endereço, dados sensíveis, dados de menores além do prenome necessário para registrar a frequência, nem qualquer dado de navegação, rastreamento ou perfil.

## Fundamentos

- **Necessidade**: cada campo existe para a finalidade do sistema, que é o registro de frequência (art. 6º, III).
- **Minimização**: apenas o estritamente necessário, com presença implícita em vez de registro positivo de todos os dias (art. 6º, III).
- **Finalidade**: dados usados exclusivamente pela equipe da escola, dentro do aplicativo.
- **Segurança**: senha com scrypt, sessões opacas com hash no banco, tráfego protegido por HTTPS no deploy, autoria anulável e trilha de auditoria sem dados de alunos.
- **Transparência**: este documento e a interface avisam o que é armazenado.

## Direitos do titular

A escola é a controladora dos dados dos alunos que cadastra. O aplicativo oferece os meios:

- **Acesso e portabilidade**: a grade por turma de origem e o relatório por aluno exibem o histórico completo; a cópia de segurança em JSON, na Gestão, entrega os dados escolares em formato aberto, e o `pg_dump` cobre o banco inteiro.
- **Correção**: edição do nome e das turmas na área de Gestão; correção da chamada e remoção da saída antecipada pela própria coordenação.
- **Eliminação**: a exclusão do aluno apaga o cadastro, as faltas e as saídas antecipadas; a desativação retira o aluno das chamadas futuras preservando o histórico, escolha da escola conforme a necessidade.
- **Eliminação da conta**: excluir uma conta remove o acesso e as sessões; as frequências da escola permanecem, com a autoria anulada. Para eliminar dados de aluno, use a exclusão do aluno.

```sql
-- excluir a conta de uma pessoa da equipe (irreversível)
delete from usuarios where id = '<id da conta>';
```

## Repartição de papéis

O desenvolvedor do aplicativo não tem acesso a dados de produção: o software roda na infraestrutura escolhida pela escola, sem telemetria e sem dependência de terceiros contratados. A integração opcional com o Google Planilhas é configurada pela própria escola, na conta Google dela, e só envia o que a finalidade de frequência exige. A escola, ao usar o sistema, responde pelos dados que insere, mantendo a caderneta digital dentro da mesma finalidade da caderneta de papel.

## Repositório limpo

- O histórico de versões e os arquivos atuais não contêm dados reais de pessoas.
- A semente de desenvolvimento usa nomes sintéticos e roda por comando opcional.
- Não existem chaves, tokens ou credenciais no controle de versões; o `.env.example` documenta as variáveis vazias.

A verificação de limpeza foi feita na reconstrução: varredura por nomes, e-mails, padrões de documento e segredos, com o histórico auditado commit a commit.

## Papéis e minimização

A administração configura séries, turmas, alunos, aulas e contas; a coordenação registra e consulta a frequência da escola. As duas funções veem os dados escolares, que são o objeto do serviço, e o aplicativo não coleta nada além do necessário. A trilha de auditoria registra apenas identificadores e nomes de ação: nenhum dado pessoal de aluno entra no log, e as frequências preservam o histórico mesmo quando uma conta é excluída.
