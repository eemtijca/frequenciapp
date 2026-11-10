#!/usr/bin/env bash
# Atualiza a instalação Compose a partir de releases ou da branch principal.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente

if [ -n "${DATABASE_URL:-}${DIRECT_URL:-}${BACKUP_DATABASE_URL:-}" ]; then
  node "$APP_DIR/scripts/servidor/validar-banco.mjs" || erro "A identidade do banco não confere."
fi

if [ -z "${ATUALIZAR_SAUDE_URL:-}" ] && [ -n "${DOMINIO:-}" ] &&
  [ "${ATUALIZAR_VERIFICAR_SAUDE_PUBLICA:-true}" = "true" ]; then
  ATUALIZAR_SAUDE_URL="https://${DOMINIO}/api/saude"
fi

ATUALIZAR_MODO="${ATUALIZAR_MODO:-auto}"
ATUALIZAR_REF="${ATUALIZAR_REF:-origin/main}"
ATUALIZAR_REMOTO="${ATUALIZAR_REMOTO:-origin}"
ATUALIZAR_BACKUP_ANTES="${ATUALIZAR_BACKUP_ANTES:-true}"
ATUALIZAR_PERMITIR_MIGRACOES="${ATUALIZAR_PERMITIR_MIGRACOES:-false}"
MIGRAR_NA_PARTIDA="${MIGRAR_NA_PARTIDA:-true}"
ATUALIZAR_MIGRACAO_EXTERNA="${ATUALIZAR_MIGRACAO_EXTERNA:-false}"
ATUALIZAR_VERIFICAR_IMAGEM="${ATUALIZAR_VERIFICAR_IMAGEM:-true}"
ATUALIZAR_TIMEOUT_SAUDE="${ATUALIZAR_TIMEOUT_SAUDE:-180}"
ATUALIZAR_SAUDE_CA="${ATUALIZAR_SAUDE_CA:-}"
ATUALIZAR_ESPACO_MINIMO_MB="${ATUALIZAR_ESPACO_MINIMO_MB:-2048}"
APP_IMAGEM_REPOSITORIO="${APP_IMAGEM_REPOSITORIO:-ghcr.io/eemtijca/frequenciapp}"
APP_IMAGEM_BACKUP_REPOSITORIO="${APP_IMAGEM_BACKUP_REPOSITORIO:-${APP_IMAGEM_REPOSITORIO}-backup}"
BACKUP_PLANILHAS_HABILITADO="${BACKUP_PLANILHAS_HABILITADO:-true}"

simular=false
forcar=false
modo_override=""
registrar=false
permitir_migracoes="$ATUALIZAR_PERMITIR_MIGRACOES"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --simular)
      simular=true
      shift
      ;;
    --forcar)
      forcar=true
      shift
      ;;
    --registrar)
      registrar=true
      shift
      ;;
    --permitir-migracoes)
      permitir_migracoes=true
      shift
      ;;
    --modo)
      modo_override="${2:-}"
      shift 2
      ;;
    --ajuda | -h)
      cat <<'TEXTO'
Uso: atualizar.sh [--simular] [--forcar] [--registrar] [--permitir-migracoes] [--modo auto|release|main]
TEXTO
      exit 0
      ;;
    *)
      erro "Opção desconhecida: $1"
      ;;
  esac
done

if [ "$ATUALIZAR_BACKUP_ANTES" != "true" ]; then
  erro "O backup anterior é obrigatório. ATUALIZAR_BACKUP_ANTES=false não é aceito."
fi

[ -n "$modo_override" ] && ATUALIZAR_MODO="$modo_override"
case "$ATUALIZAR_MODO" in
  auto | release | main) ;;
  *) erro "ATUALIZAR_MODO inválido: $ATUALIZAR_MODO." ;;
esac

estado="$ESTADO_DIR/estado.json"
falha="$ESTADO_DIR/falha.json"
estado_backup="$ESTADO_DIR/ultimo-backup.json"

