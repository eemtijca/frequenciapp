#!/usr/bin/env bash
# Ensina o fluxo do atualizador com Git real e dublês explícitos de Docker.
set -Eeuo pipefail

# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

FAKE_BIN="$TMP_RAIZ/bin"
mkdir -p "$FAKE_BIN"
export PATH="$FAKE_BIN:$PATH"
export DOCKER_LOG="$TMP_RAIZ/docker.log"
export DOCKER_UP_COUNTER="$TMP_RAIZ/docker-up-counter"
export BACKUP_CHAMADAS="$TMP_RAIZ/backup-chamadas"
export SERVIDOR_AMBIENTE_INJETADO=true
export PROXY_TIPO=caddy
export BACKUP_PLANILHAS_HABILITADO=true
export COMPOSE_ARQUIVOS=compose.yml
export ATUALIZAR_MODO=main
export ATUALIZAR_REF=origin/main
export ATUALIZAR_REMOTO=origin
export ATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false
export ATUALIZAR_VERIFICAR_IMAGEM=true
export ATUALIZAR_ESPACO_MINIMO_MB=0
export ATUALIZAR_TIMEOUT_SAUDE=1
export APP_IMAGEM_REPOSITORIO=teste/app
export APP_IMAGEM_BACKUP_REPOSITORIO=teste/backup
export APP_ENV_FILE="$TMP_RAIZ/app.env"
export OPS_ENV_FILE="$TMP_RAIZ/ops.env"
export ESTADO_DIR="$TMP_RAIZ/estado"
export LOG_DIR="$TMP_RAIZ/log"
export BACKUP_DIR="$TMP_RAIZ/backups"
export BACKUP_BANCO_DIR="$TMP_RAIZ/backups/banco"
mkdir -p "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_BANCO_DIR"
: >"$APP_ENV_FILE"
: >"$OPS_ENV_FILE"
chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"

cat >"$FAKE_BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$DOCKER_LOG"

if [ "$1" = "tag" ]; then
  exit 0
fi

if [ "$1" = "inspect" ]; then
  if [ "$2" = "--format" ] && [ "$3" = '{{.Image}}' ]; then
    printf 'imagem-anterior-id\n'
  fi
  exit 0
fi

if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  if [ "${DOCKER_REVISAO_FALSA:-}" = "true" ]; then
    printf 'revisao-falsa\n'
  elif [ -n "${DOCKER_REVISAO_IMAGEM:-}" ]; then
    printf '%s\n' "$DOCKER_REVISAO_IMAGEM"
  fi
  exit 0
fi

[ "$1" = "compose" ] || { echo "docker inesperado: $*" >&2; exit 1; }
shift
perfil_backup=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-directory | --env-file | -f)
      shift 2
      ;;
    --profile)
      [ "${2:-}" = "backup" ] && perfil_backup=true
      shift 2
      ;;
    *)
      break
      ;;
  esac
done
comando="$1"
shift

case "$comando" in
  config)
    if [[ " $* " == *" --format json "* ]]; then
      printf '{"name":"teste"}\n'
    elif [[ " $* " == *" --services "* ]]; then
      printf 'app\ndb\ncaddy\n'
      if [ "$perfil_backup" = true ] && [ "${BACKUP_PLANILHAS_HABILITADO:-true}" = "true" ]; then
        printf 'backup-planilhas\n'
      fi
    fi
    exit 0
    ;;
  build)
    printf 'APP_IMAGEM=%s APP_IMAGEM_BACKUP=%s\n' "${APP_IMAGEM:-}" "${APP_IMAGEM_BACKUP:-}" >>"$DOCKER_LOG"
    [ "${DOCKER_FALHA_BUILD:-false}" = "true" ] && exit 1
    exit 0
    ;;
  pull)
    exit 0
    ;;
  ps)
    printf 'container-app\n'
    exit 0
    ;;
  up)
    contador=0
    [ -f "$DOCKER_UP_COUNTER" ] && contador=$(cat "$DOCKER_UP_COUNTER")
    contador=$((contador + 1))
    printf '%s\n' "$contador" >"$DOCKER_UP_COUNTER"
    if [ "${DOCKER_FALHA_UP:-false}" = "true" ] && [ "$contador" -eq 1 ]; then
      exit 1
    fi
    exit 0
    ;;
  stop | exec)
    exit 0
    ;;
  *)
    echo "compose inesperado: $comando $*" >&2
    exit 1
    ;;
