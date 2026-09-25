# LGPD

Como o Chamada trata dados pessoais à luz da Lei Geral de Proteção de Dados. O objetivo é documentar de forma transparente o que existe, por que existe e como o titular pode exercer direitos.

## Dados tratados

| Dado                                      | Finalidade                                     | Retenção                                                     |
| ----------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| Nome de chamada do aluno                  | Identificar o aluno na chamada e na grade.     | Enquanto o professor mantiver o cadastro; exclusão a pedido. |
| Turma atual e de origem                   | Organizar chamadas e a consulta agrupada.      | Idem.                                                        |
| Registro de faltas por dia                | Registrar a frequência, finalidade do sistema. | Idem, junto com as chamadas.                                 |
| E-mail e hash de senha do professor       | Autenticar o acesso pessoal.                   | Conta ativa; sessões expiram em 30 dias.                     |
| Nome do administrador e professores       | Tratamento e saudação; atribuição de turmas.   | Conta ativa.                                                 |
| Trilha de auditoria (quem, o quê, quando) | Prestar contas de ações administrativas.       | Conforme política da escola; sem dados de alunos.            |

Não há coleta de CPF, matrícula, telefone, endereço, dados sensíveis, dados de menores além do prenome necessário à chamada, nem qualquer dado de navegação, rastreamento ou perfil.

## Fundamentos

- **Necessidade**: cada campo existe para a finalidade do sistema, que é o registro de frequência (art. 6º, III).
- **Minimização**: apenas o estritamente necessário, com presença implícita em vez de registro positivo de todos os dias (art. 6º, III).
- **Finalidade**: dados usados exclusivamente pelo professor dono da conta, dentro do aplicativo.
- **Segurança**: senha com scrypt, sessões opacas com hash no banco, tráfego protegido por HTTPS no deploy, isolamento por dono em toda consulta.
- **Transparência**: este documento e a interface avisam o que é armazenado.

## Direitos do titular

O professor é o controlador dos dados dos alunos que cadastra. O aplicativo oferece os meios:

- **Acesso e portabilidade**: a grade de Originais exibe o histórico completo por aluno; a exportação por `pg_dump` entrega os dados em formato aberto.
- **Correção**: edição do nome e das turmas na visão Alunos.
- **Eliminação**: a exclusão do aluno apaga o cadastro e as faltas; a desativação retira o aluno das chamadas futuras preservando o histórico, escolha do professor conforme a necessidade.
- **Eliminação completa da conta**: apagar o usuário no banco remove em cascata alunos, chamadas e sessões dele.

```sql
-- eliminar tudo de um professor (irreversível)
delete from usuarios where id = '<id do professor>';
```

## Repartição de papéis

O desenvolvedor do aplicativo não tem acesso a dados de produção: o software roda na infraestrutura escolhida pelo professor, sem telemetria e sem dependência de terceiros. O professor, ao usar o sistema, responde pelos dados que insere, mantendo a caderneta digital dentro da mesma finalidade da caderneta de papel.

## Repositório limpo

- O histórico de versões e os arquivos atuais não contêm dados reais de pessoas.
- A semente de desenvolvimento usa nomes sintéticos e roda por comando opcional.
- Não existem chaves, tokens ou credenciais no controle de versões; o `.env.example` documenta as variáveis vazias.

A verificação de limpeza foi feita na reconstrução: varredura por nomes, e-mails, padrões de documento e segredos, com o histórico auditado commit a commit.

## Papéis e minimização

O administrador configura séries, turmas, alunos e contas; o professor acessa apenas os alunos das turmas atribuídas e as próprias chamadas. A visibilidade por papel reduz a exposição: nenhuma listagem devolve ao professor dados de turmas que não lhe pertencem. A trilha de auditoria registra apenas identificadores e nomes de ação: nenhum dado pessoal de aluno entra no log.