escrever_estado() {
  local modo="$1"
  local ref="$2"
  local commit="$3"
  local imagem="$4"
  local imagem_backup="$5"
  mkdir -p "$ESTADO_DIR"
  printf '{"modo":"%s","ref":"%s","commit":"%s","imagem":"%s","imagemBackup":"%s","atualizadoEm":"%s"}\n' \
    "$modo" "$ref" "$commit" "$imagem" "$imagem_backup" \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$estado.tmp"
  mv "$estado.tmp" "$estado"
  chmod 600 "$estado"
}

escrever_falha() {
  local ref="$1"
  local commit="$2"
  local motivo="$3"
  local migracoes="$4"
  mkdir -p "$ESTADO_DIR"
  printf '{"em":"%s","ref":"%s","commit":"%s","motivo":"%s","migracoesPossivelmenteAplicadas":%s}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ref" "$commit" "$motivo" "$migracoes" >"$falha.tmp"
  mv "$falha.tmp" "$falha"
  chmod 600 "$falha"
}

limpar_falha() { rm -f "$falha"; }

worktree=""
worktree_base=""

limpar_worktree() {
  if [ -n "$worktree" ]; then
    git -C "$APP_DIR" worktree remove --force "$worktree" >/dev/null 2>&1 ||
      rm -rf "$worktree"
  fi
  if [ -n "$worktree_base" ]; then
    rm -rf "$worktree_base"
  fi
  worktree=""
  worktree_base=""
}
trap 'limpar_worktree' EXIT

criar_worktree() {
  local commit="$1"
  limpar_worktree
  worktree_base=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-atualizacao.XXXXXX")
  worktree="$worktree_base/worktree"
  git -C "$APP_DIR" worktree prune
  git -C "$APP_DIR" worktree add --detach "$worktree" "$commit" >/dev/null ||
    erro "Não foi possível criar a worktree do commit $commit."
}

validar_backup_obrigatorio() {
  local marco="$1"
  local dir_backup="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
  local arquivo
  local sha
  local calculado

  [ -f "$estado_backup" ] || erro "O backup não gravou o estado esperado."
  [ "$estado_backup" -nt "$marco" ] ||
    erro "O estado do backup não foi atualizado nesta execução."

  arquivo=$(ler_campo_json "$estado_backup" "arquivo")
  sha=$(ler_campo_json "$estado_backup" "sha256")
  [ -n "$arquivo" ] || erro "O estado do backup não informa o arquivo."
  [ -n "$sha" ] || erro "O estado do backup não informa o checksum."
  [ -f "$dir_backup/$arquivo" ] ||
    erro "O arquivo de backup não existe em $dir_backup."

  calculado=$(sha256sum "$dir_backup/$arquivo" | cut -d' ' -f1)
  [ "$calculado" = "$sha" ] ||
    erro "O checksum do backup local não confere."

  if [ -n "${BACKUP_REMOTO:-}" ] && [ "${BACKUP_VERIFICAR_REMOTO:-true}" = "true" ]; then
    backup_remoto_confirmado "$estado_backup" ||
      erro "O backup remoto não foi verificado."
  elif [ "${ATUALIZAR_PERMITIR_BACKUP_LOCAL:-false}" != "true" ]; then
    erro "A atualização exige backup remoto confirmado. Configure BACKUP_REMOTO ou defina ATUALIZAR_PERMITIR_BACKUP_LOCAL=true com decisão explícita."
  fi
}

executar_backup_obrigatorio() {
  local marco="$ESTADO_DIR/.marco-backup.$$"
  mkdir -p "$ESTADO_DIR"
  : >"$marco"
  log "Executando backup obrigatório antes da atualização."
  if ! "$DIR/backup-banco.sh"; then
    rm -f "$marco"
    erro "O backup falhou; a atualização foi cancelada."
  fi
  validar_backup_obrigatorio "$marco"
  rm -f "$marco"
}

