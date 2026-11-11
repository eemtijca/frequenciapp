// Testa a detecção de distribuição e a auditoria de pacotes com fixtures locais.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  classificarTier,
  comandoExistePadrao,
  compararVersoes,
  detectar,
  detectarBasico,
  lerOsRelease,
  versaoAtende,
} from "../../scripts/instalador/detectar.mjs";
import { auditarPacotes, normalizarVersao } from "../../scripts/instalador/pacotes.mjs";

const RAIZ_FIXTURES = fileURLToPath(new URL("./fixtures", import.meta.url));

function fixture(nome) {
  return path.join(RAIZ_FIXTURES, nome);
}

function resposta(status, stdout = "", stderr = "") {
  return { status, stdout, stderr, erro: null };
}

function criarExecutor({ comandos = [], respostas = {} } = {}) {
  const chamadas = [];
  const conjunto = new Set(comandos);
  const executar = (comando, argumentos = []) => {
    chamadas.push([comando, ...argumentos]);
    const respostaEncontrada =
      typeof respostas === "function"
        ? respostas(comando, argumentos)
        : respostas[[comando, ...argumentos].join(" ")];
    if (respostaEncontrada) {
      return { status: 0, stdout: "", stderr: "", erro: null, ...respostaEncontrada };
    }
    return { status: 127, stdout: "", stderr: `nao encontrado: ${comando}`, erro: null };
  };
  return {
    executar,
    comandoExiste: (nome) => conjunto.has(nome),
    chamadas,
  };
}

function detectarFixture(nome, opcoes = {}) {
  const ambiente = criarExecutor(opcoes);
  const resultado = detectar({
    raiz: fixture(nome),
    arquitetura: opcoes.arquitetura ?? "amd64",
    uid: opcoes.uid ?? 1000,
    executar: ambiente.executar,
    comandoExiste: ambiente.comandoExiste,
  });
  return { resultado, ambiente };
}

function executorApt({ versoes = {}, comandos = [], respostas: extra } = {}) {
  return criarExecutor({
    comandos,
    respostas: (comando, argumentos) => {
      if (extra) {
        const encontrada = extra(comando, argumentos);
        if (encontrada) return encontrada;
      }
      if (comando === "dpkg" && argumentos[0] === "-s") {
        const nome = argumentos[1];
        const versao = versoes[nome];
        if (!versao) return resposta(1, "", `dpkg-query: package '${nome}' is not installed`);
        return resposta(0, `Package: ${nome}\nStatus: install ok installed\nVersion: ${versao}\n`);
      }
      if (comando === "id") return resposta(0, "root");
      return null;
    },
  });
}

const VERSOES_APT = {
  bash: "5.2.37-1ubuntu1",
  curl: "8.5.0-2ubuntu10",
  "ca-certificates": "20240203",
  git: "1:2.43.0-1ubuntu7",
  jq: "1.7.1-3",
  openssl: "3.0.13-0ubuntu3",
  tar: "1.35+dfsg-3",
  gzip: "1.12-1ubuntu1",
  "util-linux": "2.39.3-9ubuntu6",
  coreutils: "9.4-3ubuntu6",
};

const COMANDOS_APT = ["bash", "curl", "git", "jq", "openssl", "tar", "gzip", "flock", "sha256sum"];

describe("leitura de /etc/os-release", () => {
  it("interpreta aspas, ID e ID_LIKE", () => {
    const os = lerOsRelease(fixture("ubuntu-26.04"));
    assert.equal(os.encontrado, true);
    assert.equal(os.id, "ubuntu");
    assert.equal(os.versao, "26.04");
    assert.equal(os.codename, "resolute");
    assert.deepEqual(os.idLike, ["debian"]);
    assert.match(os.bruto.PRETTY_NAME, /Ubuntu 26.04/);
  });

  it("devolve vazio quando o arquivo não existe", () => {
    const os = lerOsRelease(fixture("nao-existe"));
    assert.equal(os.encontrado, false);
    assert.equal(os.id, "");
    assert.deepEqual(os.idLike, []);
  });

  it("usa command -v para conferir a presença de comandos", () => {
    assert.equal(comandoExistePadrao("sh"), true);
    assert.equal(comandoExistePadrao("frequenciapp-comando-inexistente"), false);
  });
});

