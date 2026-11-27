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
export MIGRAR_NA_PARTIDA=false
export ID_APP ID_DB IMAGEM_BASE IMAGEM_ALVO
ID_APP=$(printf 'a%.0s' {1..64})
ID_DB=$(printf 'b%.0s' {1..64})
IMAGEM_BASE="sha256:$(printf 'c%.0s' {1..64})"
IMAGEM_ALVO="sha256:$(printf 'd%.0s' {1..64})"
export INICIO_DB=2026-01-01T00:00:00Z INICIO_PG=1767225600.000000
export BACKUP_CRIPTOGRAFIA=age BACKUP_INCLUIR_AMBIENTE=false BACKUP_ESPACO_MINIMO_MB=0
export BACKUP_AGE_DESTINATARIOS="$TMP_RAIZ/destinatarios"
printf 'age sintético\n' >"$BACKUP_AGE_DESTINATARIOS"
export BACKUP_AGE_DESTINATARIOS_SHA256
BACKUP_AGE_DESTINATARIOS_SHA256=$(sha256sum "$BACKUP_AGE_DESTINATARIOS" | cut -d' ' -f1)
export COMPOSE_PROJECT_NAME=teste
export SERVIDOR_CONFIG_DIR="$TMP_RAIZ/config"
export SERVIDOR_IDENTIDADE_ARQUIVO="$SERVIDOR_CONFIG_DIR/identidade.json"
export SERVIDOR_LOCK_DIR="$TMP_RAIZ/locks"
export COMPOSE_ARQUIVOS=compose.yml
export ATUALIZAR_MODO=main
export ATUALIZAR_PERMITIR_BACKUP_LOCAL=true
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
(
  umask 077
  mkdir -p "$ESTADO_DIR" "$LOG_DIR" "$BACKUP_BANCO_DIR" "$SERVIDOR_CONFIG_DIR"
)
: >"$APP_ENV_FILE"
: >"$OPS_ENV_FILE"
chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"

cat >"$FAKE_BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$DOCKER_LOG"
projeto="${COMPOSE_PROJECT_NAME:-teste}"
subiu=false
[ ! -s "$DOCKER_UP_COUNTER" ] || subiu=true
imagem_ativa="$IMAGEM_BASE"
revisao_ativa=$(git -C "${APP_DIR:-$PWD}" rev-parse HEAD 2>/dev/null || true)
reinicio=unless-stopped
if [ "$subiu" = true ]; then
  imagem_ativa="$IMAGEM_ALVO"
  revisao_ativa="$DOCKER_REVISAO_IMAGEM"
  [ -f "$DOCKER_UP_COUNTER.reinicio" ] && reinicio=no
fi
inicio="$INICIO_PG"
cluster=7654321098765432100
origem() {
  local registros="${1:-[]}"
  jq -cn --arg cluster "$cluster" --arg inicio "$inicio" --argjson registros "$registros" '
    {cluster:$cluster,banco:"frequencia",bancoOid:"16384",schema:"public",schemaOid:"2200",usuario:"frequencia",primario:true,gatilhos:false,inicio:$inicio,registros:$registros}
  '
}
historico() {
  local consulta registros
  consulta=$(cat)
  [[ "$consulta" == *"pg_control_system"* && "$consulta" == *"_prisma_migrations"* ]] || exit 1
  if [ "${HISTORICO_RLS_EFETIVA:-false}" = true ]; then
    printf 'psql:<stdin>:21: ERROR:  42501\n' >&2
    exit 3
  fi
  if [ "$subiu" = true ]; then
    registros="${HISTORICO_FINAL:-$HISTORICO_MANUAL_ALVO}"
  else
    registros="${HISTORICO_BASE:-$HISTORICO_MANUAL_BASE}"
  fi
  origem "$registros" | jq -c --argjson compativel "${HISTORICO_COMPATIVEL:-true}" '.historicoCompativel = $compativel'
}

if [ "$1" = update ]; then
  [ "$2" = --restart=unless-stopped ] && [ "$3" = "$ID_APP" ]
  [ ! -e "$(jq -er .autorizacao "$ESTADO_DIR/atualizacao-manual-pendente.json")" ]
  rm -- "$DOCKER_UP_COUNTER.reinicio"
  exit 0
fi

if [ "$1" = run ]; then
  [[ " $* " == *" --network none "* && " $* " == *" $IMAGEM_ALVO "* ]]
  cat >/dev/null
  while IFS= read -r arquivo; do
    hash=$(git -C "$APP_DIR" show "$DOCKER_REVISAO_IMAGEM:$arquivo" | sha256sum | cut -d' ' -f1)
    jq -cn --arg nome "$arquivo" --arg hash "$hash" '{($nome):$hash}'
  done < <(git -C "$APP_DIR" ls-tree -r --name-only "$DOCKER_REVISAO_IMAGEM" -- prisma/migrations \
    docker/app/entrypoint.sh docker/app/migrar.mjs src/infra/schema-postgres.mjs) | jq -cs add
  exit
fi

