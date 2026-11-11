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

  # O inode da pasta é a identidade comum, inclusive para caminhos alternativos.
  # Cooperação: protege chegada, validação, inventário e remoção; falha fecha tudo.
  exec {lock_retencao}<"$pasta"
  flock -x "$lock_retencao"

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
  reter_minimo="${BACKUP_RETER_MINIMO:-30}"
  case "$reter_dias" in '' | *[!0-9]*) echo "[backup-planilhas] BACKUP_RETER_DIAS inválido." >&2; exit 1 ;; esac
  case "$reter_minimo" in '' | *[!0-9]*) echo "[backup-planilhas] BACKUP_RETER_MINIMO inválido." >&2; exit 1 ;; esac
  # O produtor grava <arquivo>.zip.confirmado.json, com hash e tamanho do ZIP.
  # Nomes desconhecidos, recibos inválidos e arquivos inseguros não contam nem são apagados.
  node - "$pasta" "$reter_dias" "$reter_minimo" "$arquivo" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const [pasta, diasTexto, minimoTexto, atual] = process.argv.slice(2);
const dias = Number(diasTexto), minimo = Number(minimoTexto);
if (!Number.isSafeInteger(dias) || !Number.isSafeInteger(minimo)) throw new Error('Retenção fora do limite seguro.');
const padrao = /^frequenciapp-(\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d-\d{3}Z)-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.zip$/;
const campos = ['arquivo', 'arquivos', 'bytes', 'exportadoEm', 'sha256', 'versao'];
function conferir(nome) {
  try {
    const correspondencia = padrao.exec(nome);
    if (!correspondencia) return null;
    const zip = path.join(pasta, nome), recibo = `${zip}.confirmado.json`;
    const zs = fs.lstatSync(zip), rs = fs.lstatSync(recibo);
    if (!zs.isFile() || !rs.isFile() || zs.nlink !== 1 || rs.nlink !== 1 || rs.size > 65536 || zs.size > 66 * 1024 * 1024) return null;
    const r = JSON.parse(fs.readFileSync(recibo, 'utf8'));
    if (!r || typeof r !== 'object' || Array.isArray(r) || Object.keys(r).sort().join(',') !== campos.join(',') ||
        r.versao !== 1 || r.arquivo !== nome || typeof r.exportadoEm !== 'string' ||
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(r.exportadoEm) ||
        new Date(r.exportadoEm).toISOString() !== r.exportadoEm ||
        r.exportadoEm.replace(/[:.]/g, '-') !== correspondencia[1] ||
        typeof r.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(r.sha256) ||
        !Number.isSafeInteger(r.bytes) || r.bytes <= 0 || r.bytes !== zs.size ||
        !Number.isSafeInteger(r.arquivos) || r.arquivos < 0 ||
        createHash('sha256').update(fs.readFileSync(zip)).digest('hex') !== r.sha256) return null;
    return { nome, zip, recibo, captura: Date.parse(r.exportadoEm) };
  } catch { return null; }
}
if (!conferir(atual)) throw new Error('O par local recém-recebido não foi confirmado; retenção bloqueada.');
const copias = fs.readdirSync(pasta).map(conferir).filter(Boolean)
  .sort((a, b) => a.captura - b.captura || a.nome.localeCompare(b.nome));
let restantes = copias.length;
const agora = Date.now();
for (const copia of copias) {
  if (restantes <= minimo) break;
  if (copia.nome === atual || Math.floor((agora - copia.captura) / 86400000) <= dias) continue;
  // Apenas cooperação: terceiros podem alterar os arquivos após esta revalidação.
  const verificada = conferir(copia.nome);
  if (!verificada || verificada.captura !== copia.captura) continue;
  // Duas remoções irreversíveis, não uma transação: erro ou interrupção deste
  // processo entre elas pode deixar recibo órfão. Um erro interrompe a retenção;
  // o órfão não conta nem autoriza exclusões. Não garante propagação de sinais.
  fs.unlinkSync(copia.zip);
  fs.unlinkSync(copia.recibo);
  restantes--;
}
NODE
  exec {lock_retencao}<&-
fi

echo "[backup-planilhas] Cópia concluída: $arquivo"