describe("classificação de tier", () => {
  it("recusa arquitetura de 32 bits", () => {
    const classificacao = classificarTier({
      id: "debian",
      versao: "12",
      arquitetura: "i386",
    });
    assert.equal(classificacao.tier, 3);
  });

  it("aceita Ubuntu, Debian, RHEL, Fedora, Arch, openSUSE e Alpine", () => {
    const casos = [
      ["ubuntu", "26.04", 1],
      ["debian", "12", 1],
      ["debian", "12.5", 1],
      ["rocky", "9.5", 1],
      ["fedora", "43", 1],
      ["arch", "", 1],
      ["opensuse-leap", "15.6", 1],
      ["alpine", "3.22.0", 2],
      ["amzn", "2023", 2],
      ["ol", "9.4", 2],
    ];
    for (const [id, versao, tier] of casos) {
      assert.equal(classificarTier({ id, versao, arquitetura: "amd64" }).tier, tier, id);
    }
  });

  it("rejeita versões fora da matriz", () => {
    assert.equal(classificarTier({ id: "ubuntu", versao: "20.04", arquitetura: "amd64" }).tier, 3);
    assert.equal(classificarTier({ id: "alpine", versao: "3.19.1", arquitetura: "amd64" }).tier, 3);
    assert.equal(classificarTier({ id: "plan9", versao: "1", arquitetura: "amd64" }).tier, 3);
  });
});

