#!/usr/bin/env bash
# Valida os arquivos de servidor, proxy, backup e chart sem tocar na máquina.
set -Eeuo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-validar.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

export AUTH_SECRET="segredo-dummy-de-32-bytes-para-validacao"
export METRICAS_TOKEN="token-dummy-de-validacao-com-32-caracteres"
export PROMETHEUS_PORTA=9090
export POSTGRES_USER="frequencia"
export POSTGRES_PASSWORD="frequencia"
export POSTGRES_DB="frequencia"
export REDIS_PASSWORD="senha-sintetica-de-validacao"
export DOMINIO="frequencia.exemplo.br"
export ACME_EMAIL="administracao@escola.exemplo.br"
export ACME_CA="https://acme-v02.api.letsencrypt.org/directory"
export APP_ENV_FILE="$tmp/app.env"
export OPS_ENV_FILE="$REPO/infra/servidor/servidor.env.example"
export SERVIDOR_CONFIG_DIR="$tmp/config"
export BACKUP_HOST_DIR="$tmp/backups"
mkdir -p "$SERVIDOR_CONFIG_DIR" "$BACKUP_HOST_DIR"

cat >"$APP_ENV_FILE" <<EOF
AUTH_SECRET=$AUTH_SECRET
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
REDIS_PASSWORD=$REDIS_PASSWORD
EOF
chmod 600 "$APP_ENV_FILE"

# Token sintético da validação: vai para um arquivo restrito e nunca é impresso.
printf '%s' "$METRICAS_TOKEN" >"$tmp/metricas-token"
chmod 600 "$tmp/metricas-token"

