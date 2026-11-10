#!/usr/bin/env bash
# Funções compartilhadas dos ensaios descartáveis do servidor.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TESTE_DIR="$RAIZ/tests/servidor"
TMP_RAIZ=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-servidor.XXXXXX")
PROJETO="frequenciapp-teste-$$"

falhar() {
  printf 'FALHOU: %s\n' "$*" >&2
  exit 1
}

limpar_ambiente() {
  docker compose --project-directory "$RAIZ" --project-name "$PROJETO" \
    -f "$TESTE_DIR/compose.yml" down -v --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$TMP_RAIZ"
}
trap 'limpar_ambiente' EXIT

preparar_ambiente() {
  export COMPOSE_PROJECT_NAME="$PROJETO"
  export APP_DIR="$RAIZ"
  export APP_ENV_FILE="$TMP_RAIZ/app.env"
  export OPS_ENV_FILE="$TMP_RAIZ/ops.env"
  export ESTADO_DIR="$TMP_RAIZ/estado"
  export LOG_DIR="$TMP_RAIZ/log"
  export BACKUP_DIR="$TMP_RAIZ/backups"
  export BACKUP_BANCO_DIR="$TMP_RAIZ/backups/banco"
  export SERVIDOR_CONFIG_DIR="$TMP_RAIZ/config"
  export SERVIDOR_IDENTIDADE_ARQUIVO="$SERVIDOR_CONFIG_DIR/identidade.json"
  export SERVIDOR_LOCK_DIR="$TMP_RAIZ/locks"
  export SERVIDOR_AMBIENTE_INJETADO=true
  export COMPOSE_ARQUIVOS="tests/servidor/compose.yml"
  export PROXY_TIPO=caddy
  export BACKUP_PLANILHAS_HABILITADO=false
  export BACKUP_MODO=compose
  export BACKUP_CRIPTOGRAFIA=gpg
  export BACKUP_INCLUIR_AMBIENTE=true
  export BACKUP_AMBIENTE_ARQUIVO="$TMP_RAIZ/app.env"
  export BACKUP_RETER_DIAS=1
  export BACKUP_RETER_MINIMO=5
  export BACKUP_VERIFICAR_REMOTO=true
  export DATABASE_SCHEMA=public
  export POSTGRES_USER=frequencia
  export POSTGRES_PASSWORD=frequencia
  export POSTGRES_DB=frequencia
  export TZ_APP=America/Fortaleza

  mkdir -p "$TMP_RAIZ" "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_BANCO_DIR" "$SERVIDOR_CONFIG_DIR"
  printf 'AUTH_SECRET=segredo-sintetico-de-32-bytes-0000\n' >"$APP_ENV_FILE"
  : >"$OPS_ENV_FILE"
  chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"

  export GNUPGHOME="$TMP_RAIZ/gnupg"
  mkdir -m 700 "$GNUPGHOME"
  gpg --batch --passphrase '' --quick-generate-key \
    'Backup Teste <backup@teste.local>' rsa2048 encr 0 >/dev/null 2>&1
  fingerprint=$(gpg --batch --with-colons --with-fingerprint --list-keys |
    awk -F: '$1 == "fpr" { print $10; exit }')
  [ -n "$fingerprint" ] || falhar "não foi possível identificar a chave GPG sintética."
  gpg --batch --armor --export "$fingerprint" >"$TMP_RAIZ/backup-publica.asc"
  gpg --batch --armor --export-secret-keys "$fingerprint" >"$TMP_RAIZ/backup-privada.asc"
  export BACKUP_GPG_DESTINATARIO="$fingerprint"
  export BACKUP_GPG_FINGERPRINT="$fingerprint"
  export BACKUP_GPG_CHAVE_PUBLICA="$TMP_RAIZ/backup-publica.asc"
  export BACKUP_GPG_CHAVE_PRIVADA="$TMP_RAIZ/backup-privada.asc"
}

compose_teste() {
  docker compose --project-directory "$RAIZ" --project-name "$PROJETO" \
    -f "$TESTE_DIR/compose.yml" "$@"
}

adotar_identidade() {
  "$RAIZ/scripts/servidor/identidade.sh" --adotar --confirmar
}

iniciar_compose_teste() {
  compose_teste up -d --wait
  adotar_identidade
}

executar_sql() {
  local banco="$1"
  local sql="$2"
  compose_teste exec -T db psql -U "$POSTGRES_USER" -d "$banco" \
    -v ON_ERROR_STOP=1 -tAc "$sql"
}

preparar_banco_sintetico() {
  compose_teste exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -v ON_ERROR_STOP=1 <<'SQL'
create table alunos (id integer primary key, nome text not null);
insert into alunos (id, nome) values (1, 'Aluno Sintetico');
create table _prisma_migrations (
  id varchar(36) primary key,
  checksum varchar(64) not null,
  finished_at timestamptz,
  migration_name varchar(255) not null,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz,
  applied_steps_count integer not null default 0
);
insert into _prisma_migrations (id, checksum, migration_name, finished_at, started_at)
values ('00000000-0000-0000-0000-000000000001', repeat('a', 64), '0001_teste', now(), now());
SQL
}

ultimo_arquivo_backup() {
  find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f -name 'frequenciapp-*.dump.gpg' \
    -printf '%T@ %p\n' 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2-
}

esperar_aplicacao() {
  local _tentativa
  for _tentativa in $(seq 1 30); do
    if compose_teste ps --status running --services | grep -qx app; then
      return 0
    fi
    sleep 1
  done
  return 1
}
