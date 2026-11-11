// Detecta distribuição, arquitetura, iniciador, segurança e ferramentas do host sem alterar nada.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const LIMITE_ARQUIVO = 64 * 1024;
const LIMITE_ESTADO = 1024 * 1024;
const OPCOES_EXECUCAO = {
  encoding: "utf8",
  timeout: 5000,
  maxBuffer: 1024 * 1024,
  windowsHide: true,
};

const MAPA_ARQUITETURA = new Map([
  ["x64", "amd64"],
  ["x86_64", "amd64"],
  ["amd64", "amd64"],
  ["aarch64", "arm64"],
  ["arm64", "arm64"],
  ["ia32", "i386"],
  ["i386", "i386"],
  ["i486", "i386"],
  ["i586", "i386"],
  ["i686", "i386"],
  ["armv6l", "armv6l"],
  ["armv7l", "armv7l"],
]);

const IDS_DEBIAN = new Set([
  "ubuntu",
  "debian",
  "raspbian",
  "linuxmint",
  "pop",
  "elementary",
  "zorin",
  "kali",
  "devuan",
]);
const IDS_RHEL = new Set([
  "rhel",
  "rocky",
  "almalinux",
  "centos",
  "ol",
  "oracle",
  "amzn",
  "cloudlinux",
]);
const IDS_ARCH = new Set(["arch", "archlinux", "archarm", "manjaro"]);
const IDS_SUSE = new Set([
  "opensuse",
  "opensuse-leap",
  "opensuse-tumbleweed",
  "suse",
  "sles",
  "sle",
]);

// Executa um comando com limite de tempo e devolve status, saída e erro.
export function executarPadrao(comando, argumentos = [], opcoes = {}) {
  const resultado = spawnSync(comando, argumentos, { ...OPCOES_EXECUCAO, ...opcoes });
  return {
    status: typeof resultado.status === "number" ? resultado.status : 1,
    stdout: String(resultado.stdout ?? "").trim(),
    stderr: String(resultado.stderr ?? "").trim(),
    erro: resultado.error ? (resultado.error.code ?? "falha") : null,
  };
}

// Confere a presença de um comando no PATH sem executá-lo.
export function comandoExistePadrao(nome, executar = executarPadrao) {
  const resultado = executar("sh", ["-c", 'command -v "$1" >/dev/null 2>&1', "sh", nome]);
  return resultado.status === 0;
}

function lerArquivoRaiz(raiz, relativo, limite = LIMITE_ARQUIVO) {
  try {
    const completo = path.join(raiz, relativo);
    const informacao = fs.statSync(completo);
    if (!informacao.isFile() || informacao.size > limite) return null;
    return fs.readFileSync(completo, "utf8");
  } catch {
    return null;
  }
}

function existeRaiz(raiz, relativo) {
  try {
    fs.lstatSync(path.join(raiz, relativo));
    return true;
  } catch {
    return false;
  }
}

