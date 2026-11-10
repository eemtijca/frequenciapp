# Floci

Guia para usar o Floci como única nuvem de desenvolvimento e teste do FrequenciApp. Nenhum comando de AWS, Azure, GCP ou Terraform pode apontar para serviço real.

## Contrato

- AWS em `http://localhost:4566`.
- Azure em `https://localhost:4577`.
- GCP em `http://localhost:4588`.
- Credenciais sempre sintéticas. Nenhuma conta, assinatura, projeto ou chave real.
- Todo comando passa pelos wrappers de `scripts/cloud/` ou pela guarda de nuvem.
- A guarda falha fechado quando o endpoint, a nuvem ou a credencial não forem locais.

## Versões validadas

| Emulador | Versão validada | Observação                                                             |
| -------- | --------------- | ---------------------------------------------------------------------- |
| AWS      | 2.4.0           | O compose do repositório fixa 2.1.0 e o CI usa essa versão.            |
| Azure    | 0.13.0          | Usar o Compose do repositório com Container Apps real.                 |
| GCP      | 0.9.0           | Usar o Compose do repositório. O 0.12.0 falhou no ensaio de Cloud Run. |

O Floci Azure iniciado por `floci az start` usa Container Apps em modo mock por padrão. Para o ensaio de Terraform, use o serviço `floci-az` de `infra/floci/compose.floci.yml`, que define `FLOCI_AZ_SERVICES_CONTAINER_APPS_MOCKED=false`. O Floci GCP iniciado por `floci gcp start` pode manter estado residual; o ensaio de Terraform usa a versão pinada e um volume limpo.

## Preparar

```bash
floci start
floci az start
floci gcp start
floci az setup
```

Para o modo real de Container Apps, prefira:

```bash
FLOCI_AZ_CONTAINER=floci-az FLOCI_AZ_PORT=4577 \
  docker compose -f infra/floci/compose.floci.yml up -d floci-az
FLOCI_GCP_CONTAINER=floci-gcp FLOCI_GCP_PORT=4588 \
  docker compose -f infra/floci/compose.floci.yml up -d floci-gcp
floci az setup
```

Os dados do Azure ficam em `~/.floci/az/floci-az/azure-config`. Não use `floci az setup --global`, para não alterar a configuração real do Azure CLI.

## Wrappers

PowerShell:

```powershell
. .\scripts\cloud\floci-ambiente.ps1
Import-FlociTudo
.\scripts\cloud\guardar-floci.ps1
.\scripts\cloud\smoke-floci.ps1
.\scripts\cloud\aws-floci.ps1 s3 ls
.\scripts\cloud\az-floci.ps1 group list
.\scripts\cloud\gcloud-floci.ps1 storage ls
```

Bash:

```bash
. scripts/cloud/floci-ambiente.sh
floci_carregar_tudo
bash scripts/cloud/guardar-floci.sh
bash scripts/cloud/smoke-floci.sh
bash scripts/cloud/aws-floci.sh s3 ls
bash scripts/cloud/az-floci.sh group list
bash scripts/cloud/gcloud-floci.sh storage ls
```

## AWS

```bash
export AWS_ENDPOINT_URL=http://localhost.floci.io:4566
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
```

Passar `--endpoint-url http://localhost:4566` em todo comando. Não usar `--profile`.

## Azure

- `az cloud show --query name -o tsv` precisa retornar `floci-az`.
- `~/.azure` precisa continuar em `AzureCloud`.
- `AZURE_CONFIG_DIR` e `REQUESTS_CA_BUNDLE` vêm de `floci az env` ou do wrapper.
- O provisionamento usa Terraform. O CLI serve para verificação e operações de dados.

## GCP

O `gcloud` ignora as variáveis `*_EMULATOR_HOST`. O wrapper define:

```bash
export CLOUDSDK_CONFIG="$HOME/.floci/gcp/gcloud"
export CLOUDSDK_CORE_PROJECT=floci-local
export CLOUDSDK_CORE_ACCOUNT=floci@local
export CLOUDSDK_AUTH_ACCESS_TOKEN=floci-fake-token
export CLOUDSDK_CORE_DISABLE_PROMPTS=1
export CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK=1
export CLOUDSDK_API_ENDPOINT_OVERRIDES_STORAGE="http://localhost:4588/storage/v1/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_PUBSUB="http://localhost:4588/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_SECRETMANAGER="http://localhost:4588/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_IAM="http://localhost:4588/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_CLOUDRESOURCEMANAGER="http://localhost:4588/v1/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_SERVICEUSAGE="http://localhost:4588/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_RUN="http://localhost:4588/v2/"
export CLOUDSDK_API_ENDPOINT_OVERRIDES_SQL="http://localhost:4588/sql/v1beta4/"
```

O override do Cloud Resource Manager é obrigatório: sem ele, o `gcloud` consulta o serviço real. O `gcloud storage cp -` falha com HTTP 406; usar arquivo temporário. O `gcloud projects describe` não é suportado pelo emulador e não deve ser usado como smoke.

## Terraform

Os três módulos usam `modo_local=true` e endpoints do Floci. O ensaio oficial é:

```bash
pnpm run infra:floci:aws
pnpm run infra:floci:azure
pnpm run infra:floci:gcp
```

No host Windows, esses comandos rodam no contêiner de `tests/ferramentas`, com a rede do host e o socket do Docker. O ensaio aplica, confere `/api/saude` e destrói os recursos.

## Testes e guardas

- `scripts/cloud/guardar-floci.ps1` e `.sh` conferem endpoints, nuvem e credenciais.
- `scripts/cloud/smoke-floci.ps1` e `.sh` exercitam AWS, Azure e GCP com dados sintéticos.
- `scripts/banco/guardar-descartavel.ps1` e `.sh` recusam banco não descartável.
- Nenhum teste usa dados reais, produção ou credenciais reais.

## Limitações

- O Floci GCP não expõe HTTPS.
- O Floci Azure usa TLS e certificado próprio.
- O Floci AWS usa `localhost.floci.io` para S3 virtual-hosted. Em contêiner, usar path-style e o nome do serviço.
- O `floci az doctor` não encontra `az.cmd` no Windows; a guarda usa `Get-Command az` e `az version`.
- O `floci env --shell powershell` imprime linha vazia e comentário; usar os wrappers ou `-o json`.
