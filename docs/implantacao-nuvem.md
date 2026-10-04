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

O banco é sempre PostgreSQL gerenciado e o dono do schema é a própria conexão de runtime: `DATABASE_URL` e `DIRECT_URL` usam o mesmo usuário administrador em cada nuvem. Não existe papel de runtime separado, cache externo nem armazenamento de anexos.

O agendador continua sendo o GitHub Actions. O workflow `notificacoes.yml` chama `GET /api/notificacoes/agenda` a cada cinco minutos com `Authorization: Bearer CRON_SECRET`; nenhuma nuvem cria EventBridge Scheduler, jobs do Container Apps ou Cloud Scheduler para isso.

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
npm run infra:fmt        # formata todos os módulos
npm run infra:validar    # init sem backend e validate nas três nuvens
npm run infra:floci      # aplica e destrói nas três nuvens pelo Floci
npm run infra:floci:aws  # apenas AWS
npm run infra:floci:azure
npm run infra:floci:gcp
```

O script `infra/floci/testar.sh` constrói a imagem `frequenciapp:local` quando necessário, sobe os emuladores quando as portas padrão não respondem, aplica o Terraform, confere `GET /api/saude` e destrói os recursos. Use `MANTER=true` para preservar o ambiente após o teste.

## Modo de produção

1. Publique a imagem no registro da nuvem e informe `imagem_aplicacao`.
2. Copie `terraform.tfvars.example` para `terraform.tfvars` e ajuste os valores. Na AWS, informe também `certificado_arn`; o balanceador só encaminha HTTP na ausência do certificado no modo local.
3. Configure o backend remoto. Cada nuvem tem um exemplo em `backend.hcl.example`: na AWS com bucket versionado, criptografia e lockfile; no Azure com conta de armazenamento e autenticação do Entra ID; no GCP com bucket versionado.
4. Rode `terraform init` e `terraform plan` e revise o plano antes de aplicar. O repositório não aplica em produção por conta própria.

O `AUTH_SECRET` nasce de um valor efêmero e chega ao cofre por argumento write-only, sem registro no state. O caminho de produção de cada nuvem foi validado por `terraform validate`; os testes automatizados cobrem o modo local.

### Variáveis da aplicação

| Variável        | Uso na nuvem                                                                            |
| --------------- | --------------------------------------------------------------------------------------- |
| `DATABASE_URL`  | Conexão de runtime e dono do schema, com o administrador do banco.                      |
| `DIRECT_URL`    | Conexão do Prisma CLI, do migrador e dos scripts administrativos; mesmo administrador.  |
| `AUTH_SECRET`   | Segredo das sessões, com 32 caracteres ou mais; gerado pelo Terraform em produção.      |
| `TZ_APP`        | Fuso usado para resolver o dia corrente; padrão `America/Fortaleza`.                    |
| `PERMITIR_HTTP` | `false` em produção e `true` no modo local.                                             |
| `CRON_SECRET`   | Segredo opcional da agenda, gerado pelo Terraform em produção.                          |
| `GOOGLE_*`      | Integração opcional com OAuth e Sheets API, configurada no serviço.                     |
| `PUSH_VAPID_*`  | Notificações Web Push opcionais, configuradas no serviço.                               |
| `ADMIN_*`       | Bootstrap opcional do administrador inicial no entrypoint, sem alterar conta existente. |

O entrypoint usa `DIRECT_URL` e cai para `DATABASE_URL` quando ela não existe. O migrador aplica cada arquivo de `prisma/migrations` uma única vez, com trava consultiva e conferência de checksum.

### Migrações

O entrypoint do contêiner aguarda o banco, aplica as migrações e sobe a API. Em mais de uma réplica as migrações podem competir; o Prisma e a trava consultiva protegem a aplicação, mas o primeiro deploy deve acontecer com uma réplica antes de escalar.

Em produção, o workflow `migracoes.yml` aplica as migrações na `main` com o segredo `DIRECT_URL_PROD`, que deve conter a conexão de administrador do banco da nuvem. O build da Vercel apenas gera o cliente Prisma; o caminho em nuvem segue o mesmo desenho.

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
- O proxy de ingress do floci-az e do floci-gcp usa o cliente HTTP do JDK, que tenta o upgrade h2c na primeira requisição; o servidor standalone do Next encerra a conexão sem responder e o proxy devolve 502. Por isso o script confere a saúde na réplica real, pela porta publicada do contêiner, e não pelo FQDN emulado.
- O Secrets Manager emulado mantém a janela de recuperação; no modo local o módulo usa `recovery_window_in_days = 0` para que o ciclo de teste possa recriar os segredos.
- O Cloud Run emulado usa a imagem local; o Artifact Registry existe apenas em produção.

## Segurança

- Nenhum segredo é versionado em `tfvars`; os valores de produção são gerados pelo Terraform e gravados em cofres por argumentos write-only.
- As tarefas, o banco e os recursos de computação ficam em sub-redes privadas quando a nuvem oferece a opção, com grupos de segurança ou regras encadeadas.
- As roles seguem o menor privilégio, com escopo nos recursos criados pelo módulo.
- O domínio próprio é opcional. Sem ele, o TLS usa os endpoints gerenciados de cada plataforma. Na AWS o alias é criado no Route 53 quando `dominio` e `zona_hospedada_id` são informados, junto do `certificado_arn` validado. No Azure e no GCP o binding do hostname com certificado gerenciado acontece fora do Terraform; nesses dois provedores a variável `dominio` apenas compõe o `APP_URL` e deve ser preenchida depois do binding.
