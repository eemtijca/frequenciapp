// Audita pacotes e ferramentas do host sem instalar, atualizar ou alterar nada.
import { comandoExistePadrao, compararVersoes, executarPadrao, versaoAtende } from "./detectar.mjs";

const PACOTES = [
  {
    id: "bash",
    comandos: ["bash"],
    pacotes: { apt: ["bash"], dnf: ["bash"], pacman: ["bash"], zypper: ["bash"], apk: ["bash"] },
    minimo: "4.0.0",
    grupo: "base",
  },
  {
    id: "curl",
    comandos: ["curl"],
    pacotes: { apt: ["curl"], dnf: ["curl"], pacman: ["curl"], zypper: ["curl"], apk: ["curl"] },
    minimo: "7.0.0",
    grupo: "base",
  },
  {
    id: "ca-certificates",
    comandos: [],
    pacotes: {
      apt: ["ca-certificates"],
      dnf: ["ca-certificates"],
      pacman: ["ca-certificates"],
      zypper: ["ca-certificates"],
      apk: ["ca-certificates"],
    },
    minimo: "",
    grupo: "base",
  },
  {
    id: "git",
    comandos: ["git"],
    pacotes: { apt: ["git"], dnf: ["git"], pacman: ["git"], zypper: ["git"], apk: ["git"] },
    minimo: "2.0.0",
    grupo: "base",
  },
  {
    id: "jq",
    comandos: ["jq"],
    pacotes: { apt: ["jq"], dnf: ["jq"], pacman: ["jq"], zypper: ["jq"], apk: ["jq"] },
    minimo: "1.6.0",
    grupo: "base",
  },
  {
    id: "openssl",
    comandos: ["openssl"],
    pacotes: {
      apt: ["openssl"],
      dnf: ["openssl"],
      pacman: ["openssl"],
      zypper: ["openssl"],
      apk: ["openssl"],
    },
    minimo: "1.1.1",
    grupo: "base",
  },
  {
    id: "gpg",
    comandos: ["gpg", "gpg2"],
    pacotes: {
      apt: ["gnupg"],
      dnf: ["gnupg2"],
      pacman: ["gnupg"],
      zypper: ["gpg2"],
      apk: ["gnupg"],
    },
    minimo: "2.0.0",
    grupo: "backup",
  },
  {
    id: "age",
    comandos: ["age"],
    pacotes: { apt: ["age"], dnf: ["age"], pacman: ["age"], zypper: ["age"], apk: ["age"] },
    minimo: "",
    grupo: "backup",
    repositorio: "epel",
  },
  {
    id: "rclone",
    comandos: ["rclone"],
    pacotes: {
      apt: ["rclone"],
      dnf: ["rclone"],
      pacman: ["rclone"],
      zypper: ["rclone"],
      apk: ["rclone"],
    },
    minimo: "",
    grupo: "backup",
    repositorio: "epel",
  },
  {
    id: "tar",
    comandos: ["tar"],
    pacotes: { apt: ["tar"], dnf: ["tar"], pacman: ["tar"], zypper: ["tar"], apk: ["tar"] },
    minimo: "",
    grupo: "base",
  },
  {
    id: "gzip",
    comandos: ["gzip"],
    pacotes: { apt: ["gzip"], dnf: ["gzip"], pacman: ["gzip"], zypper: ["gzip"], apk: ["gzip"] },
    minimo: "",
    grupo: "base",
  },
  {
    id: "flock",
    comandos: ["flock"],
    pacotes: {
      apt: ["util-linux"],
      dnf: ["util-linux"],
      pacman: ["util-linux"],
      zypper: ["util-linux"],
      apk: ["util-linux"],
    },
    minimo: "",
    grupo: "base",
  },
  {
    id: "sha256sum",
    comandos: ["sha256sum"],
    pacotes: {
      apt: ["coreutils"],
      dnf: ["coreutils"],
      pacman: ["coreutils"],
      zypper: ["coreutils"],
      apk: ["coreutils"],
    },
    minimo: "",
    grupo: "base",
  },
  {
    id: "docker",
    comandos: ["docker"],
    pacotes: {
      apt: ["docker-ce"],
      dnf: ["docker-ce"],
      pacman: ["docker"],
      zypper: ["docker"],
      apk: ["docker"],
    },
    minimo: "",
    grupo: "docker",
    repositorio: "docker-oficial",
  },
  {
    id: "compose",
    comandos: [],
    pacotes: {
      apt: ["docker-compose-plugin"],
      dnf: ["docker-compose-plugin"],
      pacman: ["docker-compose"],
      zypper: ["docker-compose"],
      apk: ["docker-cli-compose"],
    },
    minimo: "2.24.0",
    grupo: "docker",
    repositorio: "docker-oficial",
    especial: "compose",
  },
];

