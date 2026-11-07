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

O arquivo pode ser um dump custom, um .dump.gpg ou um .dump.age.
Use --entrada - para receber um dump já decifrado pela entrada padrão.
TEXTO
}

arquivo=""
entrada=""
confirmar=false
fazer_copia=true
aplicacao_parada=false

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
GPG_CHAVE_PRIVADA="${BACKUP_GPG_CHAVE_PRIVADA:-}"
AGE_CHAVE_PRIVADA="${BACKUP_AGE_CHAVE_PRIVADA:-}"

case "$BACKUP_MODO" in
  compose) montar_compose ;;
  url) [ -n "$BACKUP_DATABASE_URL" ] || erro "Defina BACKUP_DATABASE_URL ou DIRECT_URL." ;;
  *) erro "BACKUP_MODO inválido: $BACKUP_MODO." ;;
esac

tmp=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-restauracao.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
umask 077

dump="$tmp/dump"

if [ -n "$entrada" ] && [ "$entrada" = "-" ]; then
  log "Lendo dump decifrado da entrada padrão."
  cat >"$dump"
else
  [ -f "$arquivo" ] || erro "Arquivo não encontrado: $arquivo"
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
        gpg --batch --import "$GPG_CHAVE_PRIVADA" >/dev/null 2>&1
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

[ -s "$dump" ] || erro "O dump está vazio."

if [ "$BACKUP_MODO" = "compose" ] && [ "$aplicacao_parada" = false ]; then
  log "Parando a aplicação para restaurar o banco."
  compose stop app >/dev/null
fi

if [ "$fazer_copia" = true ]; then
  log "Criando uma cópia de segurança antes da restauração."
  if ! BACKUP_MODO="$BACKUP_MODO" "$DIR/backup-banco.sh"; then
    erro "A cópia de segurança falhou. Use --sem-copia apenas com decisão explícita."
  fi
fi

if [ "$BACKUP_MODO" = "compose" ]; then
  usuario="${POSTGRES_USER:-frequencia}"
  banco="${POSTGRES_DB:-frequencia}"
  log "Recriando o banco $banco."
  compose exec -T db dropdb -U "$usuario" --force "$banco"
  compose exec -T db createdb -U "$usuario" -O "$usuario" "$banco"
  log "Restaurando o dump."
  compose exec -T db pg_restore \
    -U "$usuario" \
    -d "$banco" \
    --no-owner --no-acl --single-transaction --exit-on-error <"$dump"
  log "Subindo a aplicação."
  compose up -d --wait app
else
  log "Restaurando o dump na URL configurada."
  pg_restore -d "$BACKUP_DATABASE_URL" \
    --clean --if-exists --no-owner --no-acl \
    --single-transaction --exit-on-error <"$dump"
fi

log "Restauração concluída. Confira /api/saude, o login e as migrações."
