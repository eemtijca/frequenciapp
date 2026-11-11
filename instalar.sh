#!/usr/bin/env bash
# Bootstrap do instalador auto-hospedado: confere o host, prepara o Node privado e entrega a CLI.
if [ -z "${BASH_VERSION:-}" ]; then
  printf '%s\n' "E_DISTRO: Bash não encontrado. O instalador exige Bash." >&2
  exit 3
fi
set -Eeuo pipefail
umask 077
IFS=$'\n\t'

RAIZ_INSTALADOR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE_VERSAO="v24.22.3"
NODE_SHA256_X64="061ec3e3062115705b56b51fa9cc330ab50d34b6969387d4e4b1a50c6809acc2"
NODE_SHA256_ARM64="261af2af250dfd7e9f25cf151d1b2713a0adf8f10a9ad116c4947f68627affe8"
NODE_SHA256_X64_MUSL="5499b663f62c72093715da98f4aea6f83427ad8bab9cf9c75f0924e0e456ce14"

ARQ=""
PLATAFORMA_NODE=""
NODE_SHA256=""
NODE_MUSL_ARM64="false"
NODE_PRIVADO=""
NODE_BIN=""
GERENCIADOR_BOOTSTRAP=""
TRAVA_DIR=""
TRAVA_ARQUIVO=""
TRAVA_ATIVA="false"
TMP_DIR=""

limpar() {
  local status=$?
  trap - EXIT INT TERM
  if [ "$TRAVA_ATIVA" = "true" ] && command -v flock >/dev/null 2>&1; then
    flock -u 9 >/dev/null 2>&1 || true
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf -- "$TMP_DIR"
  fi
  exit "$status"
}

trap limpar EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

falhar() {
  local codigo="$1"
  local saida="$2"
  shift 2
  printf '%s: %s\n' "$codigo" "$*" >&2
  exit "$saida"
}

existe() {
  command -v "$1" >/dev/null 2>&1
}

verificar_plataforma() {
  if [ -z "${BASH_VERSION:-}" ]; then
    falhar E_DISTRO 3 "Bash não encontrado. O instalador exige Bash."
  fi
  local sistema
  local em_container="false"
  sistema="$(uname -s 2>/dev/null || printf 'desconhecido')"
  if [ "$sistema" != "Linux" ]; then
    falhar E_DISTRO 3 "Sistema não suportado: $sistema. O instalador exige Linux."
  fi
  if [ -e /.dockerenv ] || [ -e /run/.containerenv ]; then
    em_container="true"
  fi
  if [ "$em_container" = "false" ] && [ -n "${WSL_DISTRO_NAME:-}" ]; then
    falhar E_DISTRO 3 "WSL não é suportado. Use um VPS Linux."
  fi
  if [ "$em_container" = "false" ] && grep -qi microsoft /proc/version 2>/dev/null; then
    falhar E_DISTRO 3 "WSL não é suportado. Use um VPS Linux."
  fi
}

carregar_os_release() {
  local arquivo=""
  local candidato
  for candidato in /etc/os-release /usr/lib/os-release; do
    if [ -r "$candidato" ]; then
      arquivo="$candidato"
      break
    fi
  done
  if [ -z "$arquivo" ]; then
    falhar E_DISTRO 3 "Arquivo /etc/os-release não encontrado."
  fi
  # shellcheck disable=SC1090
  . "$arquivo"
  if [ -z "${ID:-}" ]; then
    falhar E_DISTRO 3 "Distribuição não identificada em /etc/os-release."
  fi
}

