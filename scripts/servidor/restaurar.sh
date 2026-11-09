#!/usr/bin/env bash
# Restaura um dump do banco em um ambiente controlado.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

uso() {
  cat <<'TEXTO'
Uso:
  restaurar.sh --arquivo CAMINHO --confirmar [--sem-copia] [--aplicacao-parada]
  restaurar.sh --entrada - --confirmar [--escopo-legado SCHEMA] [--sem-copia] [--aplicacao-parada]
  restaurar.sh --diagnosticar ID.json --confirmar
  restaurar.sh --recuperar ID.json --confirmar

Sem recibo individual válido, exige --escopo-legado com o schema exato após revisão externa.
Compose exige RESTAURAR_MANTER_ANTERIOR=true; não há descarte automático.
Diários em ESTADO_DIR/restauracoes bloqueiam nova troca enquanto houver recuperação pendente.
--aplicacao-parada conserva a aplicação parada e não comprova saúde funcional.

O modo de validação URL pré-provisionada não é aceito sem prova de ownership.
A opção --sem-validacao só é aceita no modo URL e assume explicitamente o risco
de substituir o escopo sem o ensaio interno. Nunca ocorre fallback automático.
TEXTO
}

arquivo=""
entrada=""
recuperacao=""
diagnostico=""
escopo_legado=""
confirmar=false
fazer_copia=true
aplicacao_parada=false
sem_validacao=false

while [ "$#" -gt 0 ]; do
  case "$1" in
    --arquivo)
      arquivo="${2:-}"
      shift 2
      ;;
    --entrada)
      entrada="${2:-}"
      shift 2
      ;;
    --recuperar)
      recuperacao="${2:-}"
      shift 2
      ;;
    --diagnosticar)
      diagnostico="${2:-}"
      shift 2
      ;;
    --escopo-legado)
      escopo_legado="${2:-}"
      shift 2
      ;;
    --confirmar)
      confirmar=true
      shift
      ;;
    --sem-copia)
      fazer_copia=false
      shift
      ;;
    --aplicacao-parada)
      aplicacao_parada=true
      shift
      ;;
    --sem-validacao)
      sem_validacao=true
      shift
      ;;
    --ajuda | -h)
      uso
      exit 0
      ;;
    *)
      erro "Opção desconhecida: $1"
      ;;
  esac
done

[ "$confirmar" = true ] || {
  uso
  erro "A restauração exige --confirmar."
}

if [ -n "$recuperacao$diagnostico" ]; then
  [ -z "$arquivo$entrada" ] && { [ -z "$recuperacao" ] || [ -z "$diagnostico" ]; } || erro "Selecione somente um modo de restauração."
elif [ -n "$arquivo" ] && [ -n "$entrada" ]; then
  erro "Selecione somente uma fonte de restauração: --arquivo ou --entrada -."
elif [ -z "$arquivo" ] && [ -z "$entrada" ]; then
  uso
  erro "Informe --arquivo ou --entrada -."
fi

carregar_ambiente
travar restauracao 0

BACKUP_MODO="${BACKUP_MODO:-compose}"
BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL:-${DIRECT_URL:-}}"
BACKUP_RESTAURACAO_URL_VALIDACAO="${BACKUP_RESTAURACAO_URL_VALIDACAO:-}"
GPG_CHAVE_PRIVADA="${BACKUP_GPG_CHAVE_PRIVADA:-}"
AGE_CHAVE_PRIVADA="${BACKUP_AGE_CHAVE_PRIVADA:-}"
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"
RESTAURAR_TIMEOUT_SAUDE="${RESTAURAR_TIMEOUT_SAUDE:-180}"
RESTAURAR_SAUDE_TENTATIVAS="${RESTAURAR_SAUDE_TENTATIVAS:-12}"
RESTAURAR_MANTER_ANTERIOR="${RESTAURAR_MANTER_ANTERIOR:-true}"

if [ -z "${RESTAURAR_SAUDE_URL:-}" ] && [ -n "${DOMINIO:-}" ] &&
  [ "${RESTAURAR_VERIFICAR_SAUDE_PUBLICA:-true}" = "true" ]; then
  RESTAURAR_SAUDE_URL="https://${DOMINIO}/api/saude"