revisao_da_imagem() {
  docker image inspect \
    --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' \
    "$1" 2>/dev/null || true
}

verificar_imagem_alvo() {
  local imagem="$1"
  local commit="$2"
  local revisao
  revisao=$(revisao_da_imagem "$imagem")
  if [ "$revisao" != "$commit" ]; then
    erro "A imagem $imagem não corresponde ao commit $commit (revisão: ${revisao:-ausente})."
  fi
}

construir_app_na_worktree() {
  local imagem="$1"
  local commit="$2"
  (
    montar_compose_em "$worktree"
    APP_IMAGEM="$imagem" COMMIT_SHA="$commit" conferir_identidade auto
    APP_IMAGEM="$imagem" COMMIT_SHA="$commit" compose build "$SERVIDOR_SERVICO_APP"
  )
}

construir_backup_na_worktree() {
  local imagem_app="$1"
  local imagem_backup="$2"
  local commit="$3"
  (
    montar_compose_em "$worktree"
    APP_IMAGEM="$imagem_app" APP_IMAGEM_BACKUP="$imagem_backup" COMMIT_SHA="$commit" conferir_identidade auto
    APP_IMAGEM="$imagem_app" APP_IMAGEM_BACKUP="$imagem_backup" COMMIT_SHA="$commit" \
      compose --profile backup build "$SERVIDOR_SERVICO_BACKUP_PLANILHAS"
  )
}

validar_compose_na_worktree() {
  local imagem="$1"
  local imagem_backup="$2"
  local commit="$3"
  (
    montar_compose_em "$worktree"
    APP_IMAGEM="$imagem" APP_IMAGEM_BACKUP="$imagem_backup" COMMIT_SHA="$commit" conferir_identidade auto
    APP_IMAGEM="$imagem" APP_IMAGEM_BACKUP="$imagem_backup" COMMIT_SHA="$commit" \
      compose config --quiet
  )
}

garantir_imagem_anterior() {
  local commit="$1"
  local imagem_estado="$2"
  local imagem_backup_estado="$3"
  local container
  local imagem_container
  local destino

  container=$(compose ps -q "$SERVIDOR_SERVICO_APP" 2>/dev/null || true)
  if [ -n "$container" ]; then
    imagem_container=$(docker inspect --format '{{.Image}}' "$container" 2>/dev/null || true)
    if [ -n "$imagem_container" ]; then
      destino="${APP_IMAGEM_ANTERIOR:-frequenciapp-rollback:${commit:0:12}}"
      docker tag "$imagem_container" "$destino" >/dev/null
      ANTERIOR_IMAGEM="$destino"
      ANTERIOR_BACKUP="$imagem_backup_estado"
      log "Imagem anterior preservada como $destino."
      return 0
    fi
  fi

  if [ -n "$imagem_estado" ] && docker image inspect "$imagem_estado" >/dev/null 2>&1; then
    ANTERIOR_IMAGEM="$imagem_estado"
    ANTERIOR_BACKUP="$imagem_backup_estado"
    return 0
  fi

  log "A imagem anterior não está disponível; construindo a partir do commit $commit."
  criar_worktree "$commit"
  destino="${APP_IMAGEM_ANTERIOR:-frequenciapp-rollback:${commit:0:12}}"
  construir_app_na_worktree "$destino" "$commit"
  verificar_imagem_alvo "$destino" "$commit"
  ANTERIOR_IMAGEM="$destino"
  ANTERIOR_BACKUP="$imagem_backup_estado"
}