for script in "$REPO"/scripts/servidor/*.sh; do
  bash -n "$script"
done

docker run --rm \
  -v "$REPO:/mnt" \
  -w /mnt \
  koalaman/shellcheck:stable@sha256:bb596a0d169b85ddd81d8b6d3a2ff6d5baf5fca10b97f575ebc647c3dff62b3d \
  -x -P scripts/servidor -P scripts/servidor/controlador scripts/servidor/*.sh scripts/servidor/controlador/*.sh

docker run --rm \
  -v "$REPO:/mnt" \
  -w /mnt \
  koalaman/shellcheck:stable@sha256:bb596a0d169b85ddd81d8b6d3a2ff6d5baf5fca10b97f575ebc647c3dff62b3d \
  -x infra/observabilidade/prometheus/entrypoint.sh

docker run --rm \
  -v "$REPO:/mnt" \
  -w /mnt \
  koalaman/shellcheck:stable@sha256:bb596a0d169b85ddd81d8b6d3a2ff6d5baf5fca10b97f575ebc647c3dff62b3d \
  -x infra/observabilidade/blackbox/entrypoint.sh

docker run --rm \
  -v "$REPO:/mnt" \
  -w /mnt \
  koalaman/shellcheck:stable@sha256:bb596a0d169b85ddd81d8b6d3a2ff6d5baf5fca10b97f575ebc647c3dff62b3d \
  -x infra/observabilidade/alertmanager/entrypoint.sh

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-caddy.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-nginx.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-caddy.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  -f "$REPO/compose.fila.yml" \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-nginx.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  -f "$REPO/compose.fila.yml" \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-caddy.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  --profile alertas \
  config --quiet

docker compose \
  -f "$REPO/compose.yml" \
  -f "$REPO/compose.servidor.yml" \
  -f "$REPO/compose.servidor-nginx.yml" \
  -f "$REPO/compose.observabilidade.yml" \
  --profile alertas \
  config --quiet

# A configuração referencia /etc/prometheus/regras.yml e /tmp/metricas-token.
# O mesmo UID do host mantém a leitura possível em worktrees de permissões restritas.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/prometheus:/etc/prometheus:ro" \
  -v "$tmp/metricas-token:/tmp/metricas-token:ro" \
  --entrypoint /bin/promtool \
  prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06 \
  check config /etc/prometheus/prometheus.yml

docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/prometheus:/etc/prometheus:ro" \
  -v "$tmp/metricas-token:/tmp/metricas-token:ro" \
  --entrypoint /bin/promtool \
  prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06 \
  check rules /etc/prometheus/regras.yml

# As séries sintéticas cobrem sonda com sucesso, falha, coletor fora do ar,
# ausência de amostra, recuperação e perfil de alertas desligado.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/prometheus:/etc/prometheus:ro" \
  -w /etc/prometheus \
  --entrypoint /bin/promtool \
  prom/prometheus:v3.16.0@sha256:e04987641b57704f408e31f6373ba4138ecf27cb4a165d24aabb6c38fddd0f06 \
  test rules /etc/prometheus/regras.test.yml

# O blackbox não expande variáveis no YAML: a cópia temporária prova o domínio real.
sed "s|__DOMINIO__|$DOMINIO|g" \
  "$REPO/infra/observabilidade/blackbox/blackbox.yml" >"$tmp/blackbox.yml"
chmod 644 "$tmp/blackbox.yml"

docker run --rm --user "$(id -u):$(id -g)" \
  -v "$tmp/blackbox.yml:/etc/blackbox_exporter/blackbox.yml:ro" \
  --entrypoint /bin/blackbox_exporter \
  prom/blackbox-exporter:v0.29.1@sha256:ea1c7aa3ef3f307cd03e85f34abb604478ccb90b567fc690da0cd9776da76b13 \
  --config.check --config.file=/etc/blackbox_exporter/blackbox.yml

entrypoint_alertmanager="$REPO/infra/observabilidade/alertmanager/entrypoint.sh"
grep -Fq 'smtp_auth_password_file: /tmp/alertmanager-smtp-password' "$entrypoint_alertmanager"
grep -Fq 'url_file: /tmp/alertmanager-webhook-url' \
  "$REPO/infra/observabilidade/alertmanager/alertmanager.yml"
grep -Fq 'credentials_file: /tmp/alertmanager-webhook-token' "$entrypoint_alertmanager"
if grep -Fq 'smtp_auth_password:' "$entrypoint_alertmanager"; then
  echo "O entrypoint do Alertmanager não pode gravar a senha SMTP na configuração." >&2
  exit 1
fi

trechos_sed="$(sed -n '/^[[:space:]]*sed /,/alertmanager\.yml/p' "$entrypoint_alertmanager")"
if printf '%s\n' "$trechos_sed" | grep -Eq '\$(smtp_senha|webhook|webhook_token)'; then
  echo "O entrypoint do Alertmanager não pode passar segredos em argumento do sed." >&2
  exit 1
fi

regra_disco="$(awk '/alert: FrequenciappDiscoBaixo/{ativa=1} ativa{print} ativa && /^$/{exit}' \
  "$REPO/infra/observabilidade/prometheus/regras.yml")"
if printf '%s\n' "$regra_disco" | grep -Fq '{{ $labels.mountpoint }}'; then
  echo "O alerta de disco não pode incluir o ponto de montagem na descrição." >&2
  exit 1
fi
grep -Fq 'alert: FrequenciappSondaColetorIndisponivel' \
  "$REPO/infra/observabilidade/prometheus/regras.yml"
grep -Fq 'alert: FrequenciappSondaSemAmostra' \
  "$REPO/infra/observabilidade/prometheus/regras.yml"
grep -Fq 'absent(probe_success{job="blackbox"}) and on(job) (up{job="blackbox"} == 1)' \
  "$REPO/infra/observabilidade/prometheus/regras.yml"

# O modelo e as configurações geradas nos dois modos usam apenas campos nativos
# de arquivo para os segredos.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro" \
  --entrypoint /bin/amtool \
  prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c \
  check-config /etc/alertmanager/alertmanager.yml

mkdir -p "$tmp/alertmanager-webhook" "$tmp/alertmanager-email"
chmod 700 "$tmp/alertmanager-webhook" "$tmp/alertmanager-email"

# Os receptores abaixo são sintéticos. O --version valida a geração e encerra sem iniciar o serviço.
docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/alertmanager:/etc/alertmanager:ro" \
  -v "$tmp/alertmanager-webhook:/tmp" \
  -e ALERTA_WEBHOOK_URL="https://monitor.exemplo.br/frequenciapp" \
  -e ALERTA_WEBHOOK_TOKEN="token-sintetico-de-validacao" \
  --entrypoint /bin/sh \
  prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c \
  /etc/alertmanager/entrypoint.sh --version >/dev/null

config_webhook="$tmp/alertmanager-webhook/alertmanager.yml"
grep -Fq 'url_file: /tmp/alertmanager-webhook-url' "$config_webhook"
grep -Fq 'credentials_file: /tmp/alertmanager-webhook-token' "$config_webhook"
[ "$(stat -c '%a' "$tmp/alertmanager-webhook/alertmanager-webhook-url")" = "600" ]
[ "$(stat -c '%a' "$tmp/alertmanager-webhook/alertmanager-webhook-token")" = "600" ]
[ "$(cat "$tmp/alertmanager-webhook/alertmanager-webhook-url")" = "https://monitor.exemplo.br/frequenciapp" ]
[ "$(cat "$tmp/alertmanager-webhook/alertmanager-webhook-token")" = "token-sintetico-de-validacao" ]
if grep -Fq 'monitor.exemplo.br' "$config_webhook" ||
  grep -Fq 'token-sintetico-de-validacao' "$config_webhook"; then
  echo "A configuração do webhook não pode conter a URL ou o token em texto." >&2
  exit 1
fi

docker run --rm --user "$(id -u):$(id -g)" \
  -v "$tmp/alertmanager-webhook:/config:ro" \
  --entrypoint /bin/amtool \
  prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c \
  check-config /config/alertmanager.yml

docker run --rm --user "$(id -u):$(id -g)" \
  -v "$REPO/infra/observabilidade/alertmanager:/etc/alertmanager:ro" \
  -v "$tmp/alertmanager-email:/tmp" \
  -e ALERTA_EMAIL_PARA="coordenacao@escola.exemplo.br" \
  -e ALERTA_EMAIL_DE="frequenciapp@escola.exemplo.br" \
  -e ALERTA_SMTP_SMARTHOST="smtp.escola.exemplo.br:587" \
  -e ALERTA_SMTP_USUARIO="alerta" \
  -e ALERTA_SMTP_SENHA="senha-sintetica-de-validacao" \
  --entrypoint /bin/sh \
  prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c \
  /etc/alertmanager/entrypoint.sh --version >/dev/null

config_email="$tmp/alertmanager-email/alertmanager.yml"
grep -Fq 'smtp_auth_password_file: /tmp/alertmanager-smtp-password' "$config_email"
[ "$(stat -c '%a' "$tmp/alertmanager-email/alertmanager-smtp-password")" = "600" ]
[ "$(cat "$tmp/alertmanager-email/alertmanager-smtp-password")" = "senha-sintetica-de-validacao" ]
if grep -Fq 'smtp_auth_password:' "$config_email" ||
  grep -Fq 'senha-sintetica-de-validacao' "$config_email"; then
  echo "A configuração de e-mail não pode conter a senha em texto." >&2
  exit 1
fi

docker run --rm --user "$(id -u):$(id -g)" \
  -v "$tmp/alertmanager-email:/config:ro" \
  --entrypoint /bin/amtool \
  prom/alertmanager:v0.35.0@sha256:e638797febd034838eca8b98cdbd46f951e9bf7f178777aa8669167406a9946c \
  check-config /config/alertmanager.yml

# A integração adapta os três modos e prova TLS sem SNI com CA sintética, sem rede externa.
setpriv --no-new-privs node "$REPO/tests/servidor/caddy-integracao.mjs"

# O ensaio de proxy externo usa contêiner separado, vhosts sintéticos e CA da fixture,
# sem publicar portas e sem instalar um proxy gerenciado real.
setpriv --no-new-privs node "$REPO/tests/servidor/proxy-externo.mjs"

docker build -t frequenciapp-nginx:validar "$REPO/infra/servidor/nginx"

docker run --rm --add-host app:127.0.0.1 \
  frequenciapp-nginx:validar nginx -t

mkdir -p "$tmp/certificados/live/frequenciapp"
docker run --rm \
  -v "$tmp/certificados:/cert" \
  alpine/openssl:latest@sha256:6821afa2476e11be343f29275f2ca24291720ff0a7148bd131fd8e314ff26d9e req -x509 -nodes -newkey rsa:2048 -days 1 \
  -subj "/CN=teste" \
  -keyout /cert/live/frequenciapp/privkey.pem \
  -out /cert/live/frequenciapp/fullchain.pem >/dev/null 2>&1

docker run --rm --add-host app:127.0.0.1 \
  -v "$tmp/certificados:/etc/letsencrypt:ro" \
  frequenciapp-nginx:validar nginx -t

echo "Validação de servidor concluída."