describe("detecção por fixture", () => {
  it("detecta Ubuntu 26.04 com AppArmor, Docker e instalação existente", () => {
    const { resultado } = detectarFixture("ubuntu-26.04", {
      comandos: ["apt-get", "ufw", "systemctl", "docker", "aa-status"],
      respostas: {
        "docker --version": resposta(0, "Docker version 29.8.2, build 123"),
        "docker info --format {{.ServerVersion}}": resposta(0, "29.8.2"),
        "docker compose version --short": resposta(0, "2.39.1"),
        "systemctl is-active docker": resposta(0, "active"),
        "id -nG": resposta(0, "root docker"),
        "aa-status": resposta(
          0,
          "apparmor module is loaded.\n12 profiles are in enforce mode.\n0 profiles are in complain mode.",
        ),
      },
    });
    assert.equal(resultado.distro, "ubuntu");
    assert.equal(resultado.versaoDistro, "26.04");
    assert.equal(resultado.codename, "resolute");
    assert.equal(resultado.familia, "debian");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.arquitetura, "amd64");
    assert.equal(resultado.gerenciador, "apt");
    assert.equal(resultado.iniciador, "systemd");
    assert.equal(resultado.firewall, "ufw");
    assert.equal(resultado.selinux, "ausente");
    assert.equal(resultado.apparmor, "enforcing");
    assert.equal(resultado.docker.presente, true);
    assert.equal(resultado.docker.daemon, "ativo");
    assert.equal(resultado.docker.composeVersao, "2.39.1");
    assert.equal(resultado.docker.composeSuficiente, true);
    assert.equal(resultado.docker.usuarioNoGrupo, true);
    assert.equal(resultado.instalacao.existente, true);
    assert.equal(resultado.instalacao.estadoValido, true);
    assert.equal(resultado.instalacao.perfil, "simples");
    assert.equal(resultado.instalacao.tag, "v1.0.0");
  });

  it("detecta Debian 12 e AppArmor em modo complain", () => {
    const { resultado } = detectarFixture("debian-12", {
      comandos: ["apt-get", "systemctl", "aa-status"],
      respostas: {
        "aa-status": resposta(
          0,
          "apparmor module is loaded.\n0 profiles are in enforce mode.\n3 profiles are in complain mode.",
        ),
      },
    });
    assert.equal(resultado.familia, "debian");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "apt");
    assert.equal(resultado.selinux, "ausente");
    assert.equal(resultado.apparmor, "complain");
    assert.equal(resultado.docker.presente, false);
  });

  it("detecta Rocky Linux 9 com SELinux e firewalld", () => {
    const { resultado } = detectarFixture("rocky-9", {
      comandos: ["dnf", "firewall-cmd", "systemctl"],
    });
    assert.equal(resultado.familia, "rhel");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "dnf");
    assert.equal(resultado.iniciador, "systemd");
    assert.equal(resultado.firewall, "firewalld");
    assert.equal(resultado.selinux, "enforcing");
    assert.equal(resultado.apparmor, "ausente");
  });

  it("detecta Fedora com SELinux", () => {
    const { resultado } = detectarFixture("fedora", {
      comandos: ["dnf", "systemctl"],
    });
    assert.equal(resultado.familia, "fedora");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "dnf");
    assert.equal(resultado.selinux, "enforcing");
  });

  it("detecta Arch com pacman e nft", () => {
    const { resultado } = detectarFixture("arch", {
      comandos: ["pacman", "systemctl", "nft"],
    });
    assert.equal(resultado.familia, "arch");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "pacman");
    assert.equal(resultado.firewall, "nft");
    assert.equal(resultado.selinux, "ausente");
    assert.equal(resultado.apparmor, "ausente");
  });

  it("detecta openSUSE Leap 15.6 com zypper", () => {
    const { resultado } = detectarFixture("opensuse-leap-15.6", {
      comandos: ["zypper", "firewall-cmd", "systemctl"],
    });
    assert.equal(resultado.familia, "suse");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "zypper");
    assert.equal(resultado.iniciador, "systemd");
    assert.equal(resultado.firewall, "firewalld");
  });

  it("detecta Alpine 3.22 como Tier 2 com OpenRC", () => {
    const { resultado } = detectarFixture("alpine-3.22", {
      comandos: ["apk", "nft"],
    });
    assert.equal(resultado.familia, "alpine");
    assert.equal(resultado.tier, 2);
    assert.equal(resultado.gerenciador, "apk");
    assert.equal(resultado.iniciador, "openrc");
    assert.equal(resultado.firewall, "nft");
    assert.equal(resultado.selinux, "ausente");
    assert.equal(resultado.apparmor, "ausente");
    assert.ok(resultado.avisos.some((item) => item.codigo === "A_TIER2"));
  });

  it("detecta Amazon Linux 2023 como Tier 2 da família RHEL", () => {
    const { resultado } = detectarFixture("amazonlinux-2023", {
      comandos: ["dnf", "systemctl"],
    });
    assert.equal(resultado.distro, "amzn");
    assert.equal(resultado.familia, "rhel");
    assert.equal(resultado.tier, 2);
    assert.ok(resultado.avisos.some((item) => item.codigo === "A_TIER2"));
  });

  it("recusa distribuição desconhecida", () => {
    const { resultado } = detectarFixture("desconhecida", {});
    assert.equal(resultado.familia, "desconhecida");
    assert.equal(resultado.tier, 3);
    assert.equal(resultado.gerenciador, "desconhecido");
  });

  it("recusa i386 mesmo em distro da matriz", () => {
    const { resultado } = detectarFixture("debian-12", { arquitetura: "i386" });
    assert.equal(resultado.tier, 3);
  });

  it("devolve detecção básica sem consultar Docker", () => {
    const resultado = detectarBasico(fixture("ubuntu-26.04"));
    assert.equal(resultado.distro, "ubuntu");
    assert.equal(resultado.familia, "debian");
    assert.equal(resultado.tier, 1);
    assert.equal(resultado.gerenciador, "apt");
  });
});

