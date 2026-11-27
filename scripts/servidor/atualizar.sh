#!/usr/bin/env bash
# Atualiza a instalação Compose a partir de releases ou da branch principal.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
controlador_ativo=false

# O perfil não é criado aqui. Quando ele existe, a entrada estável assume a
# operação; quando o controlador chama este script, o contrato autoriza o filho.
verificar_controlador() {
  local perfil="${SERVIDOR_CONTROLADOR_PERFIL:-/opt/frequenciapp-controlador/perfil.json}"
  local entrada
  if [ -n "${SERVIDOR_CONTROLADOR_OPERACAO:-}${SERVIDOR_CONTROLADOR_PREPARACAO:-}${SERVIDOR_CONTROLADOR_LEITURA:-}" ]; then
    [ -f "$DIR/controlador/contrato.mjs" ] ||
      {
        printf 'ERRO: Contrato do controlador ausente no snapshot.\n' >&2
        exit 78
      }
    node "$DIR/controlador/contrato.mjs" autorizar "$perfil" atualizar || exit 78
    controlador_ativo=true
    return 0
  fi
  if [ -e "$perfil" ] || [ -L "$perfil" ]; then
    entrada="$(dirname "$perfil")/executar"
    exec "$entrada" atualizar "$@"
  fi
  if [ -n "${SERVIDOR_CONTROLADOR_PERFIL:-}" ]; then
    printf 'ERRO: Perfil do controlador não existe em %s.\n' "$perfil" >&2
    exit 78
  fi
}
verificar_controlador "$@"

# shellcheck source=comum.sh
. "$DIR/comum.sh"

readonly arquivo_app_politica="$APP_ENV_FILE"
readonly arquivo_ops_politica="$OPS_ENV_FILE"
ler_politica_migracoes_auto() {
  node "$DIR/ambiente-seguro.mjs" --politica-migracoes-auto \
    "$arquivo_app_politica" "$arquivo_ops_politica"
}

carregar_ambiente
if [ "$controlador_ativo" = false ]; then
  # A configuração protegida também pode informar o perfil adotado.
  verificar_controlador "$@"
fi

if [ -n "${DATABASE_URL:-}${DIRECT_URL:-}${BACKUP_DATABASE_URL:-}" ]; then
  node "$SERVIDOR_SCRIPTS_DIR/validar-banco.mjs" || erro "A identidade do banco não confere."
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
agendado=false
migracoes_auto=false
imagem_migracoes_auto=""
envelope_migracoes_auto=""
pasta_lote_auto=""
subida_lote_auto=false
app_final_auto=""
envelope_manual=""
permissao_manual=false
protecao_manual=false
tag_override=""
ref_override=""
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
      permissao_manual=true
      shift
      ;;
    --agendado)
      agendado=true
      shift
      ;;
    --modo)
      modo_override="${2:-}"
      shift 2
      ;;
    --tag)
      tag_override="${2:-}"
      [ -n "$tag_override" ] || erro "Informe uma tag para --tag."
      shift 2
      ;;
    --ref)
      ref_override="${2:-}"
      [ -n "$ref_override" ] || erro "Informe uma referência para --ref."
      shift 2
      ;;
    --ajuda | -h)
      cat <<'TEXTO'
Uso: atualizar.sh [--simular] [--forcar] [--registrar] [--agendado | --permitir-migracoes] [--modo auto|release|main] [--tag vX.Y.Z] [--ref REF]
TEXTO
      exit 0
      ;;
    *)
      erro "Opção desconhecida: $1"
      ;;
  esac
done

if [ "$agendado" = true ]; then
  if [ "$registrar" = true ] || [ "$forcar" = true ] || [ "$permissao_manual" = true ] ||
    [ "$ATUALIZAR_MIGRACAO_EXTERNA" = true ]; then
    erro "O modo agendado não admite registro, migração externa ou permissões manuais."
  fi
  permitir_migracoes=false
  migracoes_auto=$(ler_politica_migracoes_auto) || erro "Política de migrações automáticas inválida."
fi

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
operacao="$ESTADO_DIR/atualizacao-em-andamento.json"
operacao_manual="$ESTADO_DIR/atualizacao-manual-pendente.json"
operacao_iniciada=false
lote_auto_iniciado=false

# O journal e os pins pertencem ao controlador. No caminho simples, nada é
# criado e o marcador legado não bloqueia a operação.
registrar_operacao() {
  [ "$controlador_ativo" = true ] || return 0
  [ "$operacao_iniciada" = false ] || return 0
  if [ -n "${SERVIDOR_CONTROLADOR_PREPARACAO:-}" ]; then
    local opcoes=()
    if [ "$agendado" = true ] && [ "${migracoes_novas:-false}" = true ] && [ "$migracoes_auto" = true ]; then
      opcoes+=(--migracoes-auto)
    fi
    node "$DIR/controlador/cli.mjs" iniciar "$SERVIDOR_CONTROLADOR_PERFIL" "${opcoes[@]}" || return 1
    export SERVIDOR_CONTROLADOR_OPERACAO="$SERVIDOR_CONTROLADOR_PREPARACAO"
    export SERVIDOR_CONTROLADOR_ACAO=atualizar
    if [ "${#opcoes[@]}" -gt 0 ]; then lote_auto_iniciado=true; fi
  fi
  node "$DIR/controlador/contrato.mjs" autorizar "$SERVIDOR_CONTROLADOR_PERFIL" atualizar || return 1
  operacao_iniciada=true
}

recusar_pre_troca() {
  if [ "$lote_auto_iniciado" = true ] &&
    node "$DIR/controlador/cli.mjs" abortar-migracoes-auto "$SERVIDOR_CONTROLADOR_PERFIL"; then
    printf 'ERRO: %s\n' "$*" >&2
    exit 20
  fi
  erro "$@"
}

