#!/usr/bin/env bash
# Executa o backup das planilhas e mantém uma cópia local confirmada.
set -Eeuo pipefail

if [ -z "${BACKUP_RCLONE_CONFIG:-}" ] || [ ! -f "$BACKUP_RCLONE_CONFIG" ]; then
  echo "[backup-planilhas] Configuração do rclone não encontrada." >&2
  exit 1
fi

if [ "$(stat -c '%a' "$BACKUP_RCLONE_CONFIG")" != "600" ]; then
  echo "[backup-planilhas] A configuração do rclone deve ter permissão 600." >&2
  exit 1
fi

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
fi

echo "[backup-planilhas] Cópia concluída: $arquivo"