if [ "$1" = exec ]; then
  [ "${DOCKER_MANUAL:-false}" = true ] || exit 90
  if [ "$2" = "$ID_APP" ]; then
    if [ "${BORDA_LEGADA_TESTE:-false}" = true ] && [ "$subiu" = false ]; then
      printf 'saude-legada\n' >>"$DOCKER_LOG"
    fi
    if [ "$subiu" = false ]; then revisao_ativa="$DOCKER_REVISAO_BASE"; fi
    jq -cn --arg commit "$revisao_ativa" '{ok:true,commit:$commit}'
  elif [ "$3" = "$ID_APP" ]; then
    [ "${BANCO_DIFERENTE:-false}" = false ] || cluster=9654321098765432100
    historico
  elif [ "$3" = "$ID_DB" ]; then
    case " $* " in
      *" psql "*)
        if [[ " $* " == *" -v schema=public "* ]]; then
          cat >/dev/null
          if [ -f "$DOCKER_UP_COUNTER.dump" ]; then
            case "${DUMP_VARIANTE:-ok}" in
              reinicio) inicio=1767225601.000000 ;;
              homonimo) cluster=9654321098765432100 ;;
            esac
          fi
          origem | jq -c 'del(.usuario,.gatilhos,.registros)'
        else
          historico
        fi ;;
      *" pg_dump "*)
        [[ " $* " == *" -h /var/run/postgresql -p 5432 -U frequencia -d frequencia "* ]]
        : >"$DOCKER_UP_COUNTER.dump"
        [ "${DUMP_VARIANTE:-ok}" != falha ] || exit 91
        printf 'dados sintéticos\n' ;;
      *" pg_restore -l "*) cat >/dev/null ;;
      *) exit 92 ;;
    esac
  else
    exit 93
  fi
  exit
