#!/usr/bin/env bash
# Atualiza a instalação Compose a partir de releases ou da branch principal.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

carregar_ambiente
travar atualizacao 0

if [ -z "${ATUALIZAR_SAUDE_URL:-}" ] && [ -n "${DOMINIO:-}" ]; then
  ATUALIZAR_SAUDE_URL="https://${DOMINIO}/api/saude"
fi

ATUALIZAR_MODO="${ATUALIZAR_MODO:-auto}"
ATUALIZAR_REF="${ATUALIZAR_REF:-origin/main}"
ATUALIZAR_REMOTO="${ATUALIZAR_REMOTO:-origin}"
ATUALIZAR_BACKUP_ANTES="${ATUALIZAR_BACKUP_ANTES:-true}"
ATUALIZAR_PERMITIR_MIGRACOES="${ATUALIZAR_PERMITIR_MIGRACOES:-false}"
ATUALIZAR_TIMEOUT_SAUDE="${ATUALIZAR_TIMEOUT_SAUDE:-180}"
ATUALIZAR_ESPACO_MINIMO_MB="${ATUALIZAR_ESPACO_MINIMO_MB:-2048}"
APP_IMAGEM_REPOSITORIO="${APP_IMAGEM_REPOSITORIO:-ghcr.io/eemtijca/frequenciapp}"
APP_IMAGEM_BACKUP_REPOSITORIO="${APP_IMAGEM_BACKUP_REPOSITORIO:-${APP_IMAGEM_REPOSITORIO}-backup}"

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

[ -n "$modo_override" ] && ATUALIZAR_MODO="$modo_override"
case "$ATUALIZAR_MODO" in
  auto | release | main) ;;
  *) erro "ATUALIZAR_MODO inválido: $ATUALIZAR_MODO." ;;
esac

estado="$ESTADO_DIR/estado.json"
falha="$ESTADO_DIR/falha.json"

ler_campo() {
  local arquivo="$1"
  local campo="$2"
  [ -f "$arquivo" ] || return 0
  grep -o "\"$campo\":\"[^\"]*\"" "$arquivo" | head -n 1 | cut -d'"' -f4 || true
}

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
  mkdir -p "$ESTADO_DIR"
  printf '{"em":"%s","ref":"%s","commit":"%s","motivo":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$ref" "$commit" "$motivo" >"$falha.tmp"
  mv "$falha.tmp" "$falha"
  chmod 600 "$falha"
}

limpar_falha() { rm -f "$falha"; }

if [ "$registrar" = true ]; then
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

[ -d "$APP_DIR/.git" ] || erro "Checkout Git não encontrado em $APP_DIR."
if [ -n "$(git -C "$APP_DIR" status --porcelain)" ]; then
  erro "A árvore de trabalho tem alterações. Faça commit ou descarte antes de atualizar."
fi

log "Buscando referências em $ATUALIZAR_REMOTO."
git -C "$APP_DIR" fetch --tags --prune --force "$ATUALIZAR_REMOTO"

tag_estavel=$(git -C "$APP_DIR" tag --list 'v[0-9]*.[0-9]*.[0-9]*' --sort=-v:refname |
  grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)
if [ -n "$tag_estavel" ] &&
  ! git -C "$APP_DIR" merge-base --is-ancestor "$tag_estavel" "$ATUALIZAR_REMOTO/main"; then
  log "A tag $tag_estavel não pertence à branch principal; ignorando."
  tag_estavel=""
fi

modo_atual=$(ler_campo "$estado" "modo")
ref_atual=$(ler_campo "$estado" "ref")
commit_atual=$(ler_campo "$estado" "commit")
imagem_atual=$(ler_campo "$estado" "imagem")
imagem_backup_atual=$(ler_campo "$estado" "imagemBackup")

if [ -z "$commit_atual" ]; then
  commit_atual=$(git -C "$APP_DIR" rev-parse HEAD)
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

if [ "$simular" = true ]; then
  log "Simulação: nenhuma alteração será aplicada."
  exit 0
fi

if [ "$commit_atual" = "$alvo_commit" ] && [ "$forcar" = false ]; then
  log "Nenhuma mudança a aplicar."
  exit 0
fi

