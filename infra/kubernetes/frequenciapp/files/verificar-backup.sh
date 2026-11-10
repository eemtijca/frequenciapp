#!/usr/bin/env bash
# Confere o recibo do último backup do banco antes de permitir upgrade ou rollback.
set -Eeuo pipefail

falhar() {
  printf '[backup-gate] %s\n' "$*" >&2
  exit 1
}

if [ "${ENSAIO_SEM_PROTECAO:-false}" = "true" ]; then
  printf '%s\n' \
    "[backup-gate] ENSAIO SEM PROTECAO: o upgrade ou rollback vai prosseguir sem backup confirmado." \
    "[backup-gate] Não há proteção nem promessa de recuperação neste modo." >&2
  exit 0
fi

estado_dir="${ESTADO_DIR:-/backups/estado}"
estado="$estado_dir/ultimo-backup.json"
backup_dir="${BACKUP_BANCO_DIR:-/backups/banco}"
idade_maxima="${BACKUP_GATE_IDADE_MAXIMA_HORAS:-36}"
exigir_remoto="${BACKUP_GATE_EXIGIR_REMOTO:-false}"

case "$idade_maxima" in
  '' | *[!0-9]*) falhar "BACKUP_GATE_IDADE_MAXIMA_HORAS deve ser um número inteiro." ;;
esac
case "$exigir_remoto" in
  true | false) ;;
  *) falhar "BACKUP_GATE_EXIGIR_REMOTO deve ser true ou false." ;;
esac

[ -f "$estado" ] ||
  falhar "Não há recibo de backup confirmado em $estado. Execute o backup do banco antes da migração."
[ -r "$estado" ] || falhar "O recibo de backup não pode ser lido."

campos=$(node -e '
const fs = require("node:fs");
const dados = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const texto = (valor) => (valor === undefined || valor === null ? "" : String(valor));
process.stdout.write(
  [texto(dados.em), texto(dados.arquivo), texto(dados.sha256), texto(dados.verificadoRemoto)].join("\t"),
);
' "$estado") || falhar "O recibo de backup não é um JSON válido."

IFS=$'\t' read -r em arquivo sha remoto <<<"$campos"
[ -n "$em" ] || falhar "O recibo não informa a data do backup."
[ -n "$arquivo" ] || falhar "O recibo não informa o arquivo do backup."
[ -n "$sha" ] || falhar "O recibo não informa o checksum do backup."

case "$arquivo" in
  */* | *..* | .*)
    falhar "O nome do arquivo no recibo é inválido."
    ;;
esac
if [ "${#sha}" -ne 64 ]; then
  falhar "O checksum do recibo não tem 64 caracteres."
fi
case "$sha" in
  *[!0-9a-f]*)
    falhar "O checksum do recibo não é hexadecimal."
    ;;
esac

if ! epoca=$(date -u -d "$em" +%s 2>/dev/null); then
  falhar "A data do recibo é inválida: $em."
fi
agora=$(date -u +%s)
idade=$((agora - epoca))
if [ "$idade" -lt -300 ]; then
  falhar "A data do recibo está no futuro: $em."
fi
if [ "$idade" -lt 0 ]; then
  idade=0
fi
if [ "$idade" -gt $((idade_maxima * 3600)) ]; then
  falhar "O último backup confirmado tem mais de $idade_maxima horas."
fi

caminho="$backup_dir/$arquivo"
[ -f "$caminho" ] || falhar "O arquivo confirmado pelo recibo não existe em $caminho."
calculado=$(sha256sum "$caminho" | cut -d' ' -f1)
[ "$calculado" = "$sha" ] || falhar "O checksum do arquivo diverge do recibo."

if [ "$exigir_remoto" = "true" ]; then
  [ "$remoto" = "true" ] ||
    falhar "O recibo não confirma a verificação da cópia remota."
fi

printf '[backup-gate] Backup confirmado em %s, arquivo %s.\n' "$em" "$arquivo"