fi

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
  if [ "$2" = --format ]; then
    case "$3" in
      '{{.Image}}') printf '%s\n' "$imagem_ativa" ;;
      '{{.Image}}/{{.HostConfig.RestartPolicy.Name}}') printf '%s/%s\n' "$imagem_ativa" "$reinicio" ;;
      '{{.HostConfig.RestartPolicy.Name}}') printf '%s\n' "$reinicio" ;;
      '{{.State.StartedAt}}') printf '%s\n' "$INICIO_DB" ;;
      *) exit 94 ;;
    esac
    exit
  fi
  if [ "${DOCKER_MANUAL:-false}" = true ]; then
    migrar_ativo="${MIGRAR_NA_PARTIDA_BASE_TESTE-true}"
    if [ "$subiu" = true ]; then migrar_ativo="${MIGRAR_NA_PARTIDA_ALVO_TESTE-true}"; fi
    app=$(jq -cn --arg id "$ID_APP" --arg projeto "$projeto" --arg imagem "$imagem_ativa" \
      --arg migrar "$migrar_ativo" --arg host "${APP_HOST_BANCO_TESTE:-db}" '
      {Id:$id,Image:$imagem,State:{Running:true},Mounts:[],Config:{Env:(["DATABASE_URL=postgresql://frequencia:fixture@\($host):5432/frequencia","DIRECT_URL=postgresql://frequencia:fixture@db:5432/frequencia"] + (if $migrar == "ausente" then [] else ["MIGRAR_NA_PARTIDA=" + $migrar] end)),Labels:{"com.docker.compose.project":$projeto,"com.docker.compose.service":"app"}}}')
    db=$(jq -cn --arg id "$ID_DB" --arg projeto "$projeto" --arg inicio "$INICIO_DB" '
      {Id:$id,State:{Running:true,StartedAt:$inicio},Mounts:[{Type:"volume",Name:($projeto+"-dados"),Source:("/var/lib/docker/volumes/"+$projeto+"-dados/_data"),Destination:"/var/lib/postgresql/data"}],Config:{Env:[],Labels:{"com.docker.compose.project":$projeto,"com.docker.compose.service":"db"}},NetworkSettings:{Networks:{"teste-interna":{IPAddress:"172.19.0.2"}}}}')
    if [ "$#" -eq 3 ]; then jq -cn --argjson app "$app" --argjson db "$db" '[$app,$db]'
    elif [ "$2" = "$ID_APP" ]; then jq -c '[.]' <<<"$app"
    elif [ "$2" = "$ID_DB" ]; then jq -c '[.]' <<<"$db"
    else exit 95; fi
    exit
  fi
  printf '[{"Id":"container-app","Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Config":{"Labels":{"com.docker.compose.project":"%s","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"%s-dados","Source":"/var/lib/docker/volumes/%s-dados/_data","Destination":"/var/lib/postgresql/data"}]}]\n' \
    "$projeto" "$projeto" "$projeto" "$projeto"
  exit 0
fi

if [ "$1" = "image" ] && [ "$2" = "inspect" ]; then
  if [ "${3:-}" = --format ] && [ "$4" = '{{.Id}}' ]; then
    printf '%s\n' "$IMAGEM_ALVO"
  elif [ "${5:-}" = "$IMAGEM_BASE" ] || [[ "${5:-}" == frequenciapp-rollback:* ]]; then
    printf '%s\n' "$DOCKER_REVISAO_BASE"
  elif [ "${DOCKER_REVISAO_FALSA:-}" = "true" ]; then
    printf 'revisao-falsa\n'
  elif [ -n "${DOCKER_REVISAO_IMAGEM:-}" ]; then
    printf '%s\n' "$DOCKER_REVISAO_IMAGEM"
  fi
  exit 0
fi

[ "$1" = "compose" ] || { echo "docker inesperado: $*" >&2; exit 1; }
shift
perfil_backup=false
config_manual=null
bind_manual=null
raiz_compose=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --project-directory)
      raiz_compose="$2"
      shift 2
      ;;
    -f)
      case "$2" in
        */migracao-partida.*/manual.json) config_manual=$(jq -ce '.services.app.environment' "$2") ;;
        */migracao-partida.*/compose.json) bind_manual=$(jq -ce '.services.app.volumes' "$2") ;;
      esac
      shift 2
      ;;
    --project-name | --env-file)
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
    if [ "${ABATER_APOS_TROCA:-false}" = true ] && [[ " $* " == *" --format json "* ]] &&
      [ "$(git -C "$APP_DIR" rev-parse HEAD)" = "$DOCKER_REVISAO_IMAGEM" ] &&
      [ -f "$ESTADO_DIR/atualizacao-manual-pendente.json" ]; then
      # O sinal precisa atingir o executor, não o subshell da captura de identidade.
      pai=$PPID
      while [[ "$(tr '\0' ' ' <"/proc/$pai/cmdline")" != *"$EXECUTOR/atualizar.sh"* ||
        "$(awk '{print $4}' "/proc/$pai/stat")" != "$PID_HARNESS" ]]; do
        pai=$(awk '{print $4}' "/proc/$pai/stat")
        [ "$pai" -gt 1 ] || exit 97
      done
      kill -KILL "$pai"
      exit 97
    fi
    if [[ " $* " == *" --format json "* ]]; then
      periodo_saude=10s
      if [ "${TOPOLOGIA_ALVO_DIVERGENTE:-false}" = true ] && [ "$raiz_compose" != "$APP_DIR" ]; then
        periodo_saude=60s
      fi
      jq -cn --arg projeto "$projeto" --arg migrar "$MIGRAR_NA_PARTIDA" \
        --arg imagem "${APP_IMAGEM:-teste/local}" --arg reinicio "${MIGRACAO_POLITICA_REINICIO:-unless-stopped}" \
        --argjson manual "$config_manual" --argjson bind "$bind_manual" --arg periodo "$periodo_saude" \
        --argjson borda "${BORDA_LEGADA_TESTE:-false}" '
        {name:$projeto,services:{app:{image:$imagem,restart:$reinicio,command:["./docker/app/entrypoint.sh"],healthcheck:{interval:$periodo},networks:{interna:null},environment:({MIGRAR_NA_PARTIDA:$migrar,DATABASE_URL:"postgresql://frequencia:fixture@db:5432/frequencia",DIRECT_URL:"postgresql://frequencia:fixture@db:5432/frequencia"} + ($manual // {})),volumes:$bind},db:{networks:{interna:null},environment:{POSTGRES_DB:"frequencia",POSTGRES_USER:"frequencia"},volumes:[{type:"volume",source:"dados",target:"/var/lib/postgresql/data"}]},caddy:{}},networks:{interna:{name:"teste-interna",internal:true}},volumes:{dados:{name:($projeto+"-dados")}}} |
        if $borda then .services.app.networks.borda = null | .networks.borda = {name:"teste-borda-ausente",external:true} else . end'
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
      if [ "${DOCKER_MANUAL:-false}" = true ]; then printf '%s\n' "$ID_APP" "$ID_DB"; else printf 'container-app\ncontainer-db\n'; fi
    elif [ "${DOCKER_MANUAL:-false}" = true ]; then
      case "${*: -1}" in app) printf '%s\n' "$ID_APP" ;; db) printf '%s\n' "$ID_DB" ;; *) exit 96 ;; esac
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
    if [ "${DOCKER_MANUAL:-false}" = true ]; then
      [[ " $* " == *" --no-deps --no-build --pull never "* && "${*: -1}" = app ]]
      [ "${APP_IMAGEM:-}" = "$IMAGEM_ALVO" ] && [ "${MIGRACAO_POLITICA_REINICIO:-}" = no ]
      jq -e --arg alvo "$DOCKER_REVISAO_IMAGEM" '.fase == "partida" and .alvo == $alvo' \
        "$ESTADO_DIR/atualizacao-manual-pendente.json" >/dev/null
      arquivo=$(jq -er .autorizacao "$ESTADO_DIR/atualizacao-manual-pendente.json")
      [ "$(<"$arquivo")" = "$(jq -er .MIGRACAO_LOTE_APROVADO <<<"$config_manual")" ]
      : >"$DOCKER_UP_COUNTER.reinicio"
      if [ "${ABATER_APOS_PARTIDA:-false}" = true ]; then
        [[ "$(tr '\0' ' ' <"/proc/$PPID/cmdline")" == *"$EXECUTOR/atualizar.sh"* ]]
        kill -KILL "$PPID"
      fi
    fi
    if [ "${DOCKER_FALHA_UP:-false}" = "true" ] && [ "$contador" -eq 1 ]; then
      exit 1
    fi
    exit 0
    ;;
  exec)
    if [[ " $* " == *"SELECT current_database();"* ]]; then printf 'frequencia\n'; exit; fi
    if [[ " $* " == *" psql -XwqAt "* ]]; then
      consulta=$(cat)
      [[ "$consulta" == *"BEGIN READ ONLY"* && "$consulta" == *"_prisma_migrations"* ]] || exit 1
      printf '%s\n' "${HISTORICO_SINTETICO:-[]}"
    fi
    exit 0
    ;;
  stop | down)
    exit 0
    ;;
  *)
    echo "compose inesperado: $comando $*" >&2
    exit 1
    ;;
esac
DOCKER
chmod +x "$FAKE_BIN/docker"

cat >"$FAKE_BIN/age" <<'AGE'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ "$#" == 4 && "$1" == --recipients-file && "$3" == --output ]]
{ printf 'cifra sintética:'; cat; } >"$4"
AGE
chmod +x "$FAKE_BIN/age"