describe("estado de Docker", () => {
  it("distingue daemon parado, sem permissão e Compose antigo", () => {
    const parado = detectarFixture("debian-12", {
      comandos: ["apt-get", "systemctl", "docker"],
      respostas: {
        "docker --version": resposta(0, "Docker version 24.0.7, build 123"),
        "docker info --format {{.ServerVersion}}": resposta(
          1,
          "",
          "Cannot connect to the Docker daemon",
        ),
        "docker compose version --short": resposta(0, "2.20.1"),
        "id -nG": resposta(0, "root"),
      },
    }).resultado;
    assert.equal(parado.docker.daemon, "parado");
    assert.equal(parado.docker.composeSuficiente, false);
    assert.equal(parado.docker.usuarioNoGrupo, false);

    const semPermissao = detectarFixture("debian-12", {
      comandos: ["apt-get", "systemctl", "docker"],
      respostas: {
        "docker --version": resposta(0, "Docker version 24.0.7, build 123"),
        "docker info --format {{.ServerVersion}}": resposta(
          1,
          "",
          "permission denied while trying to connect to the Docker daemon",
        ),
        "docker compose version --short": resposta(0, "2.39.1"),
        "id -nG": resposta(0, "root docker"),
      },
    }).resultado;
    assert.equal(semPermissao.docker.daemon, "sem-permissao");
    assert.equal(semPermissao.docker.composeSuficiente, true);
  });

  it("detecta Compose standalone sem Docker", () => {
    const { resultado } = detectarFixture("debian-12", {
      comandos: ["apt-get", "docker-compose"],
      respostas: {
        "docker-compose --version": resposta(0, "docker-compose version 1.29.2, build 123"),
      },
    });
    assert.equal(resultado.docker.presente, false);
    assert.equal(resultado.docker.composePresente, true);
    assert.equal(resultado.docker.composeSuficiente, false);
  });

  it("considera root com acesso ao daemon mesmo sem o grupo docker", () => {
    const { resultado } = detectarFixture("debian-12", {
      uid: 0,
      comandos: ["apt-get", "systemctl", "docker"],
      respostas: {
        "docker --version": resposta(0, "Docker version 29.8.2, build 123"),
        "docker info --format {{.ServerVersion}}": resposta(0, "29.8.2"),
        "docker compose version --short": resposta(0, "2.39.1"),
        "systemctl is-active docker": resposta(0, "active"),
        "id -nG": resposta(0, "root"),
      },
    });
    assert.equal(resultado.docker.usuarioNoGrupo, true);
  });
});

