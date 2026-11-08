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
  restaurar.sh --entrada - --confirmar [--sem-copia] [--aplicacao-parada]

No modo URL, informe BACKUP_RESTAURACAO_URL_VALIDACAO para validar em um banco
descartável. A opção --sem-validacao só é aceita nesse modo e assume o risco de
substituir o banco sem o ensaio prévio.
TEXTO
}

arquivo=""
entrada=""
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

if [ -z "$arquivo" ] && [ -z "$entrada" ]; then
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
    if [ "$sem_validacao" = false ] && [ -z "$BACKUP_RESTAURACAO_URL_VALIDACAO" ]; then
      erro "Defina BACKUP_RESTAURACAO_URL_VALIDACAO ou use --sem-validacao com decisão explícita."
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
banco_trocado=false
app_parada=false
banco_anterior=""

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
    printf '%s\n' "$sql" | compose exec -T "$SERVIDOR_SERVICO_DB" psql \
      -U "$usuario" -d "$alvo" -v schema="$DATABASE_SCHEMA" -tA
  else
    printf '%s\n' "$sql" | psql "$alvo" -v schema="$DATABASE_SCHEMA" -tA
  fi
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
    pg_restore -d "$alvo" "${opcoes[@]}" <"$dump"
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
  if [ "$status" -ne 0 ] && [ "$banco_trocado" = true ]; then
    log "Falha após a troca de banco; tentando voltar ao banco anterior."
    banco_falha="${banco}_falha_$(date -u +%Y%m%dT%H%M%SZ)_$$"
    if compose exec -T "$SERVIDOR_SERVICO_DB" psql -U "$usuario" -d postgres \
      -v ON_ERROR_STOP=1 -v banco="$banco" -v anterior="$banco_anterior" \
      -v falha="$banco_falha" <<'SQL'
select pg_terminate_backend(pid) from pg_stat_activity
 where datname in (:'banco', :'anterior') and pid <> pg_backend_pid();
alter database :"banco" rename to :"falha";
alter database :"anterior" rename to :"banco";
SQL
    then
      banco_trocado=false
      banco_anterior="$banco_falha"
    else
      log "A volta ao banco anterior também falhou."
    fi
  fi
  if [ "$status" -ne 0 ] && [ "$app_parada" = true ]; then
    compose up -d --wait --no-build --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" \
      "$SERVIDOR_SERVICO_APP" || log "Não foi possível religar a aplicação."
  fi
  if [ "$temp_criado" = true ] && [ "$banco_trocado" = false ]; then
    compose exec -T "$SERVIDOR_SERVICO_DB" dropdb -U "$usuario" --force "$banco_temp" \
      >/dev/null 2>&1 || true
  fi
  rm -rf "$tmp"
  if [ "$status" -ne 0 ]; then
    escrever_estado_restauracao "falha" "Restauração interrompida." ||
      log "Não foi possível gravar o estado da restauração."
    notificar falha "Restauração do banco falhou."
  fi
}
trap 'limpar_restauracao' EXIT

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
  banco_temp="${banco}_restauracao_$(date -u +%Y%m%dT%H%M%SZ)_$$"
  banco_anterior="${banco}_anterior_$(date -u +%Y%m%dT%H%M%SZ)_$$"
  log "Criando o banco descartável $banco_temp."
  compose exec -T "$SERVIDOR_SERVICO_DB" createdb -U "$usuario" -O "$usuario" "$banco_temp"
  temp_criado=true

  log "Restaurando e validando o dump no banco descartável."
  restaurar_em_alvo "$banco_temp"
  validar_banco_restaurado "$banco_temp"

  if [ "$fazer_copia" = true ]; then
    log "Criando uma cópia de segurança antes da restauração."
    if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
      erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
    fi
  fi

  if [ "$aplicacao_parada" = false ]; then
    log "Parando a aplicação para trocar o banco."
    compose stop "$SERVIDOR_SERVICO_APP" >/dev/null
  fi
  app_parada=true

  log "Trocando o banco validado pelo banco em uso."
  compose exec -T "$SERVIDOR_SERVICO_DB" psql -U "$usuario" -d postgres \
    -v ON_ERROR_STOP=1 -v banco="$banco" -v temp="$banco_temp" -v anterior="$banco_anterior" <<'SQL'
select pg_terminate_backend(pid) from pg_stat_activity
 where datname in (:'banco', :'temp') and pid <> pg_backend_pid();
alter database :"banco" rename to :"anterior";
alter database :"temp" rename to :"banco";
SQL
  banco_trocado=true
  temp_criado=false

  log "Subindo a aplicação."
  compose up -d --wait --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP"

  if [ -n "${RESTAURAR_SAUDE_URL:-}" ]; then
    log "Conferindo $RESTAURAR_SAUDE_URL."
    curl -fsS --retry "$RESTAURAR_SAUDE_TENTATIVAS" --retry-delay 5 --retry-all-errors \
      --max-time 15 "$RESTAURAR_SAUDE_URL" >/dev/null ||
      erro "A saúde pública não respondeu após a restauração."
  fi
  app_parada=false

  escrever_estado_restauracao "sucesso" "" ||
    log "Não foi possível gravar o estado da restauração."
  log "Restauração concluída. O banco anterior permanece como $banco_anterior."
  if [ "$RESTAURAR_MANTER_ANTERIOR" = "false" ]; then
    if compose exec -T "$SERVIDOR_SERVICO_DB" dropdb -U "$usuario" --force "$banco_anterior" >/dev/null; then
      log "O banco anterior foi descartado por RESTAURAR_MANTER_ANTERIOR=false."
      banco_trocado=false
    else
      log "Aviso: não foi possível descartar o banco anterior $banco_anterior."
    fi
  else
    log "Após conferir login, saúde e migrações, remova o banco anterior com:"
    log "  scripts/servidor/compose.sh exec -T db dropdb -U $usuario --force $banco_anterior"
  fi
else
  if [ "$fazer_copia" = true ]; then
    log "Criando uma cópia de segurança antes da restauração."
    if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
      erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
    fi
  fi

  if [ "$sem_validacao" = false ]; then
    log "Validando o dump no banco descartável configurado."
    if [ "$BACKUP_RESTAURACAO_URL_VALIDACAO" = "$BACKUP_DATABASE_URL" ]; then
      erro "A URL de validação precisa ser diferente da URL de destino."
    fi
    restaurar_url="$BACKUP_RESTAURACAO_URL_VALIDACAO"
    pg_restore -d "$restaurar_url" --clean --if-exists --no-owner --no-acl \
      --single-transaction --exit-on-error <"$dump"
    validar_banco_restaurado "$restaurar_url"
  else
    log "A validação em banco descartável foi dispensada por --sem-validacao."
  fi

  log "Restaurando o dump na URL de destino."
  pg_restore -d "$BACKUP_DATABASE_URL" --clean --if-exists --no-owner --no-acl \
    --single-transaction --exit-on-error <"$dump"
  validar_banco_restaurado "$BACKUP_DATABASE_URL"
  escrever_estado_restauracao "sucesso" ""
  log "Restauração concluída. Confira a aplicação externa, /api/saude, o login e as migrações."
fi
