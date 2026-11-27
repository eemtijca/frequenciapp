#!/usr/bin/env bash
# Aplica a base e o lote Git exato num PostgreSQL 17 descartável e confere o upgrade.
set -euo pipefail
umask 077

IMAGEM=postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994
etapa=entrada
pasta=
resumo=
rodada=
autorizacao=/run/frequenciapp-migracao

falhar() {
  printf '[ensaio] %s\n' "$*" >&2
  exit 1
}

# Não usar configuração de clientes, contexto Docker ou credenciais do usuário.
docker_local() {
  local prazo=$1
  shift
  timeout -k 3s "$prazo" env -i PATH=/usr/bin:/bin HOME="$pasta" /usr/bin/docker "$@"
}

limpar() {
  local cid identidades dono id
  if [[ -f "$pasta/cid" ]]; then
    cid=$(<"$pasta/cid")
    [[ "$cid" =~ ^[0-9a-f]{64}$ ]] || return 1
    dono=$(docker_local 10s inspect --type container \
      --format '{{index .Config.Labels "frequenciapp.ensaio.rodada"}}' "$cid") || return 1
    [[ -n "$rodada" && "$dono" == "$rodada" ]] || return 1
    docker_local 15s rm -f "$cid" >/dev/null || return 1
    identidades=$(docker_local 10s ps -aq --no-trunc) || return 1
    while IFS= read -r id; do
      [[ -z "$id" || ( "$id" =~ ^[0-9a-f]{64}$ && "$id" != "$cid" ) ]] || return 1
    done <<< "$identidades"
  fi
  rm -rf -- "$pasta"
}

encerrar() {
  local status=$?
  trap - EXIT
  if [[ -n "$pasta" && -d "$pasta/autorizacao" ]] &&
    ! rm -f -- "$pasta/autorizacao/autorizar"; then
    printf '[ensaio] Revogação da escrita não confirmada.\n' >&2
    if (( status == 0 )); then status=1; fi
  fi
  if [[ -n "$pasta" ]] && ! limpar; then
    printf '[ensaio] Limpeza não confirmada. Identidade privada em %s.\n' "$pasta" >&2
    if (( status == 0 )); then status=1; fi
  fi
  if (( status != 0 )); then
    printf '[ensaio] Ensaio interrompido na etapa: %s.\n' "$etapa" >&2
  elif [[ -n "$resumo" ]]; then
    printf '### Ensaio PostgreSQL 17 concluído\n\n    %s\n' "$resumo"
  fi
  exit "$status"
}