export { PACOTES };

function extrairVersao(texto) {
  const combinacao = /(\d+(?:\.\d+)+)/.exec(String(texto));
  return combinacao ? combinacao[1] : "";
}

function normalizarVersao(valor) {
  let texto = String(valor ?? "").trim();
  texto = texto.replace(/^\d+:/, "");
  texto = texto.replace(/^v/i, "");
  texto = texto.replace(/-(?:r?\d+|[0-9][A-Za-z0-9.+~]*)$/, "");
  return texto;
}

export { normalizarVersao };

function consultarApt(nome, executar) {
  const resultado = executar("dpkg", ["-s", nome]);
  if (resultado.status !== 0) return { presente: false, versao: "" };
  const texto = `${resultado.stdout}\n${resultado.stderr}`;
  const status = /^Status:\s*(.+)$/im.exec(texto)?.[1] ?? "";
  if (!/install ok installed/i.test(status)) return { presente: false, versao: "" };
  const versao = /^Version:\s*(.+)$/im.exec(texto)?.[1] ?? "";
  return { presente: true, versao: normalizarVersao(versao) };
}

function consultarRpm(nome, executar) {
  const resultado = executar("rpm", ["-q", "--queryformat", "%{VERSION}", nome]);
  if (resultado.status !== 0 || !resultado.stdout) return { presente: false, versao: "" };
  return { presente: true, versao: normalizarVersao(resultado.stdout) };
}

function consultarPacman(nome, executar) {
  const resultado = executar("pacman", ["-Q", nome]);
  if (resultado.status !== 0) return { presente: false, versao: "" };
  const partes = resultado.stdout.split(/\s+/);
  return { presente: true, versao: normalizarVersao(partes[1] ?? "") };
}

function consultarZypper(nome, executar) {
  const resultado = executar("zypper", ["--non-interactive", "--no-refresh", "se", "-i", nome]);
  if (resultado.status !== 0) return { presente: false, versao: "" };
  for (const linha of resultado.stdout.split(/\r?\n/)) {
    const combinacao = /^\s*i\s*\|\s*(\S+)\s*\|\s*(\S+)/.exec(linha);
    if (combinacao && combinacao[1] === nome) {
      return { presente: true, versao: normalizarVersao(combinacao[2]) };
    }
  }
  return { presente: false, versao: "" };
}

function consultarApk(nome, executar) {
  const existe = executar("apk", ["info", "-e", nome]);
  if (existe.status !== 0) return { presente: false, versao: "" };
  const versao = executar("apk", ["info", "-v", nome]);
  if (versao.status !== 0) return { presente: true, versao: "" };
  const primeiro = versao.stdout.split(/\s+/)[0] ?? "";
  const prefixo = `${nome}-`;
  const bruta = primeiro.startsWith(prefixo) ? primeiro.slice(prefixo.length) : primeiro;
  return { presente: true, versao: normalizarVersao(bruta) };
}

function consultarPacote(gerenciador, nome, executar) {
  if (gerenciador === "apt") return consultarApt(nome, executar);
  if (gerenciador === "dnf") return consultarRpm(nome, executar);
  if (gerenciador === "pacman") return consultarPacman(nome, executar);
  if (gerenciador === "zypper") return consultarZypper(nome, executar);
  if (gerenciador === "apk") return consultarApk(nome, executar);
  return { presente: false, versao: "" };
}

function versaoDoComando(comando, executar) {
  const resultado =
    comando === "rclone" ? executar("rclone", ["version"]) : executar(comando, ["--version"]);
  if (resultado.status !== 0) return "";
  return extrairVersao(`${resultado.stdout}\n${resultado.stderr}`);
}