function desescaparValor(valor) {
  if (valor.startsWith('"') && valor.endsWith('"')) {
    return valor
      .slice(1, -1)
      .replace(/\\(["\\$`])/g, "$1")
      .replace(/\\n/g, "\n");
  }
  if (valor.startsWith("'") && valor.endsWith("'")) return valor.slice(1, -1);
  return valor;
}

// Lê /etc/os-release, com fallback para /usr/lib/os-release, sem interpretar shell.
export function lerOsRelease(raiz = "/") {
  const texto =
    lerArquivoRaiz(raiz, "etc/os-release") ?? lerArquivoRaiz(raiz, "usr/lib/os-release");
  if (!texto) {
    return {
      encontrado: false,
      id: "",
      versao: "",
      idLike: [],
      codename: "",
      bruto: {},
    };
  }
  const bruto = {};
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha || linha.trimStart().startsWith("#")) continue;
    const combinacao = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(linha);
    if (!combinacao) continue;
    bruto[combinacao[1]] = desescaparValor(combinacao[2].trim());
  }
  const id = String(bruto.ID ?? "")
    .trim()
    .toLowerCase();
  const versao = String(bruto.VERSION_ID ?? "").trim();
  const idLike = String(bruto.ID_LIKE ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => item.toLowerCase());
  const codename = String(bruto.VERSION_CODENAME ?? bruto.UBUNTU_CODENAME ?? "").trim();
  return { encontrado: true, id, versao, idLike, codename, bruto };
}

// Agrupa a distribuição em uma das famílias reconhecidas pelo contrato.
export function familiaDe(id, idLike = []) {
  const semelhancas = new Set(idLike.map((item) => item.toLowerCase()));
  if (IDS_RHEL.has(id) || semelhancas.has("rhel") || semelhancas.has("centos")) return "rhel";
  if (id === "fedora" || semelhancas.has("fedora")) return "fedora";
  if (IDS_DEBIAN.has(id) || semelhancas.has("debian") || semelhancas.has("ubuntu")) return "debian";
  if (IDS_ARCH.has(id)) return "arch";
  if (IDS_SUSE.has(id) || semelhancas.has("suse") || semelhancas.has("opensuse")) return "suse";
  if (id === "alpine") return "alpine";
  return "desconhecida";
}

function maiorVersao(versao) {
  const combinacao = /^(\d+)/.exec(String(versao).trim());
  return combinacao ? Number(combinacao[1]) : null;
}

function menorVersao(versao) {
  const combinacao = /^(\d+)\.(\d+)/.exec(String(versao).trim());
  return combinacao ? Number(combinacao[2]) : null;
}

function versaoMaiorIgual(versao, referencia) {
  const partes = String(versao)
    .split(".")
    .map((parte) => Number.parseInt(parte, 10))
    .filter((parte) => Number.isFinite(parte));
  const alvo = String(referencia)
    .split(".")
    .map((parte) => Number.parseInt(parte, 10))
    .filter((parte) => Number.isFinite(parte));
  const tamanho = Math.max(partes.length, alvo.length);
  for (let indice = 0; indice < tamanho; indice += 1) {
    const atual = partes[indice] ?? 0;
    const esperado = alvo[indice] ?? 0;
    if (atual > esperado) return true;
    if (atual < esperado) return false;
  }
  return true;
}

// Classifica a distribuição em Tier 1, 2 ou 3 conforme a matriz do contrato.
export function classificarTier({ id, versao, arquitetura, raspberry = false }) {
  if (!["amd64", "arm64"].includes(arquitetura)) {
    return { tier: 3, motivo: "arquitetura não suportada" };
  }
  if (!id) return { tier: 3, motivo: "distribuição não identificada" };

  if (id === "ubuntu") {
    const aceitas = new Set(["22.04", "24.04", "26.04"]);
    if (aceitas.has(String(versao))) return { tier: 1, motivo: "" };
    return { tier: 3, motivo: "versão do Ubuntu fora da matriz" };
  }
  if (id === "debian") {
    if (raspberry) return { tier: 2, motivo: "Raspberry Pi OS em melhor esforço" };
    if ([12, 13].includes(maiorVersao(versao))) return { tier: 1, motivo: "" };
    return { tier: 3, motivo: "versão do Debian fora da matriz" };
  }
  if (["rhel", "rocky", "almalinux"].includes(id)) {
    if ([9, 10].includes(maiorVersao(versao))) return { tier: 1, motivo: "" };
    return { tier: 3, motivo: "versão do RHEL e derivados fora da matriz" };
  }
  if (id === "fedora") return { tier: 1, motivo: "" };
  if (id === "arch") return { tier: 1, motivo: "" };
  if (id === "opensuse-leap") {
    if (versaoMaiorIgual(versao, "15.6")) return { tier: 1, motivo: "" };
    return { tier: 3, motivo: "versão do openSUSE Leap fora da matriz" };
  }
  if (["opensuse", "opensuse-tumbleweed"].includes(id)) return { tier: 1, motivo: "" };
  if (id === "alpine") {
    const maior = maiorVersao(versao);
    const menor = menorVersao(versao);
    if (maior === 3 && menor !== null && menor >= 20) {
      return { tier: 2, motivo: "Alpine em melhor esforço" };
    }
    return { tier: 3, motivo: "versão do Alpine fora da matriz" };
  }
  if (id === "amzn") {
    if (String(versao) === "2023") return { tier: 2, motivo: "Amazon Linux em melhor esforço" };
    return { tier: 3, motivo: "versão do Amazon Linux fora da matriz" };
  }
  if (id === "ol") {
    if ([9, 10].includes(maiorVersao(versao))) {
      return { tier: 2, motivo: "Oracle Linux em melhor esforço" };
    }
    return { tier: 3, motivo: "versão do Oracle Linux fora da matriz" };
  }
  if (id === "centos") {
    if ([9, 10].includes(maiorVersao(versao))) {
      return { tier: 2, motivo: "CentOS Stream em melhor esforço" };
    }
    return { tier: 3, motivo: "versão do CentOS fora da matriz" };
  }
  if (id === "raspbian") return { tier: 2, motivo: "Raspberry Pi OS em melhor esforço" };
  return { tier: 3, motivo: "distribuição fora da matriz" };
}

function normalizarArquitetura(bruta) {
  const valor = String(bruta ?? "").trim();
  return (MAPA_ARQUITETURA.get(valor) ?? valor) || "desconhecida";
}

// Executa uname quando possível e normaliza a arquitetura para o contrato.
export function detectarArquitetura(executar = executarPadrao) {
  const resultado = executar("uname", ["-m"]);
  const bruta = resultado.status === 0 && resultado.stdout ? resultado.stdout : process.arch;
  return normalizarArquitetura(bruta);
}

function mapaGerenciador(familia) {
  return (
    {
      debian: "apt",
      rhel: "dnf",
      fedora: "dnf",
      arch: "pacman",
      suse: "zypper",
      alpine: "apk",
    }[familia] ?? "desconhecido"
  );
}

function binarioDoGerenciador(gerenciador) {
  return (
    {
      apt: "apt-get",
      dnf: "dnf",
      pacman: "pacman",
      zypper: "zypper",
      apk: "apk",
    }[gerenciador] ?? ""
  );
}

function detectarGerenciador(familia, comandoExiste) {
  const esperado = mapaGerenciador(familia);
  const binario = binarioDoGerenciador(esperado);
  if (binario && comandoExiste(binario)) return esperado;
  if (esperado === "dnf" && comandoExiste("yum")) return "dnf";
  for (const candidato of ["apt", "dnf", "pacman", "zypper", "apk"]) {
    const executavel = binarioDoGerenciador(candidato);
    if (executavel && comandoExiste(executavel)) return candidato;
  }
  return "desconhecido";
}

function detectarContainer(raiz) {
  if (existeRaiz(raiz, ".dockerenv") || existeRaiz(raiz, "run/.containerenv")) return true;
  const cgroup = lerArquivoRaiz(raiz, "proc/1/cgroup") ?? "";
  return /docker|kubepods|containerd|lxc|podman/i.test(cgroup);
}

function detectarIniciador(raiz, familia) {
  const container = detectarContainer(raiz);
  if (existeRaiz(raiz, "run/systemd/system")) {
    return { iniciador: "systemd", origem: "sistema", container };
  }
  if (existeRaiz(raiz, "sbin/openrc") || existeRaiz(raiz, "run/openrc")) {
    return { iniciador: "openrc", origem: "sistema", container };
  }
  const comm = (lerArquivoRaiz(raiz, "proc/1/comm") ?? "").trim();
  if (comm === "systemd") {
    return { iniciador: "systemd", origem: "sistema", container };
  }
  if (comm === "openrc-init") {
    return { iniciador: "openrc", origem: "sistema", container };
  }
  if (container && familiaComIniciadorPadrao(familia)) {
    return {
      iniciador: familia === "alpine" ? "openrc" : "systemd",
      origem: "distro",
      container,
    };
  }
  return { iniciador: "desconhecido", origem: "desconhecida", container };
}

function familiaComIniciadorPadrao(familia) {
  return ["debian", "rhel", "fedora", "arch", "suse", "alpine"].includes(familia);
}

function detectarFirewall(comandoExiste) {
  if (comandoExiste("ufw")) return "ufw";
  if (comandoExiste("firewall-cmd")) return "firewalld";
  if (comandoExiste("nft")) return "nft";
  return "nenhum";
}

function detectarSelinux(raiz) {
  if (!existeRaiz(raiz, "sys/fs/selinux")) return "ausente";
  const enforce = (lerArquivoRaiz(raiz, "sys/fs/selinux/enforce") ?? "").trim();
  if (enforce === "1") return "enforcing";
  if (enforce === "0") return "permissive";
  const configuracao = lerArquivoRaiz(raiz, "etc/selinux/config") ?? "";
  if (/^SELINUX=enforcing/m.test(configuracao)) return "enforcing";
  if (/^SELINUX=permissive/m.test(configuracao)) return "permissive";
  return "disabled";
}

function detectarAppArmor(raiz, executar, comandoExiste) {
  const habilitado = (lerArquivoRaiz(raiz, "sys/module/apparmor/parameters/enabled") ?? "")
    .trim()
    .toLowerCase();
  if (habilitado === "n") return "disabled";
  const temModulo = habilitado === "y" || existeRaiz(raiz, "sys/kernel/security/apparmor");
  if (!temModulo) {
    return existeRaiz(raiz, "etc/apparmor") ? "disabled" : "ausente";
  }
  if (comandoExiste("aa-status")) {
    const resultado = executar("aa-status", []);
    if (resultado.status === 0) {
      const complain = /(\d+)\s+profiles are in complain mode/i.exec(resultado.stdout);
      const enforce = /(\d+)\s+profiles are in enforce mode/i.exec(resultado.stdout);
      if (complain && Number(complain[1]) > 0 && (!enforce || Number(enforce[1]) === 0)) {
        return "complain";
      }
    }
  }
  return "enforcing";
}

function extrairVersao(texto) {
  const combinacao = /(\d+(?:\.\d+)+)/.exec(String(texto));
  return combinacao ? combinacao[1] : "";
}

// Compara versões numéricas simples, ignorando sufixos de empacotamento.
export function compararVersoes(esquerda, direita) {
  const extrair = (valor) =>
    String(valor)
      .replace(/^\d+:/, "")
      .match(/\d+/g)
      ?.map((parte) => Number.parseInt(parte, 10)) ?? [];
  const partesEsquerda = extrair(esquerda);
  const partesDireita = extrair(direita);
  const tamanho = Math.max(partesEsquerda.length, partesDireita.length);
  for (let indice = 0; indice < tamanho; indice += 1) {
    const atual = partesEsquerda[indice] ?? 0;
    const esperado = partesDireita[indice] ?? 0;
    if (atual > esperado) return 1;
    if (atual < esperado) return -1;
  }
  return 0;
}

export function versaoAtende(versao, minima) {
  if (!minima) return true;
  if (!versao) return false;
  return compararVersoes(versao, minima) >= 0;
}

function dockerVazio() {
  return {
    presente: false,
    versao: "",
    daemon: "ausente",
    versaoServidor: "",
    composePresente: false,
    composeVersao: "",
    composeSuficiente: false,
    servico: "desconhecido",
    usuarioNoGrupo: false,
  };
}

function detectarDocker(executar, comandoExiste, iniciador, uid) {
  const presente = comandoExiste("docker");
  const resultado = dockerVazio();
  resultado.presente = presente;
  if (!presente) {
    if (comandoExiste("docker-compose")) {
      const versao = executar("docker-compose", ["--version"]);
      if (versao.status === 0) {
        resultado.composeVersao = extrairVersao(versao.stdout);
        resultado.composePresente = Boolean(resultado.composeVersao);
        resultado.composeSuficiente = versaoAtende(resultado.composeVersao, "2.24.0");
      }
    }
    return resultado;
  }

  const versao = executar("docker", ["--version"]);
  if (versao.status === 0) resultado.versao = extrairVersao(versao.stdout);

  const informacao = executar("docker", ["info", "--format", "{{.ServerVersion}}"]);
  const texto = `${informacao.stderr}\n${informacao.stdout}`;
  if (informacao.status === 0) {
    resultado.daemon = "ativo";
    resultado.versaoServidor = informacao.stdout;
  } else if (/permission denied|permissao negada|acesso negado/i.test(texto)) {
    resultado.daemon = "sem-permissao";
  } else if (
    /cannot connect|is the docker daemon running|connection refused|cannot find the file.*docker\.sock/i.test(
      texto,
    )
  ) {
    resultado.daemon = "parado";
  } else {
    resultado.daemon = "indisponivel";
  }

  const compose = executar("docker", ["compose", "version", "--short"]);
  if (compose.status === 0) {
    resultado.composeVersao = extrairVersao(compose.stdout);
  } else if (comandoExiste("docker-compose")) {
    const standalone = executar("docker-compose", ["--version"]);
    if (standalone.status === 0) resultado.composeVersao = extrairVersao(standalone.stdout);
  }
  resultado.composePresente = Boolean(resultado.composeVersao);
  resultado.composeSuficiente = versaoAtende(resultado.composeVersao, "2.24.0");

  if (iniciador === "systemd" && comandoExiste("systemctl")) {
    const servico = executar("systemctl", ["is-active", "docker"]);
    resultado.servico = servico.stdout || (servico.status === 0 ? "active" : "inactive");
  } else if (iniciador === "openrc" && comandoExiste("rc-service")) {
    const servico = executar("rc-service", ["docker", "status"]);
    resultado.servico = servico.status === 0 ? "started" : "stopped";
  }

  const grupos = executar("id", ["-nG"]);
  resultado.usuarioNoGrupo = uid === 0;
  if (grupos.status === 0) {
    resultado.usuarioNoGrupo =
      resultado.usuarioNoGrupo || grupos.stdout.split(/\s+/).filter(Boolean).includes("docker");
  }
  return resultado;
}

function lerEstadoInstalacao(raiz) {
  const texto = lerArquivoRaiz(raiz, "var/lib/frequenciapp/instalacao.json", LIMITE_ESTADO);
  if (!texto) return { presente: false, valido: false, dados: null, corrompido: false };
  try {
    const dados = JSON.parse(texto);
    return {
      presente: true,
      valido: dados && dados.schema === "frequenciapp.instalacao/1",
      dados,
      corrompido: false,
    };
  } catch {
    return { presente: true, valido: false, dados: null, corrompido: true };
  }
}

function modoArquivo(raiz, relativo) {
  try {
    const informacao = fs.statSync(path.join(raiz, relativo));
    if (!informacao.isFile()) return null;
    return {
      caminho: path.join(raiz, relativo),
      modo: (informacao.mode & 0o777).toString(8).padStart(3, "0"),
      seguro: (informacao.mode & 0o077) === 0,
    };
  } catch {
    return null;
  }
}

function detectarInstalacao(raiz) {
  const estado = lerEstadoInstalacao(raiz);
  const diretorios = ["var/lib/frequenciapp", "etc/frequenciapp", "opt/frequenciapp"].filter(
    (relativo) => existeRaiz(raiz, relativo),
  );
  const backup = existeRaiz(raiz, "var/lib/frequenciapp/ultimo-backup.json");
  const arquivos = ["etc/frequenciapp/app.env", "etc/frequenciapp/ops.env"]
    .map((relativo) => modoArquivo(raiz, relativo))
    .filter(Boolean);
  const dados = estado.dados ?? {};
  return {
    existente: Boolean(estado.presente || diretorios.length || backup),
    diretorios,
    estadoPresente: estado.presente,
    estadoValido: estado.valido,
    estadoCorrompido: estado.corrompido,
    schema: typeof dados.schema === "string" ? dados.schema : "",
    perfil: typeof dados.perfil === "string" ? dados.perfil : "",
    canal: typeof dados.canal === "string" ? dados.canal : "",
    tag: typeof dados.tag === "string" ? dados.tag : "",
    backupPresente: backup,
    arquivos,
  };
}

function aviso(codigo, mensagem, documentacao = "docs/instalador.md#auditoria-de-pacotes") {
  return { codigo, mensagem, documentacao };
}

// Lê o host e devolve a detecção completa usada pelo plano e pelo diagnóstico.
export function detectar(opcoes = {}) {
  const raiz = opcoes.raiz ?? "/";
  const executar = opcoes.executar ?? executarPadrao;
  const comandoExiste = opcoes.comandoExiste ?? ((nome) => comandoExistePadrao(nome, executar));
  const uid = opcoes.uid ?? (typeof process.getuid === "function" ? process.getuid() : null);
  const os = lerOsRelease(raiz);
  const arquitetura = opcoes.arquitetura ?? detectarArquitetura(executar);
  const familia = familiaDe(os.id, os.idLike);
  const raspberry = existeRaiz(raiz, "etc/rpi-issue") || os.id === "raspbian";
  const classificacao = classificarTier({
    id: os.id,
    versao: os.versao,
    arquitetura,
    raspberry,
  });
  const iniciador = detectarIniciador(raiz, familia);
  const gerenciador = detectarGerenciador(familia, comandoExiste);
  const firewall = detectarFirewall(comandoExiste);
  const selinux = detectarSelinux(raiz);
  const apparmor = detectarAppArmor(raiz, executar, comandoExiste);
  const docker =
    opcoes.verificarDocker === false
      ? dockerVazio()
      : detectarDocker(executar, comandoExiste, iniciador.iniciador, uid);
  const instalacao = detectarInstalacao(raiz);

  const avisos = [];
  if (classificacao.tier === 2) {
    avisos.push(
      aviso(
        "A_TIER2",
        `Distribuição Tier 2: ${os.id} ${os.versao}. O suporte é de melhor esforço.`.trim(),
        "docs/instalador.md#tiers",
      ),
    );
  }
  if (iniciador.iniciador === "desconhecido") {
    avisos.push(
      aviso(
        "A_INICIADOR",
        "Iniciador não reconhecido. O plano usará o fallback disponível.",
        "docs/instalador.md#tiers",
      ),
    );
  }
  if (instalacao.estadoCorrompido) {
    avisos.push(
      aviso(
        "A_ESTADO_INVALIDO",
        "O estado da instalação existe, mas não pôde ser lido.",
        "docs/instalador.md#estado-durável",
      ),
    );
  }
  for (const arquivo of instalacao.arquivos) {
    if (!arquivo.seguro) {
      avisos.push(
        aviso(
          "A_PERMISSAO_ARQUIVO",
          `O arquivo ${arquivo.caminho} tem permissão mais ampla que 600.`,
          "docs/instalador.md#segurança",
        ),
      );
    }
  }

  return {
    distro: os.id || "desconhecida",
    versaoDistro: os.versao,
    codename: os.codename,
    idLike: os.idLike,
    familia,
    tier: classificacao.tier,
    motivoTier: classificacao.motivo,
    arquitetura,
    gerenciador,
    iniciador: iniciador.iniciador,
    iniciadorOrigem: iniciador.origem,
    container: iniciador.container,
    firewall,
    selinux,
    apparmor,
    docker,
    instalacao,
    avisos,
  };
}

// Lê apenas a identificação da distribuição, sem consultar Docker, rede ou backup.
export function detectarBasico(raiz = "/") {
  const os = lerOsRelease(raiz);
  const arquitetura = normalizarArquitetura(process.arch);
  const familia = familiaDe(os.id, os.idLike);
  const raspberry = existeRaiz(raiz, "etc/rpi-issue") || os.id === "raspbian";
  const classificacao = classificarTier({
    id: os.id,
    versao: os.versao,
    arquitetura,
    raspberry,
  });
  return {
    distro: os.id || "desconhecida",
    versaoDistro: os.versao,
    codename: os.codename,
    familia,
    tier: classificacao.tier,
    arquitetura,
    gerenciador: mapaGerenciador(familia),
    iniciador:
      familia === "alpine" ? "openrc" : familia === "desconhecida" ? "desconhecido" : "systemd",
    firewall: "nenhum",
    selinux: "ausente",
    apparmor: "ausente",
  };
}
