#!/usr/bin/env bash
# Verifica que o controlador é opt-in, que o marcador não bloqueia o simples e que a volta funciona.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_RAIZ=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-perfis.XXXXXX")
trap 'rm -rf "$TMP_RAIZ"' EXIT

REPO="$TMP_RAIZ/repo"
BIN="$TMP_RAIZ/bin"
CONF="$TMP_RAIZ/config"
ESTADO="$TMP_RAIZ/estado"
LOG="$TMP_RAIZ/log"
BACKUPS="$TMP_RAIZ/backups"
LOCKS="$TMP_RAIZ/locks"
CONTROLADOR="$TMP_RAIZ/controlador"

falhar() {
  printf 'FALHOU: %s\n' "$*" >&2
  exit 1
}

mkdir -p "$REPO/scripts/servidor" "$BIN" "$CONF" "$ESTADO" "$LOG" "$BACKUPS" "$LOCKS" "$CONTROLADOR"
chmod 700 "$LOCKS"
cp "$RAIZ/scripts/servidor/atualizar.sh" "$RAIZ/scripts/servidor/comum.sh" \
  "$RAIZ/scripts/servidor/compose.sh" "$RAIZ/scripts/servidor/identidade.mjs" \
  "$RAIZ/scripts/servidor/identidade.sh" "$REPO/scripts/servidor/"
chmod +x "$REPO/scripts/servidor/atualizar.sh" "$REPO/scripts/servidor/compose.sh" \
  "$REPO/scripts/servidor/identidade.sh"

cat >"$REPO/compose.yml" <<'YAML'
name: sintetico
services:
  db:
    image: postgres:17-alpine
  app:
    image: frequenciapp:local
  caddy:
    image: alpine:3.20
YAML

cat >"$BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
if [ "$1" = "info" ]; then
  printf '{"ID":"daemon-sintetico"}\n'
  exit 0
fi
if [ "$1" = "inspect" ]; then
  printf '%s\n' '[{"Id":"container-app","Image":"sha256:app","State":{"Running":true},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Image":"sha256:db","State":{"Running":true},"Config":{"Labels":{"com.docker.compose.project":"sintetico","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"sintetico-dados","Source":"/var/lib/docker/volumes/sintetico-dados/_data","Destination":"/var/lib/postgresql/data"}]}]'
  exit 0
fi
[ "$1" = "compose" ] || { echo "docker inesperado: $*" >&2; exit 1; }
shift
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-name | --project-directory | --env-file | -f | --profile) shift 2 ;;
    *) break ;;
  esac
done
comando="$1"
shift
case "$comando" in
  config)
    if [[ " $* " == *" --format json "* ]]; then
      printf '%s\n' '{"name":"sintetico","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{}},"volumes":{"dados":{"name":"sintetico-dados"}}}'
    elif [[ " $* " == *" --services "* ]]; then
      printf 'app\ndb\ncaddy\n'
    fi
    exit 0
    ;;
  ps)
    if [[ " $* " == *" -aq "* ]]; then
      printf 'container-app\ncontainer-db\n'
    else
      printf 'container-app\n'
    fi
    exit 0
    ;;
  up | build | pull | stop | exec) exit 0 ;;
  *) echo "compose inesperado: $comando $*" >&2; exit 1 ;;
esac
DOCKER
chmod 700 "$BIN/docker"

printf 'POSTGRES_DB=frequencia\nPOSTGRES_USER=frequencia\n' >"$CONF/app.env"
: >"$CONF/ops.env"
chmod 600 "$CONF/app.env" "$CONF/ops.env"

export PATH="$BIN:$PATH"
export APP_DIR="$REPO"
export APP_ENV_FILE="$CONF/app.env"
export OPS_ENV_FILE="$CONF/ops.env"
export SERVIDOR_CONFIG_DIR="$CONF"
export SERVIDOR_IDENTIDADE_ARQUIVO="$CONF/identidade.json"
export SERVIDOR_LOCK_DIR="$LOCKS"
export ESTADO_DIR="$ESTADO"
export LOG_DIR="$LOG"
export BACKUP_DIR="$BACKUPS"
export BACKUP_BANCO_DIR="$BACKUPS/banco"
export COMPOSE_PROJECT_NAME=sintetico
export COMPOSE_ARQUIVOS=compose.yml
export PROXY_TIPO=caddy
export SERVIDOR_AMBIENTE_INJETADO=true
export BACKUP_MODO=compose
export BACKUP_PLANILHAS_HABILITADO=false
export ATUALIZAR_MODO=main
export ATUALIZAR_REF=origin/main
export ATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false
export ATUALIZAR_PERMITIR_BACKUP_LOCAL=true
export ATUALIZAR_ESPACO_MINIMO_MB=0

printf 'primeira versao\n' >"$REPO/README.md"
git -C "$REPO" init -q -b main
git -C "$REPO" config user.email teste@escola.exemplo
git -C "$REPO" config user.name Teste
git -C "$REPO" add .
git -C "$REPO" commit -qm "primeira versao"
COMMIT=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" update-ref refs/remotes/origin/main "$COMMIT"

bash "$REPO/scripts/servidor/identidade.sh" --adotar --confirmar >/dev/null ||
  falhar "a identidade sintética não foi adotada."

executar_atualizacao() {
  bash "$REPO/scripts/servidor/atualizar.sh" "$@"
}

executar_atualizacao --simular >/dev/null ||
  falhar "o caminho simples inicial falhou."

bash "$REPO/scripts/servidor/compose.sh" config --quiet >/dev/null ||
  falhar "o compose simples deixou de funcionar."

printf '{"emAndamento":true}\n' >"$ESTADO/atualizacao-em-andamento.json"
executar_atualizacao --simular >/dev/null ||
  falhar "o marcador bloqueou o caminho simples sem perfil."
rm -f "$ESTADO/atualizacao-em-andamento.json"

perfil="$CONTROLADOR/perfil.json"
printf '{}\n' >"$perfil"
cat >"$CONTROLADOR/executar" <<EXECUTAVEL
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "\$*" >"$TMP_RAIZ/delegado"
EXECUTAVEL
chmod 700 "$CONTROLADOR/executar"

if [ "$(id -u)" = 0 ]; then
  if SERVIDOR_CONTROLADOR_PERFIL="$perfil" bash "$RAIZ/scripts/servidor/instalar-rotinas.sh" \
    >/dev/null 2>&1; then
    falhar "as rotinas simples aceitaram um perfil de controlador existente."
  fi
fi

SERVIDOR_CONTROLADOR_PERFIL="$perfil" bash "$REPO/scripts/servidor/atualizar.sh" --simular >/dev/null ||
  falhar "a delegação ao perfil existente falhou."
[ "$(cat "$TMP_RAIZ/delegado")" = "atualizar --simular" ] ||
  falhar "a entrada estável não recebeu a operação esperada."

rm -f "$perfil"
executar_atualizacao --simular >/dev/null ||
  falhar "a volta ao caminho simples falhou."

if SERVIDOR_CONTROLADOR_PERFIL="$perfil" bash "$REPO/scripts/servidor/atualizar.sh" --simular >/dev/null 2>&1; then
  falhar "perfil ausente não recusou a operação."
fi

printf 'Ensaios de perfis concluídos.\n'