fi

case "$BACKUP_MODO" in
  compose)
    [ "$sem_validacao" = false ] || erro "--sem-validacao só é aceito no modo URL."
    verificar_instalacao
    ;;
  url)
    [ -n "$BACKUP_DATABASE_URL" ] || erro "Defina BACKUP_DATABASE_URL ou DIRECT_URL."
    if [ "$sem_validacao" = false ]; then
      erro "A validação URL pré-provisionada está indisponível sem prova de identidade e ownership. A comparação textual de URLs não autoriza limpeza. Use validação isolada externa; --sem-validacao continua sendo decisão explícita de risco."
    fi
    ;;
  *)
    erro "BACKUP_MODO inválido: $BACKUP_MODO."
    ;;
esac


tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-restauracao.XXXXXX")
umask 077
dump="$tmp/dump"
estado_restauracao="$ESTADO_DIR/ultima-restauracao.json"
usuario="${POSTGRES_USER:-frequencia}"
banco="${POSTGRES_DB:-frequencia}"
temp_criado=false
app_parada=false
banco_anterior=""
diario=""
fase=""
concluida=false

catalogo_bancos() {
  compose exec -T "$SERVIDOR_SERVICO_DB" psql -X -q -U "$usuario" -d postgres -v ON_ERROR_STOP=1 -tA <<'SQL'
-- restauracao:catalogo
select coalesce(json_agg(json_build_object('oid',oid::bigint,'nome',datname) order by oid),'[]'::json) from pg_database;
SQL
}

reconciliar_troca() {
  local catalogo
  catalogo=$(catalogo_bancos) || return 1
  fase=$(printf '%s\n' "$catalogo" | node "$DIR/restauracao.mjs" reconciliar "$diario") || return 1
}

intencao_troca() {
  node "$DIR/restauracao.mjs" intencao "$diario" "$1"
}

renomear_banco() {
  local oid="$1" origem="$2" destino="$3"
  compose exec -T "$SERVIDOR_SERVICO_DB" psql -X -q -U "$usuario" -d postgres \
    -v ON_ERROR_STOP=1 -v oid="$oid" -v origem="$origem" -v destino="$destino" <<'SQL'
-- restauracao:renomear
select pg_terminate_backend(pid) from pg_stat_activity
 where datid=:'oid'::oid and pid<>pg_backend_pid();
select format('ALTER DATABASE %I RENAME TO %I',datname,:'destino')
 from pg_database where oid=:'oid'::oid and datname=:'origem'
\gexec
SQL
}

recuperar_original() {
  reconciliar_troca || return 1
  if [ "$fase" = substituto-promovido ]; then
    intencao_troca isolar-substituto || return 1
    renomear_banco "$substituto_oid" "$banco" "$banco_falha" || true
    reconciliar_troca || return 1
    [ "$fase" = substituto-isolado ] || return 1
  fi
  if [ "$fase" = original-renomeado ] || [ "$fase" = substituto-isolado ]; then
    intencao_troca recuperar-original || return 1
    renomear_banco "$original_oid" "$banco_anterior" "$banco" || true
    reconciliar_troca || return 1
  fi
  [ "$fase" = validado ] || [ "$fase" = recuperacao-concluida ] || return 1
  node "$DIR/restauracao.mjs" finalizar "$diario" recuperado
}

escrever_estado_restauracao() {
  local status="$1"
  local motivo="$2"
  mkdir -p "$ESTADO_DIR"
  printf '{"em":"%s","status":"%s","modo":"%s","arquivo":"%s","motivo":"%s","bancoAnterior":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" "$BACKUP_MODO" \
    "${nome_dump:-}" "$motivo" "$banco_anterior" >"$estado_restauracao.tmp"
  mv "$estado_restauracao.tmp" "$estado_restauracao"
  chmod 600 "$estado_restauracao"
}

