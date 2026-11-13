#!/usr/bin/env bash
# Executa as validações do repositório em contêineres Docker reproduzíveis.
# O host chama apenas Docker; nenhuma ferramenta do projeto roda no Windows.

set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

IMAGEM_PLAYWRIGHT="mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe"
IMAGEM_QUALIDADE="${EXECUTOR_IMAGEM_QUALIDADE:-frequenciapp-dev-qualidade:26.13.0-git-openssl}"
IMAGEM_FERRAMENTAS="${EXECUTOR_IMAGEM_FERRAMENTAS:-frequenciapp-dev-ferramentas:26.13.0-docker27.5.1-compose2.32.4}"

TAREFA="${EXECUTOR_TAREFA:-local}"
MANTER="${EXECUTOR_MANTER:-0}"
SOCKET="${EXECUTOR_DOCKER_SOCKET:-/var/run/docker.sock}"
IMAGEM_SISTEMA="${EXECUTOR_IMAGEM_SISTEMA:-ubuntu:24.04}"

# No Git Bash, o comando sem extensão do Docker Desktop tenta a integração com
# WSL. O executável nativo evita o WSL e recebe o caminho Windows nas montagens.
if command -v docker.exe >/dev/null 2>&1; then
  DOCKER="docker.exe"
else
  DOCKER="docker"
fi

# O cliente Windows precisa do caminho nativo para contextos de build e
# arquivos do Compose. Dentro do contêiner, as mesmas árvores aparecem em
# /c/... para que os ensaios que chamam Docker montem caminhos válidos.
converter_para_container() {
  local caminho="$1"
  if [[ "$caminho" =~ ^([A-Za-z]):/(.*)$ ]]; then
    local letra
    letra="$(printf '%s' "${BASH_REMATCH[1]}" | tr '[:upper:]' '[:lower:]')"
    printf '/%s/%s' "$letra" "${BASH_REMATCH[2]}"
  else
    printf '%s' "$caminho"
  fi
}

if command -v cygpath >/dev/null 2>&1; then
  RAIZ_HOST="$(cygpath -m "$RAIZ")"
else
  RAIZ_HOST="$RAIZ"
fi
RAIZ_CONTAINER="$(converter_para_container "$RAIZ_HOST")"

PROJETO=""
VOLUME_NODE_MODULES=""
VOLUME_PNPM_STORE=""
VOLUME_PLAYWRIGHT_NODE_MODULES=""
VOLUME_NPM_CACHE=""
TMP_TAREFA=""
TMP_TAREFA_HOST=""
TMP_TAREFA_CONTAINER=""
TRAVA=""
CONTAINER_SISTEMA=""
PROJETO_INICIADO=0
EXTRA=()

uso() {
  cat <<'TEXTO'
Uso: scripts/dev/executar-container.sh <subcomando> [opções] [argumentos]

Subcomandos:
  qualidade         Instala dependências e roda formatação, lint, tipos, unidade
                    e o teste deste executor.
  servidor          Monta o socket Docker e roda pnpm run servidor:validar.
  api               Sobe banco e aplicativo no projeto Compose e roda os
                    contratos de API.
  e2e               Sobe banco e aplicativo no projeto Compose e roda o
                    Playwright.
  pwa               Sobe banco e aplicativo no projeto Compose e roda a suíte
                    PWA no build de produção.
  instalador-plano  Roda instalar.sh planejar na matriz de distribuições.
  instalador-aplicar
                    Roda instalar.sh aplicar em um contêiner systemd
                    descartável.

Opções:
  --tarefa <nome>   Identificador da tarefa, usado nos nomes de projeto e de
                    volume. Padrão: local. Variável: EXECUTOR_TAREFA.
  --manter          Não remove o projeto Compose ao final. Variável:
                    EXECUTOR_MANTER=1.
  --imagem-sistema <imagem>
                    Imagem systemd do instalador-aplicar. Variável:
                    EXECUTOR_IMAGEM_SISTEMA.
  -h, --ajuda       Mostra esta ajuda.
  --                Encaminha os argumentos seguintes à suíte.

Ambiente:
  EXECUTOR_LOCK_DIR          Diretório das travas. Padrão:
                             TMPDIR/opencode/locks.
  EXECUTOR_DOCKER_SOCKET     Socket do Docker. Padrão: /var/run/docker.sock.
  EXECUTOR_IMAGENS           Lista separada por espaços para instalador-plano.
  EXECUTOR_IMAGEM_QUALIDADE  Tag local da imagem de qualidade.
  EXECUTOR_IMAGEM_FERRAMENTAS
                             Tag local da imagem com Docker CLI, Buildx e
                             Compose.

Imagens fixas:
  Node:       node:26.13.0-bookworm-slim@sha256:add5c17c14752c54d2f3d519ec46a3815684d41c33f198bcb09fb998f7dcbf68
  Playwright: mcr.microsoft.com/playwright:v1.65.0-noble@sha256:9beb546099e11f52d62e505537914870e01a67e0e6b00ae41da4775324e73dbe

O executor não usa WSL e não executa pnpm, npx, vitest ou playwright no host.
TEXTO
}

