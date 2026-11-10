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
export COMPOSE_PROJECT_NAME=teste
export SERVIDOR_CONFIG_DIR="$TMP_RAIZ/config"
export SERVIDOR_IDENTIDADE_ARQUIVO="$SERVIDOR_CONFIG_DIR/identidade.json"
export SERVIDOR_LOCK_DIR="$TMP_RAIZ/locks"
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
mkdir -p "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_BANCO_DIR" "$SERVIDOR_CONFIG_DIR"
: >"$APP_ENV_FILE"
: >"$OPS_ENV_FILE"
chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"

cat >"$FAKE_BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$DOCKER_LOG"
projeto="${COMPOSE_PROJECT_NAME:-teste}"

if [ "$1" = "tag" ]; then
  exit 0
fi

if [ "$1" = "info" ]; then
  if [ "${2:-}" = "--format" ]; then
    printf '{"ID":"daemon-teste"}\n'
  fi
  exit 0
fi

if [ "$1" = "inspect" ]; then
  if [ "$2" = "--format" ] && [ "$3" = '{{.Image}}' ]; then
    printf 'imagem-anterior-id\n'
    exit 0
  fi
  printf '[{"Id":"container-app","Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"%s-dados","Source":"/var/lib/docker/volumes/%s-dados/_data","Destination":"/var/lib/postgresql/data"}]}]\n' \
    "$projeto" "$projeto" "$projeto" "$projeto"
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
    --project-directory | --project-name | --env-file | -f)
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
      printf '{"name":"%s","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{}},"volumes":{"dados":{"name":"%s-dados"}}}\n' \
        "$projeto" "$projeto"
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
    if [[ " $* " == *" -aq "* ]]; then
      [ "${DOCKER_SEM_CONTAINERS:-false}" = "true" ] && exit 0
      printf 'container-app\ncontainer-db\n'
    else
      printf 'container-app\n'
    fi
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
em=$(date -u +%Y-%m-%dT%H:%M:%SZ)
case "${BACKUP_ESTADO_VERIFICADO:-true}" in
  true) campo=',"verificadoRemoto":true' ;;
  false) campo=',"verificadoRemoto":false' ;;
  string) campo=',"verificadoRemoto":"true"' ;;
  null) campo=',"verificadoRemoto":null' ;;
  ausente) campo='' ;;
  truncado)
    printf '{"em":"%s","arquivo":"%s","sha256":"%s","verificadoRemoto":' \
      "$em" "$arquivo" "$sha" >"$ESTADO_DIR/ultimo-backup.json"
    exit 0
    ;;
  *) printf 'variante desconhecida\n' >&2; exit 1 ;;
esac
printf '{"em":"%s","arquivo":"%s","sha256":"%s"%s}\n' \
  "$em" "$arquivo" "$sha" "$campo" >"$ESTADO_DIR/ultimo-backup.json"
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
  cp "$RAIZ/scripts/servidor/atualizar.sh" "$RAIZ/scripts/servidor/comum.sh" \
    "$RAIZ/scripts/servidor/identidade.mjs" "$RAIZ/scripts/servidor/identidade.sh" \
    "$REPO/scripts/servidor/"
  cp "$FAKE_BIN/backup-falso.sh" "$REPO/scripts/servidor/backup-banco.sh"
  chmod +x "$REPO/scripts/servidor/atualizar.sh" "$REPO/scripts/servidor/backup-banco.sh" \
    "$REPO/scripts/servidor/identidade.sh"
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
  rm -f "$DOCKER_LOG" "$DOCKER_UP_COUNTER" "$BACKUP_CHAMADAS" \
    "$ESTADO_DIR/falha.json" "$ESTADO_DIR/estado.json" "$SERVIDOR_IDENTIDADE_ARQUIVO"
  rm -rf "$SERVIDOR_LOCK_DIR"
}

adotar_identidade() {
  APP_DIR="$REPO" "$REPO/scripts/servidor/identidade.sh" --adotar --confirmar
}

preparar_instalacao() {
  preparar_repositorio
  adotar_identidade
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

# Antes da primeira subida, sem registro e sem containers, o modo inicial permite simular.
preparar_repositorio
export DOCKER_SEM_CONTAINERS=true
APP_DIR="$REPO" "$REPO/scripts/servidor/identidade.sh" --iniciar >/dev/null 2>&1 ||
  falhar "o modo inicial explícito falhou."
if APP_DIR="$REPO" "$REPO/scripts/servidor/identidade.sh" --adotar --confirmar >/dev/null 2>&1; then
  falhar "a adoção foi aceita sem recursos existentes."
fi
status=$(executar_atualizacao --simular)
unset DOCKER_SEM_CONTAINERS
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "o modo inicial bloqueou a primeira subida."; }
[ ! -f "$SERVIDOR_IDENTIDADE_ARQUIVO" ] || falhar "o modo inicial gravou identidade sem adoção."

