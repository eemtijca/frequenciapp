#!/usr/bin/env bash
# Ensaia o fluxo de restauração por URL em PostgreSQL 17 descartável.
set -Eeuo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-url.XXXXXX")
BANCO="frequenciapp-url-$$"
HOST_URL="${HOST_URL:-127.0.0.1}"
BIND="${BIND:-127.0.0.1}"

limpar() {
  docker rm -f "$BANCO" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap 'limpar' EXIT

command -v pg_restore >/dev/null 2>&1 ||
  { echo "Aviso: pg_restore ausente; ensaio URL não executado." >&2; exit 0; }

docker run -d --name "$BANCO" -p "$BIND::5432" \
  -e POSTGRES_USER=frequencia -e POSTGRES_PASSWORD=frequencia -e POSTGRES_DB=origem \
  postgres:17-alpine >/dev/null

for _tentativa in $(seq 1 60); do
  if docker exec "$BANCO" psql -U frequencia -d origem -tAc 'select 1' >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! docker exec "$BANCO" psql -U frequencia -d origem -tAc 'select 1' >/dev/null 2>&1; then
  echo "FALHOU: o PostgreSQL descartável não ficou pronto." >&2
  docker ps -a --filter "name=$BANCO" >&2 || true
  docker logs "$BANCO" >&2 || true
  exit 1
fi
PORTA=""
for _tentativa in $(seq 1 30); do
  PORTA=$(docker inspect --format \
    '{{with (index .NetworkSettings.Ports "5432/tcp")}}{{(index . 0).HostPort}}{{end}}' \
    "$BANCO" 2>/dev/null || true)
  [ -n "$PORTA" ] && break
  sleep 1
done
if [ -z "$PORTA" ]; then
  echo "FALHOU: não foi possível identificar a porta publicada do PostgreSQL." >&2
  docker inspect "$BANCO" >&2 || true
  docker logs "$BANCO" >&2 || true
  exit 1
fi
echo "PostgreSQL descartável publicado na porta $PORTA."

for _tentativa in $(seq 1 30); do
  if psql "postgresql://frequencia:frequencia@$HOST_URL:$PORTA/origem" -X -tAc 'select 1' \
    >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! psql "postgresql://frequencia:frequencia@$HOST_URL:$PORTA/origem" -X -tAc 'select 1' \
  >/dev/null 2>&1; then
  echo "FALHOU: a porta publicada do PostgreSQL não aceitou a conexão." >&2
  docker logs "$BANCO" >&2 || true
  exit 1
fi

docker exec -i "$BANCO" psql -U frequencia -d origem -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create table alunos (id integer primary key, nome text not null);
insert into alunos values (1, 'Aluno Sintetico');
create table _prisma_migrations (
  id varchar(36) primary key,
  checksum varchar(64) not null,
  finished_at timestamptz,
  migration_name varchar(255) not null,
  logs text,
  rolled_back_at timestamptz,
  started_at timestamptz,
  applied_steps_count integer not null default 0
);
insert into _prisma_migrations (id, checksum, migration_name, finished_at, started_at)
values ('00000000-0000-0000-0000-000000000001', repeat('a', 64), '0001_teste', now(), now());
SQL

docker exec "$BANCO" pg_dump -U frequencia -d origem -Fc >"$TMP/dump"
(cd "$TMP" && sha256sum dump >dump.sha256)
docker exec "$BANCO" createdb -U frequencia destino
docker exec "$BANCO" createdb -U frequencia validacao

export SERVIDOR_AMBIENTE_INJETADO=true
export APP_DIR="$RAIZ"
export ESTADO_DIR="$TMP/estado"
export SERVIDOR_LOCK_DIR="$TMP/locks"
export BACKUP_MODO=url
export BACKUP_DATABASE_URL="postgresql://frequencia:frequencia@$HOST_URL:$PORTA/destino"
export BACKUP_RESTAURACAO_URL_VALIDACAO="postgresql://frequencia:frequencia@$HOST_URL:$PORTA/validacao"
export DATABASE_SCHEMA=public
mkdir -p "$ESTADO_DIR"

if RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=false \
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$TMP/dump" --confirmar --sem-copia \
  >"$TMP/divergente.log" 2>&1; then
  cat "$TMP/divergente.log" >&2
  echo "FALHOU: a restauração aceitou migrações divergentes." >&2
  exit 1
fi
grep -q 'migrações do dump divergem' "$TMP/divergente.log" ||
  { cat "$TMP/divergente.log" >&2; echo "FALHOU: a recusa de migração divergente não apareceu." >&2; exit 1; }
export RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true

"$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$TMP/dump" --confirmar --sem-copia

[ "$(docker exec "$BANCO" psql -U frequencia -d destino -tAc 'select count(*) from alunos')" = "1" ] ||
  { echo "FALHOU: o dado sintético não voltou no modo URL." >&2; exit 1; }
[ "$(docker exec "$BANCO" psql -U frequencia -d destino -tAc 'select count(*) from _prisma_migrations')" = "1" ] ||
  { echo "FALHOU: o histórico de migrações não voltou no modo URL." >&2; exit 1; }
[ "$(docker exec "$BANCO" psql -U frequencia -d validacao -tAc 'select count(*) from alunos')" = "1" ] ||
  { echo "FALHOU: o banco descartável de validação não recebeu o dump." >&2; exit 1; }

# URLs diferentes que apontam para o mesmo banco não são isolamento.
if BACKUP_DATABASE_URL="postgresql://frequencia:frequencia@$HOST_URL:$PORTA/destino?application_name=destino" \
  BACKUP_RESTAURACAO_URL_VALIDACAO="postgresql://frequencia:frequencia@$HOST_URL:$PORTA/%64estino?application_name=validacao" \
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$TMP/dump" --confirmar --sem-copia \
  >"$TMP/equivalente.log" 2>&1; then
  echo "FALHOU: o modo URL aceitou a mesma base por URLs equivalentes." >&2
  exit 1
fi
grep -q 'mesmo banco' "$TMP/equivalente.log" ||
  { cat "$TMP/equivalente.log" >&2; echo "FALHOU: a recusa de mesma base não apareceu." >&2; exit 1; }

# Sem a URL de validação, a operação destrutiva precisa ser recusada.
docker exec "$BANCO" createdb -U frequencia outro_destino
if BACKUP_DATABASE_URL="postgresql://frequencia:frequencia@$HOST_URL:$PORTA/outro_destino" \
  BACKUP_RESTAURACAO_URL_VALIDACAO="" \
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$TMP/dump" --confirmar --sem-copia; then
  echo "FALHOU: o modo URL aceitou restauração sem banco de validação." >&2
  exit 1
fi

printf 'Ensaio de restauração por URL concluído.\n'