esac
DOCKER
chmod +x "$FAKE_BIN/docker"

cat >"$FAKE_BIN/backup-falso.sh" <<'BACKUP'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'backup\n' >>"$BACKUP_CHAMADAS"
mkdir -p "$ESTADO_DIR" "$BACKUP_BANCO_DIR"
arquivo="frequenciapp-teste.dump.gpg"
printf 'dados sinteticos\n' >"$BACKUP_BANCO_DIR/$arquivo"
sha=$(sha256sum "$BACKUP_BANCO_DIR/$arquivo" | cut -d' ' -f1)
printf '{"em":"%s","arquivo":"%s","sha256":"%s","verificadoRemoto":true}\n' \
  "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$arquivo" "$sha" >"$ESTADO_DIR/ultimo-backup.json"
BACKUP
chmod +x "$FAKE_BIN/backup-falso.sh"

compose_fixture() {
  cat >"$REPO/compose.yml" <<'YAML'
name: ${COMPOSE_PROJECT_NAME:-frequenciapp-teste}
services:
  db:
    image: postgres:17-alpine
  app:
    build:
      context: .
      args:
        COMMIT_SHA: ${COMMIT_SHA:-}
    image: ${APP_IMAGEM:-frequenciapp:local}
    depends_on:
      - db
    healthcheck:
      test: ["CMD", "true"]
  caddy:
    image: alpine:3.20
    depends_on:
      - app
YAML
  cat >"$REPO/Dockerfile" <<'DOCKERFILE'
FROM alpine:3.20
ARG COMMIT_SHA=local
LABEL org.opencontainers.image.revision=$COMMIT_SHA
CMD ["sh", "-c", "sleep infinity"]
DOCKERFILE
}

preparar_repositorio() {
  REPO="$TMP_RAIZ/repo"
  REMOTO="$TMP_RAIZ/remoto.git"
  rm -rf "$REPO" "$REMOTO"
  mkdir -p "$REPO/scripts/servidor"
  cp "$RAIZ/scripts/servidor/atualizar.sh" "$RAIZ/scripts/servidor/comum.sh" "$REPO/scripts/servidor/"
  cp "$FAKE_BIN/backup-falso.sh" "$REPO/scripts/servidor/backup-banco.sh"
  chmod +x "$REPO/scripts/servidor/atualizar.sh" "$REPO/scripts/servidor/backup-banco.sh"
  compose_fixture
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
  export DOCKER_REVISAO_IMAGEM="$COMMIT_ALVO"
  rm -f "$DOCKER_LOG" "$DOCKER_UP_COUNTER" "$BACKUP_CHAMADAS" "$ESTADO_DIR/falha.json" "$ESTADO_DIR/estado.json"
}

executar_atualizacao() {
  local status
  if bash "$REPO/scripts/servidor/atualizar.sh" "$@" >"$TMP_RAIZ/saida.log" 2>&1; then
    status=0
  else
    status=$?
  fi
  printf '%s' "$status"
}

exigir_falha() {
  local status="$1"
  local descricao="$2"
  [ "$status" -ne 0 ] || falhar "$descricao"
}