erro() {
  printf 'erro: %s\n' "$*" >&2
  exit 1
}

if [ -n "${WSL_DISTRO_NAME:-}" ] || [ -n "${WSL_INTEROP:-}" ]; then
  erro "WSL não é suportado; execute o wrapper no Git Bash ou em Linux."
fi

exigir_docker() {
  command -v "$DOCKER" >/dev/null 2>&1 || erro "Docker não encontrado no host."
  "$DOCKER" info >/dev/null 2>&1 || erro "O daemon do Docker não responde."
}

validar_tarefa() {
  if [[ ! "$TAREFA" =~ ^[a-z0-9][a-z0-9_-]{0,40}$ ]]; then
    erro "Tarefa inválida: use letras minúsculas, números, hífen ou sublinhado."
  fi
  PROJETO="frequenciapp-plan-${TAREFA}"
  VOLUME_NODE_MODULES="${PROJETO}-node_modules"
  VOLUME_PNPM_STORE="${PROJETO}-pnpm-store"
  VOLUME_PLAYWRIGHT_NODE_MODULES="${PROJETO}-playwright-node_modules"
  VOLUME_NPM_CACHE="${PROJETO}-npm-cache"
}

docker_host() {
  MSYS_NO_PATHCONV=1 "$DOCKER" "$@"
}

compose_projeto() {
  MSYS_NO_PATHCONV=1 "$DOCKER" compose \
    --project-directory "$RAIZ_HOST" \
    --project-name "$PROJETO" \
    --file "$RAIZ_HOST/compose.yml" \
    --file "$RAIZ_HOST/compose.ci.yml" \
    --file "$RAIZ_HOST/compose.ci-local.yml" \
    "$@"
}

exportar_ambiente_compose() {
  export AUTH_SECRET="segredo-dummy-de-32-bytes-para-testes-00"
  export APP_IMAGEM="${PROJETO}:app"
  export EXECUTOR_IMAGEM_PLAYWRIGHT="$IMAGEM_PLAYWRIGHT"
  export EXECUTOR_VOLUME_NODE_MODULES="$VOLUME_NODE_MODULES"
  export EXECUTOR_VOLUME_PNPM_STORE="$VOLUME_PNPM_STORE"
  export EXECUTOR_VOLUME_PLAYWRIGHT_NODE_MODULES="$VOLUME_PLAYWRIGHT_NODE_MODULES"
  export EXECUTOR_VOLUME_NPM_CACHE="$VOLUME_NPM_CACHE"
  export POSTGRES_USER="${POSTGRES_USER:-frequencia}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-frequencia}"
  export POSTGRES_DB="${POSTGRES_DB:-frequencia}"
  export COMPOSE_PROJECT_NAME="$PROJETO"
}

criar_volumes() {
  local volume
  for volume in \
    "$VOLUME_NODE_MODULES" \
    "$VOLUME_PNPM_STORE" \
    "$VOLUME_PLAYWRIGHT_NODE_MODULES" \
    "$VOLUME_NPM_CACHE"; do
    docker_host volume create "$volume" >/dev/null
  done
}

