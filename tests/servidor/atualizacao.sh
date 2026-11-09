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

# A simulação usa somente referências locais e não cria estado operacional.
preparar_repositorio
git -C "$REPO" tag v1.2.3 "$COMMIT_ANTERIOR"
git --git-dir="$REMOTO" update-ref refs/tags/v1.2.3 "$COMMIT_ALVO"
git -C "$REPO" update-ref refs/remotes/origin/removida "$COMMIT_ANTERIOR"
refs_antes=$(git -C "$REPO" show-ref)
refs_remoto_antes=$(git --git-dir="$REMOTO" show-ref)
indice_antes=$(sha256sum "$REPO/.git/index")
worktrees_antes=$(git -C "$REPO" worktree list --porcelain)
[ ! -e "$REPO/.git/FETCH_HEAD" ] || falhar "a fixture já contém FETCH_HEAD."
rm -rf "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_DIR"
status=$(executar_atualizacao --simular)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação falhou."; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar "a simulação alterou o commit."
[ "$(git -C "$REPO" show-ref)" = "$refs_antes" ] || falhar "a simulação alterou referências ou tags locais."
[ "$(git --git-dir="$REMOTO" show-ref)" = "$refs_remoto_antes" ] || falhar "a simulação alterou referências ou tags do remoto local."
[ "$(sha256sum "$REPO/.git/index")" = "$indice_antes" ] || falhar "a simulação alterou o índice."
[ "$(git -C "$REPO" worktree list --porcelain)" = "$worktrees_antes" ] || falhar "a simulação alterou worktrees."
[ ! -e "$REPO/.git/FETCH_HEAD" ] || falhar "a simulação criou FETCH_HEAD."
[ ! -e "$ESTADO_DIR" ] || falhar "a simulação criou estado ou trava."
[ ! -e "$LOG_DIR" ] || falhar "a simulação criou diretório de log."
[ ! -e "$BACKUP_DIR" ] || falhar "a simulação criou diretório de backup."
[ ! -s "$BACKUP_CHAMADAS" ] || falhar "a simulação executou backup."
[ ! -s "$DOCKER_LOG" ] || falhar "a simulação chamou Docker."
grep -q 'referências locais' "$TMP_RAIZ/saida.log" || falhar "a simulação não informou o uso de referências locais."

# Estado e FETCH_HEAD preexistentes também permanecem byte a byte.
mkdir -p "$ESTADO_DIR"
printf '{"modo":"main","commit":"%s"}\n' "$COMMIT_ANTERIOR" >"$ESTADO_DIR/estado.json"
printf 'trava anterior\n' >"$ESTADO_DIR/atualizacao.lock"
printf 'busca anterior\n' >"$REPO/.git/FETCH_HEAD"
arquivos_antes=$(sha256sum "$ESTADO_DIR/estado.json" "$ESTADO_DIR/atualizacao.lock" "$REPO/.git/FETCH_HEAD")
status=$(executar_atualizacao --simular)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação com estado anterior falhou."; }
[ "$(sha256sum "$ESTADO_DIR/estado.json" "$ESTADO_DIR/atualizacao.lock" "$REPO/.git/FETCH_HEAD")" = "$arquivos_antes" ] ||
  falhar "a simulação alterou o estado, a trava ou FETCH_HEAD anteriores."

# Registrar estado não é uma operação permitida durante simulação.
preparar_repositorio
rm -rf "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_DIR"
status=$(executar_atualizacao --simular --registrar)
exigir_falha "$status" "a simulação permitiu registrar estado."
[ ! -e "$ESTADO_DIR" ] || falhar "o registro recusado criou estado ou trava."
[ ! -e "$REPO/.git/FETCH_HEAD" ] || falhar "o registro recusado buscou referências."
[ ! -s "$DOCKER_LOG" ] || falhar "o registro recusado chamou Docker."

# Referência ausente é diagnosticada sem uma busca implícita no remoto.
preparar_repositorio
rm -rf "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_DIR"
status=$(ATUALIZAR_REF=origin/inexistente executar_atualizacao --simular)
exigir_falha "$status" "a simulação aceitou referência local ausente."
grep -q 'referência local' "$TMP_RAIZ/saida.log" || falhar "a referência ausente não teve diagnóstico claro."
[ ! -e "$ESTADO_DIR" ] || falhar "a referência ausente criou estado ou trava."
[ ! -e "$REPO/.git/FETCH_HEAD" ] || falhar "a referência ausente foi buscada no remoto."
[ ! -s "$DOCKER_LOG" ] || falhar "a referência ausente chamou Docker."

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

