# ADR-070: papéis de runtime separados nas implantações em nuvem

## Estado

Aceita em 2026-11-10.

## Contexto

Os módulos Terraform de AWS, Azure e GCP entregavam à aplicação a mesma conexão administrativa usada pelo migrador. O banco era criado com um administrador único, `DATABASE_URL` e `DIRECT_URL` apontavam para ele e o serviço principal podia executar DDL ou assumir o papel de migração. O advisory GHSA-wgqx registrou que o alcance real dependia dos grants, que não estavam caracterizados.

A correção precisa valer para o caminho de produção sem transformar o ensaio local do Floci em uma promessa de grants gerenciados.

## Decisão

- `url_runtime` e `url_migracao` são entradas sensíveis distintas, previamente provisionadas. O runtime não deriva da conta administrativa do banco.
- `runtime_provisionado` é um aceite explícito, com padrão falso. Em produção, `revisao_aplicacao` precisa ter 40 hexadecimais e o schema da aplicação não pode ser `public`.
- O serviço principal recebe apenas `DATABASE_URL`. `DIRECT_URL` fica restrita ao migrador: container lateral na AWS, Container Apps Job no Azure e Cloud Run Job no GCP.
- Na AWS, o container migrador não essencial precisa terminar com sucesso antes do container da API por `dependsOn: SUCCESS`. Na Azure e no GCP, o job tem identidade própria, acesso somente ao segredo migrador e exige confirmação da revisão antes de liberar o serviço.
- Na Azure e no GCP, as políticas de leitura de segredo do runtime não incluem o segredo de migração. Na AWS, a referência ao segredo existe apenas no container lateral e o container da API não recebe `DIRECT_URL`.
- `scripts/banco/provisionar-runtime.sql` recebe `app_schema`, `papel_runtime` e `papel_migracao` por psql, não cria logins nem senhas e não altera schemas alheios. Ele recusa atributos administrativos, memberships, ownership, `CREATE` ou `TEMP` efetivos e schema externo com `USAGE`.
- O SQL remove privilégios explícitos do runtime nas tabelas, sequences, funções e tipos do schema antes de conceder apenas DML, uso de sequences e uso de tipos. `_prisma_migrations` fica fora do alcance do runtime.
- O provisionamento exige que as migrações iniciais já tenham sido aplicadas pelo owner dedicado e que `_prisma_migrations` exista.
- O ensaio local continua sintético. Ele usa a credencial descartável do emulador e não atesta a separação de papéis, os grants gerenciados ou o RBAC real; serve para exercitar a ligação entre os recursos.

## Alternativas consideradas

- Manter o mesmo administrador com grants reduzidos por `REVOKE`: recusada porque o runtime continuaria capaz de assumir o papel administrativo por ownership ou membership.
- Criar o papel de runtime automaticamente no entrypoint: recusada porque o entrypoint não deve receber a credencial administrativa nem executar DDL de provisionamento.
- Revogar `PUBLIC` globalmente no banco: recusada porque afetaria outros schemas e outras aplicações. O operador prepara um banco dedicado e remove `TEMP` e `USAGE` públicos conforme o contrato.
- Confiar apenas em `terraform validate`: recusada porque a validação declarativa não prova grants efetivos.
- Executar o job de migração em toda subida da aplicação: recusada porque mistura privilégios e repete mutações sem um recibo por revisão.
- Tratar o modo local como prova de segurança: recusada porque o Floci não emula IAM/RBAC nem o motor de banco gerenciado com fidelidade.

## Consequências

- A implantação em nuvem exige provisionamento prévio de dois logins, do schema e das migrações iniciais.
- O runtime deixa de conseguir criar objetos, assumir o migrador ou ler o segredo de migração.
- Azure e GCP exigem `migracao_confirmada_sha` igual ao SHA da imagem antes de promover o serviço; criar o job não comprova execução.
- O ensaio local da AWS executa o migrador no schema `public` do emulador. Azure e GCP não criam o job no Floci porque as versões fixadas não implementam Container Apps Jobs nem Cloud Run Jobs; a saúde local confere apenas a conexão.
- A separação de privilégios em produção ainda depende de revisão operacional dos grants, do IAM/RBAC e do teste `tests/servidor/privilegios-runtime.sh` na pilha exclusiva da issue #423-C.
- A conta administrativa gerenciada continua reservada ao bootstrap e à criação inicial do schema.
