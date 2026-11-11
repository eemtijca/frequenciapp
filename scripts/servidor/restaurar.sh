#!/usr/bin/env bash
# Restaura um dump do banco em um ambiente controlado.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

uso() {
  cat <<'TEXTO'
Uso:
  restaurar.sh --arquivo CAMINHO --confirmar [--checksum SHA256] [--sem-copia] [--aplicacao-parada]
  restaurar.sh --entrada - --checksum SHA256 --confirmar [--sem-copia] [--aplicacao-parada]

O checksum é obrigatório: use o arquivo .sha256 ao lado do dump ou informe
--checksum com o SHA-256 do arquivo ou do dump recebido na entrada padrão.

No modo URL, BACKUP_RESTAURACAO_PERFIL=postgres-direto exige PostgreSQL 17 direto
com CREATEDB e cria seu próprio banco de ensaio. URLs de validação externas são
recusadas. --sem-validacao dispensa explicitamente o ensaio e assume esse risco.
A entrada padrão materializa texto claro em diretório temporário privado.
Chave GPG protegida deve ser decifrada externamente em estação autorizada;
--entrada - recebe esse dump, sem enviar chave privada ou passphrase ao servidor.
TEXTO
}

arquivo=""
entrada=""
checksum_esperado=""
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
    --checksum)
      checksum_esperado="${2:-}"
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
BACKUP_MODO="${BACKUP_MODO:-compose}"
# Somente o perfil direto suportado pode criar um ensaio próprio. Uma URL
# externa, mesmo diferente, nunca é autoridade para destruir um banco de ensaio.
if [ "$BACKUP_MODO" = url ] && [ "$sem_validacao" = false ]; then
  BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL:-${DIRECT_URL:-}}" \
    node "$DIR/restauracao-url.mjs" perfil || exit "$?"
fi
carregar_imagens_do_estado

BACKUP_DATABASE_URL="${BACKUP_DATABASE_URL:-${DIRECT_URL:-}}"
BACKUP_RESTAURACAO_URL_VALIDACAO="${BACKUP_RESTAURACAO_URL_VALIDACAO:-}"
GPG_CHAVE_PRIVADA="${BACKUP_GPG_CHAVE_PRIVADA:-}"
AGE_CHAVE_PRIVADA="${BACKUP_AGE_CHAVE_PRIVADA:-}"
DATABASE_SCHEMA="${DATABASE_SCHEMA:-public}"
RESTAURAR_TIMEOUT_SAUDE="${RESTAURAR_TIMEOUT_SAUDE:-180}"

if [ -n "${DATABASE_URL:-}${DIRECT_URL:-}${BACKUP_DATABASE_URL:-}" ]; then
  node "$APP_DIR/scripts/servidor/validar-banco.mjs" || erro "A identidade do banco não confere."
fi
RESTAURAR_SAUDE_TENTATIVAS="${RESTAURAR_SAUDE_TENTATIVAS:-12}"
RESTAURAR_SAUDE_CA="${RESTAURAR_SAUDE_CA:-}"
RESTAURAR_MANTER_ANTERIOR="${RESTAURAR_MANTER_ANTERIOR:-true}"
RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES="${RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES:-false}"

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
    ;;
  *)
    erro "BACKUP_MODO inválido: $BACKUP_MODO."
    ;;
esac

if [ "$BACKUP_MODO" = url ]; then SERVIDOR_ALVO_CHAVE=url-conservador; fi
travar restauracao 0

tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-restauracao.XXXXXX")
umask 077
dump="$tmp/dump"
estado_restauracao="$ESTADO_DIR/ultima-restauracao.json"
estado_backup="$ESTADO_DIR/ultimo-backup.json"
BACKUP_BANCO_DIR="${BACKUP_BANCO_DIR:-$BACKUP_DIR/banco}"
backup_seguranca=""
usuario="${POSTGRES_USER:-frequencia}"
banco="${POSTGRES_DB:-frequencia}"
temp_criado=false
banco_trocado=false
restauracao_destino_iniciada=false
app_parada=false
banco_anterior=""

