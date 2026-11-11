#!/usr/bin/env bash
# Confere leituras e recusas prévias com Git real, sem daemon, rede ou aplicação.
set -Eeuo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
if [ -z "${ATUALIZACAO_CASO:-}" ]; then
  exec bash "$(dirname "${BASH_SOURCE[0]}")/atualizacao.sh"
fi
verificar_raiz() {
  [ -n "${TMP_RAIZ:-}" ] && [ -d "$TMP_RAIZ" ] && [ ! -L "$TMP_RAIZ" ] &&
    [ "$(/usr/bin/stat -c '%d:%i:%u:%a' -- "$TMP_RAIZ")" = "${FIXTURE_IDENTIDADE:-}" ] &&
    [ "$(/usr/bin/stat -c '%u:%a' -- "$TMP_RAIZ")" = "$(/usr/bin/id -u):700" ] || {
      printf 'Raiz da fixture não pertence a esta execução; limpeza recusada.\n' >&2
      return 1
    }
}
executar_suite() {
  verificar_raiz || exit 99
  rm() { verificar_raiz || exit 99; /usr/bin/rm "$@"; }
  export -f verificar_raiz rm
  [ "$(command -v docker)" = "$TMP_RAIZ/bin/docker" ] || exit 99
  [ "$(command -v curl)" = "$TMP_RAIZ/bin/curl" ] || exit 99
  [ "$GIT_ALLOW_PROTOCOL" = file ] || exit 99
  falhar() {
    printf 'FALHOU: %s\n' "$*" >&2
    [ ! -f "$TMP_RAIZ/saida.log" ] || cat "$TMP_RAIZ/saida.log" >&2
    exit 1
  }
  export APP_DIR="$TMP_RAIZ/repo" SERVIDOR_AMBIENTE_INJETADO=true
  export COMPOSE_PROJECT_NAME=teste COMPOSE_ARQUIVOS=compose.yml PROXY_TIPO=caddy
  export BACKUP_PLANILHAS_HABILITADO=false ATUALIZAR_MODO=main ATUALIZAR_ESPACO_MINIMO_MB=0
  export ATUALIZAR_REF=origin/main ATUALIZAR_VERIFICAR_SAUDE_PUBLICA=false
  export APP_ENV_FILE="$TMP_RAIZ/app.env" OPS_ENV_FILE="$TMP_RAIZ/ops.env"
  export SERVIDOR_CONFIG_DIR="$TMP_RAIZ/config" SERVIDOR_LOCK_DIR="$TMP_RAIZ/locks"
  export SERVIDOR_IDENTIDADE_ARQUIVO="$SERVIDOR_CONFIG_DIR/identidade.json"
  export ESTADO_DIR="$TMP_RAIZ/estado" BACKUP_DIR="$TMP_RAIZ/backups" LOG_DIR="$TMP_RAIZ/log"
  export DOCKER_LOG="$TMP_RAIZ/docker.log"
  REPO="$APP_DIR"
  FAKE_BIN="$TMP_RAIZ/bin"
  mkdir -p "$REPO/scripts/servidor" "$ESTADO_DIR" "$BACKUP_DIR" "$SERVIDOR_CONFIG_DIR"
  : >"$APP_ENV_FILE"; : >"$OPS_ENV_FILE"
  chmod 600 "$APP_ENV_FILE" "$OPS_ENV_FILE"
  cp "$RAIZ/scripts/servidor/atualizar.sh" "$RAIZ/scripts/servidor/comum.sh" \
    "$RAIZ/scripts/servidor/identidade.mjs" "$RAIZ/scripts/servidor/identidade.sh" "$REPO/scripts/servidor/"
  chmod 700 "$REPO/scripts/servidor/identidade.sh"
  cat >"$REPO/scripts/servidor/backup-banco.sh" <<'BACKUP'
#!/usr/bin/env bash
printf 'backup proibido\n' >>"$TMP_RAIZ/backup-chamadas"
exit 99
BACKUP
  chmod 700 "$REPO/scripts/servidor/backup-banco.sh"
  cat >"$FAKE_BIN/curl" <<'CURL'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$TMP_RAIZ/alerta.log"
printf 'Rede proibida\n' >&2
exit 99
CURL
  chmod 700 "$FAKE_BIN/curl"
  printf 'services: {}\n' >"$REPO/compose.yml"
  printf 'revisão 1\n' >"$REPO/README.md"
  cat >"$FAKE_BIN/docker" <<'DOCKER'
#!/usr/bin/env bash
set -Eeuo pipefail
printf '%s\n' "$*" >>"$DOCKER_LOG"
case "$1" in
  info) printf '{"ID":"daemon-teste"}\n'; exit 0 ;;
  inspect)
    printf '[{"Id":"container-app","Config":{"Labels":{"com.docker.compose.project":"teste","com.docker.compose.service":"app"}},"Mounts":[]},{"Id":"container-db","Config":{"Labels":{"com.docker.compose.project":"teste","com.docker.compose.service":"db"}},"Mounts":[{"Type":"volume","Name":"teste-dados","Source":"/virtual/dados","Destination":"/var/lib/postgresql/data"}]}]\n'
    exit 0 ;;
  compose) shift ;;
  *) printf 'Docker inesperado: %s\n' "$*" >&2; exit 99 ;;
