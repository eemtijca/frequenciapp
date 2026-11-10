#!/usr/bin/env bash
# Exercita cifra real com chaves sintéticas e clientes PostgreSQL falsos.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$raiz/scripts/servidor/comum.sh"
tmp=$(mktemp -d)
trap 'limpar_home_gpg; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin" "$tmp/curto" "$tmp/caminho longo com espacos/$(printf 'x%.0s' {1..110})"
chmod 700 "$tmp/curto"
GPG_BASE_CURTA="$tmp/curto"
TMPDIR="$tmp/caminho longo com espacos/$(printf 'x%.0s' {1..110})"
export GPG_BASE_CURTA TMPDIR
cat >"$tmp/bin/pg_dump" <<'CLIENTE'
#!/usr/bin/env bash
printf 'conteudo sintetico sem banco\n'
CLIENTE
cat >"$tmp/bin/pg_restore" <<'CLIENTE'
#!/usr/bin/env bash
printf 'pg_restore\n' >>"$CLIENTE_LOG"
if [ "${1:-}" = -l ]; then cat "${2:-/dev/stdin}" >/dev/null; else cat >"$RESTAURADO_FALSO"; fi
CLIENTE
cat >"$tmp/bin/psql" <<'CLIENTE'
#!/usr/bin/env bash
cat >/dev/null
printf '1\n'
CLIENTE
chmod +x "$tmp/bin/"*
export PATH="$tmp/bin:$PATH" SERVIDOR_AMBIENTE_INJETADO=true BACKUP_MODO=url
export ESTADO_DIR="$tmp/estado" BACKUP_DIR="$TMPDIR/backups" BACKUP_BANCO_DIR="$TMPDIR/backups/banco"
export SERVIDOR_LOCK_DIR="$tmp/locks" BACKUP_CRIPTOGRAFIA=gpg BACKUP_INCLUIR_AMBIENTE=false
export BACKUP_ESPACO_MINIMO_MB=0 BACKUP_DATABASE_URL=postgresql://sintetico/nao-conectar
export CLIENTE_LOG="$tmp/clientes.log" RESTAURADO_FALSO="$tmp/restaurado"
iniciar_home_gpg
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key \
  'Cifra Sintetica <cifra@exemplo.invalid>' rsa2048 encr 0 >/dev/null 2>&1
fingerprint=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" { print $10; exit }')
gpg --batch --armor --export "$fingerprint" >"$tmp/publica.asc"
gpg --batch --armor --export-secret-keys "$fingerprint" >"$tmp/privada.asc"
export BACKUP_GPG_DESTINATARIO="$fingerprint" BACKUP_GPG_FINGERPRINT="$fingerprint"
export BACKUP_GPG_CHAVE_PUBLICA="$tmp/publica.asc" BACKUP_GPG_CHAVE_PRIVADA="$tmp/privada.asc"
bash "$raiz/scripts/servidor/backup-banco.sh"
arquivos=("$BACKUP_BANCO_DIR/"*.dump.gpg)
[ -s "${arquivos[0]}" ]
bash "$raiz/scripts/servidor/restaurar.sh" --arquivo "${arquivos[0]}" --confirmar --sem-copia --sem-validacao
cmp "$RESTAURADO_FALSO" <(printf 'conteudo sintetico sem banco\n')
limpar_home_gpg
# Chave protegida nunca usa o cache da estação no processo da restauração.
iniciar_home_gpg
printf 'marcador-sintetico-nao-real\n' | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --quick-generate-key \
  'Protegida Sintetica <protegida@exemplo.invalid>' rsa2048 encr 0 >/dev/null 2>&1
fingerprint=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" { print $10; exit }')
printf 'marcador-sintetico-nao-real\n' | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --armor --export-secret-keys "$fingerprint" >"$tmp/protegida.asc"
printf 'conteudo sintetico sem banco\n' | gpg --batch --trust-model always --recipient "$fingerprint" --output "$tmp/protegido.gpg" --encrypt
export BACKUP_GPG_CHAVE_PRIVADA="$tmp/protegida.asc"
: >"$CLIENTE_LOG"
if timeout 15 bash "$raiz/scripts/servidor/restaurar.sh" --arquivo "$tmp/protegido.gpg" --confirmar --sem-copia --sem-validacao >"$tmp/protegida.log" 2>&1; then
  erro "Chave protegida foi desbloqueada sem contrato."
else
  status=$?
  [ "$status" -ne 124 ] || erro "Decifra ficou suspensa em pinentry."
fi
[ ! -s "$CLIENTE_LOG" ] || erro "A falha de decifra chegou ao cliente de banco."
grep -q 'estação autorizada' "$tmp/protegida.log"
if grep -q 'marcador-sintetico-nao-real' "$tmp/protegida.log"; then
  erro "Marcador sensível apareceu no log da decifra."
fi
# O fluxo externo entrega somente o dump decifrado; ainda usa temporário privado.
printf 'marcador-sintetico-nao-real\n' | gpg --batch --pinentry-mode loopback --passphrase-fd 0 --output "$tmp/decifrado" --decrypt "$tmp/protegido.gpg" >/dev/null 2>&1
bash "$raiz/scripts/servidor/restaurar.sh" --entrada - --confirmar --sem-copia --sem-validacao <"$tmp/decifrado"
cmp "$RESTAURADO_FALSO" "$tmp/decifrado"
limpar_home_gpg
[ -z "$(find "$GPG_BASE_CURTA" -mindepth 1 -print -quit)" ] || erro "Home GPG residual."
printf 'Cifra, recusa de chave protegida e entrada externa exercitadas com clientes falsos, não PostgreSQL.\n'
