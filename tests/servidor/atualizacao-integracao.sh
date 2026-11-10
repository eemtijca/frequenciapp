#!/usr/bin/env bash
# Confirma em Compose descartável que a atualização usa o commit alvo e preserva volumes e proxy.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-integracao.XXXXXX")
REPO="$TMP/repo"
REMOTO="$TMP/remoto.git"
PROJETO="frequenciapp-integracao-$$"

limpar() {
  docker compose --project-directory "$REPO" --project-name "$PROJETO" \
    -f "$REPO/compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap 'limpar' EXIT

command -v docker >/dev/null 2>&1 || { echo "Aviso: Docker ausente; ensaio de atualização não executado." >&2; exit 0; }

mkdir -p "$REPO/scripts/servidor"
cp "$RAIZ/scripts/servidor/atualizar.sh" "$RAIZ/scripts/servidor/comum.sh" \
  "$RAIZ/scripts/servidor/identidade.mjs" "$REPO/scripts/servidor/"
cat >"$REPO/scripts/servidor/backup-banco.sh" <<'BACKUP'
#!/usr/bin/env bash
set -Eeuo pipefail
mkdir -p "$ESTADO_DIR" "$BACKUP_BANCO_DIR"
arquivo="frequenciapp-integracao.dump.gpg"
printf 'dados sinteticos\n' >"$BACKUP_BANCO_DIR/$arquivo"
sha=$(sha256sum "$BACKUP_BANCO_DIR/$arquivo" | cut -d' ' -f1)
printf '{"em":"%s","arquivo":"%s","sha256":"%s","verificadoRemoto":true}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$arquivo" "$sha" >"$ESTADO_DIR/ultimo-backup.json"
BACKUP
chmod +x "$REPO/scripts/servidor/atualizar.sh" "$REPO/scripts/servidor/backup-banco.sh"

cat >"$REPO/compose.yml" <<'YAML'
name: ${COMPOSE_PROJECT_NAME:-frequenciapp-integracao}
services:
  db:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-frequencia}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-frequencia}
      POSTGRES_DB: ${POSTGRES_DB:-frequencia}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-frequencia} -d ${POSTGRES_DB:-frequencia}"]
      interval: 2s
      timeout: 3s
      retries: 30
  app:
    build:
      context: .
      args:
        COMMIT_SHA: ${COMMIT_SHA:-}
    image: ${APP_IMAGEM:-frequenciapp:local}
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:3000/')"]
      interval: 2s
      timeout: 2s
      retries: 20
  caddy:
    image: alpine:3.20
    command: ["sh", "-c", "while true; do sleep 3600; done"]
    depends_on:
      app:
        condition: service_healthy
    volumes:
      - ./proxy.conf:/etc/proxy.conf:ro
    healthcheck:
      test: ["CMD", "sh", "-c", "exit 0"]
      interval: 2s
      timeout: 2s
      retries: 10
volumes:
  pgdata:
YAML

cat >"$REPO/Dockerfile" <<'DOCKERFILE'
FROM python:3.12-alpine
ARG COMMIT_SHA=local
LABEL org.opencontainers.image.revision=$COMMIT_SHA
RUN mkdir -p /www && printf '%s\n' "$COMMIT_SHA" >/www/commit && printf 'ok\n' >/www/index.html
WORKDIR /www
CMD ["python", "-m", "http.server", "3000", "--bind", "0.0.0.0"]
DOCKERFILE

printf 'proxy-config-estavel\n' >"$REPO/proxy.conf"
printf 'primeira versao\n' >"$REPO/README.md"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email teste@escola.exemplo
git -C "$REPO" config user.name Teste
git -C "$REPO" add .
git -C "$REPO" commit -qm "primeira versao"
git init -q --bare "$REMOTO"
git -C "$REPO" remote add origin "$REMOTO"
git -C "$REPO" push -qu origin main
printf 'segunda versao\n' >"$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -qm "segunda versao"
git -C "$REPO" push -q origin main
COMMIT_ANTERIOR=$(git -C "$REPO" rev-parse HEAD~1)
COMMIT_ALVO=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"