escrever_estado_restauracao() {
  local status="$1"
  local motivo="$2"
  mkdir -p "$ESTADO_DIR"
  node - "$status" "$BACKUP_MODO" "${nome_dump:-}" "$motivo" "$banco_anterior" \
    "$restauracao_destino_iniciada" >"$estado_restauracao.tmp" <<'NODE'
const [status, modo, arquivo, motivo, bancoAnterior, iniciado] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  em: new Date().toISOString(), status, modo, arquivo, motivo, bancoAnterior,
  destinoEscritaIniciada: iniciado === "true",
  resultadoIncerto: status !== "sucesso" && iniciado === "true",
}) + "\n");
NODE
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
    -exec basename {} \; 2>/dev/null | sort || true)
  restauradas=$(consultar_alvo "$alvo" \
    'select migration_name from :"schema"._prisma_migrations where rolled_back_at is null order by migration_name' \
    2>/dev/null | sed '/^[[:space:]]*$/d' | sort || true)
  if [ -n "$esperadas" ] && [ "$esperadas" != "$restauradas" ]; then
    if [ "$RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES" = "true" ]; then
      log "Aviso: as migrações do dump diferem das migrações do checkout; divergência permitida explicitamente."
    else
      quantidade=$(printf '%s\n' "$restauradas" | sed '/^[[:space:]]*$/d' | wc -l | tr -d '[:space:]')
      prefixo=$(printf '%s\n' "$esperadas" | head -n "$quantidade")
      if [ "$prefixo" != "$restauradas" ]; then
        erro "As migrações do dump divergem do checkout. A restauração exige um dump compatível ou RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true com decisão explícita."
      fi
      log "O dump está em uma revisão anterior; as migrações pendentes serão aplicadas na subida."
    fi
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
select set_config('restauracao.banco', :'banco', false),
       set_config('restauracao.anterior', :'anterior', false),
       set_config('restauracao.falha', :'falha', false);
do $$
declare
  v_banco text := current_setting('restauracao.banco');
  v_anterior text := current_setting('restauracao.anterior');
  v_falha text := current_setting('restauracao.falha');
  v_tem_banco boolean;
  v_tem_anterior boolean;
  v_tem_falha boolean;
begin
  select exists(select 1 from pg_database where datname = v_banco) into v_tem_banco;
  select exists(select 1 from pg_database where datname = v_anterior) into v_tem_anterior;
  select exists(select 1 from pg_database where datname = v_falha) into v_tem_falha;
  if v_tem_falha then
    raise exception 'O banco de falha % já existe.', v_falha;
  end if;
  if not v_tem_banco and not v_tem_anterior then
    raise exception 'Nem o banco % nem o anterior % existem.', v_banco, v_anterior;
  end if;
  perform pg_terminate_backend(pid) from pg_stat_activity
   where datname in (v_banco, v_anterior) and pid <> pg_backend_pid();
  if not v_tem_banco and v_tem_anterior then
    execute format('alter database %I rename to %I', v_anterior, v_banco);
  elsif v_tem_banco and v_tem_anterior then
    execute format('alter database %I rename to %I', v_banco, v_falha);
    execute format('alter database %I rename to %I', v_anterior, v_banco);
  end if;
end $$;
SQL
    then
      banco_trocado=false
      banco_anterior=""
      log "O banco anterior voltou ao nome $banco. A cópia restaurada, se existir, é $banco_falha."
    else
      log "A volta ao banco anterior também falhou."
    fi
  fi
  if [ "$status" -ne 0 ] && [ "$app_parada" = true ]; then
    compose up -d --wait --no-build --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" \
      "$SERVIDOR_SERVICO_APP" || log "Não foi possível religar a aplicação."
  fi
  if [ "$status" -ne 0 ] && [ "$BACKUP_MODO" = "url" ] &&
    [ "$restauracao_destino_iniciada" = true ]; then
    log "Resultado da restauração URL incerto; intervenção manual necessária. Cópia indicada: ${backup_seguranca:-não identificada}."
  fi
  if [ "$temp_criado" = true ] && [ "$banco_trocado" = false ]; then
    compose exec -T "$SERVIDOR_SERVICO_DB" dropdb -U "$usuario" --force "$banco_temp" \
      >/dev/null 2>&1 || true
  fi
  limpar_home_gpg
  rm -rf "$tmp"
  if [ "$status" -ne 0 ]; then
    escrever_estado_restauracao "falha" "Restauração interrompida." ||
      log "Não foi possível gravar o estado da restauração."
    notificar falha "Restauração do banco falhou."
  fi
}
trap 'limpar_restauracao' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [ -n "$entrada" ] && [ "$entrada" = "-" ]; then
  if [ -z "$checksum_esperado" ]; then
    erro "A entrada padrão exige --checksum SHA256."
  fi
  case "$checksum_esperado" in
    *[!0-9a-f]* | "") erro "O checksum deve ter 64 caracteres hexadecimais." ;;
  esac
  [ "${#checksum_esperado}" -eq 64 ] || erro "O checksum deve ter 64 caracteres hexadecimais."
  log "Lendo dump decifrado da entrada padrão."
  cat >"$dump"
  calculado=$(sha256sum "$dump" | cut -d' ' -f1)
  [ "$calculado" = "$checksum_esperado" ] || erro "O checksum da entrada padrão não confere."
