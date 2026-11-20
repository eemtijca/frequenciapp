#!/usr/bin/env bash
# Ensaia backup, retenção, verificação remota e restauração em Compose descartável.
set -Eeuo pipefail

# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

preparar_ambiente
export RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true
iniciar_compose_teste
preparar_banco_sintetico

# O conteúdo do dump precisa ultrapassar a capacidade do FIFO.
executar_sql "$POSTGRES_DB" 'create table prova_fluxo as select i, md5(i::text) as valor from generate_series(1, 25000) i' >/dev/null

# Cópias antigas para exercitar o mínimo de retenção.
for i in 1 2 3 4 5; do
  nome="frequenciapp-20200101T00000${i}Z-abc${i}.dump.gpg"
  printf 'antigo\n' >"$BACKUP_BANCO_DIR/$nome"
  printf '%064d  %s\n' 0 "$nome" >"$BACKUP_BANCO_DIR/$nome.sha256"
  touch -d '10 days ago' "$BACKUP_BANCO_DIR/$nome" "$BACKUP_BANCO_DIR/$nome.sha256"
done

timeout -k 5 60 "$RAIZ/scripts/servidor/backup-banco.sh"

dump=$(ultimo_arquivo_backup)
[ -n "$dump" ] || falhar "o backup não gerou um arquivo cifrado."
quantidade_dumps=$(find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f -name 'frequenciapp-*.dump.gpg' | wc -l)
[ "$quantidade_dumps" -eq 6 ] ||
  falhar "a retenção preservou as cinco cópias sem recibo e a nova cópia confirmada (encontradas $quantidade_dumps)."
grep -q '"recibo":"frequenciapp-[0-9TZ-]*-[a-f0-9]*\.confirmado\.json"' "$ESTADO_DIR/ultimo-backup.json" ||
  falhar "o estado não apontou para o recibo confirmado."
if find "$BACKUP_BANCO_DIR" -maxdepth 1 -name '*.dump' -print -quit | grep -q .; then
  falhar "há dump em texto claro no diretório de backup."