export COMPOSE_PROJECT_NAME="$PROJETO"
export APP_DIR="$REPO"
export APP_ENV_FILE="$TMP/app.env"
export OPS_ENV_FILE="$TMP/ops.env"
export ESTADO_DIR="$TMP/estado"
export LOG_DIR="$TMP/log"
export BACKUP_DIR="$TMP/backups"
export BACKUP_BANCO_DIR="$TMP/backups/banco"
export SERVIDOR_CONFIG_DIR="$TMP/config"
export SERVIDOR_IDENTIDADE_ARQUIVO="$SERVIDOR_CONFIG_DIR/identidade.json"
export SERVIDOR_LOCK_DIR="$TMP/locks"
export SERVIDOR_AMBIENTE_INJETADO=true
export COMPOSE_ARQUIVOS=compose.yml
export PROXY_TIPO=caddy
export BACKUP_PLANILHAS_HABILITADO=false
export POSTGRES_USER=frequencia
export POSTGRES_PASSWORD=frequencia
export POSTGRES_DB=frequencia
export ATUALIZAR_MODO=main
export ATUALIZAR_PERMITIR_BACKUP_LOCAL=true
export ATUALIZAR_REF=origin/main
export ATUALIZAR_REMOTO=origin
export ATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false
export ATUALIZAR_ESPACO_MINIMO_MB=0
export ATUALIZAR_TIMEOUT_SAUDE=60
export APP_IMAGEM_REPOSITORIO=teste/app
export APP_IMAGEM_BACKUP_REPOSITORIO=teste/backup
export APP_IMAGEM="teste/app:local"
export COMMIT_SHA="$COMMIT_ANTERIOR"
mkdir -p "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_BANCO_DIR" "$SERVIDOR_CONFIG_DIR"
printf 'POSTGRES_USER=frequencia\nPOSTGRES_PASSWORD=frequencia\nPOSTGRES_DB=frequencia\n' >"$APP_ENV_FILE"
: >"$OPS_ENV_FILE"
chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"

docker compose --project-directory "$REPO" --project-name "$PROJETO" \
  --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" -f "$REPO/compose.yml" \
  up -d --build --wait

adotar_identidade() {
  APP_DIR="$REPO" "$RAIZ/scripts/servidor/identidade.sh" --adotar --confirmar
}
adotar_identidade

docker compose --project-directory "$REPO" --project-name "$PROJETO" \
  --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" -f "$REPO/compose.yml" \
  exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -c 'create table marcador (valor text not null); insert into marcador values ($$preservado$$);' >/dev/null

if ! bash "$REPO/scripts/servidor/atualizar.sh" >"$TMP/atualizacao.log" 2>&1; then
  cat "$TMP/atualizacao.log" >&2
  echo "FALHOU: a atualização real falhou." >&2
  exit 1
fi

[ "$(docker compose --project-directory "$REPO" --project-name "$PROJETO" \
  --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" -f "$REPO/compose.yml" \
  exec -T app cat /www/commit | tr -d '[:space:]')" = "$COMMIT_ALVO" ] ||
  { echo "FALHOU: a aplicação não executa o commit alvo." >&2; exit 1; }

[ "$(docker image inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
  "teste/app:main-${COMMIT_ALVO:0:12}")" = "$COMMIT_ALVO" ] ||
  { echo "FALHOU: a imagem não tem o rótulo do commit alvo." >&2; exit 1; }

[ "$(docker compose --project-directory "$REPO" --project-name "$PROJETO" \
  --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" -f "$REPO/compose.yml" \
  exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc 'select valor from marcador' |
  tr -d '[:space:]')" = "preservado" ] ||
  { echo "FALHOU: o volume do banco não foi preservado." >&2; exit 1; }

[ "$(docker compose --project-directory "$REPO" --project-name "$PROJETO" \
  --env-file "$APP_ENV_FILE" --env-file "$OPS_ENV_FILE" -f "$REPO/compose.yml" \
  exec -T caddy cat /etc/proxy.conf | tr -d '[:space:]')" = "proxy-config-estavel" ] ||
  { echo "FALHOU: a configuração de proxy não foi preservada." >&2; exit 1; }

[ "$(cat "$ESTADO_DIR/estado.json" | grep -o '"commit":"[^"]*"' | cut -d'"' -f4)" = "$COMMIT_ALVO" ] ||
  { echo "FALHOU: o estado não registrou o commit alvo." >&2; exit 1; }

printf 'Ensaio de atualização em Compose descartável concluído.\n'