consultar_alvo() {
  local alvo="$1"
  local sql="$2"
  if [ "$BACKUP_MODO" = "compose" ]; then
    printf '%s\n' "$sql" | compose exec -T "$SERVIDOR_SERVICO_DB" psql -X -q \
      -U "$usuario" -d "$alvo" -v ON_ERROR_STOP=1 -v schema="$DATABASE_SCHEMA" -tA
  else
    printf '%s\n' "$sql" | psql "$alvo" -X -q -v ON_ERROR_STOP=1 -v schema="$DATABASE_SCHEMA" -tA
  fi
}

validar_escopo_alvo() {
  local alvo="$1" modo="${2:-integral}" inventario sql
  sql=$(cat <<'SQL'
-- restauracao:inventario
with namespaces as (
 select oid,nspname from pg_namespace
 where nspname !~ '^pg_' and nspname<>'information_schema'
), objetos as (
 select distinct n.nspname as schema, (pg_identify_object(d.classid,d.objid,d.objsubid)).type as tipo
 from pg_depend d join namespaces n on d.refclassid='pg_namespace'::regclass and d.refobjid=n.oid
), dependencias as (
 select d.*, (pg_identify_object(d.classid,d.objid,d.objsubid)).schema as origem,
 (pg_identify_object(d.refclassid,d.refobjid,d.refobjsubid)).schema as destino
 from pg_depend d
), externas as (
 select * from dependencias
 where (origem=:'schema' and destino is not null and destino<>:'schema' and destino !~ '^pg_' and destino<>'information_schema')
 or (destino=:'schema' and origem is not null and origem<>:'schema' and origem !~ '^pg_' and origem<>'information_schema')
 or (origem=:'schema' and destino is null and refobjid>=16384 and refclassid not in ('pg_namespace'::regclass))
)
select json_build_object('versao',1,
 'schemas',(select coalesce(json_agg(nspname order by nspname),'[]'::json) from namespaces),
 'objetos',(select coalesce(json_agg(objetos),'[]'::json) from objetos),
 'extensoes',(select coalesce(json_agg(extname order by extname),'[]'::json) from pg_extension),
 'largeObjects',(select count(*) from pg_largeobject_metadata),
 'dependenciasExternas',(select count(*) from externas),
 'globais', (select count(*) from pg_foreign_server)+(select count(*) from pg_event_trigger)
 +(select count(*) from pg_publication)+(select count(*) from pg_subscription)
 +(select count(*) from pg_default_acl)+(select count(*) from pg_seclabel)
 +(select count(*) from pg_cast where oid>=16384)
 +(select count(*) from pg_language where lanname not in ('internal','c','sql','plpgsql'))
 +(select count(*) from pg_db_role_setting where setdatabase=(select oid from pg_database where datname=current_database())));
SQL
)
  inventario=$(consultar_alvo "$alvo" "$sql") || erro "Consulta do inventário falhou; nenhuma troca autorizada."
  printf '%s\n' "$inventario" | node "$DIR/restauracao-escopo.mjs" "$DATABASE_SCHEMA" "$modo" || erro "Escopo não suportado; nenhum objeto adicional será apagado."
}

restaurar_em_alvo() {
  local alvo="$1"
  local opcoes=(
    --clean --if-exists --no-owner --no-acl
    --single-transaction --exit-on-error
  )
  if [ "$BACKUP_MODO" = "compose" ]; then
    compose exec -T "$SERVIDOR_SERVICO_DB" pg_restore -U "$usuario" -d "$alvo" \
      "${opcoes[@]}" <"$dump"
  else
    pg_restore -d "$alvo" --schema="$DATABASE_SCHEMA" --strict-names "${opcoes[@]}" <"$dump"
  fi
}

validar_dump() {
  [ -s "$dump" ] || erro "O dump está vazio."
  if [ "$BACKUP_MODO" = "compose" ]; then
    compose exec -T "$SERVIDOR_SERVICO_DB" pg_restore -l <"$dump" >/dev/null ||
      erro "O dump não passou na validação do pg_restore."
  else
    pg_restore -l "$dump" >/dev/null ||
      erro "O dump não passou na validação do pg_restore."
  fi
}