criar_tmp_tarefa() {
  TMP_TAREFA="$(mktemp -d "$RAIZ/.executor-tmp.XXXXXX")"
  if command -v cygpath >/dev/null 2>&1; then
    TMP_TAREFA_HOST="$(cygpath -m "$TMP_TAREFA")"
  else
    TMP_TAREFA_HOST="$TMP_TAREFA"
  fi
  TMP_TAREFA_CONTAINER="$(converter_para_container "$TMP_TAREFA_HOST")"
}

travar_execucao() {
  local diretorio="${EXECUTOR_LOCK_DIR:-${TMPDIR:-/tmp}/opencode/locks}"
  local arquivo
  mkdir -p "$diretorio"
  TRAVA="$diretorio/e2e.lock"
  if ! mkdir "$TRAVA" 2>/dev/null; then
    erro "Outra execução usa a trava $TRAVA. Remova o diretório apenas se não houver processo ativo."
  fi
  arquivo="$TRAVA/pid"
  printf '%s\n' "$$" >"$arquivo"
}

liberar_trava() {
  if [ -n "$TRAVA" ] && [ -d "$TRAVA" ]; then
    rm -rf -- "$TRAVA"
  fi
  TRAVA=""
}

finalizar() {
  local codigo=$?
  trap - EXIT INT TERM
  if [ -n "$CONTAINER_SISTEMA" ]; then
    docker_host rm --force "$CONTAINER_SISTEMA" >/dev/null 2>&1 || true
  fi
  if [ "$PROJETO_INICIADO" = "1" ] && [ "$MANTER" != "1" ]; then
    compose_projeto down --volumes --remove-orphans >/dev/null 2>&1 || true
  fi
  if [ -n "$TMP_TAREFA" ] && [ -d "$TMP_TAREFA" ]; then
    rm -rf -- "$TMP_TAREFA"
  fi
  liberar_trava
  exit "$codigo"
}

trap finalizar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

construir_qualidade() {
  docker_host build \
    --file "$RAIZ_HOST/scripts/dev/img/quality.Dockerfile" \
    --tag "$IMAGEM_QUALIDADE" \
    "$RAIZ_HOST"
}

construir_ferramentas() {
  docker_host build \
    --file "$RAIZ_HOST/scripts/dev/img/ferramentas.Dockerfile" \
    --tag "$IMAGEM_FERRAMENTAS" \
    "$RAIZ_HOST"
}

rodar_qualidade() {
  construir_qualidade
  criar_volumes
  docker_host run --rm --init \
    --volume "$RAIZ_HOST:$RAIZ_CONTAINER" \
    --volume "$VOLUME_NODE_MODULES:$RAIZ_CONTAINER/node_modules" \
    --volume "$VOLUME_PNPM_STORE:/pnpm-store" \
    --workdir "$RAIZ_CONTAINER" \
    --env CI=1 \
    --env PNPM_HOME=/pnpm \
    --env PNPM_STORE_DIR=/pnpm-store \
    --env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    --env NEXT_TELEMETRY_DISABLED=1 \
    --env TZ_APP=America/Fortaleza \
    --env DATABASE_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    --env DIRECT_URL=postgresql://frequencia:frequencia@localhost:5432/frequencia \
    --env AUTH_SECRET=segredo-dummy-de-32-bytes-para-testes-00 \
    "$IMAGEM_QUALIDADE" \
    bash -lc 'set -Eeuo pipefail
corepack enable
pnpm install --frozen-lockfile --store-dir=/pnpm-store
pnpm run format:check
pnpm run lint
pnpm run tsc
pnpm run test:unit
node --test tests/dev/executar-container.test.mjs'
}

rodar_servidor() {
  construir_ferramentas
  criar_volumes
  criar_tmp_tarefa
  docker_host run --rm --init \
    --volume "$RAIZ_HOST:$RAIZ_CONTAINER" \
    --volume "$VOLUME_NODE_MODULES:$RAIZ_CONTAINER/node_modules" \
    --volume "$VOLUME_PNPM_STORE:/pnpm-store" \
    --volume "$SOCKET:/var/run/docker.sock" \
    --workdir "$RAIZ_CONTAINER" \
    --env CI=1 \
    --env PNPM_HOME=/pnpm \
    --env PNPM_STORE_DIR=/pnpm-store \
    --env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    --env TZ_APP=America/Fortaleza \
    --env TMPDIR="$TMP_TAREFA_CONTAINER" \
    "$IMAGEM_FERRAMENTAS" \
    bash -lc 'set -Eeuo pipefail
corepack enable
pnpm install --frozen-lockfile --store-dir=/pnpm-store
pnpm run servidor:validar'
}

