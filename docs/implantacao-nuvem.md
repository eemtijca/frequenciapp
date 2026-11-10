# Implantação em nuvem

O projeto pode ser implantado na AWS, no Azure ou no GCP com Terraform, além da Vercel e das demais formas descritas em [deploy.md](deploy.md). Cada nuvem tem um módulo raiz independente em `infra/terraform/<nuvem>`, com dois modos:

- `modo_local = true`: usa os emuladores do Floci, recursos mínimos e a imagem local. Serve para testar o Terraform e a aplicação sem conta em nuvem.
- `modo_local = false`: caminho de produção, com serviços gerenciados, criptografia, backups, identificadores e segredos write-only.

O [ADR-036](adr/036-implantacao-multinuvem.md) registra a decisão.

## Arquitetura por nuvem

| Camada              | AWS                                   | Azure                                                | GCP                            |
| ------------------- | ------------------------------------- | ---------------------------------------------------- | ------------------------------ |
| Computação          | ECS Fargate atrás de ALB              | App Service (produção) e Container Apps (modo local) | Cloud Run v2                   |
| Banco               | RDS PostgreSQL 17                     | PostgreSQL Flexible Server                           | Cloud SQL PostgreSQL           |
| Segredos            | Secrets Manager                       | Key Vault                                            | Secret Manager                 |
| Registro de imagens | ECR                                   | Azure Container Registry                             | Artifact Registry              |
| Observabilidade     | CloudWatch Logs e alarmes             | Log Analytics e alertas                              | Cloud Logging e alerta de 5xx  |
| Rede                | VPC com sub-redes públicas e privadas | VNet com sub-redes delegadas                         | VPC com Private Service Access |

O PostgreSQL de bootstrap é separado das credenciais de aplicação. `url_runtime` e `url_migracao` são entradas sensíveis distintas e previamente provisionadas. Em produção, a aplicação não recebe a conta administrativa nem `DIRECT_URL`. O modo local é sintético: ele usa a credencial descartável do emulador e não atesta grants, IAM ou RBAC gerenciados. O contrato está preparado em código e o caminho de produção exige o aceite explícito descrito abaixo. Não há cache externo nem armazenamento de anexos.

O agendador continua sendo o GitHub Actions. O workflow `notificacoes.yml` chama `GET /api/notificacoes/agenda` a cada cinco minutos com `Authorization: Bearer CRON_SECRET`, e `fila-planilha.yml` faz o mesmo em `GET /api/planilha/fila/agenda` para esvaziar a fila de envios às planilhas; nenhuma nuvem cria EventBridge Scheduler, jobs do Container Apps ou Cloud Scheduler para isso.

## Pré-requisitos

- Terraform 1.11 ou superior.
- Docker com Compose.
- Emuladores do Floci (`floci`, `floci-az` e `floci-gcp`).
- AWS CLI, Azure CLI e gcloud apenas para inspeção manual; os scripts usam `curl` e o próprio Terraform.
- Node 20.19 ou superior para construir a imagem da aplicação.

## Estrutura

```text
infra/
  floci/
    compose.floci.yml   # emuladores usados nos testes locais e no CI
    testar.sh           # ciclo completo por nuvem
  terraform/
    validar.sh          # init sem backend e validate nas três nuvens
    aws/
    azure/
    gcp/
```

Cada módulo tem `versions.tf`, `providers.tf`, `variables.tf`, `locals.tf`, os recursos separados por assunto, `outputs.tf` e os exemplos `terraform.tfvars.example`, `terraform.tfvars.local.example` e `backend.hcl.example` em cada nuvem. Os arquivos `.tfvars` reais não são versionados.

## Comandos

```bash
pnpm run infra:fmt        # formata todos os módulos
pnpm run infra:validar    # init sem backend e validate nas três nuvens
pnpm run infra:floci      # aplica e destrói nas três nuvens pelo Floci
pnpm run infra:floci:aws  # apenas AWS
pnpm run infra:floci:azure
pnpm run infra:floci:gcp
```

O script `infra/floci/testar.sh` constrói a imagem `frequenciapp:local` quando necessário, sobe os emuladores quando as portas padrão não respondem, aplica o Terraform, confere `GET /api/saude` e destrói os recursos. Use `MANTER=true` para preservar o ambiente após o teste. O ciclo local usa o schema `public` do emulador e não cria os jobs de migração da Azure e do GCP, que não existem nas versões fixadas do Floci.

## Modo de produção

1. Publique a imagem no registro da nuvem e informe `imagem_aplicacao`.
2. Copie `terraform.tfvars.example` para `terraform.tfvars` e ajuste os valores. Na AWS, informe também `certificado_arn`; o balanceador só encaminha HTTP na ausência do certificado no modo local.
3. Configure o backend remoto. Cada nuvem tem um exemplo em `backend.hcl.example`: na AWS com bucket versionado, criptografia e lockfile; no Azure com conta de armazenamento e autenticação do Entra ID; no GCP com bucket versionado.
4. Rode `terraform init` e `terraform plan` e revise o plano antes de aplicar. O repositório não aplica em produção por conta própria.