fixar_backup_controlador() {
  [ "$controlador_ativo" = true ] || return 0
  node "$DIR/controlador/cli.mjs" fixar "$SERVIDOR_CONTROLADOR_PERFIL"
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
revogar_lote_auto() {
  [ -n "$pasta_lote_auto" ] || return 0
  rm -f -- "$pasta_lote_auto/entrada/autorizar" &&
    [ ! -e "$pasta_lote_auto/entrada/autorizar" ] &&
    [ ! -L "$pasta_lote_auto/entrada/autorizar" ] &&
    sync -f "$pasta_lote_auto/entrada"
}

limpar_atualizacao() {
  local status=$?
  trap - EXIT
  limpar_worktree
  if [ -n "$pasta_lote_auto" ]; then
    if ! revogar_lote_auto; then
      printf 'ERRO: Não foi possível revogar a autorização de partida.\n' >&2
      status=1
    elif [ "$subida_lote_auto" = false ]; then
      rm -f -- "$pasta_lote_auto/compose.json" "$pasta_lote_auto/manual.json"
      rmdir -- "$pasta_lote_auto/entrada" "$pasta_lote_auto" || status=1
    fi
  fi
  exit "$status"
}
trap limpar_atualizacao EXIT

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
  local marco="$ESTADO_DIR/.marco-backup.$$" origem
  mkdir -p "$ESTADO_DIR"
  : >"$marco"
  log "Executando backup obrigatório antes da atualização."
  if [ "$lote_auto_iniciado" = true ]; then
    origem=$(projetar_banco_pre_migracao "$banco_observado_auto") || erro "Observação do banco inválida."
    if ! BACKUP_MIGRACOES_AUTO_ESPERADO="$origem" "$DIR/backup-banco.sh"; then
      rm -f "$marco"
      recusar_pre_troca "O backup pré-migração falhou; nenhuma troca foi iniciada."
    fi
  elif [ "$protecao_manual" = true ]; then
    if ! BACKUP_MIGRACAO_MANUAL_OPERACAO="$id_manual" BACKUP_MIGRACOES_AUTO_ESPERADO="$origem_manual" \
      BACKUP_MIGRACAO_MANUAL_INICIO="$inicio_manual" "$DIR/backup-banco.sh"; then
      rm -f "$marco"
      erro "O backup pré-migração manual falhou; nenhuma troca foi iniciada."
    fi
  elif ! "$DIR/backup-banco.sh"; then
    rm -f "$marco"
    erro "O backup falhou; a atualização foi cancelada."
  fi
  if [ "$protecao_manual" = true ]; then
    rm -f "$marco"
    backup_manual=$(conferir_backup_manual) || erro "Backup desta operação sem recibo de origem e artefatos conferidos."
  else
    validar_backup_obrigatorio "$marco"
    rm -f "$marco"
  fi
  fixar_backup_controlador ||
    erro "Não foi possível fixar backup, recibo e checksums fora da retenção."
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

falhar_atualizacao() {
  local motivo="$1"
  local migracoes="$2"
  log "$motivo As migrações não são revertidas; revisão manual do banco e da aplicação é obrigatória. Nenhuma imagem anterior será iniciada automaticamente."
  escrever_falha "$alvo_ref" "$alvo_commit" "$motivo" "$migracoes"
  notificar falha "Atualização falhou; intervenção manual necessária."
  exit 1
}

[ -d "$APP_DIR/.git" ] || erro "Checkout Git não encontrado em $APP_DIR."
verificar_instalacao
travar atualizacao 0

# Só o controlador adota o marcador; no caminho simples ele é ignorado para
# não transformar um resíduo de perfil removido em bloqueio permanente.
if [ "$controlador_ativo" = true ] && { [ -e "$operacao" ] || [ -L "$operacao" ]; }; then
  erro "Atualização anterior em andamento ou incerta; revise manualmente $operacao antes de qualquer nova operação."
fi

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

if [ "$simular" = false ] && [ "$controlador_ativo" = true ] &&
  [ "$ATUALIZAR_MIGRACAO_EXTERNA" = true ]; then
  registrar_operacao || erro "Não foi possível registrar a operação; nenhuma atualização será iniciada."
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

modo_atual=""; commit_atual=""
if [ -f "$estado" ]; then
  modo_atual=$(ler_campo_json "$estado" "modo")
  commit_atual=$(ler_campo_json "$estado" "commit")
fi

head_commit=$(git -C "$APP_DIR" rev-parse HEAD)
if [ -z "$commit_atual" ]; then
  commit_atual="$head_commit"
elif [ "$commit_atual" != "$head_commit" ] && [ "$forcar" = false ]; then
  erro "O estado registrado aponta para $commit_atual, mas o checkout está em $head_commit. Registre o estado ou use --forcar."
fi

alvo_modo=""
alvo_ref=""
alvo_commit=""
alvo_imagem=""
alvo_backup=""

definir_release() {
  local alvo_tag="${tag_override:-$tag_estavel}"
  [ -n "$alvo_tag" ] || erro "Não há tag estável disponível para o modo release."
  case "$alvo_tag" in
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) erro "A tag $alvo_tag não segue o formato vX.Y.Z." ;;
  esac
  git -C "$APP_DIR" rev-parse "$alvo_tag^{commit}" >/dev/null 2>&1 ||
    erro "A tag $alvo_tag não existe no checkout local; busque as tags antes de atualizar."
  alvo_modo="release"
  alvo_ref="$alvo_tag"
  alvo_commit=$(git -C "$APP_DIR" rev-parse "$alvo_tag^{commit}")
  alvo_imagem="${APP_IMAGEM_REPOSITORIO}:${alvo_tag#v}"
  alvo_backup="${APP_IMAGEM_BACKUP_REPOSITORIO}:${alvo_tag#v}"
}