detectar_arquitetura() {
  local bruta
  local libc
  local musl="false"
  bruta="$(uname -m 2>/dev/null || printf 'desconhecida')"
  case "$bruta" in
    x86_64 | amd64)
      ARQ="amd64"
      PLATAFORMA_NODE="linux-x64"
      NODE_SHA256="$NODE_SHA256_X64"
      ;;
    aarch64 | arm64)
      ARQ="arm64"
      PLATAFORMA_NODE="linux-arm64"
      NODE_SHA256="$NODE_SHA256_ARM64"
      ;;
    i386 | i486 | i586 | i686)
      falhar E_DISTRO 3 "Arquitetura de 32 bits não suportada: $bruta."
      ;;
    *)
      falhar E_DISTRO 3 "Arquitetura não suportada: $bruta."
      ;;
  esac
  if [ -e /lib/ld-musl-x86_64.so.1 ] || [ -e /lib/ld-musl-aarch64.so.1 ]; then
    musl="true"
  else
    libc="$(ldd --version 2>&1 || true)"
    if printf '%s' "$libc" | grep -qi musl; then
      musl="true"
    fi
  fi
  if [ "$musl" = "true" ]; then
    if [ "$ARQ" = "amd64" ]; then
      PLATAFORMA_NODE="linux-x64-musl"
      NODE_SHA256="$NODE_SHA256_X64_MUSL"
    else
      NODE_MUSL_ARM64="true"
    fi
  fi
}

detectar_gerenciador_bootstrap() {
  if existe apt-get; then
    GERENCIADOR_BOOTSTRAP="apt"
  elif existe dnf; then
    GERENCIADOR_BOOTSTRAP="dnf"
  elif existe yum; then
    GERENCIADOR_BOOTSTRAP="yum"
  elif existe pacman; then
    GERENCIADOR_BOOTSTRAP="pacman"
  elif existe zypper; then
    GERENCIADOR_BOOTSTRAP="zypper"
  elif existe apk; then
    GERENCIADOR_BOOTSTRAP="apk"
  else
    GERENCIADOR_BOOTSTRAP=""
  fi
}

definir_node_privado() {
  local base
  if [ -n "${INSTALADOR_NODE_DIR:-}" ]; then
    base="$INSTALADOR_NODE_DIR"
  elif [ "$(id -u)" -eq 0 ]; then
    base="/var/cache/frequenciapp/node"
  else
    base="${XDG_CACHE_HOME:-${HOME:-/tmp}/.cache}/frequenciapp/node"
  fi
  NODE_PRIVADO="$base/${NODE_VERSAO}-${PLATAFORMA_NODE}"
}

resolver_node() {
  local -a candidatos=()
  local candidato
  local versao
  local maior
  if [ -n "${INSTALADOR_NODE:-}" ]; then
    if [ ! -x "$INSTALADOR_NODE" ]; then
      falhar E_VALIDACAO 4 "INSTALADOR_NODE não aponta para um executável."
    fi
    candidatos=("$INSTALADOR_NODE")
  else
    if [ -x "$NODE_PRIVADO/bin/node" ]; then
      candidatos+=("$NODE_PRIVADO/bin/node")
    fi
    if existe node; then
      candidatos+=("$(command -v node)")
    fi
  fi
  for candidato in "${candidatos[@]}"; do
    versao="$("$candidato" -p 'process.versions.node' 2>/dev/null || true)"
    maior="${versao%%.*}"
    if [ -n "$versao" ] && [[ "$maior" =~ ^[0-9]+$ ]] && [ "$maior" -ge 24 ]; then
      NODE_BIN="$candidato"
      return 0
    fi
  done
  if [ -n "${INSTALADOR_NODE:-}" ]; then
    falhar E_VALIDACAO 4 "INSTALADOR_NODE aponta para Node.js sem a versão 24 mínima."
  fi
  NODE_BIN=""
  return 1
}

instalar_pacotes_bootstrap() {
  local pacotes=("$@")
  if [ "${#pacotes[@]}" -eq 0 ]; then
    return 0
  fi
  case "$GERENCIADOR_BOOTSTRAP" in
    apt)
      DEBIAN_FRONTEND=noninteractive apt-get update -qq || return 1
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends \
        "${pacotes[@]}" || return 1
      ;;
    dnf)
      dnf install -y -q --setopt=install_weak_deps=False "${pacotes[@]}" || return 1
      ;;
    yum)
      yum install -y -q "${pacotes[@]}" || return 1
      ;;
    pacman)
      pacman -Sy --needed --noconfirm "${pacotes[@]}" || return 1
      ;;
    zypper)
      zypper --non-interactive refresh || return 1
      zypper --non-interactive install --no-recommends --auto-agree-with-licenses \
        "${pacotes[@]}" || return 1
      ;;
    apk)
      apk add --no-cache "${pacotes[@]}" || return 1
      ;;
    *)
      return 1
      ;;
  esac
}