# Com recurso existente e sem adoção, a operação é recusada.
preparar_repositorio
status=$(executar_atualizacao --simular)
exigir_falha "$status" "o projeto existente foi usado sem adoção."
grep -qi 'identidade' "$TMP_RAIZ/saida.log" || falhar "a recusa de identidade não apareceu."

# A adoção explícita grava a identidade e não pode ser repetida sobre o registro.
preparar_repositorio
adotar_identidade
[ -f "$SERVIDOR_IDENTIDADE_ARQUIVO" ] || falhar "a adoção não gravou a identidade."
if adotar_identidade 2>/dev/null; then
  falhar "a adoção sobrescreveu uma identidade existente."
fi

# Uma identidade divergente é recusada, sem adoção automática.
jq '.daemon = "outro-daemon"' "$SERVIDOR_IDENTIDADE_ARQUIVO" >"$SERVIDOR_IDENTIDADE_ARQUIVO.tmp"
chmod 600 "$SERVIDOR_IDENTIDADE_ARQUIVO.tmp"
mv "$SERVIDOR_IDENTIDADE_ARQUIVO.tmp" "$SERVIDOR_IDENTIDADE_ARQUIVO"
status=$(executar_atualizacao --simular)
exigir_falha "$status" "a identidade divergente foi aceita."
grep -qi 'identidade' "$TMP_RAIZ/saida.log" || falhar "a recusa de identidade divergente não apareceu."

# Primeiro uso sem estado: Compose montado, backup obrigatório e alvo aplicado.
preparar_instalacao
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
preparar_instalacao
status=$(executar_atualizacao --simular)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação falhou."; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a simulação alterou o commit."
[ ! -s "$BACKUP_CHAMADAS" ] || falhar "a simulação executou backup."
! grep -q 'build ' "$DOCKER_LOG" || falhar "a simulação executou build."

# Árvore suja é recusada antes de qualquer alteração.
preparar_instalacao
printf 'sujo\n' >"$REPO/nao-rastreado.txt"
status=$(executar_atualizacao)
exigir_falha "$status" "a árvore suja foi aceita."
grep -q 'árvore de trabalho' "$TMP_RAIZ/saida.log" || falhar "a mensagem de árvore suja não apareceu."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a árvore suja alterou o commit."

# Imagem com revisão divergente é recusada antes do checkout.
preparar_instalacao
export DOCKER_REVISAO_FALSA=true
status=$(executar_atualizacao)
unset DOCKER_REVISAO_FALSA
exigir_falha "$status" "a imagem com revisão divergente foi aceita."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a revisão divergente alterou o commit."

# Falha de build mantém o checkout anterior.
preparar_instalacao
export DOCKER_FALHA_BUILD=true
status=$(executar_atualizacao)
unset DOCKER_FALHA_BUILD
exigir_falha "$status" "a falha de build foi ignorada."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a falha de build alterou o commit."

# Falha de saúde aciona rollback de imagem e commit.
preparar_instalacao
export DOCKER_FALHA_UP=true
status=$(executar_atualizacao)
unset DOCKER_FALHA_UP
exigir_falha "$status" "a falha de saúde foi ignorada."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "o rollback não voltou o commit."
grep -q 'rollback' "$TMP_RAIZ/saida.log" || falhar "o log não registrou o rollback."
[ -f "$ESTADO_DIR/falha.json" ] || falhar "a falha não foi registrada."
[ "$(cat "$DOCKER_UP_COUNTER")" -ge 2 ] || falhar "o rollback não tentou subir a versão anterior."

# Migração nova bloqueia por padrão e é liberada com a opção explícita.
preparar_instalacao
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
preparar_instalacao
export BACKUP_PLANILHAS_HABILITADO=false
status=$(executar_atualizacao)
unset BACKUP_PLANILHAS_HABILITADO
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a atualização sem backup de planilhas falhou."; }
! grep -q 'teste/backup' "$DOCKER_LOG" || falhar "a imagem opcional foi construída."

# A confirmação remota só libera a atualização com booleano verdadeiro.
for variante in false string null ausente truncado; do
  preparar_instalacao
  export BACKUP_REMOTO=destino:teste BACKUP_VERIFICAR_REMOTO=true
  export BACKUP_ESTADO_VERIFICADO="$variante"
  status=$(executar_atualizacao)
  unset BACKUP_ESTADO_VERIFICADO BACKUP_REMOTO BACKUP_VERIFICAR_REMOTO
  exigir_falha "$status" "o backup remoto $variante liberou a atualização."
  ! grep -q 'build ' "$DOCKER_LOG" || falhar "o backup remoto $variante chegou ao build."
done
preparar_instalacao
export BACKUP_REMOTO=destino:teste BACKUP_VERIFICAR_REMOTO=true
export BACKUP_ESTADO_VERIFICADO=true
status=$(executar_atualizacao)
unset BACKUP_ESTADO_VERIFICADO BACKUP_REMOTO BACKUP_VERIFICAR_REMOTO
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "o backup remoto verdadeiro bloqueou a atualização."; }

printf 'Ensaios do atualizador concluídos.\n'