validar_banco_restaurado() {
  local alvo="$1"
  local migracoes
  local tabelas
  local esperadas
  local restauradas

  migracoes=$(consultar_alvo "$alvo" \
    'select count(*) from :"schema"._prisma_migrations' 2>/dev/null | tr -d '[:space:]' || true)
  [ -n "$migracoes" ] && [ "$migracoes" -gt 0 ] ||
    erro "O banco restaurado não contém o histórico de migrações."
  tabelas=$(consultar_alvo "$alvo" \
    "select count(*) from information_schema.tables where table_schema = :'schema'" \
    2>/dev/null | tr -d '[:space:]' || true)
  [ -n "$tabelas" ] && [ "$tabelas" -gt 0 ] ||
    erro "O banco restaurado não contém tabelas no schema $DATABASE_SCHEMA."

  esperadas=$(find "$APP_DIR/prisma/migrations" -mindepth 1 -maxdepth 1 -type d \
    -printf '%f\n' 2>/dev/null | sort || true)
  restauradas=$(consultar_alvo "$alvo" \
    'select migration_name from :"schema"._prisma_migrations where rolled_back_at is null order by migration_name' \
    2>/dev/null | sed '/^[[:space:]]*$/d' | sort || true)
  if [ -n "$esperadas" ] && [ "$esperadas" != "$restauradas" ]; then
    log "Aviso: as migrações do dump diferem das migrações do checkout."
  fi
  log "Banco validado com $migracoes migração(ões) e $tabelas tabela(s)."
}

limpar_restauracao() {
  local status=$?
  set +e
  if [ "$status" -ne 0 ] && [ -n "$diario" ] && [ "$concluida" = false ]; then
    # Mesmo uma resposta SQL perdida exige leitura do catálogo, nunca flags locais.
    local pode_recuperar=true
    if [ "$app_parada" = true ] && [ "$aplicacao_parada" = false ]; then
      compose stop "$SERVIDOR_SERVICO_APP" >/dev/null || pode_recuperar=false
    fi
    if [ "$pode_recuperar" = true ] && recuperar_original; then
      log "Original recuperado por OID; substituto preservado."
      if [ "$app_parada" = true ] && [ "$aplicacao_parada" = false ]; then
        compose up -d --wait --no-build --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP" || {
          node "$DIR/restauracao.mjs" finalizar "$diario" recuperacao-pendente
          log "Original recuperado, mas a aplicação não foi religada."
        }
      fi
    else
      node "$DIR/restauracao.mjs" finalizar "$diario" recuperacao-pendente
      log "Recuperação não confirmada. Preservar bancos e diário $diario; não religar automaticamente."
    fi
  elif [ "$status" -ne 0 ] && [ -z "$diario" ]; then
    escrever_estado_restauracao falha "Restauração interrompida antes da troca."
  fi
  # Não apagar bancos no trap: preservar original, substituto e evidência de criação incerta.
  rm -rf "$tmp"
  if [ "$status" -ne 0 ]; then notificar falha "Restauração do banco falhou."; fi
  return "$status"
}
if [ -n "$recuperacao$diagnostico" ]; then
  [ "$BACKUP_MODO" = compose ] || erro "Reentrada de troca exige modo Compose."
  id_diario="${recuperacao:-$diagnostico}"
  [[ "$id_diario" =~ ^[a-f0-9]{32}\.json$ ]] || erro "Informe o identificador exato do diário, sem caminho."
  diario="$ESTADO_DIR/restauracoes/$id_diario"
  [ "$(node "$DIR/restauracao.mjs" campo "$diario" alvo)" = "$SERVIDOR_ALVO_CHAVE" ] || erro "O diário pertence a outro alvo."
  if [ -n "$diagnostico" ]; then
    catalogo=$(catalogo_bancos) || erro "Catálogo indisponível."
    printf '%s\n' "$catalogo" | node "$DIR/restauracao.mjs" diagnosticar "$diario"
    rm -rf "$tmp"
    exit 0
  fi
  [ "$(node "$DIR/restauracao.mjs" campo "$diario" status)" != sucesso ] || erro "Operação concluída não é recuperação pendente."
  banco=$(node "$DIR/restauracao.mjs" campo "$diario" ativo)
  banco_temp=$(node "$DIR/restauracao.mjs" campo "$diario" temporario)
  banco_anterior=$(node "$DIR/restauracao.mjs" campo "$diario" anterior)
  banco_falha=$(node "$DIR/restauracao.mjs" campo "$diario" falha)
  original_oid=$(node "$DIR/restauracao.mjs" campo "$diario" originalOid)
  substituto_oid=$(node "$DIR/restauracao.mjs" campo "$diario" substitutoOid)
  gerenciar_app=$(node "$DIR/restauracao.mjs" campo "$diario" gerenciarApp)
  reconciliar_troca || erro "Catálogo ambíguo. Preservar todos os bancos."
  if [ "$gerenciar_app" = true ]; then
    intencao_troca parar-para-recuperar
    compose stop "$SERVIDOR_SERVICO_APP" >/dev/null || erro "Parada não confirmada."
  fi
  if ! recuperar_original; then
    node "$DIR/restauracao.mjs" finalizar "$diario" recuperacao-pendente
    erro "Recuperação não confirmada; preservar diário e bancos."
  fi
  if [ "$gerenciar_app" = true ]; then
    compose up -d --wait --no-build --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP" || {
      node "$DIR/restauracao.mjs" finalizar "$diario" recuperacao-pendente
      erro "Original recuperado, aplicação ainda parada."
    }
  fi
  rm -rf "$tmp"
  log "Recuperação explícita confirmada por OIDs; bancos preservados."
  exit 0