garantir_utilitarios() {
  local pacotes=()
  if ! existe curl && ! existe wget; then
    pacotes+=("curl")
  fi
  if ! existe tar; then
    pacotes+=("tar")
  fi
  if ! existe gzip; then
    pacotes+=("gzip")
  fi
  if ! existe sha256sum && ! existe openssl && ! existe shasum; then
    pacotes+=("coreutils")
  fi
  if ! existe flock; then
    pacotes+=("util-linux")
  fi
  if [ "$PLATAFORMA_NODE" = "linux-x64-musl" ] && [ ! -e /usr/lib/libstdc++.so.6 ]; then
    pacotes+=("libstdc++")
  fi
  if [ ! -f /etc/ssl/certs/ca-certificates.crt ] &&
    [ ! -f /etc/pki/tls/certs/ca-bundle.crt ] &&
    [ ! -f /etc/ssl/cert.pem ]; then
    pacotes+=("ca-certificates")
  fi
  if [ "${#pacotes[@]}" -eq 0 ]; then
    return 0
  fi
  if [ -z "$GERENCIADOR_BOOTSTRAP" ]; then
    falhar E_PACOTE 8 "Gerenciador de pacotes não reconhecido para instalar o mínimo."
  fi
  if ! instalar_pacotes_bootstrap "${pacotes[@]}"; then
    falhar E_PACOTE 8 "Falha ao instalar os utilitários mínimos com $GERENCIADOR_BOOTSTRAP."
  fi
}

baixar() {
  local url="$1"
  local destino="$2"
  if existe curl; then
    if curl --proto '=https' --tlsv1.2 -fsSL --retry 3 --connect-timeout 15 \
      -o "$destino" "$url"; then
      :
    elif existe wget; then
      wget -q -T 30 -t 3 -O "$destino" "$url" || falhar E_REDE 6 "Falha ao baixar o Node.js oficial."
    else
      falhar E_REDE 6 "Falha ao baixar o Node.js oficial."
    fi
  elif existe wget; then
    wget -q -T 30 -t 3 -O "$destino" "$url" || falhar E_REDE 6 "Falha ao baixar o Node.js oficial."
  else
    falhar E_VALIDACAO 4 "curl ou wget não encontrado."
  fi
  if [ ! -s "$destino" ]; then
    falhar E_REDE 6 "O download do Node.js oficial ficou vazio."
  fi
}

verificar_sha256() {
  local arquivo="$1"
  local esperado="$2"
  local saida=""
  local obtido=""
  if existe sha256sum; then
    saida="$(sha256sum "$arquivo" 2>/dev/null || true)"
    obtido="${saida%% *}"
  elif existe openssl; then
    saida="$(openssl dgst -sha256 "$arquivo" 2>/dev/null || true)"
    obtido="${saida##* }"
  elif existe shasum; then
    saida="$(shasum -a 256 "$arquivo" 2>/dev/null || true)"
    obtido="${saida%% *}"
  else
    falhar E_VALIDACAO 4 "sha256sum, openssl ou shasum não encontrado."
  fi
  if [ "$obtido" != "$esperado" ]; then
    falhar E_VALIDACAO 7 "O SHA-256 do Node.js oficial diverge do valor esperado."
  fi
}