subir_aplicativo() {
  exportar_ambiente_compose
  criar_volumes
  compose_projeto build app
  PROJETO_INICIADO=1
  compose_projeto up --detach db app
}

aguardar_aplicativo() {
  local id estado tentativa
  id="$(compose_projeto ps --quiet app)"
  [ -n "$id" ] || erro "O serviço app não foi criado."
  for ((tentativa = 1; tentativa <= 90; tentativa++)); do
    estado="$(docker_host inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$id")"
    case "$estado" in
      healthy)
        return 0
        ;;
      exited | dead)
        compose_projeto logs app >&2 || true
        erro "O aplicativo encerrou antes de ficar saudável (${estado})."
        ;;
    esac
    sleep 2
  done
  compose_projeto logs app >&2 || true
  erro "O aplicativo não ficou saudável no tempo esperado."
}

criar_contas_de_teste() {
  compose_projeto exec --no-TTY \
    --env ADMIN_EMAIL=direcao@escola.exemplo \
    --env ADMIN_SENHA=DirecaoFrequencia2026 \
    --env ADMIN_NOME=Direcao \
    app node scripts/administracao/criar-admin.mjs
  compose_projeto exec --no-TTY \
    --env CONTA_EMAIL=demo@escola.exemplo \
    --env CONTA_SENHA=DemoFrequencia2026 \
    --env CONTA_NOME=Demo \
    app node scripts/administracao/criar-coordenacao.mjs
}

rodar_suite() {
  local servico="$1"
  local comando="$2"
  travar_execucao
  subir_aplicativo
  aguardar_aplicativo
  criar_contas_de_teste
  compose_projeto run --rm --no-TTY --no-deps "$servico" "$comando" _ "${EXTRA[@]}"
}

rodar_api() {
  # shellcheck disable=SC2016
  rodar_suite api 'set -Eeuo pipefail
npm install --global corepack@0.36.0
corepack enable
pnpm install --frozen-lockfile --store-dir=/pnpm-store
pnpm exec vitest run --config vitest.api.config.ts "$@"'
}

rodar_e2e() {
  # shellcheck disable=SC2016
  rodar_suite e2e 'set -Eeuo pipefail
npm install --global pnpm@12.11.2 --silent --no-fund --no-audit
pnpm install --frozen-lockfile --store-dir=/pnpm-store
pnpm exec playwright test "$@"'
}

rodar_pwa() {
  # shellcheck disable=SC2016
  rodar_suite pwa 'set -Eeuo pipefail
npm install --global pnpm@12.11.2 --silent --no-fund --no-audit
pnpm install --frozen-lockfile --store-dir=/pnpm-store
pnpm exec playwright test --config=playwright.pwa.config.ts --project=chromium "$@"'
}

imagens_instalador() {
  if [ -n "${EXECUTOR_IMAGENS:-}" ]; then
    IFS=' ' read -r -a IMAGENS <<<"$EXECUTOR_IMAGENS"
  else
    IMAGENS=(
      ubuntu:22.04
      ubuntu:24.04
      ubuntu:26.04
      debian:12
      debian:13
      rockylinux:9
      almalinux:9
      fedora:latest
      archlinux:latest
      opensuse/leap:15.6
      amazonlinux:2023
      alpine:3.22
    )
  fi
}