else
  [ -f "$arquivo" ] || erro "Arquivo não encontrado: $arquivo"
  nome_dump=$(basename "$arquivo")
  [ -f "$arquivo.sha256" ] || [ -n "$checksum_esperado" ] ||
    erro "Checksum não encontrado. Informe --checksum SHA256 ou mantenha o arquivo .sha256 ao lado do dump."
  # A cópia privada é a fonte tanto do hash quanto da decifra/restauração.
  # Não reabrir o caminho fornecido após a verificação.
  arquivo_capturado="$tmp/arquivo-capturado"
  cat -- "$arquivo" >"$arquivo_capturado" || erro "Não foi possível copiar o arquivo de entrada."
  calculado=$(sha256sum <"$arquivo_capturado" | cut -d' ' -f1)
  if [ -f "$arquivo.sha256" ]; then
    log "Conferindo o checksum do arquivo."
    checksum_sidecar=$(sha256sum "$arquivo.sha256" | cut -d' ' -f1)
    checksum_linha=$(printf '%s  %s\n' "$calculado" "$nome_dump" | sha256sum | cut -d' ' -f1)
    [ "$checksum_sidecar" = "$checksum_linha" ] ||
      erro "O checksum não confere com o arquivo solicitado."
  fi
  if [ -n "$checksum_esperado" ]; then
    case "$checksum_esperado" in
      *[!0-9a-f]* | "") erro "O checksum deve ter 64 caracteres hexadecimais." ;;
    esac
    [ "${#checksum_esperado}" -eq 64 ] || erro "O checksum deve ter 64 caracteres hexadecimais."
    [ "$calculado" = "$checksum_esperado" ] || erro "O checksum do arquivo não confere."
  fi
  case "$arquivo" in
    *.gpg)
      log "Decifrando com GPG."
      if [ -n "$GPG_CHAVE_PRIVADA" ]; then
        [ -f "$GPG_CHAVE_PRIVADA" ] || erro "Chave privada GPG não encontrada."
        iniciar_home_gpg
        gpg --batch --import "$GPG_CHAVE_PRIVADA" >/dev/null ||
          erro "Não foi possível importar a chave privada GPG."
      else
        erro "A decifra nativa exige BACKUP_GPG_CHAVE_PRIVADA explícita; não usa agente pessoal herdado."
      fi
      gpg --batch --yes --pinentry-mode error --output "$dump" --decrypt "$arquivo_capturado" ||
        erro "Decifra GPG não interativa falhou. Para chave protegida, decifrar externamente em estação autorizada e usar --entrada -. Não enviar passphrase em argumentos ou ambiente."
      ;;
    *.age)
      log "Decifrando com age."
      [ -n "$AGE_CHAVE_PRIVADA" ] || erro "Defina BACKUP_AGE_CHAVE_PRIVADA para decifrar arquivos age."
      age --decrypt -i "$AGE_CHAVE_PRIVADA" -o "$dump" "$arquivo_capturado" ||
        erro "Não foi possível decifrar o dump com age."
      ;;
    *)
      cp "$arquivo_capturado" "$dump"
      ;;
  esac
fi

validar_dump