regressoes=false
if [[ $# == 1 && $1 == --regressoes ]]; then
  regressoes=true
else
  [[ $# == 2 && $1 =~ ^[0-9a-f]{40}$ && $2 =~ ^[0-9a-f]{40}$ ]] ||
    falhar 'Informe os SHAs completos da base e do alvo, ou use --regressoes.'
  base=$1 alvo=$2
fi
uid=$(id -u) gid=$(id -g)
[[ "$uid" != 0 && "$uid" != 999 ]] || falhar 'Use um usuário sem privilégios distinto do PostgreSQL.'
while IFS= read -r chave; do
  case "$chave" in
    DATABASE_* | DIRECT_URL* | PG* | POSTGRES_* | DOCKER_HOST | DOCKER_CONTEXT)
      falhar 'O ambiente contém configuração de banco ou de daemon Docker externo.' ;;
  esac
done < <(compgen -e)

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.."
repo=$PWD
git_local() { GIT_ALLOW_PROTOCOL= /usr/bin/git --no-replace-objects --literal-pathspecs "$@"; }
if ! $regressoes; then
  [[ "$(git_local rev-parse HEAD)" == "$alvo" && "$(git_local rev-parse HEAD^1)" == "$base" ]] ||
    falhar 'O checkout não corresponde ao alvo e ao seu primeiro pai.'
  # A mesma instalação do pg atende às duas fontes somente se seus insumos coincidirem.
  git_local diff --quiet "$base" "$alvo" -- package.json pnpm-lock.yaml pnpm-workspace.yaml ||
    falhar 'As dependências da base e do alvo precisam ser iguais para este ensaio.'
fi

trap encerrar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
pasta=$(mktemp -d "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/ensaio-migracoes.XXXXXXXXXXXX")
# --mount usa vírgula como separador; não interpretar caminhos do host como opções.
node_bin=$(node -p 'process.execPath')
dependencias=$(realpath -e -- node_modules)
for caminho in "$pasta" "$node_bin" "$dependencias"; do
  [[ "$caminho" == /* && "$caminho" != *','* && "$caminho" != *\"* && "$caminho" != *$'\n'* ]] ||
    falhar 'Caminho incompatível com as montagens privadas do ensaio.'
done
[[ -f "$node_bin" && -d "$dependencias/pg" ]] || falhar 'Instale as dependências fixadas antes do ensaio.'

# Materializar só arquivos regulares e os bytes dos objetos Git, não o checkout.
projetar() {
  local revisao=$1 destino=$2 entrada caminho metadados
  git_local ls-tree -r -z --full-tree "$revisao" -- \
    prisma/migrations docker/app/migrar.mjs src/infra/schema-postgres.mjs > "$pasta/arvore"
  while IFS= read -r -d '' entrada; do
    caminho=${entrada#*$'\t'}
    metadados=${entrada%%$'\t'*}
    case "$caminho" in
      prisma/migrations/migration_lock.toml) continue ;;
      docker/app/migrar.mjs | src/infra/schema-postgres.mjs) ;;
      *) [[ "$caminho" =~ ^prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration\.sql$ ]] ||
        falhar 'Arquivo inesperado na árvore de migrações.' ;;
    esac
    [[ "$metadados" =~ ^100644\ blob\ [0-9a-f]{40}$ ]] || falhar 'Arquivo Git não regular.'
    mkdir -p -- "$destino/${caminho%/*}"
    git_local cat-file blob "$revisao:$caminho" > "$destino/$caminho"
  done < "$pasta/arvore"
  [[ -f "$destino/docker/app/migrar.mjs" && -f "$destino/src/infra/schema-postgres.mjs" ]]
}
montagens=(
  --mount "type=bind,src=$dependencias,dst=/node_modules,readonly"
  --mount "type=bind,src=$node_bin,dst=/ensaio-node,readonly"
)
prova_tmpfs="rw,nosuid,nodev,noexec,uid=$uid,gid=$gid,mode=0700,size=1m"
if $regressoes; then
  etapa=projecao-regressoes
  for fonte in docker/app/migrar.mjs src/infra/schema-postgres.mjs tests/servidor/migracao-auto-lock.test.mjs; do
    install -D -m 600 -- "$repo/$fonte" "$pasta/regressoes/$fonte"
  done
  ln -s /node_modules "$pasta/regressoes/node_modules"
  montagens+=(--mount "type=bind,src=$pasta/regressoes,dst=/regressoes,readonly")
  montagens+=(--tmpfs "$autorizacao:$prova_tmpfs")
else
  etapa=inventario
  node scripts/servidor/politica-migracoes-auto.mjs "$repo" "$base" "$alvo" > "$pasta/lote.json"
  jq -e --arg base "$base" --arg alvo "$alvo" '
    .base == $base and .alvo == $alvo and (.migracoes | type == "array" and length > 0) and
    all(.migracoes[]; (.caminho | test("^prisma/migrations/[0-9]{14}_[a-z0-9_]+/migration\\.sql$")) and
                      (.sha256 | test("^[a-f0-9]{64}$")))
  ' "$pasta/lote.json" >/dev/null

  projetar "$base" "$pasta/base"
  projetar "$alvo" "$pasta/alvo"
  mkdir -m 700 -- "$pasta/autorizacao"
  montagens+=(
    --mount "type=bind,src=$pasta/base,dst=/base,readonly"
    --mount "type=bind,src=$pasta/alvo,dst=/alvo,readonly"
    --mount "type=bind,src=$pasta/autorizacao,dst=$autorizacao,readonly"
  )
fi

etapa=isolamento
imagem_id=$(docker_local 10s image inspect "$IMAGEM" --format '{{.Id}}')
[[ "$imagem_id" =~ ^sha256:[0-9a-f]{64}$ ]]
rodada=$(openssl rand -hex 16)
senha=$(openssl rand -hex 24)
banco="ensaio_${senha:0:16}"
docker_local 20s create --pull never --cidfile "$pasta/cid" --label frequenciapp.ensaio=migracoes-auto \
  --label "frequenciapp.ensaio.rodada=$rodada" \
  --network none --read-only --user 999:999 --cap-drop ALL --security-opt no-new-privileges \
  --pids-limit 64 --cpus 1 --memory 512m --log-driver none \
  --tmpfs /var/lib/postgresql/data:rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=256m \
  --tmpfs /var/run/postgresql:rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=4m \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,mode=1777,size=16m \
  "${montagens[@]}" \
  -e "POSTGRES_DB=$banco" -e POSTGRES_USER=ensaio -e "POSTGRES_PASSWORD=$senha" \
  "$IMAGEM" postgres -c listen_addresses=127.0.0.1 -c lock_timeout=5s -c statement_timeout=30s >/dev/null
cid=$(<"$pasta/cid")
[[ "$cid" =~ ^[0-9a-f]{64}$ ]]
docker_local 10s inspect --type container "$cid" | jq -e \
  --arg id "$cid" --arg imagem "$imagem_id" --arg rodada "$rodada" \
  --arg pasta "$pasta" --arg deps "$dependencias" --arg node "$node_bin" \
  --arg autorizacao "$autorizacao" --arg prova_tmpfs "$prova_tmpfs" --argjson regressoes "$regressoes" '
  length == 1 and (.[0] |
    .Id == $id and .Image == $imagem and .State.Status == "created" and
    .Config.Labels["frequenciapp.ensaio.rodada"] == $rodada and .Config.User == "999:999" and
    .HostConfig.NetworkMode == "none" and .HostConfig.ReadonlyRootfs and
    (.HostConfig.Privileged | not) and (.HostConfig.PublishAllPorts | not) and
    .HostConfig.CapDrop == ["ALL"] and
    (.HostConfig.SecurityOpt | . == ["no-new-privileges"] or . == ["no-new-privileges:true"]) and
    (.HostConfig.PortBindings | length == 0) and
    (.HostConfig.Tmpfs | keys == (["/tmp", "/var/lib/postgresql/data", "/var/run/postgresql"] +
      (if $regressoes then [$autorizacao] else [] end) | sort)) and
    (if $regressoes then .HostConfig.Tmpfs[$autorizacao] == $prova_tmpfs else true end) and
    all(.Mounts[]; .Type == "bind" and .RW == false) and
    ([.Mounts[] | [.Destination, .Source]] | sort) ==
      ([["/ensaio-node", $node], ["/node_modules", $deps]] +
        (if $regressoes then [["/regressoes", $pasta + "/regressoes"]]
         else [["/alvo", $pasta + "/alvo"], ["/base", $pasta + "/base"],
               [$autorizacao, $pasta + "/autorizacao"]] end) | sort))
' >/dev/null
docker_local 15s start "$cid" >/dev/null

psql_ensaio() {
  docker_local 40s exec -i "$cid" env -i PATH=/usr/local/bin:/usr/bin:/bin \
    "PGPASSWORD=$senha" PGCONNECT_TIMEOUT=2 psql -XwqAt -h 127.0.0.1 -p 5432 -U ensaio -d "$banco" \
    -v ON_ERROR_STOP=1 "$@" 2> "$pasta/psql.erro"
}

etapa=identidade
# A conexão TCP só fica disponível no postmaster definitivo, após initdb.
identidade=
for ((i=0; i<30; i++)); do
  if identidade=$(psql_ensaio -c "SELECT current_database(), current_user, current_schema(),
    pg_catalog.host(pg_catalog.inet_server_addr()), current_setting('server_version_num')::int / 10000,
    current_setting('data_directory'),
    NOT EXISTS (SELECT FROM pg_class WHERE relnamespace = 'public'::regnamespace)"); then
    break
  fi
  sleep 1
done
IFS='|' read -r banco_observado usuario_observado schema_observado ip_observado versao pgdata vazio <<< "$identidade"
[[ "$banco_observado" == "$banco" && "$usuario_observado" == ensaio &&
   "$schema_observado" == public && "$ip_observado" == 127.0.0.1 && "$versao" == 17 &&
   "$pgdata" == /var/lib/postgresql/data && "$vazio" == t ]]

if $regressoes; then
  etapa=regressoes
  docker_local 90s exec --user "$uid:$gid" "$cid" env -i PATH=/usr/bin:/bin HOME=/tmp \
    MIGRADOR_BANCO_DESCARTAVEL=true \
    "DIRECT_URL=postgresql://ensaio:$senha@127.0.0.1:5432/postgres" \
    /ensaio-node --test /regressoes/tests/servidor/migracao-auto-lock.test.mjs
  exit 0
fi

migrar() {
  local modo=false lote="${2:-}"
  if [[ -n "$lote" ]]; then modo=true; fi
  docker_local 150s exec --user "$uid:$gid" "$cid" env -i PATH=/usr/bin:/bin HOME=/tmp \
    "MIGRACAO_AUTOMATICA=$modo" "MIGRACAO_LOTE_APROVADO=$lote" \
    "DIRECT_URL=postgresql://ensaio:$senha@127.0.0.1:5432/$banco?schema=public" \
    /ensaio-node "/$1/docker/app/migrar.mjs" > "$pasta/migrador.log" 2>&1
}

historico() {
  psql_ensaio -c "SELECT coalesce(json_agg(json_build_array(migration_name, checksum,
    finished_at IS NOT NULL AND rolled_back_at IS NULL, id) ORDER BY started_at, migration_name), '[]')
    FROM public._prisma_migrations"
}

conferir_historico() {
  jq -c 'map(.[0:3])' "$2" |
    node scripts/servidor/aprovacao-migracoes.mjs historico "$repo" "$1"
}

catalogo() {
  psql_ensaio -c "SELECT coalesce(json_agg(json_build_array(table_name, column_name)
    ORDER BY table_name, column_name), '[]') FROM information_schema.columns
    JOIN information_schema.tables USING (table_schema, table_name)
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
}

retrato() {
  psql_ensaio -c "SELECT to_jsonb(u) FROM public.usuarios u WHERE email = 'ensaio@example.invalid'"
}

etapa=base
migrar base
historico > "$pasta/historico-base"
conferir_historico "$base" "$pasta/historico-base"
psql_ensaio -c "INSERT INTO public.usuarios (email, senha_hash, nome, atualizado_em)
  VALUES ('ensaio@example.invalid', 'sem-login', 'Registro sintético', '2026-01-01T00:00:00Z')"
registro=$(retrato)
[[ -n "$registro" ]]
catalogo > "$pasta/catalogo-base"

etapa=upgrade
observacao=$(node scripts/servidor/alvo-migracoes-auto.mjs sql-historico public |
  psql_ensaio -f - |
  node scripts/servidor/alvo-migracoes-auto.mjs historico "$repo" "$base" "$banco" public |
  jq -ce --arg ip "$ip_observado" '. + {ip: $ip}')
envelope=$(node scripts/servidor/alvo-migracoes-auto.mjs envelope "$repo" "$base" "$alvo" <<<"$observacao")
[[ "$envelope" =~ ^[a-zA-Z0-9_-]+$ ]]
# O bind é do diretório: remover a entrada revoga a escrita também no contêiner.
printf '%s' "$envelope" > "$pasta/autorizacao/autorizar"
migrar alvo "$envelope"
rm -- "$pasta/autorizacao/autorizar"
historico > "$pasta/historico-alvo"
conferir_historico "$alvo" "$pasta/historico-alvo"
jq -e --slurpfile base "$pasta/historico-base" --slurpfile lote "$pasta/lote.json" '
  ($base[0] | length) as $n | .[0:$n] == $base[0] and
  (.[ $n: ] | map({caminho: ("prisma/migrations/" + .[0] + "/migration.sql"), sha256: .[1]})) ==
    $lote[0].migracoes
' "$pasta/historico-alvo" >/dev/null
registro_alvo=$(retrato)
# Uma coluna nova na própria tabela não faz parte do retrato da base.
jq -e --argjson base "$registro" '
  . as $alvo | $base | to_entries | all(.[]; . as $campo |
    ($alvo | has($campo.key)) and $alvo[$campo.key] == $campo.value)
' <<< "$registro_alvo" >/dev/null

etapa=esquema
catalogo > "$pasta/catalogo-alvo"
novas=$(jq -ce --slurpfile base "$pasta/catalogo-base" '
  . as $alvo | if ($base[0] - $alvo | length) == 0 then $alvo - $base[0] | select(length > 0) else empty end
' "$pasta/catalogo-alvo")
# Executar uma leitura em cada coluna nova, sem tratar nomes como comandos do psql.
psql_ensaio -v "novas=$novas" >/dev/null <<'SQL'
BEGIN READ ONLY;
SELECT format('SELECT %I FROM public.%I LIMIT 1', item->>1, item->>0)
  FROM json_array_elements(:'novas') AS item
\gexec
ROLLBACK;
SQL

etapa=idempotencia
migrar alvo "$envelope"
grep -Fxq '[migrar] Banco já está na última revisão.' "$pasta/migrador.log"
[[ "$(historico)" == "$(<"$pasta/historico-alvo")" && "$(retrato)" == "$registro_alvo" ]]
resumo=$(jq -c '{base, alvo, migracoes}' "$pasta/lote.json")