describe("auditoria de pacotes", () => {
  it("lista presentes, faltantes e ações sem instalar", () => {
    const ambiente = executorApt({ versoes: VERSOES_APT, comandos: COMANDOS_APT });
    const auditoria = auditarPacotes({
      familia: "debian",
      gerenciador: "apt",
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const porNome = new Map(auditoria.pacotes.map((pacote) => [pacote.pacote, pacote]));
    assert.equal(porNome.get("jq").presente, true);
    assert.equal(porNome.get("jq").acao, "nenhuma");
    assert.equal(porNome.get("age").presente, false);
    assert.equal(porNome.get("age").acao, "instalar");
    assert.equal(porNome.get("gpg").acao, "instalar");
    assert.equal(porNome.get("docker").acao, "instalar");
    assert.equal(porNome.get("compose").acao, "instalar");
    assert.equal(auditoria.resumo.total, auditoria.pacotes.length);
    assert.ok(auditoria.resumo.faltantes >= 4);
    for (const chamada of ambiente.chamadas) {
      const texto = chamada.join(" ");
      assert.doesNotMatch(texto, /\binstall\b|\bupgrade\b|\badd\b|pacman -S|apt-get update/);
    }
  });

  it("marca versão antiga como atualização", () => {
    const versoes = { ...VERSOES_APT, jq: "1.5-1" };
    const ambiente = executorApt({ versoes, comandos: COMANDOS_APT });
    const auditoria = auditarPacotes({
      familia: "debian",
      gerenciador: "apt",
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const jq = auditoria.pacotes.find((pacote) => pacote.pacote === "jq");
    assert.equal(jq.presente, true);
    assert.equal(jq.versao, "1.5");
    assert.equal(jq.acao, "atualizar");
  });

  it("não reinstala Docker e Compose presentes e suficientes", () => {
    const ambiente = executorApt({
      versoes: VERSOES_APT,
      comandos: [...COMANDOS_APT, "docker"],
      respostas: (comando, argumentos) => {
        if (comando === "docker" && argumentos[0] === "--version") {
          return resposta(0, "Docker version 29.8.2, build 123");
        }
        if (comando === "docker" && argumentos[0] === "compose") {
          return resposta(0, "2.39.1");
        }
        if (comando === "id") return resposta(0, "root docker");
        return null;
      },
    });
    const auditoria = auditarPacotes({
      familia: "debian",
      gerenciador: "apt",
      executar: ambiente.executar,
      comandoExiste: ambiente.comandoExiste,
    });
    const docker = auditoria.pacotes.find((pacote) => pacote.pacote === "docker");
    const compose = auditoria.pacotes.find((pacote) => pacote.pacote === "compose");
    assert.equal(docker.presente, true);
    assert.equal(docker.acao, "nenhuma");
    assert.equal(docker.versao, "29.8.2");
    assert.equal(compose.presente, true);
    assert.equal(compose.acao, "nenhuma");
    assert.equal(compose.versao, "2.39.1");
  });

  it("usa dpkg -s, rpm -q, pacman -Q, zypper se -i e apk info -e", () => {
    const casos = [
      {
        gerenciador: "apt",
        familia: "debian",
        ambiente: executorApt({ versoes: VERSOES_APT, comandos: COMANDOS_APT }),
        esperado: (chamada) => chamada[0] === "dpkg" && chamada[1] === "-s",
      },
      {
        gerenciador: "dnf",
        familia: "rhel",
        ambiente: criarExecutor({
          comandos: ["dnf", "bash", "jq"],
          respostas: (comando, argumentos) => {
            if (comando === "rpm" && argumentos[0] === "-q") {
              const nome = argumentos[argumentos.length - 1];
              return nome === "bash"
                ? resposta(0, "5.1.8")
                : resposta(1, "", `package ${nome} is not installed`);
            }
            if (comando === "id") return resposta(0, "root");
            return null;
          },
        }),
        esperado: (chamada) => chamada[0] === "rpm" && chamada[1] === "-q",
      },
      {
        gerenciador: "pacman",
        familia: "arch",
        ambiente: criarExecutor({
          comandos: ["pacman", "bash", "jq"],
          respostas: (comando, argumentos) => {
            if (comando === "pacman" && argumentos[0] === "-Q") {
              return argumentos[1] === "bash"
                ? resposta(0, "bash 5.2.026-1")
                : resposta(1, "", "error: package not found");
            }
            if (comando === "id") return resposta(0, "root");
            return null;
          },
        }),
        esperado: (chamada) => chamada[0] === "pacman" && chamada[1] === "-Q",
      },
      {
        gerenciador: "zypper",
        familia: "suse",
        ambiente: criarExecutor({
          comandos: ["zypper", "bash", "jq"],
          respostas: (comando, argumentos) => {
            if (comando === "zypper") {
              const nome = argumentos[argumentos.length - 1];
              if (nome === "bash") {
                return resposta(
                  0,
                  "S | Name | Type | Version | Arch | Repository\n--+------+------+---------+------+-----------\ni | bash | package | 5.2.37-1 | x86_64 | repo",
                );
              }
              return resposta(0, "No matching items found.");
            }
            if (comando === "id") return resposta(0, "root");
            return null;
          },
        }),
        esperado: (chamada) =>
          chamada[0] === "zypper" && chamada.includes("se") && chamada.includes("-i"),
      },
      {
        gerenciador: "apk",
        familia: "alpine",
        ambiente: criarExecutor({
          comandos: ["apk", "bash", "jq"],
          respostas: (comando, argumentos) => {
            if (comando === "apk" && argumentos[0] === "info" && argumentos[1] === "-e") {
              return argumentos[2] === "bash" ? resposta(0, "bash") : resposta(1);
            }
            if (comando === "apk" && argumentos[0] === "info" && argumentos[1] === "-v") {
              return argumentos[2] === "bash" ? resposta(0, "bash-5.2.37-r0") : resposta(1);
            }
            if (comando === "id") return resposta(0, "root");
            return null;
          },
        }),
        esperado: (chamada) => chamada[0] === "apk" && chamada[1] === "info" && chamada[2] === "-e",
      },
    ];
    for (const caso of casos) {
      const auditoria = auditarPacotes({
        familia: caso.familia,
        gerenciador: caso.gerenciador,
        executar: caso.ambiente.executar,
        comandoExiste: caso.ambiente.comandoExiste,
      });
      assert.equal(auditoria.gerenciador, caso.gerenciador);
      assert.ok(
        caso.ambiente.chamadas.some(caso.esperado),
        `consulta esperada não encontrada para ${caso.gerenciador}`,
      );
    }
  });

  it("normaliza versões de empacotamento e compara números", () => {
    assert.equal(normalizarVersao("1:2.43.0-1ubuntu7"), "2.43.0");
    assert.equal(normalizarVersao("5.2.37-r0"), "5.2.37");
    assert.equal(normalizarVersao("v1.2.3"), "1.2.3");
    assert.equal(compararVersoes("2.39.1", "2.24.0"), 1);
    assert.equal(compararVersoes("2.20.0", "2.24.0"), -1);
    assert.equal(versaoAtende("2.24", "2.24.0"), true);
    assert.equal(versaoAtende("", "2.24.0"), false);
  });
});