# Primeiro uso sem estado: Compose montado, backup obrigatório e alvo aplicado.
preparar_repositorio
status=$(executar_atualizacao)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a atualização inicial falhou."; }
grep -q ' config ' "$DOCKER_LOG" || falhar "o Compose não foi validado antes do uso."
[ "$(wc -l <"$BACKUP_CHAMADAS" | tr -d ' ')" -eq 1 ] || falhar "o backup inicial não foi executado."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ALVO" ] || falhar "o commit alvo não foi aplicado."
grep -q 'APP_IMAGEM=teste/app' "$DOCKER_LOG" || falhar "a imagem do alvo não foi construída."
grep -q 'APP_IMAGEM_BACKUP=teste/backup' "$DOCKER_LOG" || falhar "a imagem de backup não foi construída."
grep -q 'frequenciapp-atualizacao.*build app' "$DOCKER_LOG" ||
  falhar "a imagem não foi construída na worktree isolada."

# A simulação não altera commit nem executa backup ou build.
preparar_repositorio
status=$(executar_atualizacao --simular)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação falhou."; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a simulação alterou o commit."
[ ! -s "$BACKUP_CHAMADAS" ] || falhar "a simulação executou backup."
! grep -q 'build ' "$DOCKER_LOG" || falhar "a simulação executou build."

# Árvore suja é recusada antes de qualquer alteração.
preparar_repositorio
printf 'sujo\n' >"$REPO/nao-rastreado.txt"
status=$(executar_atualizacao)
exigir_falha "$status" "a árvore suja foi aceita."
grep -q 'árvore de trabalho' "$TMP_RAIZ/saida.log" || falhar "a mensagem de árvore suja não apareceu."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a árvore suja alterou o commit."

# Imagem com revisão divergente é recusada antes do checkout.
preparar_repositorio
export DOCKER_REVISAO_FALSA=true
status=$(executar_atualizacao)
unset DOCKER_REVISAO_FALSA
exigir_falha "$status" "a imagem com revisão divergente foi aceita."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a revisão divergente alterou o commit."

# Falha de build mantém o checkout anterior.
preparar_repositorio
export DOCKER_FALHA_BUILD=true
status=$(executar_atualizacao)
unset DOCKER_FALHA_BUILD
exigir_falha "$status" "a falha de build foi ignorada."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a falha de build alterou o commit."

# Falha de saúde aciona rollback de imagem e commit.
preparar_repositorio
export DOCKER_FALHA_UP=true
status=$(executar_atualizacao)
unset DOCKER_FALHA_UP
exigir_falha "$status" "a falha de saúde foi ignorada."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "o rollback não voltou o commit."
grep -q 'rollback' "$TMP_RAIZ/saida.log" || falhar "o log não registrou o rollback."
[ -f "$ESTADO_DIR/falha.json" ] || falhar "a falha não foi registrada."
[ "$(cat "$DOCKER_UP_COUNTER")" -ge 2 ] || falhar "o rollback não tentou subir a versão anterior."

# Migração nova bloqueia por padrão e é liberada com a opção explícita.
preparar_repositorio
git -C "$REPO" reset -q --hard "$COMMIT_ALVO"
mkdir -p "$REPO/prisma/migrations/0002_nova"
printf 'select 1;\n' >"$REPO/prisma/migrations/0002_nova/migration.sql"
git -C "$REPO" add prisma
git -C "$REPO" commit -qm "migracao nova"
git -C "$REPO" push -q origin main
COMMIT_MIGRACAO=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
export DOCKER_REVISAO_IMAGEM="$COMMIT_MIGRACAO"
status=$(executar_atualizacao)
exigir_falha "$status" "a migração nova foi aceita sem opção explícita."
! grep -q 'build ' "$DOCKER_LOG" || falhar "a migração bloqueada chegou ao build."
status=$(executar_atualizacao --permitir-migracoes)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a migração liberada falhou."; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_MIGRACAO" ] || falhar "a migração liberada não foi aplicada."

# Backup de planilhas desabilitado não constrói a imagem opcional.
preparar_repositorio
export BACKUP_PLANILHAS_HABILITADO=false
status=$(executar_atualizacao)
unset BACKUP_PLANILHAS_HABILITADO
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a atualização sem backup de planilhas falhou."; }
! grep -q 'teste/backup' "$DOCKER_LOG" || falhar "a imagem opcional foi construída."

printf 'Ensaios do atualizador concluídos.\n'