fi
ls -1 "$BACKUP_BANCO_DIR"/*-ambiente.env.gpg >/dev/null 2>&1 ||
  falhar "o arquivo de ambiente não foi cifrado."

metrica="$ESTADO_DIR/metricas/ultimo-backup.prom"
[ -f "$metrica" ] || falhar "a métrica do último backup não foi criada."
[ "$(stat -c '%a' "$metrica")" = "644" ] ||
  falhar "a métrica do último backup não tem modo 644."
[ "$(stat -c '%a' "$ESTADO_DIR/metricas")" = "755" ] ||
  falhar "o diretório de métricas não tem modo 755."
grep -q '^# HELP frequenciapp_backup_ultimo_sucesso_timestamp_seconds ' "$metrica" ||
  falhar "a métrica do último backup não tem o cabeçalho HELP."
grep -q '^# TYPE frequenciapp_backup_ultimo_sucesso_timestamp_seconds gauge$' "$metrica" ||
  falhar "a métrica do último backup não tem o cabeçalho TYPE."
em_backup=$(grep -o '"em":"[^"]*"' "$ESTADO_DIR/ultimo-backup.json" | cut -d'"' -f4 | head -n 1)
epoch_backup=$(date -u -d "$em_backup" +%s)
[ "$(tail -n 1 "$metrica")" = "frequenciapp_backup_ultimo_sucesso_timestamp_seconds $epoch_backup" ] ||
  falhar "a época da métrica não corresponde ao instante do backup."
[ -z "$(find "$ESTADO_DIR/metricas" -maxdepth 1 -name '.ultimo-backup.*' -print -quit)" ] ||
  falhar "sobrou temporário da métrica do último backup."

# A verificação sem --sem-escrita republica a métrica; com --sem-escrita não altera.
rm -f "$metrica"
"$RAIZ/scripts/servidor/backup-banco.sh" --verificar >/dev/null
[ -f "$metrica" ] || falhar "a verificação não republicou a métrica do último backup."
antes_metrica=$(stat -c '%Y %s' "$metrica")
sleep 1
"$RAIZ/scripts/servidor/backup-banco.sh" --verificar --sem-escrita >/dev/null
[ "$(stat -c '%Y %s' "$metrica")" = "$antes_metrica" ] ||
  falhar "a verificação --sem-escrita alterou a métrica do último backup."

# Falha de backup preserva a métrica do último sucesso.
sleep 1
if BACKUP_ESPACO_MINIMO_MB=999999999 "$RAIZ/scripts/servidor/backup-banco.sh" >/dev/null 2>&1; then
  falhar "o backup com espaço insuficiente não falhou."
fi
[ "$(stat -c '%Y %s' "$metrica")" = "$antes_metrica" ] ||
  falhar "a falha de backup alterou a métrica do último backup."

# A remoção do registro prova que a restauração recupera os dados.
executar_sql "$POSTGRES_DB" 'delete from alunos' >/dev/null
executar_sql "$POSTGRES_DB" 'delete from prova_fluxo' >/dev/null
"$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$dump" --confirmar --sem-copia

[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from prova_fluxo where valor = md5(i::text)')" = "25000" ] ||
  falhar "o conteúdo que excede o FIFO não voltou integralmente na restauração."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
  falhar "o aluno sintético não voltou na restauração."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from _prisma_migrations')" = "1" ] ||
  falhar "o histórico de migrações não voltou na restauração."
[ "$(executar_sql postgres "select count(*) from pg_database where datname like '${POSTGRES_DB}_anterior_%'")" -ge 1 ] ||
  falhar "o banco anterior não foi preservado."
esperar_aplicacao || falhar "a aplicação não ficou em execução após a restauração."

# A cifra com age usa outro fluxo de validação e outra chave privada.
if command -v age-keygen >/dev/null 2>&1 && command -v age >/dev/null 2>&1; then
  age-keygen -o "$TMP_RAIZ/age.txt" >/dev/null 2>&1
  age-keygen -y "$TMP_RAIZ/age.txt" >"$TMP_RAIZ/age-destinatarios.txt"
  export BACKUP_CRIPTOGRAFIA=age
  export BACKUP_AGE_DESTINATARIOS="$TMP_RAIZ/age-destinatarios.txt"
  BACKUP_AGE_DESTINATARIOS_SHA256="$(sha256sum "$TMP_RAIZ/age-destinatarios.txt" | cut -d' ' -f1)"
  export BACKUP_AGE_DESTINATARIOS_SHA256
  export BACKUP_AGE_CHAVE_PRIVADA="$TMP_RAIZ/age.txt"
  "$RAIZ/scripts/servidor/backup-banco.sh"
  dump_age=$(find "$BACKUP_BANCO_DIR" -maxdepth 1 -type f -name '*.dump.age' \
    -exec stat -c '%Y %n' {} \; 2>/dev/null | sort -rn | head -n 1 | cut -d' ' -f2- || true)
  [ -n "$dump_age" ] || falhar "o backup age não gerou arquivo."
  executar_sql "$POSTGRES_DB" 'delete from alunos' >/dev/null
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$dump_age" --confirmar --sem-copia
  [ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
    falhar "o aluno sintético não voltou na restauração age."
  export BACKUP_CRIPTOGRAFIA=gpg
else
  printf 'Aviso: age ausente; ensaio com age não executado.\n'
fi

# O dump cobre apenas DATABASE_SCHEMA; a troca do banco inteiro precisa recusar outros schemas.
executar_sql "$POSTGRES_DB" 'create schema extra_qa' >/dev/null
if "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$dump" --confirmar --sem-copia \
  >"$TMP_RAIZ/escopo.log" 2>&1; then
  falhar "a restauração aceitou um banco com schema fora do dump."
fi
grep -q 'schemas fora de' "$TMP_RAIZ/escopo.log" ||
  falhar "a recusa de schema fora do dump não apareceu."
esperar_aplicacao || falhar "a aplicação ficou parada após a recusa de escopo."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
  falhar "a recusa de escopo alterou o banco em uso."
executar_sql "$POSTGRES_DB" 'drop schema extra_qa' >/dev/null

# Falha de saúde depois da troca precisa voltar ao banco anterior e religar a aplicação.
if RESTAURAR_SAUDE_URL='http://127.0.0.1:1/api/saude' RESTAURAR_SAUDE_TENTATIVAS=0 \
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$dump" --confirmar --sem-copia; then
  falhar "a falha de saúde depois da troca foi ignorada."
fi
esperar_aplicacao || falhar "a aplicação não voltou após o rollback da restauração."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
  falhar "o rollback da restauração não voltou ao banco anterior."
[ "$(grep -o '"status":"[^"]*"' "$ESTADO_DIR/ultima-restauracao.json" | cut -d'"' -f4)" = "falha" ] ||
  falhar "a falha de restauração não foi registrada."

# Falha entre as renomeações precisa desfazer a troca parcial e manter o banco original.
if RESTAURAR_FALHA_ENTRE_RENOMEACOES=true \
  "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$dump" --confirmar --sem-copia; then
  falhar "a falha entre renomeações foi ignorada."
fi
esperar_aplicacao || falhar "a aplicação não voltou após a falha entre renomeações."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
  falhar "a falha entre renomeações deixou o banco em uso indisponível."
[ "$(grep -o '"status":"[^"]*"' "$ESTADO_DIR/ultima-restauracao.json" | cut -d'"' -f4)" = "falha" ] ||
  falhar "a falha entre renomeações não foi registrada."

# Um dump corrompido com checksum válido precisa falhar antes de parar a aplicação.
corrompido="$TMP_RAIZ/corrompido.dump.gpg"
cp "$dump" "$corrompido"
printf 'corrompido\n' >>"$corrompido"
(cd "$TMP_RAIZ" && sha256sum "$(basename "$corrompido")" >"$(basename "$corrompido").sha256")
if "$RAIZ/scripts/servidor/restaurar.sh" --arquivo "$corrompido" --confirmar --sem-copia; then
  falhar "a restauração aceitou um dump corrompido."
fi
esperar_aplicacao || falhar "a aplicação ficou parada após a falha de restauração."
[ "$(executar_sql "$POSTGRES_DB" 'select count(*) from alunos')" = "1" ] ||
  falhar "a falha de restauração alterou o banco em uso."

# A verificação remota precisa detectar arquivo e checksum remotos adulterados.
if command -v rclone >/dev/null 2>&1; then
  export BACKUP_REMOTO="destino:$TMP_RAIZ/remoto"
  export BACKUP_RCLONE_CONFIG="$TMP_RAIZ/rclone.conf"
  mkdir -p "$TMP_RAIZ/remoto"
  printf '[destino]\ntype = local\n' >"$BACKUP_RCLONE_CONFIG"
  chmod 600 "$BACKUP_RCLONE_CONFIG"
  "$RAIZ/scripts/servidor/backup-banco.sh"
  dump_remoto=$(ultimo_arquivo_backup)
  nome_remoto=$(basename "$dump_remoto")
  printf 'adulterado\n' >"$TMP_RAIZ/remoto/$nome_remoto"
  sha_adulterado=$(sha256sum "$TMP_RAIZ/remoto/$nome_remoto" | cut -d' ' -f1)
  printf '%s  %s\n' "$sha_adulterado" "$nome_remoto" >"$TMP_RAIZ/remoto/$nome_remoto.sha256"
  if "$RAIZ/scripts/servidor/backup-banco.sh" --verificar; then
    falhar "a verificação remota aceitou arquivo e checksum adulterados."
  fi
else
  printf 'Aviso: rclone ausente; ensaio remoto não executado.\n'
fi

printf 'Ensaios de backup e restauração concluídos.\n'