O `AUTH_SECRET` nasce de valor efêmero e usa argumento write-only no cofre. As entradas de credenciais são sensíveis, mas o plano, o modo local e o state exigem proteção própria; sensibilidade não elimina persistência. A separação foi validada por `terraform fmt -check`, `terraform validate` e pelo ciclo de apply, saúde e destroy do Floci nas três nuvens. Esses ensaios não comprovam grants, IAM ou RBAC de serviços gerenciados.

### Variáveis da aplicação

| Variável                  | Uso na nuvem                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`            | Conexão do papel de DML, sem ownership nem atributos administrativos.                   |
| `DIRECT_URL`              | Conexão apenas do job migrador, com owner dedicado ao schema.                           |
| `AUTH_SECRET`             | Segredo das sessões, com 32 caracteres ou mais; gerado pelo Terraform em produção.      |
| `TZ_APP`                  | Fuso usado para resolver o dia corrente; padrão `America/Fortaleza`.                    |
| `PERMITIR_HTTP`           | `false` em produção e `true` no modo local.                                             |
| `CRON_SECRET`             | Segredo opcional da agenda, gerado pelo Terraform em produção.                          |
| `GOOGLE_*`                | Integração opcional com OAuth e Sheets API, configurada no serviço.                     |
| `PUSH_VAPID_*`            | Notificações Web Push opcionais, configuradas no serviço.                               |
| `ADMIN_*`                 | Bootstrap opcional do administrador inicial no entrypoint, sem alterar conta existente. |
| `url_runtime`             | Entrada sensível do módulo com a conexão de DML do runtime.                             |
| `url_migracao`            | Entrada sensível do módulo com a conexão do owner do schema.                            |
| `runtime_provisionado`    | Aceite explícito após o ensaio de privilégios; padrão falso.                            |
| `revisao_aplicacao`       | SHA completo da imagem e do migrador, exigido em produção.                              |
| `migracao_confirmada_sha` | Recibo do job concluído, igual a `revisao_aplicacao` antes de promover o serviço.       |
| `schema_aplicacao`        | Schema exclusivo já migrado; não pode ser `public` em produção.                         |

O serviço principal define `MIGRAR_NA_PARTIDA=false`, `DATABASE_SCHEMA` e `COMMIT_SHA`. Jobs e o container lateral são os únicos consumidores de `DIRECT_URL`. Na Azure e no GCP, a identidade do serviço não lê o segredo de migração; na AWS, a referência existe apenas no container lateral e a API não recebe a variável. A conta administrativa gerenciada fica reservada ao bootstrap.

### Bootstrap, migração e aceite

O provisionamento de papéis é uma operação separada. Criar logins sem privilégios administrativos, aplicar as migrações iniciais como owner dedicado e executar `scripts/banco/provisionar-runtime.sql` no schema exclusivo, nunca em `public`. O SQL recebe `app_schema`, `papel_runtime` e `papel_migracao` via psql, não cria senhas e não aplica grants a schemas alheios. Falha se memberships, PUBLIC, ownership ou atributos administrativos impedirem o contrato; não captura a recusa como proteção nem revoga PUBLIC globalmente. Antes da execução, o banco dedicado precisa remover `TEMP` e `USAGE` públicos que dariam ao runtime privilégio efetivo fora do schema.

Depois do ensaio de privilégios efetivos, `runtime_provisionado` é um aceite explícito, com padrão falso. Informar `url_runtime`, `url_migracao`, `schema_aplicacao` e SHA em `revisao_aplicacao`. Isso não é efetuado automaticamente pela alteração de código. O SQL foi exercitado em PostgreSQL 17 descartável: DML permitido, DDL, `SET ROLE`, leitura de `_prisma_migrations` e schema externo recusados. O ensaio `tests/servidor/privilegios-runtime.sh` permanece preparado para a pilha exclusiva da issue #423-C.

Na AWS, um container migrador não essencial encerra com sucesso antes de liberar o container API por `dependsOn: SUCCESS`; a trava do migrador é preservada. Na Azure, um Container Apps Job manual tem identidade própria e acesso somente ao segredo migrador. Em produção exige `ambiente_job_migracao_id` de environment com rede aprovada, sem criar topologia ou custo implicitamente. No GCP, um Cloud Run Job manual tem service account própria e conexão privada. Os jobs não repetem mutações automaticamente e não são criados no modo local da Azure e do GCP, porque as versões fixadas do Floci não implementam esses recursos.

Azure e GCP exigem `migracao_confirmada_sha` igual à revisão da imagem antes de liberar o serviço. Criar o job por Terraform não comprova execução: o operador ou futuro adaptador precisa executá-lo, verificar seu término e registrar o recibo sob exclusão por destino. Nenhum recibo de produção foi produzido nesta frente. `implantacao.yml` recusa destinos sem adaptador aprovado, e não aplica uma migração cloud paralela em silêncio.

Floci não comprova grants ou RBAC de serviços gerenciados. Permanecem obrigatórios: PostgreSQL 17 sintético, providers do lock, `terraform fmt -check`, init sem backend e sem credenciais cloud, validação dos módulos, conclusão dos jobs, IAM/RBAC e saúde por revisão. Nenhuma conexão pública de banco é aberta para fazer validação. O ciclo local de apply, saúde e destroy passou com AWS 2.4.0, Azure 0.13.0 e GCP 0.9.0; a integração com o orquestrador comum, o custo e a rede do job Azure continuam exigindo aceite operacional antes da ativação.

### Agenda de notificações

O `CRON_SECRET` gerado pelo Terraform fica no cofre da nuvem. Copie o valor para o segredo `CRON_SECRET` do repositório no GitHub Actions e defina a variável `NOTIFICACOES_APP_URL` com a URL pública da aplicação. Sem essas configurações, o workflow de notificações apenas registra que a agenda está aguardando o segredo, sem falhar.

### Integração Google

A integração com OAuth e Sheets API é opcional em runtime. Para habilitá-la, defina as cinco variáveis `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PICKER_API_KEY` e `GOOGLE_PROJECT_NUMBER` no serviço de computação da nuvem, com `GOOGLE_REDIRECT_URI` apontando para `/api/planilha/google/retorno`. O Terraform não cria recursos para a integração; apenas a saída HTTPS para `script.google.com` e `script.googleapis.com` (ou os hosts equivalentes do redirecionamento) precisa estar liberada na rede. Sem as variáveis, o aplicativo segue funcionando e a área de planilhas fica indisponível.

As chaves `PUSH_VAPID_*` seguem a mesma lógica: são opcionais, não geram recursos de nuvem e podem ser definidas no serviço quando a escola usar notificações push.

## Limites do modo local

- A AWS não cria ECR, o Azure não cria ACR e o GCP não cria o Artifact Registry no modo local; a imagem vem do Docker da máquina e os emuladores não concluem a exclusão desses registros.
- O ECS emulado não injeta segredos do Secrets Manager; no modo local as variáveis vão no ambiente da tarefa, com valores de desenvolvimento.
- O Key Vault e o Log Analytics ficam restritos à produção no Azure: o emulador não responde ao data plane de certificados nem à listagem de workspaces excluídos.
- O Container Apps emulado exige `FLOCI_AZ_SERVICES_CONTAINER_APPS_MOCKED=false` e TLS, configuração já presente em `compose.floci.yml`.
- O PostgreSQL emulado do Azure registra o recurso no ARM sem criar o banco no motor; o script de teste cria com `createdb` quando ainda não existe.
- Os jobs de migração da Azure e do GCP existem apenas em produção. O Floci 0.13.0 não implementa Container Apps Jobs e o 0.9.0 não implementa Cloud Run Jobs; no modo local a saúde confere a conexão e a revisão, não o schema migrado.
- O modo local da AWS aplica as migrações no schema `public` com a credencial descartável do emulador. Ele não comprova a separação de papéis exigida em produção.
- O proxy de ingress do floci-az e do floci-gcp usa o cliente HTTP do JDK, que tenta o upgrade h2c na primeira requisição; o servidor standalone do Next encerra a conexão sem responder e o proxy devolve 502. Por isso o script confere a saúde na réplica real, pela porta publicada do contêiner, e não pelo FQDN emulado.
- O Secrets Manager emulado mantém a janela de recuperação; no modo local o módulo usa `recovery_window_in_days = 0` para que o ciclo de teste possa recriar os segredos.
- O Cloud Run emulado usa a imagem local; o Artifact Registry existe apenas em produção.

## Segurança

- Nenhum segredo é versionado em `tfvars`; os valores de produção são gerados pelo Terraform e gravados em cofres por argumentos write-only.
- As tarefas, o banco e os recursos de computação ficam em sub-redes privadas quando a nuvem oferece a opção, com grupos de segurança ou regras encadeadas.
- As roles seguem o menor privilégio, com escopo nos recursos criados pelo módulo.
- O domínio próprio é opcional. Sem ele, o TLS usa os endpoints gerenciados de cada plataforma. Na AWS o alias é criado no Route 53 quando `dominio` e `zona_hospedada_id` são informados, junto do `certificado_arn` validado. No Azure e no GCP o binding do hostname com certificado gerenciado acontece fora do Terraform; nesses dois provedores a variável `dominio` apenas compõe o `APP_URL` e deve ser preenchida depois do binding.