falhar_atualizacao() {
  local motivo="$1"
  local migracoes="$2"
  log "$motivo Iniciando rollback."
  git -C "$APP_DIR" checkout --detach "$ANTERIOR_COMMIT"
  APP_IMAGEM="$ANTERIOR_IMAGEM" APP_IMAGEM_BACKUP="$ANTERIOR_BACKUP" \
    COMMIT_SHA="$ANTERIOR_COMMIT" conferir_identidade auto
  if ! APP_IMAGEM="$ANTERIOR_IMAGEM" APP_IMAGEM_BACKUP="$ANTERIOR_BACKUP" \
    COMMIT_SHA="$ANTERIOR_COMMIT" compose up -d --wait --no-build \
    --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE"; then
    log "O rollback também falhou; intervenção manual necessária."
  fi
  escrever_falha "$alvo_ref" "$alvo_commit" "$motivo" "$migracoes"
  notificar falha "Atualização falhou e o rollback foi tentado."
  exit 1
}

[ -d "$APP_DIR/.git" ] || erro "Checkout Git não encontrado em $APP_DIR."
verificar_instalacao
travar atualizacao 0

if [ "$registrar" = true ]; then
  if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
    erro "A árvore de trabalho tem alterações. Faça commit ou descarte antes de registrar."
  fi
  commit=$(git -C "$APP_DIR" rev-parse HEAD)
  ref=$(git -C "$APP_DIR" describe --tags --exact-match 2>/dev/null || git -C "$APP_DIR" rev-parse --short HEAD)
  modo_registro="main"
  imagem="${APP_IMAGEM:-frequenciapp:main-${commit:0:12}}"
  imagem_backup="${APP_IMAGEM_BACKUP:-frequenciapp-backup:main-${commit:0:12}}"
  if git -C "$APP_DIR" describe --tags --exact-match >/dev/null 2>&1; then
    modo_registro="release"
    imagem="${APP_IMAGEM_REPOSITORIO}:${ref#v}"
    imagem_backup="${APP_IMAGEM_BACKUP_REPOSITORIO}:${ref#v}"
  fi
  escrever_estado "$modo_registro" "$ref" "$commit" "$imagem" "$imagem_backup"
  log "Estado registrado em $estado."
  exit 0
fi

if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
  erro "A árvore de trabalho tem alterações. Faça commit ou descarte antes de atualizar."
fi

if [ "$simular" = true ]; then
  # A simulação não busca referências: o fetch com tags, prune e force altera
  # refs locais. Quem quiser considerar o remoto atualizado busca antes, de
  # forma explícita, e repete a simulação.
  log "Simulação sem buscar referências: usando as refs locais em $APP_DIR."
  log "Execute git fetch manualmente se precisar considerar o remoto atualizado."
else
  log "Buscando referências em $ATUALIZAR_REMOTO."
  git -C "$APP_DIR" fetch --tags --prune --force "$ATUALIZAR_REMOTO"
fi

tag_estavel=$(git -C "$APP_DIR" tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname |
  grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)
if [ -n "$tag_estavel" ] &&
  ! git -C "$APP_DIR" merge-base --is-ancestor "$tag_estavel" "$ATUALIZAR_REMOTO/main"; then
  log "A tag $tag_estavel não pertence à branch principal; ignorando."
  tag_estavel=""
fi

modo_atual=""; ref_atual=""; commit_atual=""; imagem_atual=""; imagem_backup_atual=""
if [ -f "$estado" ]; then
  modo_atual=$(ler_campo_json "$estado" "modo")
  ref_atual=$(ler_campo_json "$estado" "ref")
  commit_atual=$(ler_campo_json "$estado" "commit")
  imagem_atual=$(ler_campo_json "$estado" "imagem")
  imagem_backup_atual=$(ler_campo_json "$estado" "imagemBackup")
fi

head_commit=$(git -C "$APP_DIR" rev-parse HEAD)
if [ -z "$commit_atual" ]; then
  commit_atual="$head_commit"
elif [ "$commit_atual" != "$head_commit" ] && [ "$forcar" = false ]; then
  erro "O estado registrado aponta para $commit_atual, mas o checkout está em $head_commit. Registre o estado ou use --forcar."