fi
if [ "$BACKUP_MODO" = compose ]; then
  node "$DIR/restauracao.mjs" pendentes "$ESTADO_DIR/restauracoes" "$SERVIDOR_ALVO_CHAVE" || erro "Resolver a operação pendente antes de outra restauração."
fi
trap 'limpar_restauracao' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

node "$DIR/restauracao-escopo.mjs" entrada "$arquivo" "$DATABASE_SCHEMA" "$escopo_legado" || erro "Escopo da entrada não confirmado."

if [ -n "$entrada" ] && [ "$entrada" = "-" ]; then
  log "Lendo dump decifrado da entrada padrão."
  cat >"$dump"
else
  [ -f "$arquivo" ] || erro "Arquivo não encontrado: $arquivo"
  nome_dump=$(basename "$arquivo")
  if [ -f "$arquivo.sha256" ]; then
    log "Conferindo o checksum do arquivo."
    (cd "$(dirname "$arquivo")" && sha256sum -c "$(basename "$arquivo").sha256" >/dev/null) ||
      erro "O checksum não confere."
  fi
  case "$arquivo" in
    *.gpg)
      log "Decifrando com GPG."
      if [ -n "$GPG_CHAVE_PRIVADA" ]; then
        [ -f "$GPG_CHAVE_PRIVADA" ] || erro "Chave privada GPG não encontrada."
        export GNUPGHOME="$tmp/gnupg"
        mkdir -m 700 "$GNUPGHOME"
        gpg --batch --import "$GPG_CHAVE_PRIVADA" >/dev/null ||
          erro "Não foi possível importar a chave privada GPG."
      fi
      gpg --batch --yes --output "$dump" --decrypt "$arquivo" ||
        erro "Não foi possível decifrar o dump com GPG."
      ;;
    *.age)
      log "Decifrando com age."
      [ -n "$AGE_CHAVE_PRIVADA" ] || erro "Defina BACKUP_AGE_CHAVE_PRIVADA para decifrar arquivos age."
      age --decrypt -i "$AGE_CHAVE_PRIVADA" -o "$dump" "$arquivo" ||
        erro "Não foi possível decifrar o dump com age."
      ;;
    *)
      cp "$arquivo" "$dump"
      ;;
  esac
fi

validar_dump

