#!/usr/bin/env bash
# Simula UID/ownership para o protocolo root-cron; não é ensaio multi-UID real.
set -Eeuo pipefail
raiz="$(pwd)"
p=$(mktemp -d)
trap 'rm -rf "$p"' EXIT
mkdir -m 700 "$p/locks" "$p/bin"
: >"$p/locks/operacoes.lock"
chmod 600 "$p/locks/operacoes.lock"
cat >"$p/bin/id" <<'ID'
#!/bin/bash
if [ "${2:-}" = operador ]; then printf '2000\n'; else printf '%s\n' "$UID_SIMULADO"; fi
ID
cat >"$p/bin/stat" <<'STAT'
#!/bin/bash
if [ "$1" = -c ] && [ "$2" = %u ]; then printf '2000\n'; else exec /usr/bin/stat "$@"; fi
STAT
chmod +x "$p/bin/id" "$p/bin/stat"
export PATH="$p/bin:$PATH" SERVIDOR_LOCK_DIR="$p/locks" SERVIDOR_ALVO_CHAVE=sintetico SERVIDOR_USUARIO=operador
export COMUM="$raiz/scripts/servidor/comum.sh"
# O processo dito root usa o mesmo inode já pertencente ao operador sintético.
UID_SIMULADO=0 bash -c '. "$COMUM"; travar instalador; stat -Lc "%d:%i" /proc/self/fd/9; UID_SIMULADO=2000 bash -c '\''. "$COMUM"; travar cron; stat -Lc "%d:%i" /proc/self/fd/9'\''' >"$p/root.log"
UID_SIMULADO=2000 bash -c '. "$COMUM"; travar cron; stat -Lc "%d:%i" /proc/self/fd/9' >"$p/cron.log"
[ "$(sort -u "$p/root.log")" = "$(cat "$p/cron.log")" ]
[ "$(wc -l <"$p/root.log")" = 2 ]
# O root não reatribui ownership nem concede privilégios ao cron.
! grep -Eq 'sudo' "$COMUM"
printf 'PASS OP-02/UID-ownership-simulados mesmo inode e FD herdado\n'
