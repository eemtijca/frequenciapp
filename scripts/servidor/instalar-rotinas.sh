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
TZ_APP="${TZ_APP:-America/Fortaleza}"
CRON_TZ="${CRON_TZ:-}"
MAILTO="${MAILTO:-}"
BACKUP_HORARIO="${BACKUP_HORARIO:-30 2 * * *}"
BACKUP_PLANILHAS_HORARIO="${BACKUP_PLANILHAS_HORARIO:-0 3 * * *}"
AGENDA_HORARIO="${AGENDA_HORARIO:-*/5 * * * *}"
ATUALIZAR_HORARIO="${ATUALIZAR_HORARIO:-30 4 * * *}"
CERTBOT_RENOVAR_HORARIO="${CERTBOT_RENOVAR_HORARIO:-15 2 * * *}"

id -u "$SERVIDOR_USUARIO" >/dev/null 2>&1 ||
  erro "O usuário $SERVIDOR_USUARIO não existe."

fuso_do_sistema() {
  if [ -n "${CRON_FUSO_SISTEMA:-}" ]; then
    printf '%s' "$CRON_FUSO_SISTEMA"
    return 0
  fi
  if command -v timedatectl >/dev/null 2>&1; then
    local fuso
    fuso=$(timedatectl show --property=Timezone --value 2>/dev/null || true)
    if [ -n "$fuso" ]; then
      printf '%s' "$fuso"
      return 0
    fi
  fi
  if [ -r /etc/timezone ]; then
    head -n 1 /etc/timezone
    return 0
  fi
  date +%Z
}

cron_suporta_tz() {
  if command -v rpm >/dev/null 2>&1 && rpm -q cronie >/dev/null 2>&1; then
    return 0
  fi
  local binario
  binario=$(command -v cron || command -v crond || true)
  [ -n "$binario" ] || return 1
  command -v strings >/dev/null 2>&1 || return 1
  strings "$binario" 2>/dev/null | grep -q 'CRON_TZ'
}

validar_agendador() {
  command -v cron >/dev/null 2>&1 || command -v crond >/dev/null 2>&1 ||
    erro "Instale o cron antes de instalar as rotinas."
  local fuso_sistema
  fuso_sistema=$(fuso_do_sistema)
  [ -n "$fuso_sistema" ] ||
    erro "Não foi possível identificar o fuso do daemon do cron. Defina CRON_FUSO_SISTEMA."

  if [ -n "$CRON_TZ" ]; then
    cron_suporta_tz ||
      erro "O cron instalado não suporta CRON_TZ. Use o fuso do daemon ou um cron compatível."
    CRON_TZ_LINHA="CRON_TZ=$CRON_TZ"
    log "O cron usará CRON_TZ=$CRON_TZ; confirme o suporte na implementação instalada."
    return 0
  fi

  if [ "$fuso_sistema" != "$TZ_APP" ]; then
    erro "O fuso do daemon do cron ($fuso_sistema) difere de TZ_APP ($TZ_APP). Ajuste o fuso do sistema ou defina CRON_TZ em um cron compatível."
  fi
  CRON_TZ_LINHA=""
  log "O cron usará o fuso do daemon: $fuso_sistema."
}

validar_agendador
criar_diretorios
chown -R "$SERVIDOR_USUARIO:$SERVIDOR_USUARIO" "$ESTADO_DIR" "$BACKUP_DIR" "$LOG_DIR"
chmod +x "$DIR/agenda.sh" "$DIR/backup-banco.sh" "$DIR/backup-planilhas.sh" \
  "$DIR/backup-planilhas-interno.sh" "$DIR/atualizar.sh" "$DIR/restaurar.sh" \
  "$DIR/renovar-certificado.sh" "$DIR/compose.sh" 2>/dev/null || true

linha_agenda=""
linha_backup=""
linha_backup_planilhas=""
linha_atualizar=""
linha_certbot=""

if [ "$AGENDA_HABILITADA" = "true" ]; then
  linha_agenda="$AGENDA_HORARIO $SERVIDOR_USUARIO \"$APP_DIR/scripts/servidor/agenda.sh\" >>\"$LOG_DIR/agenda.log\" 2>&1"
fi
if [ "$BACKUP_HABILITADO" = "true" ]; then
  linha_backup="$BACKUP_HORARIO $SERVIDOR_USUARIO \"$APP_DIR/scripts/servidor/backup-banco.sh\" >>\"$LOG_DIR/backup.log\" 2>&1"
fi
if [ "$BACKUP_PLANILHAS_HABILITADO" = "true" ]; then
  linha_backup_planilhas="$BACKUP_PLANILHAS_HORARIO $SERVIDOR_USUARIO \"$APP_DIR/scripts/servidor/backup-planilhas.sh\" >>\"$LOG_DIR/backup-planilhas.log\" 2>&1"
fi
if [ "$ATUALIZAR_HABILITADO" = "true" ]; then
  linha_atualizar="$ATUALIZAR_HORARIO $SERVIDOR_USUARIO \"$APP_DIR/scripts/servidor/atualizar.sh\" >>\"$LOG_DIR/atualizacao.log\" 2>&1"
fi
if [ "${PROXY_TIPO:-caddy}" = "nginx" ] && [ "${TLS_MODO:-acme}" = "acme" ]; then
  linha_certbot="$CERTBOT_RENOVAR_HORARIO $SERVIDOR_USUARIO \"$APP_DIR/scripts/servidor/renovar-certificado.sh\" >>\"$LOG_DIR/certificado.log\" 2>&1"
fi

escapar_sed() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

modelo="$APP_DIR/infra/servidor/cron/servidor.template"
[ -f "$modelo" ] || erro "Modelo de cron não encontrado: $modelo"

cron_tmp=$(mktemp)
sed \
  -e "s|@MAILTO@|$(escapar_sed "$MAILTO")|g" \
  -e "s|@CRON_TZ_LINHA@|$(escapar_sed "$CRON_TZ_LINHA")|g" \
  -e "s|@LINHA_AGENDA@|$(escapar_sed "$linha_agenda")|g" \
  -e "s|@LINHA_BACKUP@|$(escapar_sed "$linha_backup")|g" \
  -e "s|@LINHA_BACKUP_PLANILHAS@|$(escapar_sed "$linha_backup_planilhas")|g" \
  -e "s|@LINHA_ATUALIZAR@|$(escapar_sed "$linha_atualizar")|g" \
  -e "s|@LINHA_CERTBOT@|$(escapar_sed "$linha_certbot")|g" \
  "$modelo" | grep -v '^$' >"$cron_tmp"

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