# Um clone parcial mantém os commits disponíveis, mas não a árvore do alvo.
preparar_clone_parcial() {
  preparar_repositorio
  git -C "$REPO" reset -q --hard "$COMMIT_ALVO"
  mkdir -p "$REPO/prisma/migrations/0002_parcial"
  printf 'select 1;\n' >"$REPO/prisma/migrations/0002_parcial/migration.sql"
  git -C "$REPO" add prisma
  git -C "$REPO" commit -qm "migracao do clone parcial"
  git -C "$REPO" push -q origin main "$COMMIT_ANTERIOR:refs/heads/stable"
  COMMIT_ALVO=$(git -C "$REPO" rev-parse HEAD)
  ARVORE_ALVO=$(git -C "$REPO" rev-parse 'HEAD^{tree}')
  git --git-dir="$REMOTO" config uploadpack.allowFilter true
  git --git-dir="$REMOTO" config uploadpack.allowAnySHA1InWant true
  REPO="$TMP_RAIZ/parcial"
  rm -rf "$REPO"
  git clone -q --filter=tree:0 --no-checkout --branch stable "file://$REMOTO" "$REPO"
  git -C "$REPO" checkout -q stable
  # Enumera só os objetos locais, inclusive no Git sem suporte a GIT_NO_LAZY_FETCH.
  objetos_locais=$(git -C "$REPO" cat-file --batch-all-objects --batch-check='%(objectname)')
  if grep -Fxq "$ARVORE_ALVO" <<<"$objetos_locais"; then
    falhar "a fixture parcial já contém a árvore alvo."
  fi
  rm -rf "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_DIR"
}

for cenario_parcial in disponivel indisponivel extensao filtro; do
  preparar_clone_parcial
  case "$cenario_parcial" in
    indisponivel)
      git -C "$REPO" remote set-url origin "file://$TMP_RAIZ/remoto-inexistente.git"
      ;;
    extensao)
      git -C "$REPO" config --unset remote.origin.promisor
      git -C "$REPO" config --unset remote.origin.partialclonefilter
      git -C "$REPO" config extensions.partialClone origin
      ;;
    filtro)
      git -C "$REPO" config --unset remote.origin.promisor
      ;;
  esac
  objetos_antes=$(git -C "$REPO" count-objects -v)
  refs_antes=$(git -C "$REPO" show-ref)
  indice_antes=$(sha256sum "$REPO/.git/index")
  trace_parcial="$TMP_RAIZ/git-parcial.log"
  rm -f "$trace_parcial"
  status=$(GIT_TRACE="$trace_parcial" executar_atualizacao --simular)
  [ "$(git -C "$REPO" count-objects -v)" = "$objetos_antes" ] ||
    falhar "a simulação baixou objetos ausentes no clone parcial."
  [ "$(git -C "$REPO" show-ref)" = "$refs_antes" ] || falhar "o clone parcial mudou referências."
  [ "$(sha256sum "$REPO/.git/index")" = "$indice_antes" ] || falhar "o clone parcial mudou o índice."
  if [ -f "$trace_parcial" ] && grep -Eq 'built-in: git fetch|run_command:.* fetch ' "$trace_parcial"; then
    falhar "a simulação tentou fetch implícito no clone parcial."
  fi
  exigir_falha "$status" "a simulação ignorou uma comparação de migrações impossível."
  grep -q 'comparar as migrações' "$TMP_RAIZ/saida.log" ||
    falhar "a comparação incompleta não teve diagnóstico claro."
  ! grep -q 'Sem migrações novas' "$TMP_RAIZ/saida.log" ||
    falhar "a simulação afirmou ausência de migrações sem conseguir comparar."
  [ ! -e "$ESTADO_DIR" ] || falhar "o clone parcial criou estado ou trava."
  [ ! -s "$DOCKER_LOG" ] || falhar "o clone parcial chamou Docker."
done

printf 'Ensaios do atualizador concluídos.\n'
