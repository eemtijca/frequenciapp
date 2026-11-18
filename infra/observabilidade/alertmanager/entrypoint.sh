#!/bin/sh
# Gera a configuração do Alertmanager a partir de um receptor opt-in e inicia o serviço.
set -eu

umask 077

erro() {
  printf 'Alertmanager: %s\n' "$*" >&2
  exit 1
}

escapar_sed() {
  printf '%s' "$1" | sed -e 's/[\\&|]/\\&/g'
}

escapar_yaml() {
  # Duplica aspas simples para o escalar YAML e protege a substituição do sed.
  printf '%s' "$1" | sed -e "s/'/''/g" | sed -e 's/[\\&|]/\\&/g'
}

exigir_linha_unica() {
  [ "$(printf '%s' "$1" | tr -d '\r\n')" = "$1" ] ||
    erro "Os valores do receptor de e-mail não podem conter quebra de linha."
}

webhook="${ALERTA_WEBHOOK_URL:-}"
email_para="${ALERTA_EMAIL_PARA:-}"
email_de="${ALERTA_EMAIL_DE:-}"
smtp_smarthost="${ALERTA_SMTP_SMARTHOST:-}"
smtp_usuario="${ALERTA_SMTP_USUARIO:-}"
smtp_senha="${ALERTA_SMTP_SENHA:-}"

receptores=0
[ -z "$webhook" ] || receptores=$((receptores + 1))
email=false
if [ -n "$email_para$email_de$smtp_smarthost$smtp_usuario$smtp_senha" ]; then
  email=true
  receptores=$((receptores + 1))
fi

[ "$receptores" -ne 0 ] ||
  erro "Configure ALERTA_WEBHOOK_URL ou o conjunto ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE, ALERTA_SMTP_SMARTHOST, ALERTA_SMTP_USUARIO e ALERTA_SMTP_SENHA."
[ "$receptores" -eq 1 ] ||
  erro "Configure apenas um receptor: webhook ou e-mail."

if [ "$email" = true ]; then
  for valor in "$email_para" "$email_de" "$smtp_smarthost" "$smtp_usuario" "$smtp_senha"; do
    [ -n "$valor" ] ||
      erro "O receptor de e-mail exige ALERTA_EMAIL_PARA, ALERTA_EMAIL_DE, ALERTA_SMTP_SMARTHOST, ALERTA_SMTP_USUARIO e ALERTA_SMTP_SENHA."
    exigir_linha_unica "$valor"
  done

  cat <<'EOF' >/tmp/alertmanager-email.yml
global:
  smtp_smarthost: '__SMARTHOST__'
  smtp_from: '__DE__'
  smtp_auth_username: '__USUARIO__'
  smtp_auth_password: '__SENHA__'
  smtp_require_tls: true

route:
  receiver: frequenciapp
  group_by: ['alertname']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h

receivers:
  - name: frequenciapp
    email_configs:
      - to: '__PARA__'
        require_tls: true
        send_resolved: true
EOF

  sed \
    -e "s|__PARA__|$(escapar_yaml "$email_para")|" \
    -e "s|__DE__|$(escapar_yaml "$email_de")|" \
    -e "s|__SMARTHOST__|$(escapar_yaml "$smtp_smarthost")|" \
    -e "s|__USUARIO__|$(escapar_yaml "$smtp_usuario")|" \
    -e "s|__SENHA__|$(escapar_yaml "$smtp_senha")|" \
    /tmp/alertmanager-email.yml >/tmp/alertmanager.yml
  rm -f /tmp/alertmanager-email.yml
else
  case "$webhook" in
    http://* | https://*) ;;
    *) erro "ALERTA_WEBHOOK_URL precisa começar com http:// ou https://." ;;
  esac
  case "$webhook" in
    *[[:space:]]*) erro "ALERTA_WEBHOOK_URL não pode conter espaços." ;;
  esac
  sed "s|http://127.0.0.1:9099/alerta|$(escapar_sed "$webhook")|" \
    /etc/alertmanager/alertmanager.yml >/tmp/alertmanager.yml
fi

# A saída do amtool não é exibida para não expor valores do receptor em log.
if ! /bin/amtool check-config /tmp/alertmanager.yml >/dev/null 2>&1; then
  rm -f /tmp/alertmanager.yml
  erro "A configuração gerada do Alertmanager é inválida."
fi

exec /bin/alertmanager --config.file=/tmp/alertmanager.yml "$@"