cat >"$FAKE_BIN/backup-falso.sh" <<'BACKUP'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'backup\n' >>"$BACKUP_CHAMADAS"
if [ -n "${BACKUP_MIGRACAO_MANUAL_OPERACAO:-}" ] && [ "${RECIBO_VARIANTE:-ok}" != legado ]; then
  if [ "${TESTAR_CONCORRENCIA:-false}" = true ]; then
    # Outra entrada não herda o descritor nem o contrato do filho de backup.
    if env -u SERVIDOR_LOCK_HERDADO -u BACKUP_MIGRACAO_MANUAL_OPERACAO \
      -u BACKUP_MIGRACOES_AUTO_ESPERADO -u BACKUP_MIGRACAO_MANUAL_INICIO \
      bash "$(dirname "$0")/compose.sh" up -d app 9>&- >"$ESTADO_DIR/concorrente.log" 2>&1; then
      exit 98
    fi
    grep -q 'Outra operação incompatível com compose' "$ESTADO_DIR/concorrente.log" || exit 99
  fi
  "$(dirname "$0")/backup-real.sh" "$@"
  if [ "${RECIBO_VARIANTE:-ok}" = adulterado ]; then
    arquivo=$(jq -er '.arquivo' "$ESTADO_DIR/ultimo-backup.json")
    printf 'adulterado\n' >>"$BACKUP_BANCO_DIR/$arquivo"
  fi
  exit 0
fi
if [ "${1:-}" = --verificar ]; then
  exec "$(dirname "$0")/backup-real.sh" "$@"
fi
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
    "$RAIZ/scripts/servidor/ambiente-seguro.mjs" \
    "$RAIZ/scripts/servidor/aprovacao-migracoes.mjs" \
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
  export DOCKER_REVISAO_IMAGEM="$COMMIT_ALVO" DOCKER_REVISAO_BASE="$COMMIT_ANTERIOR"
  rm -f "$DOCKER_LOG" "$DOCKER_UP_COUNTER" "$DOCKER_UP_COUNTER.dump" "$DOCKER_UP_COUNTER.reinicio" "$BACKUP_CHAMADAS" \
    "$ESTADO_DIR/falha.json" "$ESTADO_DIR/estado.json" "$SERVIDOR_IDENTIDADE_ARQUIVO" \
    "$ESTADO_DIR/atualizacao-manual-pendente.json" "$ESTADO_DIR/ultimo-backup.json" \
    "$ESTADO_DIR/aprovacao-migracoes.json" "$ESTADO_DIR"/aprovacao-migracoes-*.usada.json
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
  if APP_DIR="$REPO" PID_HARNESS="$BASHPID" bash "${EXECUTOR:-$REPO/scripts/servidor}/atualizar.sh" "$@" >"$TMP_RAIZ/saida.log" 2>&1; then
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

# A simulação também não busca nem altera refs e tags remotas.
preparar_instalacao
git -C "$REPO" checkout -q -b avanco-remoto "$COMMIT_ALVO"
printf 'terceira versao\n' >"$REPO/README.md"
git -C "$REPO" add README.md
git -C "$REPO" commit -qm "terceira versao"
git -C "$REPO" push -q origin avanco-remoto:main
git -C "$REPO" tag v9.9.9
git -C "$REPO" push -q origin v9.9.9
git -C "$REPO" checkout -q main
git -C "$REPO" branch -D avanco-remoto >/dev/null
git -C "$REPO" tag -d v9.9.9 >/dev/null
antes_refs=$(git -C "$REPO" for-each-ref --format='%(refname) %(objectname)')
status=$(executar_atualizacao --simular)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação com remoto à frente falhou."; }
depois_refs=$(git -C "$REPO" for-each-ref --format='%(refname) %(objectname)')
[ "$antes_refs" = "$depois_refs" ] || falhar "a simulação alterou refs ou tags."
grep -q 'sem buscar referências' "$TMP_RAIZ/saida.log" ||
  falhar "a simulação não avisou que usa as refs locais."

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

# Sem histórico atestado, desligar o migrador não autoriza rollback.
preparar_instalacao
export DOCKER_FALHA_UP=true
status=$(executar_atualizacao)
unset DOCKER_FALHA_UP
exigir_falha "$status" "a falha de saúde foi ignorada."
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ALVO" ] || falhar "houve rollback sem histórico atestado."
grep -q 'Nenhuma imagem anterior será iniciada' "$TMP_RAIZ/saida.log" || falhar "faltou a orientação de recuperação."
[ -f "$ESTADO_DIR/falha.json" ] || falhar "a falha não foi registrada."
[ "$(cat "$DOCKER_UP_COUNTER")" -eq 1 ] || falhar "uma imagem anterior foi iniciada."