esac
while [ "$#" -gt 0 ]; do
  case "$1" in --project-directory|--project-name|--env-file|-f|--profile) shift 2 ;; *) break ;; esac
done
case "$1" in
  config)
    case " $* " in
      *' --format json '*) printf '{"name":"teste","services":{"app":{},"db":{"volumes":[{"type":"volume","source":"dados","target":"/var/lib/postgresql/data"}]},"caddy":{}},"volumes":{"dados":{"name":"teste-dados"}}}\n' ;;
      *' --services '*) printf 'app\ndb\ncaddy\n' ;;
    esac ;;
  ps) [ "${DOCKER_SEM_CONTAINERS:-false}" = true ] || printf 'container-app\ncontainer-db\n' ;;
  *) printf 'Mutação Docker proibida: %s\n' "$*" >&2; exit 99 ;;
esac
DOCKER
  chmod 700 "$FAKE_BIN/docker"
  git -C "$REPO" init -q -b main
  git -C "$REPO" config user.email teste@escola.exemplo
  git -C "$REPO" config user.name Teste
  git -C "$REPO" add .; git -C "$REPO" commit -qm base
  COMMIT_ANTERIOR=$(git -C "$REPO" rev-parse HEAD)
  git init -q --bare "$TMP_RAIZ/remoto.git"
  git -C "$REPO" remote add origin "$TMP_RAIZ/remoto.git"
  git -C "$REPO" push -qu origin main
  printf 'revisão 2\n' >"$REPO/README.md"
  git -C "$REPO" commit -qam alvo
  COMMIT_ALVO=$(git -C "$REPO" rev-parse HEAD)
  git -C "$REPO" push -q origin main
  git -C "$REPO" reset -q --hard "$COMMIT_ANTERIOR"
  adotar_identidade() { bash "$REPO/scripts/servidor/identidade.sh" --adotar --confirmar; }
  executar_atualizacao() {
    local status
    if bash "$REPO/scripts/servidor/atualizar.sh" "$@" >"$TMP_RAIZ/saida.log" 2>&1; then status=0; else status=$?; fi
    printf '%s' "$status"
  }
  sem_aplicacao() {
    [ "$(/usr/bin/git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar 'checkout alterado.'
    [ ! -e "$ESTADO_DIR/ultimo-backup.json" ] && [ ! -e "$ESTADO_DIR/atualizacao-em-andamento.json" ] || falhar 'backup ou marcador criado.'
    ! grep -Eq '(^| )(build|pull|up|stop|kill|down|restart|run)( |$)' "$DOCKER_LOG" || falhar 'mutação Docker alcançada.'
  }
  # A fotografia não segue links, inclui raízes ausentes e não reduz estado a nomes.
  fotografar() {
    node - "$@" <<'JS'
const fs = require('node:fs'), path = require('node:path'), {createHash} = require('node:crypto');
const out = new Map();
function visitar(p) {
  const s = fs.lstatSync(p, {throwIfNoEntry:false});
  if (!s) {out.set(p, null); return;}
  const v = [s.mode & 0o7777, s.mode & 0o170000];
  if (s.isFile()) v.push(createHash('sha256').update(fs.readFileSync(p)).digest('hex'));
  else if (s.isSymbolicLink()) v.push(fs.readlinkSync(p));
  out.set(p, v);
  if (s.isDirectory()) for (const n of fs.readdirSync(p)) visitar(path.join(p,n));
}
for (const raiz of process.argv.slice(2)) visitar(raiz);
const comparar = (a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b));
console.log(JSON.stringify(Object.fromEntries([...out].sort(([a],[b])=>comparar(a,b)))));
JS
  }
  case "$ATUALIZACAO_CASO" in
    identidade-inicial)
      export DOCKER_SEM_CONTAINERS=true
      bash "$REPO/scripts/servidor/identidade.sh" --iniciar
      if adotar_identidade; then falhar 'adoção aceita sem recursos.'; fi
      status=$(executar_atualizacao --simular)
      [ "$status" = 0 ] || falhar "simulação inicial: $status."
      [ ! -e "$SERVIDOR_IDENTIDADE_ARQUIVO" ] || falhar 'modo inicial gravou adoção.'
      ;;
    identidade-ausente)
      status=$(executar_atualizacao --simular)
      [ "$status" = 1 ] || falhar "identidade ausente: $status."
      grep -qi identidade "$TMP_RAIZ/saida.log" || falhar 'diagnóstico de identidade ausente.'
      ;;
    *) adotar_identidade ;;
  esac
  case "$ATUALIZACAO_CASO" in
    identidade-inicial|identidade-ausente) sem_aplicacao ;;
    identidade-adotada)
      [ -f "$SERVIDOR_IDENTIDADE_ARQUIVO" ] || falhar 'adoção ausente.'
      if adotar_identidade; then falhar 'adoção sobrescreveu registro.'; fi
      jq '.daemon = "outro-daemon"' "$SERVIDOR_IDENTIDADE_ARQUIVO" >"$TMP_RAIZ/identidade.tmp"
      chmod 600 "$TMP_RAIZ/identidade.tmp"; mv "$TMP_RAIZ/identidade.tmp" "$SERVIDOR_IDENTIDADE_ARQUIVO"
      status=$(executar_atualizacao --simular)
      [ "$status" = 1 ] || falhar "daemon divergente: $status."
      grep -qi identidade "$TMP_RAIZ/saida.log" || falhar 'diagnóstico de divergência ausente.'
      sem_aplicacao
      ;;
    simular-registrar)
      printf 'estado anterior sintético\n' >"$ESTADO_DIR/estado.json"; chmod 600 "$ESTADO_DIR/estado.json"
      # Controles da própria fotografia: bytes, modos, tipos, links e ausência.
      probe="$TMP_RAIZ/prova-fotografia"
      mkdir "$probe"; printf 'a\n' >"$probe/arquivo"; chmod 644 "$probe/arquivo"; ln -s arquivo "$probe/link"
      original=$(fotografar "$probe" "$probe-ausente")
      for alteracao in bytes modo tipo link ausente; do
        case "$alteracao" in
          bytes) printf 'b\n' >"$probe/arquivo" ;;
          modo) chmod 700 "$probe/arquivo" ;;
          tipo) rm "$probe/arquivo"; mkdir "$probe/arquivo" ;;
          link) rm "$probe/link"; ln -s inexistente "$probe/link" ;;
          ausente) mkdir "$probe-ausente" ;;
        esac
        [ "$(fotografar "$probe" "$probe-ausente")" != "$original" ] || falhar "fotografia perdeu $alteracao."
        rm -rf "$probe/arquivo" "$probe/link" "$probe-ausente"
        printf 'a\n' >"$probe/arquivo"; chmod 644 "$probe/arquivo"; ln -s arquivo "$probe/link"
        [ "$(fotografar "$probe-ausente" "$probe")" = "$original" ] || falhar 'fotografia não determinística.'
      done
      rm -f "$DOCKER_LOG"
      export NOTIFICAR_URL=https://alerta.invalid/hook
      printf ': >"$TMP_RAIZ/ambiente-carregado"\n' >"$APP_ENV_FILE"
      for ambiente in injetado arquivo; do
        [ "$ambiente" != arquivo ] || export SERVIDOR_AMBIENTE_INJETADO=false
        for ordem in simular-primeiro registrar-primeiro; do
          antes=$(fotografar "$REPO" "$ESTADO_DIR" "$SERVIDOR_LOCK_DIR" "$BACKUP_DIR" "$SERVIDOR_CONFIG_DIR")
          if [ "$ordem" = simular-primeiro ]; then status=$(executar_atualizacao --simular --registrar); else status=$(executar_atualizacao --registrar --simular); fi
          depois=$(fotografar "$REPO" "$ESTADO_DIR" "$SERVIDOR_LOCK_DIR" "$BACKUP_DIR" "$SERVIDOR_CONFIG_DIR")
          [ "$antes" = "$depois" ] || falhar 'opções contraditórias alteraram fotografia.'
          [ "$status" = 1 ] || falhar "opções contraditórias: $status."
          grep -q -- '--simular.*--registrar\|--registrar.*--simular' "$TMP_RAIZ/saida.log" || falhar 'recusa de opções ausente.'
          [ ! -e "$DOCKER_LOG" ] && [ ! -e "$TMP_RAIZ/ambiente-carregado" ] || falhar 'opções leram ambiente ou cliente.'
        done
      done
      ;;
    bloqueio-atualizacao)
      export NOTIFICAR_URL=https://alerta.invalid/hook
      rm -f "$DOCKER_LOG"
      cat >"$FAKE_BIN/git" <<'GIT'