if [ "$BACKUP_MODO" = "compose" ]; then
  esquemas_extras=$(consultar_alvo "$banco" \
    "select nspname from pg_namespace where nspname !~ '^pg_' and nspname <> 'information_schema' and nspname <> :'schema' order by 1")
  if [ -n "$esquemas_extras" ]; then
    erro "O banco em uso tem schemas fora de $DATABASE_SCHEMA: $esquemas_extras. O dump restaura apenas esse schema e a troca do banco inteiro perderia os demais. Gere um dump integral em outro fluxo ou remova esses schemas antes da restauração."
  fi
fi

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
  banco_trocado=true
  falha_entre_renomeacoes=""
  if [ "${RESTAURAR_FALHA_ENTRE_RENOMEACOES:-false}" = true ]; then
    falha_entre_renomeacoes="select 1/0;"
  fi
  compose exec -T "$SERVIDOR_SERVICO_DB" psql -U "$usuario" -d postgres \
    -v ON_ERROR_STOP=1 -v banco="$banco" -v temp="$banco_temp" -v anterior="$banco_anterior" \
    -v falha_entre="$falha_entre_renomeacoes" <<'SQL'
begin;
select pg_terminate_backend(pid) from pg_stat_activity
 where datname in (:'banco', :'temp') and pid <> pg_backend_pid();
alter database :"banco" rename to :"anterior";
:falha_entre
alter database :"temp" rename to :"banco";
commit;
SQL
  temp_criado=false

  log "Subindo a aplicação."
  compose up -d --wait --wait-timeout "$RESTAURAR_TIMEOUT_SAUDE" "$SERVIDOR_SERVICO_APP"

  if [ -n "${RESTAURAR_SAUDE_URL:-}" ]; then
    log "Conferindo $RESTAURAR_SAUDE_URL."
    curl_args=(-fsS --retry "$RESTAURAR_SAUDE_TENTATIVAS" --retry-delay 5 --retry-all-errors \
      --max-time 15)
    if [ -n "$RESTAURAR_SAUDE_CA" ]; then
      [ -f "$RESTAURAR_SAUDE_CA" ] || erro "CA de saúde não encontrada: $RESTAURAR_SAUDE_CA."
      curl_args+=(--cacert "$RESTAURAR_SAUDE_CA")
    fi
    curl "${curl_args[@]}" "$RESTAURAR_SAUDE_URL" >/dev/null ||
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
  if [ "$sem_validacao" = false ]; then
    log "Ensaiando o dump em banco próprio no endpoint direto."
    BACKUP_DATABASE_URL="$BACKUP_DATABASE_URL" ESTADO_DIR="$ESTADO_DIR" APP_DIR="$APP_DIR" \
      DATABASE_SCHEMA="$DATABASE_SCHEMA" \
      RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES="$RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES" \
      node "$DIR/restauracao-url.mjs" ensaio "$dump" || exit "$?"
  else
    log "Aviso: a validação em banco descartável foi dispensada por --sem-validacao; risco aceito explicitamente."
  fi
  if [ "$fazer_copia" = true ]; then
    log "Criando uma cópia de segurança antes da restauração."
    if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
      erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
    fi
    if [ -f "$estado_backup" ]; then
      arquivo_backup=$(ler_campo_json "$estado_backup" "arquivo")
      [ -n "$arquivo_backup" ] && backup_seguranca="$BACKUP_BANCO_DIR/$arquivo_backup"
    fi
  fi

  log "Restaurando o dump na URL de destino."
  # O resultado da chamada pode ser incerto mesmo quando pg_restore falha.
  restauracao_destino_iniciada=true
  if pg_restore -d "$BACKUP_DATABASE_URL" --clean --if-exists --no-owner --no-acl \
    --single-transaction --exit-on-error <"$dump" >"$tmp/pg-restore-destino.log" 2>&1; then
    :
  else
    codigo_restore=$?
    log "pg_restore falhou no destino (código $codigo_restore); diagnóstico bruto omitido para não divulgar SQL ou credenciais." >&2
    exit "$codigo_restore"
  fi
  validar_banco_restaurado "$BACKUP_DATABASE_URL"
  escrever_estado_restauracao "sucesso" ""
  log "Restauração concluída. Confira a aplicação externa, /api/saude, o login e as migrações."
fi
