#!/usr/bin/env bash
# Executa o backup das planilhas e mantém uma cópia local confirmada.
set -Eeuo pipefail

if [ -z "${BACKUP_RCLONE_CONFIG:-}" ] || [ ! -f "$BACKUP_RCLONE_CONFIG" ]; then
  echo "[backup-planilhas] Configuração do rclone não encontrada." >&2
  exit 1
fi

config_original="$BACKUP_RCLONE_CONFIG"
modo_config=$(stat -c '%a' "$config_original")
if (( (8#$modo_config & 8#037) != 0 )); then
  echo "[backup-planilhas] Permissão insegura na configuração do rclone." >&2
  exit 1
fi
BACKUP_RCLONE_CONFIG=$(mktemp "${TMPDIR:-/tmp}/frequenciapp-rclone.XXXXXX")
trap 'rm -f "$BACKUP_RCLONE_CONFIG"' EXIT
cp "$config_original" "$BACKUP_RCLONE_CONFIG"
chmod 600 "$BACKUP_RCLONE_CONFIG"

saida=$(node scripts/backup/backup-externo.mjs)
printf '%s\n' "$saida"

# shellcheck disable=SC2016
valores=$(printf '%s' "$saida" | node -e '
let dados = "";
process.stdin.on("data", (parte) => { dados += parte; });
process.stdin.on("end", () => {
  const resultado = JSON.parse(dados);
  if (!resultado.arquivo || !resultado.sha256) process.exit(1);
  process.stdout.write(`${resultado.arquivo}\t${resultado.sha256}`);
});
')

arquivo=$(printf '%s' "$valores" | cut -f1)
sha_esperado=$(printf '%s' "$valores" | cut -f2)

if [ -z "$arquivo" ] || [ -z "$sha_esperado" ]; then
  echo "[backup-planilhas] A rotina não retornou arquivo e hash." >&2
  exit 1
fi

if [ "${BACKUP_PLANILHAS_LOCAL:-true}" = "true" ]; then
  destino="${BACKUP_DESTINO%/}"
  pasta="${BACKUP_PLANILHAS_DIR:-/backups/planilhas}"
  mkdir -p "$pasta"
  chmod 700 "$pasta" 2>/dev/null || true

  ambiente=(env -i PATH="$PATH" HOME="${HOME:-/tmp}" RCLONE_CONFIG="$BACKUP_RCLONE_CONFIG")
  if [ -n "${RCLONE_CONFIG_PASS:-}" ]; then
    ambiente+=("RCLONE_CONFIG_PASS=$RCLONE_CONFIG_PASS")
  fi

  "${ambiente[@]}" rclone copyto "$destino/$arquivo" "$pasta/$arquivo" --immutable
  "${ambiente[@]}" rclone copyto "$destino/$arquivo.confirmado.json" \
    "$pasta/$arquivo.confirmado.json" --immutable

  sha_local=$(sha256sum "$pasta/$arquivo" | cut -d' ' -f1)
  if [ "$sha_local" != "$sha_esperado" ]; then
    echo "[backup-planilhas] A cópia local não confere com o hash retornado." >&2
    exit 1
  fi
  chmod 600 "$pasta/$arquivo" "$pasta/$arquivo.confirmado.json"

  reter_dias="${BACKUP_RETER_DIAS:-30}"
  reter_minimo="${BACKUP_RETER_MINIMO:-5}"
  case "$reter_dias" in '' | *[!0-9]*) echo "[backup-planilhas] BACKUP_RETER_DIAS inválido." >&2; exit 1 ;; esac
  case "$reter_minimo" in '' | *[!0-9]*) echo "[backup-planilhas] BACKUP_RETER_MINIMO inválido." >&2; exit 1 ;; esac
  agora=$(date +%s)
  mapfile -t copias < <(
    find "$pasta" -maxdepth 1 -type f -name 'frequenciapp-*.zip' -exec stat -c '%Y %n' {} \; | sort -n
  )
  total=${#copias[@]}
  for ((indice = 0; indice < total; indice += 1)); do
    linha="${copias[$indice]}"
    mtime="${linha%% *}"
    caminho="${linha#* }"
    base="${caminho%.zip}"
    [ -f "$base.confirmado.json" ] || continue
    idade=$(( (agora - ${mtime%.*}) / 86400 ))
    restantes=$((total - indice))
    if [ "$idade" -gt "$reter_dias" ] && [ "$restantes" -gt "$reter_minimo" ]; then
      rm -f "$caminho" "$base.confirmado.json"
    fi
  done
fi

echo "[backup-planilhas] Cópia concluída: $arquivo"