instalar_node() {
  if [ "$NODE_MUSL_ARM64" = "true" ]; then
    falhar E_DISTRO 3 "Node.js 24 oficial não publica build musl para arm64."
  fi
  if [ -z "$NODE_SHA256" ]; then
    falhar E_DISTRO 3 "Plataforma Node.js não suportada: $PLATAFORMA_NODE."
  fi
  garantir_utilitarios
  if ! mkdir -p "$(dirname "$NODE_PRIVADO")"; then
    falhar E_VALIDACAO 5 "Sem permissão para criar o diretório do Node privado."
  fi
  TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/frequenciapp-node.XXXXXX")" ||
    falhar E_VALIDACAO 7 "Não foi possível criar o diretório temporário."
  local url="https://nodejs.org/dist/${NODE_VERSAO}/node-${NODE_VERSAO}-${PLATAFORMA_NODE}.tar.gz"
  local pacote="$TMP_DIR/node.tar.gz"
  baixar "$url" "$pacote"
  verificar_sha256 "$pacote" "$NODE_SHA256"
  if ! mkdir -p "$TMP_DIR/extraido"; then
    falhar E_VALIDACAO 7 "Não foi possível preparar a extração do Node."
  fi
  if ! tar -xzf "$pacote" -C "$TMP_DIR/extraido" --strip-components=1; then
    falhar E_VALIDACAO 7 "Não foi possível extrair o Node.js oficial."
  fi
  if [ ! -x "$TMP_DIR/extraido/bin/node" ]; then
    falhar E_VALIDACAO 7 "O tarball do Node.js não contém o executável esperado."
  fi
  if [ -e "$NODE_PRIVADO" ]; then
    falhar E_VALIDACAO 7 "O runtime Node privado existente não é válido. Remova $NODE_PRIVADO."
  fi
  if ! mv "$TMP_DIR/extraido" "$NODE_PRIVADO"; then
    falhar E_VALIDACAO 5 "Não foi possível instalar o Node privado em $NODE_PRIVADO."
  fi
  NODE_BIN="$NODE_PRIVADO/bin/node"
}

comando_altera_host() {
  local primeiro="${1:-}"
  case "$primeiro" in
    aplicar | atualizar | backup | restaurar | desinstalar | --aplicar)
      return 0
      ;;
    canal)
      if [ "${2:-}" = "definir" ]; then
        return 0
      fi
      ;;
  esac
  return 1
}

abrir_trava() {
  if ! existe flock; then
    if [ "${INSTALADOR_PERMITIR_BOOTSTRAP:-0}" = "1" ]; then
      garantir_utilitarios
    else
      falhar E_VALIDACAO 4 "flock não encontrado para abrir a trava."
    fi
  fi
  TRAVA_DIR="${INSTALADOR_LOCK_DIR:-/var/lock/frequenciapp}"
  if ! mkdir -p "$TRAVA_DIR"; then
    falhar E_VALIDACAO 5 "Sem permissão para criar $TRAVA_DIR."
  fi
  chmod 700 "$TRAVA_DIR" || true
  TRAVA_ARQUIVO="$TRAVA_DIR/instalador.lock"
  if ! exec 9>"$TRAVA_ARQUIVO"; then
    falhar E_VALIDACAO 5 "Sem permissão para criar a trava em $TRAVA_ARQUIVO."
  fi
  chmod 600 "$TRAVA_ARQUIVO" || true
  local ajuda_flock
  ajuda_flock="$(flock --help 2>&1 || true)"
  if printf '%s' "$ajuda_flock" | grep -q -- '-w'; then
    if ! flock -w 30 9; then
      falhar E_VALIDACAO 7 "A trava do instalador está ocupada por outro processo."
    fi
  else
    local espera=0
    while ! flock -n 9; do
      if [ "$espera" -ge 30 ]; then
        falhar E_VALIDACAO 7 "A trava do instalador está ocupada por outro processo."
      fi
      sleep 1
      espera=$((espera + 1))
    done
  fi
  TRAVA_ATIVA="true"
}

verificar_plataforma
carregar_os_release
detectar_arquitetura
detectar_gerenciador_bootstrap
definir_node_privado

if ! resolver_node; then
  if [ -n "${INSTALADOR_NODE:-}" ]; then
    falhar E_VALIDACAO 4 "INSTALADOR_NODE não aponta para Node.js 24."
  fi
  if [ "${INSTALADOR_PERMITIR_BOOTSTRAP:-0}" = "1" ] && comando_altera_host "$@"; then
    instalar_node
    if ! resolver_node; then
      falhar E_VALIDACAO 4 "Node.js 24 não encontrado após a preparação do runtime."
    fi
  else
    falhar E_VALIDACAO 4 \
      "Node.js 24 não encontrado. Instale Node.js 24 ou use INSTALADOR_PERMITIR_BOOTSTRAP=1 em um comando que altera o host."
  fi
fi

if comando_altera_host "$@"; then
  abrir_trava
fi

if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
  rm -rf -- "$TMP_DIR"
  TMP_DIR=""
fi

exec "$NODE_BIN" "$RAIZ_INSTALADOR/scripts/instalador/cli.mjs" "$@"