function consultarCompose(executar, comandoExiste) {
  if (comandoExiste("docker")) {
    const resultado = executar("docker", ["compose", "version", "--short"]);
    if (resultado.status === 0) {
      return { presente: true, versao: extrairVersao(resultado.stdout) };
    }
  }
  if (comandoExiste("docker-compose")) {
    const resultado = executar("docker-compose", ["--version"]);
    if (resultado.status === 0) {
      return { presente: true, versao: extrairVersao(resultado.stdout) };
    }
  }
  return { presente: false, versao: "" };
}

function origemDoPacote(especificacao, familia) {
  if (especificacao.repositorio === "docker-oficial") {
    if (["debian", "rhel", "fedora"].includes(familia)) return "docker-oficial";
    return "distro";
  }
  if (especificacao.repositorio === "epel" && familia === "rhel") return "epel";
  return "distro";
}

// Devolve a tabela estável de pacotes com presença, versão e ação prevista.
export function auditarPacotes(opcoes = {}) {
  const gerenciador = opcoes.gerenciador ?? "desconhecido";
  const familia = opcoes.familia ?? "desconhecida";
  const executar = opcoes.executar ?? executarPadrao;
  const comandoExiste = opcoes.comandoExiste ?? ((nome) => comandoExistePadrao(nome, executar));

  const pacotes = [];
  for (const especificacao of PACOTES) {
    const nome = especificacao.pacotes[gerenciador]?.[0] ?? especificacao.id;
    const consulta =
      especificacao.especial === "compose"
        ? consultarCompose(executar, comandoExiste)
        : consultarPacote(gerenciador, nome, executar);
    const comandoPresente =
      especificacao.especial === "compose"
        ? consulta.presente
        : especificacao.comandos.some((comando) => comandoExiste(comando));
    let versao = consulta.versao;
    if (!versao && comandoPresente) {
      const comando = especificacao.comandos.find((item) => comandoExiste(item));
      if (comando) versao = versaoDoComando(comando, executar);
    }
    const presente =
      especificacao.especial === "compose"
        ? consulta.presente
        : especificacao.comandos.length === 0
          ? consulta.presente
          : comandoPresente;
    const minima = especificacao.minimo ?? "";
    let acao = "nenhuma";
    if (!presente) acao = "instalar";
    else if (!versaoAtende(versao, minima)) acao = "atualizar";
    pacotes.push({
      pacote: especificacao.id,
      nome,
      presente,
      comandoPresente,
      versao,
      versaoMinima: minima,
      acao,
      grupo: especificacao.grupo,
      origem: origemDoPacote(especificacao, familia),
    });
  }

  const resumo = {
    total: pacotes.length,
    presentes: pacotes.filter((pacote) => pacote.presente).length,
    faltantes: pacotes.filter((pacote) => pacote.acao === "instalar").length,
    desatualizados: pacotes.filter((pacote) => pacote.acao === "atualizar").length,
  };

  const avisos = [];
  if (familia === "rhel") {
    const dependeDeEpel = pacotes.some(
      (pacote) => ["age", "rclone"].includes(pacote.pacote) && pacote.acao !== "nenhuma",
    );
    if (dependeDeEpel) {
      avisos.push({
        codigo: "A_EPEL",
        mensagem: "age e rclone podem exigir o repositório EPEL nesta família.",
        documentacao: "docs/instalador.md#famílias-pacotes-e-repositórios",
      });
    }
  }

  return { gerenciador, familia, pacotes, resumo, avisos };
}

// Monta o comando de instalação usado nas ações previstas do plano.
export function comandoInstalacao(gerenciador, nomes) {
  const lista = nomes.filter(Boolean);
  if (!lista.length) return null;
  if (gerenciador === "apt") return `apt-get install -y ${lista.join(" ")}`;
  if (gerenciador === "dnf") return `dnf install -y ${lista.join(" ")}`;
  if (gerenciador === "pacman") return `pacman -S --needed --noconfirm ${lista.join(" ")}`;
  if (gerenciador === "zypper") return `zypper --non-interactive install ${lista.join(" ")}`;
  if (gerenciador === "apk") return `apk add --no-cache ${lista.join(" ")}`;
  return null;
}

export { compararVersoes };