fi
if [ -z "$ref_atual" ]; then
  ref_atual=$(git -C "$APP_DIR" describe --tags --always 2>/dev/null || printf '%s' "${commit_atual:0:12}")
fi
if [ -z "$imagem_atual" ]; then
  imagem_atual="${APP_IMAGEM:-}"
fi
if [ -z "$imagem_backup_atual" ]; then
  imagem_backup_atual="${APP_IMAGEM_BACKUP:-}"
fi

alvo_modo=""
alvo_ref=""
alvo_commit=""
alvo_imagem=""
alvo_backup=""

definir_release() {
  [ -n "$tag_estavel" ] || erro "Não há tag estável disponível para o modo release."
  alvo_modo="release"
  alvo_ref="$tag_estavel"
  alvo_commit=$(git -C "$APP_DIR" rev-parse "$tag_estavel^{commit}")
  alvo_imagem="${APP_IMAGEM_REPOSITORIO}:${tag_estavel#v}"
  alvo_backup="${APP_IMAGEM_BACKUP_REPOSITORIO}:${tag_estavel#v}"
}

definir_main() {
  alvo_modo="main"
  alvo_ref="$ATUALIZAR_REF"
  alvo_commit=$(git -C "$APP_DIR" rev-parse "$ATUALIZAR_REF")
  alvo_imagem="${APP_IMAGEM_REPOSITORIO}:main-${alvo_commit:0:12}"
  alvo_backup="${APP_IMAGEM_BACKUP_REPOSITORIO}:main-${alvo_commit:0:12}"
}

case "$ATUALIZAR_MODO" in
  release)
    definir_release
    ;;
  main)
    definir_main
    ;;
  auto)
    if [ -z "$tag_estavel" ]; then
      definir_main
    elif [ "$modo_atual" = "release" ]; then
      definir_release
    elif [ -z "$modo_atual" ]; then
      if git -C "$APP_DIR" merge-base --is-ancestor "$commit_atual" "$tag_estavel"; then
        definir_release
      else
        definir_main
      fi
    elif git -C "$APP_DIR" merge-base --is-ancestor "$commit_atual" "$tag_estavel"; then
      definir_release
    else
      definir_main
    fi
    ;;
esac

log "Modo atual: ${modo_atual:-desconhecido}; modo alvo: $alvo_modo."
log "Referência alvo: $alvo_ref ($alvo_commit)."

migracoes_novas=false
migracoes=$(git -C "$APP_DIR" diff --name-only "$commit_atual" "$alvo_commit" -- prisma/migrations || true)
if [ -n "$migracoes" ]; then
  migracoes_novas=true
fi

if [ "$simular" = true ]; then
  log "Simulação: nenhuma alteração será aplicada."
  log "Backup obrigatório antes da aplicação: sim."
  if [ "$migracoes_novas" = true ]; then
    if [ "$permitir_migracoes" = "true" ]; then
      log "Migrações novas serão permitidas por opção explícita."
    else
      log "Migrações novas bloqueariam a atualização; use --permitir-migracoes."
    fi
  else
    log "Sem migrações novas entre o estado atual e o alvo."
  fi
  if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
    log "O backup de planilhas habilitado também será considerado."
  else
    log "O backup de planilhas está desabilitado e não será construído."
  fi
  exit 0
fi

if [ "$commit_atual" = "$alvo_commit" ] && [ "$forcar" = false ]; then
  log "Nenhuma mudança a aplicar."
  exit 0
fi

if [ -f "$falha" ] && [ "$forcar" = false ]; then
  falha_ref=$(ler_campo_json "$falha" "ref")
  if [ "$falha_ref" = "$alvo_ref" ]; then
    erro "A versão $alvo_ref falhou antes. Use --forcar após corrigir."
  fi
fi

if [ "$migracoes_novas" = true ] && [ "$permitir_migracoes" != "true" ]; then
  erro "Há migrações novas. Revise e repita com --permitir-migracoes ou defina ATUALIZAR_PERMITIR_MIGRACOES=true."