#!/usr/bin/env bash
printf '%s\n' "$*" >>"$TMP_RAIZ/git-chamadas.log"
exec /usr/bin/git "$@"
GIT
      chmod 700 "$FAKE_BIN/git"
      for opcoes in '' '--forcar' '--permitir-migracoes' '--forcar --permitir-migracoes' '--modo --registrar' '--modo --simular'; do
        read -r -a args <<<"$opcoes"
        status=$(executar_atualizacao "${args[@]}")
        [ "$status" = 78 ] || falhar "bloqueio $opcoes: $status."
        grep -q 'Atualização bloqueada' "$TMP_RAIZ/saida.log" || falhar 'diagnóstico do bloqueio ausente.'
        [ "$(/usr/bin/git -C "$REPO" rev-parse HEAD)" = "$COMMIT_ANTERIOR" ] || falhar 'checkout alterado.'
        [ ! -e "$TMP_RAIZ/git-chamadas.log" ] && [ ! -e "$DOCKER_LOG" ] && [ ! -e "$ESTADO_DIR/estado.json" ] &&
          [ ! -e "$ESTADO_DIR/ultimo-backup.json" ] && [ ! -e "$ESTADO_DIR/atualizacao-em-andamento.json" ] || falhar 'bloqueio invocou cliente ou persistiu estado.'
      done
      ;;
    registrar-disponivel)
      status=$(executar_atualizacao --registrar)
      [ "$status" = 0 ] || falhar "registro: $status."
      jq -e --arg commit "$COMMIT_ANTERIOR" '.commit == $commit' "$ESTADO_DIR/estado.json" >/dev/null || falhar 'commit registrado incorreto.'
      sem_aplicacao
      ;;
    diagnostico-diff)
      status=$(executar_atualizacao --simular)
      [ "$status" = 0 ] || falhar "controle de simulação: $status."
      sem_aplicacao
      cat >"$FAKE_BIN/git" <<'GIT'
