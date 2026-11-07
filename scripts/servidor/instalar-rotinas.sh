#!/usr/bin/env bash
# Instala o cron e o logrotate das rotinas do servidor auto-hospedado.
set -Eeuo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=comum.sh
. "$DIR/comum.sh"

[ "$(id -u)" -eq 0 ] || erro "Execute este instalador como root."

carregar_ambiente

SERVIDOR_USUARIO="${SERVIDOR_USUARIO:-frequenciapp}"
AGENDA_HABILITADA="${AGENDA_HABILITADA:-true}"
BACKUP_HABILITADO="${BACKUP_HABILITADO:-true}"
BACKUP_PLANILHAS_HABILITADO="${BACKUP_PLANILHAS_HABILITADO:-true}"
ATUALIZAR_HABILITADO="${ATUALIZAR_HABILITADO:-true}"
CRON_TZ="${CRON_TZ:-${TZ_APP:-America/Fortaleza}}"
MAILTO="${MAILTO:-}"
BACKUP_HORARIO="${BACKUP_HORARIO:-30 2 * * *}"
BACKUP_PLANILHAS_HORARIO="${BACKUP_PLANILHAS_HORARIO:-0 3 * * *}"
AGENDA_HORARIO="${AGENDA_HORARIO:-*/5 * * * *}"
ATUALIZAR_HORARIO="${ATUALIZAR_HORARIO:-30 4 * * *}"
CERTBOT_RENOVAR_HORARIO="${CERTBOT_RENOVAR_HORARIO:-15 2 * * *}"

id -u "$SERVIDOR_USUARIO" >/dev/null 2>&1 ||
  erro "O usuário $SERVIDOR_USUARIO não existe."

criar_diretorios
chown -R "$SERVIDOR_USUARIO:$SERVIDOR_USUARIO" "$ESTADO_DIR" "$BACKUP_DIR" "$LOG_DIR"
chmod +x "$DIR/agenda.sh" "$DIR/backup-banco.sh" "$DIR/backup-planilhas.sh" \
  "$DIR/backup-planilhas-interno.sh" "$DIR/atualizar.sh" \
  "$DIR/renovar-certificado.sh" "$DIR/compose.sh" 2>/dev/null || true

cron_tmp=$(mktemp)
{
  printf '%s\n' \
    "# Rotinas do FrequenciApp. Gerado por scripts/servidor/instalar-rotinas.sh." \
    "SHELL=/bin/bash" \
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin" \
    "MAILTO=\"$MAILTO\"" \
    "CRON_TZ=$CRON_TZ" \
    ""
  if [ "$AGENDA_HABILITADA" = "true" ]; then
    printf '%s %s %s/scripts/servidor/agenda.sh >>%s/agenda.log 2>&1\n' \
      "$AGENDA_HORARIO" "$SERVIDOR_USUARIO" "$APP_DIR" "$LOG_DIR"
  fi
  if [ "$BACKUP_HABILITADO" = "true" ]; then
    printf '%s %s %s/scripts/servidor/backup-banco.sh >>%s/backup.log 2>&1\n' \
      "$BACKUP_HORARIO" "$SERVIDOR_USUARIO" "$APP_DIR" "$LOG_DIR"
  fi
  if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
    printf '%s %s %s/scripts/servidor/backup-planilhas.sh >>%s/backup-planilhas.log 2>&1\n' \
      "$BACKUP_PLANILHAS_HORARIO" "$SERVIDOR_USUARIO" "$APP_DIR" "$LOG_DIR"
  fi
  if [ "$ATUALIZAR_HABILITADO" = "true" ]; then
    printf '%s %s %s/scripts/servidor/atualizar.sh >>%s/atualizacao.log 2>&1\n' \
      "$ATUALIZAR_HORARIO" "$SERVIDOR_USUARIO" "$APP_DIR" "$LOG_DIR"
  fi
  if [ "${PROXY_TIPO:-caddy}" = "nginx" ] && [ "${TLS_MODO:-acme}" = "acme" ]; then
    printf '%s %s %s/scripts/servidor/renovar-certificado.sh >>%s/certificado.log 2>&1\n' \
      "$CERTBOT_RENOVAR_HORARIO" "$SERVIDOR_USUARIO" "$APP_DIR" "$LOG_DIR"
  fi
} >"$cron_tmp"

install -m 644 -o root -g root "$cron_tmp" /etc/cron.d/frequenciapp
rm -f "$cron_tmp"

cat >/etc/logrotate.d/frequenciapp <<EOF
$LOG_DIR/*.log {
    weekly
    rotate 12
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
chmod 644 /etc/logrotate.d/frequenciapp

if command -v systemctl >/dev/null 2>&1; then
  systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true
fi

log "Cron instalado em /etc/cron.d/frequenciapp."
log "Logrotate instalado em /etc/logrotate.d/frequenciapp."