# O executor revisado fica fora do checkout. A revisão instalada não fornece os validadores.
preparar_manual() {
  local sem_migracoes="${1:-false}" alvo_legado="${2:-false}"
  export DOCKER_MANUAL=true
  preparar_instalacao
  EXECUTOR="$TMP_RAIZ/executor/scripts/servidor"
  export EXECUTOR
  mkdir -p "$(dirname "$EXECUTOR")" "$TMP_RAIZ/executor/src/infra" "$TMP_RAIZ/executor/docker/app"
  cp -r "$RAIZ/scripts/servidor" "$(dirname "$EXECUTOR")/"
  cp "$RAIZ/src/infra/schema-postgres.mjs" "$TMP_RAIZ/executor/src/infra/"
  cp "$RAIZ/docker/app/"{entrypoint.sh,migrar.mjs} "$TMP_RAIZ/executor/docker/app/"
  mv "$EXECUTOR/backup-banco.sh" "$EXECUTOR/backup-real.sh"
  cp "$FAKE_BIN/backup-falso.sh" "$EXECUTOR/backup-banco.sh"
  mkdir -p "$REPO/prisma/migrations/20260101000000_base" "$REPO/docker/app" "$REPO/src/infra"
  printf 'CREATE TABLE prova (id integer PRIMARY KEY);\n' >"$REPO/prisma/migrations/20260101000000_base/migration.sql"
  # A rodada local pode montar os bytes da revisão antiga, sem copiá-los para
  # o executor ou exigir histórico Git completo no checkout raso do CI.
  if [ -n "${ATUALIZACAO_FONTE_LEGADA:-}" ]; then
    cp "$ATUALIZACAO_FONTE_LEGADA/docker/app/"{entrypoint.sh,migrar.mjs} "$REPO/docker/app/"
    cp "$ATUALIZACAO_FONTE_LEGADA/scripts/servidor/"{atualizar.sh,ambiente-seguro.mjs,comum.sh} "$REPO/scripts/servidor/"
  else
    printf '// Migrador legado sintético.\n' >"$REPO/docker/app/migrar.mjs"
    cp "$RAIZ/docker/app/entrypoint.sh" "$REPO/docker/app/"
  fi
  cp "$RAIZ/src/infra/schema-postgres.mjs" "$REPO/src/infra/"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm "base com histórico"
  COMMIT_ANTERIOR=$(git -C "$REPO" rev-parse HEAD)
  if [ "$alvo_legado" = false ]; then cp "$RAIZ/docker/app/"{entrypoint.sh,migrar.mjs} "$REPO/docker/app/"; fi
  if [ "$sem_migracoes" = false ]; then
    mkdir -p "$REPO/prisma/migrations/20260102000000_nova"
    printf 'ALTER TABLE prova ADD COLUMN uid uuid DEFAULT gen_random_uuid();\n' \
      >"$REPO/prisma/migrations/20260102000000_nova/migration.sql"
  fi
  printf 'nova revisão\n' >"$REPO/README.md"
  git -C "$REPO" add .
  git -C "$REPO" commit -qm "alvo manual"
  git -C "$REPO" push -q --force origin HEAD:main
  COMMIT_MIGRACAO=$(git -C "$REPO" rev-parse HEAD)
  export DOCKER_REVISAO_IMAGEM="$COMMIT_MIGRACAO" DOCKER_REVISAO_BASE="$COMMIT_ANTERIOR"
  historico_git() {
    local revisao="$1" arquivo nome hash
    while IFS= read -r arquivo; do
      nome=${arquivo%/migration.sql}
      hash=$(git -C "$REPO" show "$revisao:$arquivo" | sha256sum | cut -d' ' -f1)
      jq -cn --arg nome "${nome##*/}" --arg hash "$hash" '[$nome,$hash,true]'
    done < <(git -C "$REPO" ls-tree -r --name-only "$revisao" -- prisma/migrations) | jq -cs '.'
  }
  export HISTORICO_MANUAL_BASE HISTORICO_MANUAL_ALVO
  HISTORICO_MANUAL_BASE=$(historico_git "$COMMIT_ANTERIOR")
  HISTORICO_MANUAL_ALVO=$(historico_git "$COMMIT_MIGRACAO")
  git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
  export MIGRAR_NA_PARTIDA=true
  # Força a validação do ambiente pela cópia revisada na primeira invocação.
  unset SERVIDOR_AMBIENTE_INJETADO
}

exigir_recusa_manual() {
  local mensagem="$1"
  exigir_falha "$status" "$mensagem"
  grep -q "$mensagem" "$TMP_RAIZ/saida.log" || { cat "$TMP_RAIZ/saida.log"; falhar "$mensagem"; }
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] && [ ! -s "$DOCKER_UP_COUNTER" ] &&
    [ ! -e "$ESTADO_DIR/atualizacao-manual-pendente.json" ] || falhar "a recusa chegou à troca ou à partida."
}

preparar_manual
status=$(executar_atualizacao)
exigir_recusa_manual 'Há migrações novas'
status=$(ATUALIZAR_PERMITIR_MIGRACOES=true executar_atualizacao --simular)
if [ "$status" -ne 0 ] || ! grep -q 'bloqueariam a atualização' "$TMP_RAIZ/saida.log"; then
  falhar "a simulação prometeu migrar sem a flag."