fi

if [ "$migracoes_novas" = true ] && [ "$MIGRAR_NA_PARTIDA" != "true" ]; then
  [ "$ATUALIZAR_MIGRACAO_EXTERNA" = "true" ] ||
    erro "Há migrações novas e MIGRAR_NA_PARTIDA=false. Aplique a migração explicitamente e defina ATUALIZAR_MIGRACAO_EXTERNA=true antes de atualizar."
  log "Migrações externas confirmadas por ATUALIZAR_MIGRACAO_EXTERNA=true."
fi

livre=$(espaco_livre_mb "$APP_DIR")
if [ "${livre:-0}" -lt "$ATUALIZAR_ESPACO_MINIMO_MB" ]; then
  erro "Espaço insuficiente em $APP_DIR: ${livre:-0} MB livres."
fi

executar_backup_obrigatorio

ANTERIOR_COMMIT="$commit_atual"
ANTERIOR_IMAGEM=""
ANTERIOR_BACKUP="$imagem_backup_atual"
garantir_imagem_anterior "$ANTERIOR_COMMIT" "$imagem_atual" "$imagem_backup_atual"

log "Preparando o commit alvo em worktree isolada."
criar_worktree "$alvo_commit"

validar_compose_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit" ||
  erro "A configuração ou identidade do Compose alvo não foi conferida."

if [ "$alvo_modo" = "release" ]; then
  log "Baixando a imagem $alvo_imagem."
  APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" compose pull "$SERVIDOR_SERVICO_APP"

  if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
    if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
      compose --profile backup pull "$SERVIDOR_SERVICO_BACKUP_PLANILHAS"; then
      log "Imagem de backup não publicada; construindo a partir da aplicação."
      construir_backup_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit"
    fi
  fi
else
  log "Construindo a imagem $alvo_imagem a partir do commit alvo."
  construir_app_na_worktree "$alvo_imagem" "$alvo_commit"
  if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
    construir_backup_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit"
  fi
fi

if [ "$ATUALIZAR_VERIFICAR_IMAGEM" = "true" ]; then
  verificar_imagem_alvo "$alvo_imagem" "$alvo_commit"
fi

validar_compose_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit" ||
  erro "A configuração do Compose não é válida na versão alvo."

log "Aplicando $alvo_ref."
git -C "$APP_DIR" checkout --detach "$alvo_commit"

APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" conferir_identidade auto

if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" compose config --quiet; then
  git -C "$APP_DIR" checkout --detach "$ANTERIOR_COMMIT"
  erro "A configuração do Compose não é válida no checkout alvo."
fi

if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" compose up -d --wait --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE"; then
  falhar_atualizacao "Falha de saúde após a atualização." "$migracoes_novas"
fi

if [ -n "${ATUALIZAR_SAUDE_URL:-}" ]; then
  log "Conferindo $ATUALIZAR_SAUDE_URL."
  curl_args=(-fsS --retry 12 --retry-delay 5 --retry-all-errors --max-time 15)
  if [ -n "$ATUALIZAR_SAUDE_CA" ]; then
    [ -f "$ATUALIZAR_SAUDE_CA" ] || erro "CA de saúde não encontrada: $ATUALIZAR_SAUDE_CA."
    curl_args+=(--cacert "$ATUALIZAR_SAUDE_CA")
  fi
  if ! curl "${curl_args[@]}" "$ATUALIZAR_SAUDE_URL" >/dev/null; then
    falhar_atualizacao "Falha na saúde pública após a atualização." "$migracoes_novas"
  fi
fi

escrever_estado "$alvo_modo" "$alvo_ref" "$alvo_commit" "$alvo_imagem" "$alvo_backup"
limpar_falha
notificar sucesso "Atualização concluída para $alvo_ref."
log "Atualização concluída para $alvo_ref."