definir_main() {
  alvo_modo="main"
  alvo_ref="${ref_override:-$ATUALIZAR_REF}"
  alvo_commit=$(git -C "$APP_DIR" rev-parse "$alvo_ref")
  if [ "$agendado" = true ] && [ -n "$ref_override" ]; then
    [[ "$ref_override" =~ ^[0-9a-f]{40}$ ]] && [ "$ref_override" = "$alvo_commit" ] &&
      [ "$alvo_commit" = "$(git -C "$APP_DIR" rev-parse --verify "refs/remotes/$ATUALIZAR_REMOTO/main^{commit}")" ] ||
      erro "O SHA conferido pelo agendamento não é mais a ponta da main local após a consulta."
  fi
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

if [ "$agendado" = true ] && [ -n "$ref_override" ] && [ "$alvo_modo" != main ]; then
  erro "O agendamento com SHA fixo exige o canal main."
fi

log "Modo atual: ${modo_atual:-desconhecido}; modo alvo: $alvo_modo."
log "Referência alvo: $alvo_ref ($alvo_commit)."

migracoes_novas=false
migracoes=$(git -C "$APP_DIR" diff --name-only "$commit_atual" "$alvo_commit" -- prisma/migrations) ||
  erro "Não foi possível comparar as migrações entre as revisões."
if [ -n "$migracoes" ]; then
  migracoes_novas=true
fi

conferir_historico_agendado() {
  local revisao="$1"
  # Um histórico incompleto faria o migrador executar SQL não aprovado no lote.
  timeout -k 5 20 "${COMPOSE[@]}" exec -T "$SERVIDOR_SERVICO_DB" psql -XwqAt \
      -U "${POSTGRES_USER:-frequencia}" -d "${POSTGRES_DB:-frequencia}" -v ON_ERROR_STOP=1 \
      -v "schema=${DATABASE_SCHEMA:-public}" -f - <<'SQL' |
BEGIN READ ONLY;
SET LOCAL statement_timeout='5s';
SELECT coalesce(json_agg(json_build_array(migration_name, checksum, finished_at IS NOT NULL)), '[]')
FROM :"schema"._prisma_migrations WHERE rolled_back_at IS NULL;
ROLLBACK;
SQL
    node "$DIR/aprovacao-migracoes.mjs" historico "$APP_DIR" "$revisao"
}

conferir_compose_migracoes_auto() {
  compose config --format json | node "$DIR/alvo-migracoes-auto.mjs" compose \
    "$SERVIDOR_SERVICO_APP" "$SERVIDOR_SERVICO_DB" "$banco_auto" "$schema_auto"
}

preparar_montagem_lote_auto() {
  pasta_lote_auto=$(mktemp -d "$ESTADO_DIR/migracao-partida.XXXXXXXXXXXX") || return 1
  mkdir -m 0755 -- "$pasta_lote_auto/entrada" || return 1
  (umask 077; jq -n --arg app "$SERVIDOR_SERVICO_APP" --arg origem "$pasta_lote_auto/entrada" '
    {services:{($app):{volumes:[{type:"bind",source:$origem,target:"/run/frequenciapp-migracao",
      read_only:true,bind:{create_host_path:false}}]}}}
  ' > "$pasta_lote_auto/compose.json")
}

compose_do_lote_auto() {
  APP_IMAGEM="$imagem_migracoes_auto" APP_IMAGEM_BACKUP="$alvo_backup" COMMIT_SHA="$alvo_commit" \
    MIGRACAO_AUTOMATICA=true MIGRACAO_LOTE_APROVADO="$envelope_migracoes_auto" \
    MIGRACAO_POLITICA_REINICIO=no compose -f "$pasta_lote_auto/compose.json" "$@"
}

conferir_compose_do_lote_auto() {
  compose_do_lote_auto config --format json | node "$DIR/alvo-migracoes-auto.mjs" compose \
    "$SERVIDOR_SERVICO_APP" "$SERVIDOR_SERVICO_DB" "$banco_auto" "$schema_auto" \
    "$imagem_migracoes_auto" "$envelope_migracoes_auto" "$pasta_lote_auto/entrada"
}

conferir_revisao_migracoes() {
  local app="$1" revisao="$2" imagem
  [[ "$app" =~ ^[a-f0-9]{64}$ ]] || return 1
  imagem=$(docker inspect --format '{{.Image}}' "$app") || return 1
  [[ "$imagem" =~ ^sha256:[a-f0-9]{64}$ ]] && [ "$(revisao_da_imagem "$imagem")" = "$revisao" ]
}

conferir_saude_migracoes_auto() {
  local revisao="$1" app prova
  app=$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_APP") || return 1
  conferir_revisao_migracoes "$app" "$revisao" || return 1
  prova=$(timeout -k 3 12 docker exec "$app" node --input-type=module -e '
    try {
      const resposta = await fetch("http://127.0.0.1:3000/api/saude", { signal: AbortSignal.timeout(5000) });
      if (!resposta.ok) throw new Error();
      const { ok, commit } = await resposta.json();
      process.stdout.write(JSON.stringify({ ok, commit }));
    } catch { process.exitCode = 1; }
  ' 2>/dev/null) || return 1
  jq -e --arg revisao "$revisao" '.ok == true and .commit == $revisao' <<<"$prova" >/dev/null
}

conferir_banco_migracoes_auto() {
  local revisao="$1" banco app rede ip_banco servidor observacao_db observacao_app
  local perfil="${2:-auto}" sufixo="" inicio_container="" redes_app="" redes_observadas='{}' borda=false
  local -a nomes_redes=() opcoes_sonda=()
  if [ "$perfil" = manual ]; then sufixo=-manual; fi
  banco=$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_DB") || return 1
  app=$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_APP") || return 1
  [[ "$banco" =~ ^[0-9a-f]{64}$ && "$app" =~ ^[0-9a-f]{64}$ && "$banco" != "$app" ]] || return 1
  rede=$(jq -er '.rede' <<<"$alvo_compose_auto") || return 1
  if [ "$perfil" = manual ]; then
    redes_app=$(jq -ec '.redesApp // []' <<<"$alvo_compose_auto") || return 1
    if [ "$redes_app" != '[]' ]; then
      borda=true
      opcoes_sonda=(--borda)
      mapfile -t nomes_redes < <(jq -r '.[]' <<<"$redes_app")
      # A configuração externa não descreve o driver real nem garante que a
      # rede interna já existente no daemon ainda isole o PostgreSQL.
      redes_observadas=$(timeout -k 3 12 docker network inspect -- "${nomes_redes[@]}" | jq -ce \
        --arg rede "$rede" --argjson esperadas "$redes_app" '
        select((map(.Name)|sort) == $esperadas and
          (map(.Id)|unique|length) == length and
          all(.[]; .Driver == "bridge" and .Scope == "local" and .Ingress == false and
            (.Id | test("^[0-9a-f]{64}$"))) and
          any(.[]; .Name == $rede and .Internal == true)) |
        map({key:.Name, value:.Id}) | from_entries
      ') || return 1
      conferir_revisao_migracoes "$app" "$revisao" || return 1
    fi
  fi

  # Os clientes de backup e de histórico usam o mesmo contêiner e socket local.
  ip_banco=$(docker inspect "$banco" | jq -er \
    --arg proj "$COMPOSE_PROJECT_NAME" --arg db "$SERVIDOR_SERVICO_DB" --arg rede "$rede" \
    --argjson borda "$borda" --argjson redes "$redes_observadas" '
      select(length == 1) | .[0] | select(.State.Running and
      .Config.Labels["com.docker.compose.project"] == $proj and
      .Config.Labels["com.docker.compose.service"] == $db and
      (if $borda then (.NetworkSettings.Networks | keys) == [$rede] and
        .NetworkSettings.Networks[$rede].NetworkID == $redes[$rede] else true end) and
      all(.Config.Env[]; test("^PG(HOST|HOSTADDR|DATABASE|PORT|USER|SERVICE|SERVICEFILE|OPTIONS)=") | not)) |
      .NetworkSettings.Networks[$rede].IPAddress | select(type == "string" and test("^[0-9.]+$"))
    ') || return 1

  if [ "$perfil" = manual ]; then
    inicio_container=$(docker inspect --format '{{.State.StartedAt}}' "$banco") || return 1
    [ -n "$inicio_container" ] || return 1
  fi

  # A conexão do app em uso precisa ser a rota efetiva do Compose, não uma URL alternativa.
  # Compare em pipe, sem ecoar ambiente ou credenciais.
  { compose config --format json && docker inspect "$app"; } | jq -es \
    --arg proj "$COMPOSE_PROJECT_NAME" --arg app "$SERVIDOR_SERVICO_APP" --argjson redes "$redes_observadas" \
    --arg banco "$SERVIDOR_SERVICO_DB" --arg ip "$ip_banco" --argjson partida "${subida_lote_auto:-false}" '
    length == 2 and (.[0].services[$app].environment as $esperado |
      .[1] | length == 1 and (.[0] |
        (.Config.Env | map(capture("^(?<key>[^=]+)=(?<value>.*)$")) | from_entries) as $real |
        .State.Running and
        .Config.Labels["com.docker.compose.project"] == $proj and
        .Config.Labels["com.docker.compose.service"] == $app and
        (if $redes == {} then true else
          (.NetworkSettings.Networks | map_values(.NetworkID)) == $redes and
          (if $partida then (.HostConfig.ExtraHosts == [$banco + ":" + $ip] or
            .HostConfig.ExtraHosts == [$banco + "=" + $ip]) else true end)
        end) and
        all(["DATABASE_URL", "DIRECT_URL", "DATABASE_SCHEMA", "MIGRAR_NA_PARTIDA"][];
          ($real[.] // "") == ($esperado[.] // "")) and
        all($real | keys[]; test("^(PG|LD_|NODE_OPTIONS$|NODE_PATH$)") | not)))
    ' >/dev/null || return 1

  servidor=$(jq -er '.usuario' <<<"$alvo_compose_auto") || return 1
  [ "$servidor" = "${POSTGRES_USER:-frequencia}" ] || return 1
  observacao_db=$(node "$DIR/alvo-migracoes-auto.mjs" "sql-historico$sufixo" "$schema_auto" |
    timeout -k 3 18 docker exec -i "$banco" env -i PATH=/usr/local/bin:/usr/bin:/bin \
      PGCONNECT_TIMEOUT=4 psql -XwqAt -h /var/run/postgresql -p 5432 \
      -U "$servidor" -d "$banco_auto" -v ON_ERROR_STOP=1 -f - 2>/dev/null |
    node "$DIR/alvo-migracoes-auto.mjs" "historico$sufixo" "$APP_DIR" "$revisao" "$banco_auto" "$schema_auto") || return 1
  observacao_app=$(node "$DIR/alvo-migracoes-auto.mjs" "sql-historico$sufixo" "$schema_auto" |
    timeout -k 3 22 docker exec -i "$app" node --input-type=module -e '
      import fs from "node:fs";
      import { lookup } from "node:dns/promises";
      import pg from "pg";
      const sql = fs.readFileSync(0, "utf8");
      const ipEsperado = process.argv[1];
      const borda = process.argv[2] === "--borda";
      let primeiro;
      try {
        for (const nome of ["DIRECT_URL", "DATABASE_URL"]) {
          let connectionString = process.env[nome];
          if (borda) {
            const url = new URL(connectionString);
            const destinos = await lookup(url.hostname, { all: true });
            if (!destinos.length || !destinos.every(({ address }) => address === ipEsperado)) throw new Error();
            // Não resolver novamente entre a conferência e a autenticação.
            url.hostname = ipEsperado;
            connectionString = url.href;
          }
          const cliente = new pg.Client({connectionString, connectionTimeoutMillis: 4000});
          try {
            await cliente.connect();
            const { rows } = await cliente.query("SELECT pg_catalog.host(pg_catalog.inet_server_addr()) AS ip");
            if (rows[0]?.ip !== ipEsperado) throw new Error();
            const respostas = await cliente.query(sql);
            const linhas = respostas.flatMap((r) => r.rows);
            if (linhas.length !== 1) throw new Error();
            const atual = JSON.stringify(Object.values(linhas[0])[0]);
            if (primeiro !== undefined && primeiro !== atual) throw new Error();
            primeiro = atual;
          } finally { await cliente.end(); }
        }
        process.stdout.write(primeiro);
      } catch { process.exitCode = 1; }
    ' -- "$ip_banco" "${opcoes_sonda[@]}" 2>/dev/null |
    node "$DIR/alvo-migracoes-auto.mjs" "historico$sufixo" "$APP_DIR" "$revisao" "$banco_auto" "$schema_auto") || return 1
  [ "$observacao_app" = "$observacao_db" ] || return 1
  [ "$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_DB")" = "$banco" ] &&
    [ "$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_APP")" = "$app" ] || return 1
  if [ "$perfil" = manual ]; then
    [ "$(docker inspect --format '{{.State.StartedAt}}' "$banco")" = "$inicio_container" ] || return 1
  fi
  jq -ce --arg container "$banco" --arg ip "$ip_banco" --arg inicio "$inicio_container" \
    --argjson redes "$redes_observadas" '
    . + {container:$container,ip:$ip} + (if $inicio == "" then {} else {inicioContainer:$inicio} end) +
      (if $redes == {} then {} else {redes:$redes} end)
  ' <<<"$observacao_db"
}

projetar_banco_pre_migracao() {
  jq -ce '{container,cluster,banco,bancoOid,schema,schemaOid}' <<<"$1"
}

conferir_imagem_migradora() {
  local imagem="$1" acao="${2:-imagem}"
  [[ "$imagem" =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  [ "$(revisao_da_imagem "$imagem")" = "$alvo_commit" ] || return 1
  node "$DIR/alvo-migracoes-auto.mjs" sondar-imagem |
    timeout -k 5 40 docker run --rm -i --pull=never --network none --read-only \
      --cap-drop ALL --security-opt no-new-privileges --pids-limit 64 --memory 128m \
      --entrypoint /usr/local/bin/node "$imagem" --input-type=module - |
    node "$DIR/alvo-migracoes-auto.mjs" "$acao" "$APP_DIR" "$alvo_commit"
}

fixar_imagem_migracoes_auto() {
  imagem_migracoes_auto=$(docker image inspect --format '{{.Id}}' "$alvo_imagem") || return 1
  conferir_imagem_migradora "$imagem_migracoes_auto"
}

conferir_compose_manual() {
  local opcoes=("$SERVIDOR_SERVICO_APP" "$SERVIDOR_SERVICO_DB" "$banco_auto" "$schema_auto")
  if [ "$#" -eq 0 ]; then
    compose config --format json | node "$DIR/alvo-migracoes-auto.mjs" compose-manual "${opcoes[@]}"
  else
    local -a ip=()
    if [ -n "${ip_manual_borda:-}" ]; then ip=("$ip_manual_borda"); fi
    compose_manual_alvo config --format json | node "$DIR/alvo-migracoes-auto.mjs" compose-manual \
      "${opcoes[@]}" "$imagem_manual" "$envelope_manual" "$pasta_lote_auto/entrada" "${ip[@]}"
  fi
}

compose_manual_alvo() {
  APP_IMAGEM="$imagem_manual" APP_IMAGEM_BACKUP="$alvo_backup" COMMIT_SHA="$alvo_commit" \
    MIGRACAO_POLITICA_REINICIO=no compose -f "$pasta_lote_auto/compose.json" \
      -f "$pasta_lote_auto/manual.json" "$@"
}

preparar_envelope_manual() {
  envelope_manual=$(node "$DIR/alvo-migracoes-auto.mjs" envelope-manual \
    "$APP_DIR" "$commit_atual" "$alvo_commit" <<<"$banco_manual") || return 1
  ip_manual_borda=$(jq -r 'if has("redes") then .ip else "" end' <<<"$banco_manual") || return 1
  preparar_montagem_lote_auto || return 1
  jq -n --arg app "$SERVIDOR_SERVICO_APP" --arg envelope "$envelope_manual" \
    --arg db "$SERVIDOR_SERVICO_DB" --arg ip "$ip_manual_borda" '
    {services:{($app):{environment:{MIGRACAO_MANUAL_PROTEGIDA:"true",
      MIGRACAO_LOTE_APROVADO:$envelope,ADMIN_EMAIL:"",ADMIN_SENHA:""}} +
      (if $ip == "" then {} else {extra_hosts:[$db + "=" + $ip]} end)}}
  ' >"$pasta_lote_auto/manual.json"
}

conferir_backup_manual() {
  local resultado dir_backup="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
  resultado=$(BACKUP_BANCO_VERIFICADO="$banco_auto" DATABASE_SCHEMA="$schema_auto" \
    BACKUP_REMOTO="${BACKUP_REMOTO:-}" node "$DIR/recibos.mjs" conferir-estado-manual \
    "$dir_backup" "$estado_backup" "$origem_manual" "$id_manual") || return 1
  if [ -n "${BACKUP_REMOTO:-}" ]; then
    "$DIR/backup-banco.sh" --verificar --sem-escrita >&2 || return 1
  elif [ "${ATUALIZAR_PERMITIR_BACKUP_LOCAL:-false}" != true ]; then
    return 1
  fi
  printf '%s\n' "$resultado"
}

preparar_migracao_manual() {
  [ "${BACKUP_MODO:-compose}" = compose ] && [ "$ATUALIZAR_VERIFICAR_IMAGEM" = true ] &&
    [ "$head_commit" = "$commit_atual" ] || erro "Migração manual exige Compose, verificação da imagem e checkout da base registrada."
  node "$DIR/alvo-migracoes-auto.mjs" transicao-manual "$APP_DIR" "$commit_atual" "$alvo_commit" ||
    erro "A transição manual não preserva os SQLs da base instalada."
  banco_auto="${POSTGRES_DB:-frequencia}"
  schema_auto="${DATABASE_SCHEMA:-public}"
  alvo_compose_auto=$(conferir_compose_manual) || erro "Alvo Compose da migração manual não conferido."
  perfil_manual=$(jq -er 'if has("redesApp") then "borda" else "simples" end' <<<"$alvo_compose_auto") ||
    erro "Perfil Compose da migração manual não conferido."
  # Na borda, a rota de saúde do app antigo pode abrir uma conexão sem a pinagem.
  # A base usa a revisão da imagem e a sonda do banco pelo destino verificado.
  if [ "$perfil_manual" = simples ]; then
    conferir_saude_migracoes_auto "$commit_atual" || erro "O aplicativo ativo não serve a revisão instalada."
  fi
  banco_manual=$(conferir_banco_migracoes_auto "$commit_atual" manual) ||
    erro "Banco de backup, conexões da aplicação ou histórico não correspondem à base instalada."
  origem_manual=$(projetar_banco_pre_migracao "$banco_manual")
  inicio_manual=$(jq -ce '{inicio,inicioContainer}' <<<"$banco_manual")
  id_manual=$(node -p 'require("node:crypto").randomUUID()')
}

registrar_fase_manual() {
  local fase="$1" temporario
  [ -d "$ESTADO_DIR" ] && [ ! -L "$ESTADO_DIR" ] && [ "$(stat -c %a "$ESTADO_DIR")" = 700 ] || return 1
  temporario=$(mktemp "$ESTADO_DIR/.atualizacao-manual.XXXXXXXX") || return 1
  if ! jq -n --arg fase "$fase" --arg id "$id_manual" --arg base "$commit_atual" \
    --arg alvo "$alvo_commit" --arg chave "$SERVIDOR_ALVO_CHAVE" --arg imagem "$imagem_manual" \
    --arg autorizacao "$pasta_lote_auto/entrada/autorizar" \
    --argjson origem "$origem_manual" --argjson backup "$backup_manual" '
    {versao:1,operacao:$id,fase:$fase,base:$base,alvo:$alvo,chave:$chave,imagem:$imagem,
     origem:$origem,backup:$backup,autorizacao:$autorizacao}
  ' >"$temporario" || ! sync "$temporario" || ! mv -T -- "$temporario" "$operacao_manual"; then
    rm -f -- "$temporario"
    return 1
  fi
  sync -f "$ESTADO_DIR"
}

reconferir_base_manual() {
  local observado backup_atual
  if [ "$perfil_manual" = simples ]; then conferir_saude_migracoes_auto "$commit_atual" || return 1; fi
  backup_atual=$(conferir_backup_manual) || return 1
  [ "$backup_atual" = "$backup_manual" ] || return 1
  observado=$(conferir_banco_migracoes_auto "$commit_atual" manual) || return 1
  [ "$observado" = "$banco_manual" ]
}

ler_evidencia_migracoes_auto() {
  node --input-type=module - "$DIR" "$APP_DIR" "$commit_atual" "$alvo_commit" "$ATUALIZAR_REMOTO" <<'NODE'
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const [dir, repo, base, alvo, remoto] = process.argv.slice(2);
try {
  const { inventariarLoteAutomatico } = await import(pathToFileURL(join(dir, 'politica-migracoes-auto.mjs')));
  const { verificarEvidenciaAutomatica } = await import(pathToFileURL(join(dir, 'evidencia-migracoes-auto.mjs')));
  const lote = inventariarLoteAutomatico(repo, base, alvo);
  const ensaio = await verificarEvidenciaAutomatica(repo, lote, remoto);
  process.stdout.write(JSON.stringify({ lote, ensaio }));
} catch (erro) {
  console.error(`[aprovação automática] ${erro instanceof Error ? erro.message : 'Evidência recusada.'}`);
  process.exitCode = 1;
}
NODE
}

aprovar_migracoes_agendadas() {
  [ "$alvo_modo" = main ] && [ "$MIGRAR_NA_PARTIDA" = true ] ||
    erro "A aprovação agendada de migrações exige a main e o migrador na partida."
  [ "${BACKUP_MODO:-compose}" = compose ] ||
    erro "A aprovação agendada exige banco Compose e histórico local verificável."
  if [ "$migracoes_auto" = true ]; then
    [ "$controlador_ativo" = true ] ||
      erro "A política automática exige o controlador adotado para proteger o backup e registrar a operação."
    [ -n "${BACKUP_REMOTO:-}" ] && [ "${BACKUP_VERIFICAR_REMOTO:-true}" = true ] ||
      erro "A política automática exige cópia remota de backup verificada."
    [ "$ATUALIZAR_VERIFICAR_IMAGEM" = true ] && [ "$modo_atual" = main ] ||
      erro "A política automática exige a main instalada e a verificação da imagem ativa."
    [ "$(ler_politica_migracoes_auto)" = true ] || erro "A política automática mudou durante a atualização."
    git --no-replace-objects -C "$APP_DIR" diff --quiet "$commit_atual" "$alvo_commit" -- \
      ':(glob)compose*.yml' ':(glob)compose*.yaml' Dockerfile .dockerignore infra/servidor \
      infra/observabilidade scripts/servidor docker/app ||
      erro "Mudanças de Compose, imagem ou rotinas operacionais exigem revisão manual."
    if [ "$1" = simular ]; then
      node "$DIR/politica-migracoes-auto.mjs" "$APP_DIR" "$commit_atual" "$alvo_commit" >/dev/null ||
        erro "O lote não é elegível para a política automática."
      return 0
    fi
    banco_auto="${POSTGRES_DB:-frequencia}"
    schema_auto="${DATABASE_SCHEMA:-public}"
    if [ "$1" = verificar ]; then
      alvo_compose_auto=$(conferir_compose_migracoes_auto) || erro "Alvo Compose da migração não conferido."
      conferir_saude_migracoes_auto "$commit_atual" ||
        erro "O aplicativo ativo não corresponde à revisão instalada."
      banco_observado_auto=$(conferir_banco_migracoes_auto "$commit_atual") ||
        erro "Banco de backup e conexões da aplicação não correspondem à base instalada."
      local observado
      observado=$(jq -ce '{cluster,banco,schema}' <<<"$banco_observado_auto") || erro "Observação do banco inválida."
      recuperacao_migracoes_auto=$(node "$DIR/recuperacao-migracoes-auto.mjs" verificar \
        "$SERVIDOR_CONTROLADOR_PERFIL" "$observado") || erro "Recuperação do backup não comprovada."
      evidencia_migracoes_auto=$(ler_evidencia_migracoes_auto) ||
        erro "Aprovação automática recusada; ensaio do lote não confirmado."
      return 0
    else
      local evidencia_atual compose_atual banco_atual observado recibo
      fixar_imagem_migracoes_auto || recusar_pre_troca "A imagem não contém as migrações aprovadas."
      envelope_migracoes_auto=$(node "$DIR/alvo-migracoes-auto.mjs" envelope \
        "$APP_DIR" "$commit_atual" "$alvo_commit" <<<"$banco_observado_auto") ||
        recusar_pre_troca "Não foi possível vincular o migrador ao lote exato."
      [[ "$envelope_migracoes_auto" =~ ^[a-zA-Z0-9_-]+$ ]] || recusar_pre_troca "Vínculo do lote inválido."
      preparar_montagem_lote_auto || recusar_pre_troca "Não foi possível preparar a autorização efêmera."
      compose_atual=$(conferir_compose_do_lote_auto) ||
        recusar_pre_troca "Compose não confirmou a imagem e o migrador automático."
      [ "$compose_atual" = "$alvo_compose_auto" ] || recusar_pre_troca "Destino Compose mudou durante a atualização."
      conferir_saude_migracoes_auto "$commit_atual" || recusar_pre_troca "O aplicativo ativo mudou durante a atualização."
      banco_atual=$(conferir_banco_migracoes_auto "$commit_atual") || recusar_pre_troca "A base do banco não foi reconfirmada."
      [ "$banco_atual" = "$banco_observado_auto" ] || recusar_pre_troca "A identidade do banco mudou durante a atualização."
      observado=$(projetar_banco_pre_migracao "$banco_atual") || recusar_pre_troca "Observação do banco inválida."
      node "$DIR/recuperacao-migracoes-auto.mjs" confirmar "$SERVIDOR_CONTROLADOR_PERFIL" \
        "$observado" "$SERVIDOR_CONTROLADOR_OPERACAO" "$recuperacao_migracoes_auto" ||
        recusar_pre_troca "O backup pré-migração não foi reconfirmado."
      evidencia_atual=$(ler_evidencia_migracoes_auto) ||
        recusar_pre_troca "Aprovação automática recusada na conferência final do ensaio."
      [ "$evidencia_atual" = "$evidencia_migracoes_auto" ] ||
        recusar_pre_troca "A revisão ou a tentativa do ensaio mudou durante a atualização."
      [ "$(ler_politica_migracoes_auto)" = true ] || recusar_pre_troca "A política foi desativada antes da troca."
      recibo=$(jq -ce --arg recuperacao "$recuperacao_migracoes_auto" --arg imagem "$imagem_migracoes_auto" \
        '. + {recuperacao:$recuperacao,imagem:$imagem}' <<<"$evidencia_migracoes_auto") || erro "Evidência inválida."
      node "$DIR/controlador/cli.mjs" registrar-migracoes-auto "$SERVIDOR_CONTROLADOR_PERFIL" "$recibo" ||
        erro "Não foi possível persistir a aprovação antes da troca."
      log "Aprovação automática registrada para $alvo_commit."
      return 0
    fi
  fi
  if [ "$1" != simular ]; then
    conferir_historico_agendado "$commit_atual" ||
      erro "Não foi possível comprovar o histórico da revisão instalada."
  fi
  node "$DIR/aprovacao-migracoes.mjs" "$1" "$APP_DIR" "$ESTADO_DIR" "$commit_atual" "$alvo_commit" "$ATUALIZAR_REMOTO" ||
    erro "Aprovação agendada de migrações recusada. Nenhuma troca de versão foi iniciada."
}

if [ "$simular" = true ]; then
  log "Simulação: nenhuma alteração será aplicada."
  log "Backup obrigatório antes da aplicação: sim."
  if [ "$migracoes_novas" = true ]; then
    if [ "$agendado" = true ]; then
      aprovar_migracoes_agendadas simular
      if [ "$migracoes_auto" = true ]; then
        log "Lote elegível pela análise local; a simulação não valida CI, recuperação ou aplicação."
      else
        log "Aprovação agendada confere com as referências locais; não foi usada."
      fi
    elif [ "$permissao_manual" = true ] || { [ "$controlador_ativo" = true ] && [ "$permitir_migracoes" = true ]; }; then
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
  if [ "$controlador_ativo" = true ] && [ "$operacao_iniciada" = false ]; then exit 10; fi
  exit 0
fi

if [ "$commit_atual" = "$alvo_commit" ] && [ "$controlador_ativo" = false ] &&
  [ "$agendado" = false ] && [ "$MIGRAR_NA_PARTIDA" = true ]; then
  erro "O modo manual protegido não reaplica a revisão instalada com o migrador ativo."
fi

if [ -f "$falha" ] && [ "$forcar" = false ]; then
  falha_ref=$(ler_campo_json "$falha" "ref")
  if [ "$falha_ref" = "$alvo_ref" ]; then
    erro "A versão $alvo_ref falhou antes. Use --forcar após corrigir."
  fi
fi

if [ "$controlador_ativo" = false ] && [ "$agendado" = false ] &&
  [ "$migracoes_novas" = true ] && [ "$permissao_manual" = false ]; then
  erro "Há migrações novas. Revise o lote desta atualização e execute com --permitir-migracoes."
fi

if [ "$migracoes_novas" = true ] && [ "$permitir_migracoes" != "true" ]; then
  if [ "$agendado" = true ]; then
    aprovar_migracoes_agendadas verificar
  else
    erro "Há migrações novas. Revise e repita com --permitir-migracoes ou defina ATUALIZAR_PERMITIR_MIGRACOES=true."
  fi
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

if [ "$controlador_ativo" = false ] && [ "$agendado" = false ] && [ "$MIGRAR_NA_PARTIDA" = true ]; then
  protecao_manual=true
  preparar_migracao_manual
fi
registrar_operacao || erro "Não foi possível registrar a operação; nenhuma atualização será iniciada."
executar_backup_obrigatorio

ANTERIOR_COMMIT="$commit_atual"

log "Preparando o commit alvo em worktree isolada."
criar_worktree "$alvo_commit"
if [ "$controlador_ativo" = true ]; then
  node "$DIR/controlador/cli.mjs" validar-fonte "$SERVIDOR_CONTROLADOR_PERFIL" "$worktree" ||
    erro "Fonte alvo sem guard de migração aprovado."
fi

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
  if [ "$lote_auto_iniciado" = true ]; then
    construir_app_na_worktree "$alvo_imagem" "$alvo_commit" ||
      recusar_pre_troca "A construção da imagem falhou; nenhuma troca foi iniciada."
  else
    construir_app_na_worktree "$alvo_imagem" "$alvo_commit"
  fi
  if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
    construir_backup_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit"
  fi
fi

if [ "$ATUALIZAR_VERIFICAR_IMAGEM" = "true" ]; then
  verificar_imagem_alvo "$alvo_imagem" "$alvo_commit"
fi
if [ "$controlador_ativo" = true ]; then
  node "$DIR/controlador/cli.mjs" validar-imagem "$SERVIDOR_CONTROLADOR_PERFIL" "$alvo_imagem" ||
    erro "Imagem alvo sem guard de migração aprovado."
fi

validar_compose_na_worktree "$alvo_imagem" "$alvo_backup" "$alvo_commit" ||
  erro "A configuração do Compose não é válida na versão alvo."

if [ "$agendado" = true ] && [ "$migracoes_novas" = true ]; then
  # A main e a validade podem mudar durante o backup e a construção da imagem.
  aprovar_migracoes_agendadas consumir
fi

if [ "$protecao_manual" = true ]; then
  imagem_manual=$(docker image inspect --format '{{.Id}}' "$alvo_imagem") || erro "Imagem alvo indisponível."
  conferir_imagem_migradora "$imagem_manual" imagem-manual || erro "A imagem alvo não implementa o protocolo manual compatível."
  preparar_envelope_manual || erro "Não foi possível vincular o lote manual ao banco e à autorização de partida."
  compose_alvo=$(
    montar_compose_em "$worktree" && conferir_compose_manual partida
  ) || erro "O Compose alvo não permite partida isolada do app."
  [ "$compose_alvo" = "$alvo_compose_auto" ] || erro "O destino Compose diverge entre base e alvo."
  reconferir_base_manual || erro "Banco, histórico ou backup mudou antes da troca."
  sync -f "${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}" || erro "O conjunto de recuperação não pôde ser sincronizado."
  registrar_fase_manual troca || erro "A intenção da troca não pôde ser persistida."
elif [ "$controlador_ativo" = false ] && [ "$agendado" = false ]; then
  # O seletor do shell não basta se um override reativar o migrador no alvo.
  (montar_compose_em "$worktree"; APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" COMMIT_SHA="$alvo_commit" compose config --format json) |
    jq -e --arg app "$SERVIDOR_SERVICO_APP" '.services[$app].environment.MIGRAR_NA_PARTIDA == "false"' >/dev/null ||
    erro "O Compose alvo precisa manter o migrador na partida desativado nesta execução."
fi

log "Aplicando $alvo_ref."
git -C "$APP_DIR" checkout --detach "$alvo_commit"

APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" conferir_identidade auto

if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
  COMMIT_SHA="$alvo_commit" compose config --quiet; then
  if [ "$protecao_manual" = false ]; then git -C "$APP_DIR" checkout --detach "$ANTERIOR_COMMIT"; fi
  erro "A configuração do Compose não é válida no checkout alvo."
fi

# Sem atestado do histórico, não se presume compatibilidade para rollback.
migracao_possivel=true
if [ -n "${imagem_migracoes_auto:-}" ]; then
  [ "$(conferir_compose_do_lote_auto)" = "$alvo_compose_auto" ] ||
    falhar_atualizacao "O Compose de partida divergiu da configuração aprovada." true
  if ! (umask 022 && set -o noclobber && printf '%s' "$envelope_migracoes_auto" > "$pasta_lote_auto/entrada/autorizar") ||
    ! chmod 0444 "$pasta_lote_auto/entrada/autorizar"; then
    falhar_atualizacao "A autorização efêmera de partida não pôde ser preparada." true
  fi
  subida_lote_auto=true
  if ! compose_do_lote_auto up -d --no-deps --no-build --pull never \
    --wait --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP"; then
    falhar_atualizacao "Falha de saúde após a migração automática." true
  fi
  banco_final_auto=$(conferir_banco_migracoes_auto "$alvo_commit") ||
    falhar_atualizacao "O histórico final da migração automática não confere." true
  [ "$banco_final_auto" = "$banco_observado_auto" ] ||
    falhar_atualizacao "A identidade do banco após a migração mudou." true
  conferir_saude_migracoes_auto "$alvo_commit" ||
    falhar_atualizacao "O aplicativo ativo não serve a revisão aprovada." true
  app_final_auto=$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_APP") ||
    falhar_atualizacao "Não foi possível obter o contêiner atualizado." true
  [[ "$app_final_auto" =~ ^[0-9a-f]{64}$ ]] &&
    [ "$(docker inspect --format '{{.Image}}/{{.HostConfig.RestartPolicy.Name}}' "$app_final_auto")" = "$imagem_migracoes_auto/no" ] &&
    [ "$(docker image inspect --format '{{.Id}}' "$alvo_imagem")" = "$imagem_migracoes_auto" ] ||
    falhar_atualizacao "O contêiner ou a tag deixou de corresponder à imagem aprovada." true
elif [ "$protecao_manual" = true ]; then
  [ "$(conferir_compose_manual partida)" = "$alvo_compose_auto" ] ||
    erro "O Compose efetivo divergiu antes da partida; a recuperação permanece protegida."
  reconferir_base_manual || erro "Banco, histórico ou backup mudou antes da partida; a recuperação permanece protegida."
  registrar_fase_manual partida || erro "A intenção da partida não pôde ser persistida."
  if ! (umask 022 && set -o noclobber && printf '%s' "$envelope_manual" >"$pasta_lote_auto/entrada/autorizar") ||
    ! chmod 0444 "$pasta_lote_auto/entrada/autorizar"; then
    falhar_atualizacao "A autorização efêmera da partida manual não pôde ser preparada." true
  fi
  subida_lote_auto=true
  if ! compose_manual_alvo up -d --no-deps --no-build --pull never \
    --wait --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP"; then
    falhar_atualizacao "Falha de saúde após a partida manual." true
  fi
  banco_final_manual=$(conferir_banco_migracoes_auto "$alvo_commit" manual) ||
    falhar_atualizacao "O histórico final da migração manual não confere." true
  [ "$banco_final_manual" = "$banco_manual" ] ||
    falhar_atualizacao "A identidade do banco após a migração manual mudou." true
  conferir_saude_migracoes_auto "$alvo_commit" || falhar_atualizacao "A revisão alvo não foi servida." true
  app_final_manual=$(compose ps -q --no-trunc "$SERVIDOR_SERVICO_APP") ||
    falhar_atualizacao "Não foi possível identificar o aplicativo atualizado." true
  [[ "$app_final_manual" =~ ^[a-f0-9]{64}$ ]] &&
    [ "$(docker inspect --format '{{.Image}}/{{.HostConfig.RestartPolicy.Name}}' "$app_final_manual")" = "$imagem_manual/no" ] ||
    falhar_atualizacao "O aplicativo não corresponde à imagem e política de reinício conferidas." true
else
  if [ "$controlador_ativo" = false ] && [ "$agendado" = false ]; then
    APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" COMMIT_SHA="$alvo_commit" compose config --format json |
      jq -e --arg app "$SERVIDOR_SERVICO_APP" '.services[$app].environment.MIGRAR_NA_PARTIDA == "false"' >/dev/null ||
      erro "O Compose efetivo reativou o migrador; nenhuma partida foi iniciada."
  fi
  if ! APP_IMAGEM="$alvo_imagem" APP_IMAGEM_BACKUP="$alvo_backup" \
    COMMIT_SHA="$alvo_commit" compose up -d --wait --wait-timeout "$ATUALIZAR_TIMEOUT_SAUDE"; then
    falhar_atualizacao "Falha de saúde após a atualização." "$migracao_possivel"
  fi
fi

if [ -n "${ATUALIZAR_SAUDE_URL:-}" ]; then
  log "Conferindo $ATUALIZAR_SAUDE_URL."
  curl_args=(-fsS --retry 12 --retry-delay 5 --retry-all-errors --max-time 15)
  if [ -n "$ATUALIZAR_SAUDE_CA" ]; then
    if [ ! -f "$ATUALIZAR_SAUDE_CA" ] && [ "$controlador_ativo" = true ]; then
      falhar_atualizacao "CA de saúde não encontrada após a subida." "$migracao_possivel"
    fi
    [ -f "$ATUALIZAR_SAUDE_CA" ] || erro "CA de saúde não encontrada: $ATUALIZAR_SAUDE_CA."
    curl_args+=(--cacert "$ATUALIZAR_SAUDE_CA")
  fi
  if [ -n "$app_final_auto" ] || [ "$protecao_manual" = true ]; then
    curl "${curl_args[@]}" "$ATUALIZAR_SAUDE_URL" |
      jq -e --arg alvo "$alvo_commit" '.ok == true and .commit == $alvo' >/dev/null ||
      falhar_atualizacao "A saúde pública não confirmou a revisão aprovada." true
  elif ! curl "${curl_args[@]}" "$ATUALIZAR_SAUDE_URL" >/dev/null; then
    falhar_atualizacao "Falha na saúde pública após a atualização." "$migracao_possivel"
  fi
fi

if [ -n "${app_final_auto:-}" ]; then
  revogar_lote_auto || falhar_atualizacao "Não foi possível revogar a autorização de partida." true
  docker update --restart=unless-stopped "$app_final_auto" >/dev/null &&
    [ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$app_final_auto")" = unless-stopped ] ||
    falhar_atualizacao "Não foi possível restaurar o reinício normal do aplicativo." true
fi
if [ "$protecao_manual" = true ]; then
  [ "$(docker image inspect --format '{{.Id}}' "$alvo_imagem")" = "$imagem_manual" ] ||
    falhar_atualizacao "A tag alvo divergiu da imagem servida." true
  revogar_lote_auto || falhar_atualizacao "Não foi possível revogar a autorização de partida manual." true
  docker update --restart=unless-stopped "$app_final_manual" >/dev/null &&
    [ "$(docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' "$app_final_manual")" = unless-stopped ] ||
    falhar_atualizacao "Não foi possível restaurar o reinício normal do aplicativo." true
fi
escrever_estado "$alvo_modo" "$alvo_ref" "$alvo_commit" "$alvo_imagem" "$alvo_backup"
limpar_falha
if [ "$protecao_manual" = true ]; then
  if ! sync -f "$ESTADO_DIR" || ! rm -- "$operacao_manual" || ! sync -f "$ESTADO_DIR"; then
    erro "Não foi possível concluir o registro da atualização manual."
  fi
fi
if [ -n "$app_final_auto" ]; then
  log "Aplicação e histórico conferidos para $alvo_ref; o controlador confirma a conclusão."
else
  notificar sucesso "Atualização concluída para $alvo_ref."
  log "Atualização concluída para $alvo_ref."
fi