fi
status=$(ATUALIZAR_PERMITIR_MIGRACOES=true executar_atualizacao)
exigir_recusa_manual 'Há migrações novas'
status=$(HISTORICO_COMPATIVEL=false executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'estrutura da tabela de histórico incompatível'
status=$(HISTORICO_RLS_EFETIVA=true executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'RLS efetiva ou privilégios insuficientes'
[ ! -s "$BACKUP_CHAMADAS" ] && [ ! -e "$DOCKER_UP_COUNTER.dump" ] ||
  falhar 'A recusa da estrutura do histórico chegou ao backup.'
status=$(RECIBO_VARIANTE=legado executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'sem recibo de origem'
status=$(RECIBO_VARIANTE=adulterado executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'sem recibo de origem'
status=$(BANCO_DIFERENTE=true executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'não correspondem à base instalada'
status=$(BORDA_LEGADA_TESTE=true executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'não correspondem à base instalada'
if grep -qx 'saude-legada' "$DOCKER_LOG"; then
  falhar "a atualização com borda consultou a saúde do app legado antes de conferir o destino."
fi
for desvio in reinicio homonimo falha; do
  rm -f "$DOCKER_UP_COUNTER.dump"
  status=$(DUMP_VARIANTE="$desvio" executar_atualizacao --permitir-migracoes)
  exigir_recusa_manual 'backup pré-migração manual falhou'
done
rm -f "$DOCKER_UP_COUNTER.dump"
status=$(TOPOLOGIA_ALVO_DIVERGENTE=true executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'destino Compose diverge'
status=$(TESTAR_CONCORRENCIA=true executar_atualizacao --permitir-migracoes)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a migração liberada falhou."; }
grep -q 'Outra operação incompatível com compose' "$ESTADO_DIR/concorrente.log"
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_MIGRACAO" ] &&
  [ ! -e "$ESTADO_DIR/atualizacao-manual-pendente.json" ] && [ "$(cat "$DOCKER_UP_COUNTER")" = 1 ] ||
  falhar "o alvo não foi concluído depois das verificações finais."

# A revisão já servida não deve ser recriada pelo protocolo pré-migração.
chamadas_antes=$(wc -l <"$BACKUP_CHAMADAS")
status=$(executar_atualizacao)
if [ "$status" -ne 0 ] || ! grep -q 'Nenhuma mudança a aplicar' "$TMP_RAIZ/saida.log"; then
  falhar "a mesma revisão sem --forcar não ficou em repouso."
fi
status=$(executar_atualizacao --forcar)
exigir_falha "$status" "--forcar aceitou recriar a mesma revisão com o migrador ativo."
grep -q 'não reaplica a revisão instalada com o migrador ativo' "$TMP_RAIZ/saida.log" ||
  { cat "$TMP_RAIZ/saida.log"; falhar "faltou a recusa explícita da reaplicação."; }
[ "$(wc -l <"$BACKUP_CHAMADAS")" -eq "$chamadas_antes" ] &&
  [ "$(cat "$DOCKER_UP_COUNTER")" = 1 ] && [ ! -e "$ESTADO_DIR/atualizacao-manual-pendente.json" ] ||
  falhar "a recusa de --forcar executou backup, gravou intenção ou iniciou outra partida."

# A retomada exige uma opção explícita e o registro da revisão base.
retomada=(--permitir-migracoes --base-sem-migrador)
preparar_manual
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false executar_atualizacao "${retomada[@]}")
exigir_recusa_manual 'não correspondem à base instalada'
status=$(executar_atualizacao --registrar)
[ "$status" -eq 0 ] || falhar "não foi possível registrar a base do ensaio de retomada."
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'não correspondem à base instalada'
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false executar_atualizacao --base-sem-migrador --agendado)
exigir_recusa_manual 'A opção --base-sem-migrador exige'
for valor in ausente '' False true; do
  status=$(MIGRAR_NA_PARTIDA_BASE_TESTE="$valor" executar_atualizacao "${retomada[@]}")
  exigir_recusa_manual 'não correspondem à base instalada'
done
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false APP_HOST_BANCO_TESTE=outro executar_atualizacao "${retomada[@]}")
exigir_recusa_manual 'não correspondem à base instalada'
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false HISTORICO_BASE='[]' executar_atualizacao "${retomada[@]}")
exigir_recusa_manual 'não correspondem à base instalada'
[ ! -s "$BACKUP_CHAMADAS" ] && [ ! -e "$DOCKER_UP_COUNTER.dump" ] || falhar "uma base divergente chegou ao backup."
status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false executar_atualizacao "${retomada[@]}")
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a base recuperada com o migrador desligado foi recusada."; }
[ "$(jq -er .commit "$ESTADO_DIR/estado.json")" = "$COMMIT_MIGRACAO" ] &&
  [ ! -e "$ESTADO_DIR/atualizacao-manual-pendente.json" ] && [ "$(cat "$DOCKER_UP_COUNTER")" = 1 ] ||
  falhar "a retomada não confirmou a revisão alvo."

preparar_manual false true
status=$(executar_atualizacao --permitir-migracoes)
exigir_recusa_manual 'não implementa o protocolo manual compatível'

for caso in saude historico sinal troca migrador_alvo; do
  preparar_manual
  case "$caso" in
    saude) status=$(DOCKER_FALHA_UP=true executar_atualizacao --permitir-migracoes) ;;
    historico) status=$(HISTORICO_FINAL="$HISTORICO_MANUAL_BASE" executar_atualizacao --permitir-migracoes) ;;
    sinal) status=$(ABATER_APOS_PARTIDA=true executar_atualizacao --permitir-migracoes) ;;
    troca) status=$(ABATER_APOS_TROCA=true executar_atualizacao --permitir-migracoes) ;;
    migrador_alvo)
      status=$(executar_atualizacao --registrar)
      [ "$status" -eq 0 ] || falhar "não foi possível registrar a base do ensaio de retomada."
      status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false MIGRAR_NA_PARTIDA_ALVO_TESTE=false executar_atualizacao "${retomada[@]}")
      grep -q 'O banco, o histórico ou a configuração do aplicativo alvo não conferem' "$TMP_RAIZ/saida.log" ||
        falhar "a divergência do migrador no alvo não foi detectada na verificação final."
      ;;
  esac
  exigir_falha "$status" "o resultado incerto foi tratado como sucesso: $caso"
  fase=partida
  partidas=1
  if [ "$caso" = troca ]; then fase=troca; partidas=0; fi
  [ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_MIGRACAO" ] &&
    [ "$(cat "$DOCKER_UP_COUNTER" 2>/dev/null || printf 0)" = "$partidas" ] ||
    falhar "houve partida ou rollback não previsto: $caso."
  if [ "$caso" = troca ] || [ "$caso" = sinal ]; then
    [ "$status" -eq 137 ] || falhar "a interrupção não atingiu o atualizador: $caso."
  fi
  pendente="$ESTADO_DIR/atualizacao-manual-pendente.json"
  jq -e --arg commit "$COMMIT_MIGRACAO" --arg fase "$fase" \
    '.fase == $fase and .alvo == $commit and (.backup.sha256 | length == 64)' "$pendente" >/dev/null
  antes=$(sha256sum "$ESTADO_DIR/ultimo-backup.json" "$BACKUP_BANCO_DIR/$(jq -r '.backup.arquivo' "$pendente")")
  status=$(MIGRAR_NA_PARTIDA_BASE_TESTE=false executar_atualizacao "${retomada[@]}" --forcar)
  exigir_falha "$status" "uma nova atualização ignorou o marcador."
  grep -q 'Atualização manual pendente ou incerta' "$TMP_RAIZ/saida.log" || falhar "a repetição não encontrou a guarda."
  for entrada in backup-real.sh restaurar.sh controlador/retencao.sh compose.sh; do
    args=()
    if [ "$entrada" = restaurar.sh ]; then
      args=(--arquivo "$(jq -r '.backup.arquivo' "$pendente")" --confirmar --sem-copia)
    fi
    if [ "$entrada" = compose.sh ]; then args=(up -d app); fi
    if APP_DIR="$REPO" bash "$EXECUTOR/$entrada" "${args[@]}" >"$TMP_RAIZ/entrada.log" 2>&1; then
      falhar "a entrada $entrada ignorou o marcador."
    fi
    grep -q 'Atualização manual pendente ou incerta' "$TMP_RAIZ/entrada.log" ||
      { cat "$TMP_RAIZ/entrada.log"; falhar "a entrada $entrada não encontrou a guarda."; }
  done
  [ "$antes" = "$(sha256sum "$ESTADO_DIR/ultimo-backup.json" "$BACKUP_BANCO_DIR/$(jq -r '.backup.arquivo' "$pendente")")" ] ||
    falhar "o conjunto protegido mudou."
  [ "$(cat "$DOCKER_UP_COUNTER" 2>/dev/null || printf 0)" = "$partidas" ] ||
    falhar "uma nova partida ocorreu após a recusa."
done

preparar_manual true
for historico in '[]' '[["20260101000000_base","divergente",true]]' '[["20260101000000_base","divergente",false]]'; do
  status=$(HISTORICO_BASE="$historico" executar_atualizacao)
  exigir_recusa_manual 'não correspondem à base instalada'
done
status=$(executar_atualizacao)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a atualização sem pendências falhou."; }
unset EXECUTOR DOCKER_MANUAL
export MIGRAR_NA_PARTIDA=true SERVIDOR_AMBIENTE_INJETADO=true

preparar_instalacao
status=$(MIGRAR_NA_PARTIDA=false executar_atualizacao --agendado)
if [ "$status" -ne 0 ] || [ "$(cat "$DOCKER_UP_COUNTER")" -ne 1 ] ||
  [ "$(jq -er .commit "$ESTADO_DIR/estado.json")" != "$COMMIT_ALVO" ]; then
  falhar "o agendado simples sem diferença e sem migrador deixou de aplicar."
fi

# O cron não aceita permissão geral e só consome uma aprovação no momento de aplicar.
preparar_instalacao
git -C "$REPO" reset -q --hard "$COMMIT_ALVO"
mkdir -p "$REPO/prisma/migrations/20260101000000_aprovada"
printf 'select 1;\n' >"$REPO/prisma/migrations/20260101000000_aprovada/migration.sql"
git -C "$REPO" add prisma
git -C "$REPO" commit -qm "migracao para ensaio"
git -C "$REPO" push -q origin main
COMMIT_APROVADO=$(git -C "$REPO" rev-parse HEAD)
export DOCKER_REVISAO_IMAGEM="$COMMIT_APROVADO"
git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
status=$(ATUALIZAR_PERMITIR_MIGRACOES=true executar_atualizacao --agendado)
exigir_falha "$status" "o cron aceitou permissão geral sem aprovação."
grep -q 'Aprovação agendada de migrações recusada' "$TMP_RAIZ/saida.log" || falhar "a aprovação não foi exigida."
[ ! -e "$BACKUP_CHAMADAS" ] || falhar "a recusa chegou ao backup."

aprovacao="$ESTADO_DIR/aprovacao-migracoes.json"
recibo_usado="$ESTADO_DIR/aprovacao-migracoes-$COMMIT_APROVADO.usada.json"
inicio=$(date -u -d '1 minute ago' +%FT%TZ)
fim=$(date -u -d '10 minutes' +%FT%TZ)
node "$REPO/scripts/servidor/aprovacao-migracoes.mjs" preparar "$REPO" "$COMMIT_ANTERIOR" "$COMMIT_APROVADO" "$inicio" "$fim" >"$TMP_RAIZ/aprovacao-correta"
install -m 600 "$TMP_RAIZ/aprovacao-correta" "$aprovacao"
printf 'ATUALIZAR_APROVAR_MIGRACOES_AUTOMATICAMENTE=true\n' >"$OPS_ENV_FILE"
status=$(executar_atualizacao --agendado)
exigir_falha "$status" "a política automática sem controlador caiu no caminho do manifesto manual."
grep -q 'controlador adotado' "$TMP_RAIZ/saida.log" || falhar "faltou a recusa explícita por perfil."
[ ! -e "$BACKUP_CHAMADAS" ] && [ ! -e "$recibo_usado" ] || falhar "a recusa chegou a uma mutação."
: >"$OPS_ENV_FILE"
jq '.migracoes[0].sha256 = "divergente"' "$TMP_RAIZ/aprovacao-correta" >"$aprovacao"
chmod 600 "$aprovacao"
status=$(executar_atualizacao --agendado)
exigir_falha "$status" "o cron aceitou checksum divergente."
[ ! -e "$BACKUP_CHAMADAS" ] || falhar "a cópia divergente chegou ao backup."
chmod 644 "$aprovacao"
status=$(executar_atualizacao --agendado)
exigir_falha "$status" "o cron aceitou aprovação sem proteção."
grep -q 'modo 600' "$TMP_RAIZ/saida.log" || { cat "$TMP_RAIZ/saida.log"; falhar "a proteção do arquivo não foi conferida."; }
chmod 600 "$aprovacao"
jq '.inicio = "2000-01-01T00:00:00Z" | .fim = "2000-01-01T00:01:00Z"' "$TMP_RAIZ/aprovacao-correta" >"$aprovacao"
status=$(executar_atualizacao --agendado)
exigir_falha "$status" "o cron aceitou aprovação vencida."
grep -q 'janela.*vencida' "$TMP_RAIZ/saida.log" || falhar "a validade não foi conferida."
install -m 600 "$TMP_RAIZ/aprovacao-correta" "$aprovacao"
status=$(HISTORICO_SINTETICO='[["20260101000000_outra","hash",false]]' executar_atualizacao --agendado)
exigir_falha "$status" "o cron aceitou histórico divergente."
grep -q 'histórico do banco não corresponde' "$TMP_RAIZ/saida.log" || falhar "o histórico não foi conferido."
status=$(executar_atualizacao --simular --agendado)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a simulação da aprovação falhou."; }
[ ! -e "$recibo_usado" ] && [ ! -e "$BACKUP_CHAMADAS" ] || falhar "a simulação usou aprovação ou executou backup."
status=$(executar_atualizacao --agendado)
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "o cron não aplicou o commit autorizado."; }
[ "$(git -C "$REPO" rev-parse HEAD)" = "$COMMIT_APROVADO" ] && [ -f "$recibo_usado" ] ||
  falhar "o commit ou o uso único da aprovação não foi registrado."