rodar_instalador_plano() {
  local imagem
  [ -f "$RAIZ/instalar.sh" ] ||
    erro "instalar.sh não existe neste worktree; implemente a tarefa P4 antes de usar instalador-plano."
  imagens_instalador
  for imagem in "${IMAGENS[@]}"; do
    printf 'Instalador planejar em %s\n' "$imagem" >&2
    if [ "$imagem" = "alpine:3.22" ]; then
      docker_host run --rm \
        --volume "$RAIZ_HOST:$RAIZ_CONTAINER:ro" \
        --workdir "$RAIZ_CONTAINER" \
        "$imagem" \
        sh -lc 'apk add --no-cache bash curl >/dev/null && bash instalar.sh planejar --json --nao-interativo'
    else
      docker_host run --rm \
        --volume "$RAIZ_HOST:$RAIZ_CONTAINER:ro" \
        --workdir "$RAIZ_CONTAINER" \
        "$imagem" \
        bash -lc 'bash instalar.sh planejar --json --nao-interativo'
    fi
  done
}

rodar_instalador_aplicar() {
  local container estado_sistema tentativa
  [ -f "$RAIZ/instalar.sh" ] ||
    erro "instalar.sh não existe neste worktree; implemente a tarefa P4 antes de usar instalador-aplicar."
  criar_tmp_tarefa
  container="${PROJETO}-sistema-$$"
  CONTAINER_SISTEMA="$container"
  docker_host run --detach --name "$container" \
    --privileged \
    --cgroupns=host \
    --volume /sys/fs/cgroup:/sys/fs/cgroup:rw \
    --volume "$RAIZ_HOST:$RAIZ_CONTAINER" \
    --volume "$SOCKET:/var/run/docker.sock" \
    --volume "$TMP_TAREFA_HOST:$TMP_TAREFA_CONTAINER" \
    --workdir "$RAIZ_CONTAINER" \
    --env TMPDIR="$TMP_TAREFA_CONTAINER" \
    "$IMAGEM_SISTEMA" \
    bash -lc 'set -Eeuo pipefail
apt-get update >/dev/null
apt-get install -y --no-install-recommends systemd dbus docker.io docker-compose-v2 >/dev/null
exec /sbin/init' >/dev/null
  for ((tentativa = 1; tentativa <= 60; tentativa++)); do
    estado_sistema="$(docker_host exec "$container" systemctl is-system-running 2>/dev/null || true)"
    case "$estado_sistema" in
      running | degraded)
        break
        ;;
    esac
    sleep 2
  done
  # shellcheck disable=SC2016
  docker_host exec "$container" \
    bash -lc 'set -Eeuo pipefail
cd "$1"
shift
bash instalar.sh aplicar --modo-teste --nao-interativo --sem-firewall "$@"' _ "$RAIZ_CONTAINER" "${EXTRA[@]}"
  docker_host rm --force "$container" >/dev/null
  CONTAINER_SISTEMA=""
}

COMANDO="${1:-}"
[ -n "$COMANDO" ] || {
  uso >&2
  exit 2
}
shift

case "$COMANDO" in
  ajuda | --ajuda | -h)
    uso
    exit 0
    ;;
esac

while (($#)); do
  case "$1" in
    --tarefa)
      [ $# -ge 2 ] || erro "A opção --tarefa exige um valor."
      TAREFA="$2"
      shift 2
      ;;
    --tarefa=*)
      TAREFA="${1#--tarefa=}"
      shift
      ;;
    --manter)
      MANTER=1
      shift
      ;;
    --imagem-sistema)
      [ $# -ge 2 ] || erro "A opção --imagem-sistema exige um valor."
      IMAGEM_SISTEMA="$2"
      shift 2
      ;;
    --imagem-sistema=*)
      IMAGEM_SISTEMA="${1#--imagem-sistema=}"
      shift
      ;;
    -h | --ajuda)
      uso
      exit 0
      ;;
    --)
      shift
      EXTRA+=("$@")
      break
      ;;
    *)
      EXTRA+=("$1")
      shift
      ;;
  esac
done

validar_tarefa
exigir_docker

case "$COMANDO" in
  qualidade)
    rodar_qualidade
    ;;
  servidor)
    rodar_servidor
    ;;
  api)
    rodar_api
    ;;
  e2e)
    rodar_e2e
    ;;
  pwa)
    rodar_pwa
    ;;
  instalador-plano)
    rodar_instalador_plano
    ;;
  instalador-aplicar)
    rodar_instalador_aplicar
    ;;
  *)
    erro "Subcomando desconhecido: $COMANDO. Use --ajuda para ver as opções."
    ;;
esac