if [ -f "$falha" ] && [ "$forcar" = false ]; then
  falha_ref=$(ler_campo "$falha" "ref")
  if [ "$falha_ref" = "$alvo_ref" ]; then
    erro "A versão $alvo_ref falhou antes. Use --forcar após corrigir."
  fi
fi

livre=$(espaco_livre_mb "$APP_DIR")
if [ "${livre:-0}" -lt "$ATUALIZAR_ESPACO_MINIMO_MB" ]; then
  erro "Espaço insuficiente em $APP_DIR: ${livre:-0} MB livres."
fi

if [ "$alvo_modo" = "release" ]; then
  log "Baixando a imagem $alvo_imagem."
  APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" compose pull app
  if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
    compose --profile backup pull backup-planilhas; then
    log "Imagem de backup não publicada; construindo a partir da aplicação."
    APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
      compose --profile backup build backup-planilhas
  fi
else
  log "Construindo a imagem $alvo_imagem."
  APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" compose build app
  APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
    compose --profile backup build backup-planilhas
fi

if [ -n "$commit_atual" ] &&
  git -C "$APP_DIR" diff --name-only "$commit_atual" "$alvo_commit" -- prisma/migrations | grep -q .; then
  if [ "$permitir_migracoes" != "true" ]; then
    erro "Há migrações novas. Revise e repita com --permitir-migracoes ou defina ATUALIZAR_PERMITIR_MIGRACOES=true."
  fi
fi

if [ "$ATUALIZAR_BACKUP_ANTES" = "true" ] && [ -n "$modo_atual" ]; then
  log "Executando backup antes da atualização."
  if ! "$DIR/backup-banco.sh"; then
    erro "O backup falhou; a atualização foi cancelada."
  fi
else
  log "Backup anterior não executado nesta atualização."
fi

anterior_commit=$(git -C "$APP_DIR" rev-parse HEAD)
anterior_imagem="$imagem_atual"
anterior_backup="$imagem_backup_atual"
if [ -z "$anterior_imagem" ]; then
  anterior_imagem="${APP_IMAGEM:-frequenciapp:main-${anterior_commit:0:12}}"
fi
if [ -z "$anterior_backup" ]; then
  anterior_backup="${APP_IMAGEM_BACKUP:-frequenciapp-backup:main-${anterior_commit:0:12}}"
fi

log "Aplicando $alvo_ref."
git -C "$APP_DIR" checkout --detach "$alvo_commit"

if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" compose config --quiet; then
  git -C "$APP_DIR" checkout --detach "$anterior_commit"
  erro "A configuração do Compose não é válida na versão alvo."
fi

if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" compose up -d --wait --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE"; then
  log "A versão alvo não ficou saudável; iniciando rollback."
  git -C "$APP_DIR" checkout --detach "$anterior_commit"
  APP_IMAGEM="$anterior_imagem" APP_IMAGEM_BACKUP="$anterior_backup" \
    COMMIT_SHA="$anterior_commit" compose up -d --wait --no-build --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE" ||
    log "O rollback também falhou; intervenção manual necessária."
  escrever_falha "$alvo_ref" "$alvo_commit" "Falha de saúde após a atualização."
  notificar falha "Atualização falhou e o rollback foi tentado."
  exit 1
fi

if [ -n "${ATUALIZAR_SAUDE_URL:-}" ]; then
  log "Conferindo $ATUALIZAR_SAUDE_URL."
  if ! curl -fsS --retry 12 --retry-delay 5 --retry-all-errors --max-time 15 "$ATUALIZAR_SAUDE_URL" >/dev/null; then
    log "A saúde pública falhou; iniciando rollback."
    git -C "$APP_DIR" checkout --detach "$anterior_commit"
    APP_IMAGEM="$anterior_imagem" APP_IMAGEM_BACKUP="$anterior_backup" \
      COMMIT_SHA="$anterior_commit" compose up -d --wait --no-build --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE" ||
      log "O rollback também falhou; intervenção manual necessária."
    escrever_falha "$alvo_ref" "$alvo_commit" "Falha na saúde pública após a atualização."
    notificar falha "Atualização falhou na saúde pública."
    exit 1
  fi
fi

escrever_estado "$alvo_modo" "$alvo_ref" "$alvo_commit" "$alvo_imagem" "$alvo_backup"
limpar_falha
notificar sucesso "Atualização concluída para $alvo_ref."
log "Atualização concluída para $alvo_ref."