rm "$ESTADO_DIR/estado.json"
git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
status=$(executar_atualizacao --agendado)
exigir_falha "$status" "o cron reutilizou uma aprovação já consumida."
grep -q 'já foi usada' "$TMP_RAIZ/saida.log" || falhar "o uso anterior não foi identificado."

git -C "$REPO" push -q --force origin "$COMMIT_ALVO:refs/heads/main"
status=$(executar_atualizacao --agendado --ref "$COMMIT_APROVADO")
exigir_falha "$status" "o cron aceitou um SHA aprovado fora da ponta da main."
grep -q 'não é mais a ponta da main' "$TMP_RAIZ/saida.log" || falhar "a divergência da main não foi identificada."

# MIGRAR_NA_PARTIDA=false não pode trocar a imagem sem confirmação externa.
preparar_instalacao
git -C "$REPO" reset -q --hard "$COMMIT_ALVO"
mkdir -p "$REPO/prisma/migrations/0003_externa"
printf 'select 1;\n' >"$REPO/prisma/migrations/0003_externa/migration.sql"
git -C "$REPO" add prisma
git -C "$REPO" commit -qm "migracao externa"
git -C "$REPO" push -q origin main
COMMIT_EXTERNO=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
export DOCKER_REVISAO_IMAGEM="$COMMIT_EXTERNO"
export MIGRAR_NA_PARTIDA=false
unset ATUALIZAR_MIGRACAO_EXTERNA
status=$(executar_atualizacao --permitir-migracoes)
exigir_falha "$status" "a atualização aceitou migração implícita com MIGRAR_NA_PARTIDA=false."
grep -q 'MIGRAR_NA_PARTIDA' "$TMP_RAIZ/saida.log" || falhar "a recusa de migração implícita não apareceu."
export ATUALIZAR_MIGRACAO_EXTERNA=true
status=$(executar_atualizacao --permitir-migracoes)
unset ATUALIZAR_MIGRACAO_EXTERNA
export MIGRAR_NA_PARTIDA=false
[ "$status" -eq 0 ] || { cat "$TMP_RAIZ/saida.log"; falhar "a migração externa não foi aceita."; }

# Sem backup remoto, a atualização exige opt-in explícito para a cópia local.
preparar_instalacao
export ATUALIZAR_PERMITIR_BACKUP_LOCAL=false
status=$(executar_atualizacao)
unset ATUALIZAR_PERMITIR_BACKUP_LOCAL
exigir_falha "$status" "a atualização aceitou backup apenas local sem opt-in."
grep -q 'backup remoto confirmado' "$TMP_RAIZ/saida.log" || falhar "a recusa de backup local não apareceu."
export ATUALIZAR_PERMITIR_BACKUP_LOCAL=true

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