#!/usr/bin/env bash
if [[ " $* " == *" diff --name-only "* ]]; then printf 'diff recusado\n' >"$TMP_RAIZ/diff-injecao.log"; exit 42; fi
exec /usr/bin/git "$@"
GIT
      chmod 700 "$FAKE_BIN/git"
      status=$(executar_atualizacao --simular)
      [ "$status" = 1 ] && [ -s "$TMP_RAIZ/diff-injecao.log" ] || falhar "diff não injetado: $status."
      grep -q 'Não foi possível comparar as migrações' "$TMP_RAIZ/saida.log" || falhar 'diagnóstico de diff ausente.'
      sem_aplicacao
      ;;
    simulacao|refs)
      if [ "$ATUALIZACAO_CASO" = refs ]; then
        git -C "$REPO" checkout -q -b avanco-remoto "$COMMIT_ALVO"
        printf 'revisão 3\n' >"$REPO/README.md"; git -C "$REPO" commit -qam avanco
        git -C "$REPO" push -q origin avanco-remoto:main
        git -C "$REPO" tag v9.9.9; git -C "$REPO" push -q origin v9.9.9
        git -C "$REPO" checkout -q main; git -C "$REPO" branch -D avanco-remoto >/dev/null
        git -C "$REPO" tag -d v9.9.9 >/dev/null
      fi
      antes=$(git -C "$REPO" for-each-ref --format='%(refname) %(objectname)')
      status=$(executar_atualizacao --simular)
      [ "$status" = 0 ] || falhar "simulação: $status."
      [ "$(git -C "$REPO" for-each-ref --format='%(refname) %(objectname)')" = "$antes" ] || falhar 'simulação fez fetch de refs/tags.'
      grep -q 'sem buscar referências' "$TMP_RAIZ/saida.log" || falhar 'limite das refs locais ausente.'
      sem_aplicacao
      ;;
    *) falhar 'Caso ROOT migrado para controlador/operacional.e2e.mjs ou caso desconhecido; não ignorar.' ;;
  esac
  [ ! -e "$TMP_RAIZ/backup-chamadas" ] && [ ! -e "$TMP_RAIZ/alerta.log" ] || falhar 'leitura invocou backup ou alerta.'
  printf 'PASS: %s\n' "$ATUALIZACAO_CASO"
}
# Nunca importar lib.sh nem aceitar uma raiz/posse herdada para limpeza.
raiz_temp=$(/usr/bin/mktemp -d "${TMPDIR:-/tmp}/atualizador-fixture.XXXXXXXX")
TMP_RAIZ=$(/usr/bin/realpath -e -- "$raiz_temp")
FIXTURE_IDENTIDADE=$(/usr/bin/stat -c '%d:%i:%u:%a' -- "$TMP_RAIZ")
verificar_raiz || exit 99
trap 'if verificar_raiz; then /usr/bin/rm -rf -- "$TMP_RAIZ"; else exit 99; fi' EXIT
mkdir -p "$TMP_RAIZ/bin" "$TMP_RAIZ/home"
node_bin=$(command -v node) || { printf 'Node.js não encontrado.\n' >&2; exit 99; }
ln -s "$node_bin" "$TMP_RAIZ/bin/node"
printf '#!/bin/sh\necho "Docker proibido antes do dublê" >&2\nexit 99\n' >"$TMP_RAIZ/bin/docker"
printf '#!/bin/sh\necho "Rede proibida no ensaio" >&2\nexit 99\n' >"$TMP_RAIZ/bin/curl"
chmod 700 "$TMP_RAIZ/bin/docker" "$TMP_RAIZ/bin/curl"
env -i PATH="$TMP_RAIZ/bin:/usr/bin:/bin" HOME="$TMP_RAIZ/home" TMPDIR="$TMP_RAIZ" \
  GIT_CONFIG_NOSYSTEM=1 GIT_CONFIG_GLOBAL=/dev/null GIT_ALLOW_PROTOCOL=file \
  RAIZ="$RAIZ" TMP_RAIZ="$TMP_RAIZ" FIXTURE_IDENTIDADE="$FIXTURE_IDENTIDADE" \
  ATUALIZACAO_CASO="$ATUALIZACAO_CASO" \
  bash -c "set -Eeuo pipefail; $(declare -f verificar_raiz executar_suite); executar_suite"
