#!/usr/bin/env bash
# Exercita home GPG curto e pin com chave exclusivamente sintética, sem banco.
set -Eeuo pipefail
raiz="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
. "$raiz/scripts/servidor/comum.sh"
tmp=$(mktemp -d)
trap 'limpar_home_gpg; rm -rf "$tmp"' EXIT
mkdir -p "$tmp/temporarios muito longos/$(printf 'a%.0s' {1..120})"
export TMPDIR="$tmp/temporarios muito longos/$(printf 'a%.0s' {1..120})"
export GPG_BASE_CURTA="$tmp/curto"
mkdir -m700 "$GPG_BASE_CURTA"
iniciar_home_gpg
home_criado="$GNUPGHOME"
[ "$(stat -c %a "$home_criado")" = 700 ]
[[ "$home_criado" != "$TMPDIR"* ]]
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key \
  'Operacao Sintetica <sintetico@exemplo.invalid>' ed25519 sign 0 >/dev/null 2>&1
fingerprint=$(gpg --batch --with-colons --list-keys | awk -F: '$1 == "fpr" {print $10; exit}')
gpg --batch --pinentry-mode loopback --passphrase '' --quick-add-key "$fingerprint" cv25519 encr 0 >/dev/null 2>&1
export BACKUP_GPG_DESTINATARIO="$fingerprint" BACKUP_GPG_FINGERPRINT="$fingerprint"
validar_destinatario_gpg
[[ "$BACKUP_DESTINATARIO_VERIFICADO" =~ ^[A-F0-9]{40}$ ]]
[ "$BACKUP_DESTINATARIO_VERIFICADO" != "$fingerprint" ]
if (BACKUP_GPG_FINGERPRINT=0000000000000000000000000000000000000000; validar_destinatario_gpg) 2>/dev/null; then
  erro "Pin divergente foi aceito."
fi
limpar_home_gpg
[ ! -e "$home_criado" ]
printf 'Home privado e destinatário sintético conferidos; não prova restauração PostgreSQL.\n'