if [ "$BACKUP_MODO" = "compose" ]; then
  validar_escopo_alvo "$banco" integral
  [ "$RESTAURAR_MANTER_ANTERIOR" = true ] || erro "A restauração recuperável exige RESTAURAR_MANTER_ANTERIOR=true. O descarte precisa de revisão explícita dos OIDs após o aceite."
  banco_temp="${banco}_restauracao_$(date -u +%Y%m%dT%H%M%SZ)_$$"
  banco_anterior="${banco}_anterior_$(date -u +%Y%m%dT%H%M%SZ)_$$"
  log "Criando o banco descartável $banco_temp."
  compose exec -T "$SERVIDOR_SERVICO_DB" createdb -U "$usuario" -O "$usuario" "$banco_temp"
  temp_criado=true

  log "Restaurando e validando o dump no banco descartável."
  restaurar_em_alvo "$banco_temp"
  validar_banco_restaurado "$banco_temp"
  validar_escopo_alvo "$banco_temp" integral

  if [ "$fazer_copia" = true ]; then
    log "Criando uma cópia de segurança antes da restauração."
    if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
      erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
    fi
  fi

  catalogo=$(catalogo_bancos) || erro "Não foi possível identificar os bancos."
  mkdir -p "$ESTADO_DIR/restauracoes"
  chmod 700 "$ESTADO_DIR/restauracoes"
  banco_falha="${banco}_falha_$(date -u +%Y%m%dT%H%M%SZ)_$$"
  diario="$ESTADO_DIR/restauracoes/$(node -e 'process.stdout.write(require("node:crypto").randomBytes(16).toString("hex"))').json"
  printf '%s\n' "$catalogo" | node "$DIR/restauracao.mjs" iniciar "$diario" "$SERVIDOR_ALVO_CHAVE" \
    "$banco" "$banco_temp" "$banco_anterior" "$banco_falha" "$([ "$aplicacao_parada" = false ] && printf true || printf false)" || erro "Não foi possível persistir a intenção de troca."
  original_oid=$(node "$DIR/restauracao.mjs" campo "$diario" originalOid)
  substituto_oid=$(node "$DIR/restauracao.mjs" campo "$diario" substitutoOid)
  intencao_troca parar-aplicacao
  app_parada=true
  if [ "$aplicacao_parada" = false ]; then
    log "Parando a aplicação para trocar o banco."
    compose stop "$SERVIDOR_SERVICO_APP" >/dev/null
  fi

  log "Trocando o banco validado pelo banco em uso."
  validar_escopo_alvo "$banco" integral
  intencao_troca renomear-original
  renomear_banco "$original_oid" "$banco" "$banco_anterior"
  reconciliar_troca
  [ "$fase" = original-renomeado ] || erro "Primeira renomeação não confirmada."
  intencao_troca promover-substituto
  renomear_banco "$substituto_oid" "$banco_temp" "$banco"
  reconciliar_troca
  [ "$fase" = substituto-promovido ] || erro "Promoção não confirmada."
  temp_criado=false

  log "Subindo a aplicação."
  intencao_troca subir-aplicacao
  if [ "$aplicacao_parada" = false ]; then
    compose up -d --wait --no-build --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP"
  fi

  if [ -n "${RESTAURAR_SAUDE_URL:-}" ]; then
    log "Conferindo $RESTAURAR_SAUDE_URL."
    curl -fsS --retry "$RESTAURAR_SAUDE_TENTATIVAS" --retry-delay 5 --retry-all-errors \
      --max-time 15 "$RESTAURAR_SAUDE_URL" >/dev/null ||
      erro "A saúde pública não respondeu após a restauração."
  fi
  reconciliar_troca
  [ "$fase" = substituto-promovido ] || erro "Estado final de promoção divergiu."
  node "$DIR/restauracao.mjs" finalizar "$diario" sucesso
  concluida=true
  app_parada=false
  log "Restauração concluída. O banco anterior permanece como $banco_anterior."
  log "O diário $diario preserva OIDs e nomes para conferência explícita antes de qualquer descarte."
else
  validar_escopo_alvo "$BACKUP_DATABASE_URL" limitado
  if [ "$fazer_copia" = true ]; then
    log "Criando uma cópia de segurança antes da restauração."
    if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
      erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
    fi
  fi

  log "A validação em banco descartável foi dispensada explicitamente por --sem-validacao."

  log "Restaurando o dump na URL de destino."
  restaurar_em_alvo "$BACKUP_DATABASE_URL"
  validar_banco_restaurado "$BACKUP_DATABASE_URL"
  validar_escopo_alvo "$BACKUP_DATABASE_URL" limitado
  escrever_estado_restauracao "sucesso" ""
  log "Restauração concluída. Confira a aplicação externa, /api/saude, o login e as migrações."
fi
