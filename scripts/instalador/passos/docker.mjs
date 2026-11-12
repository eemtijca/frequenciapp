// Etapa de Docker: instala ou valida Engine, serviço, grupo e plugin Compose.
import {
  acao,
  avisoEtapa,
  comRetentativas,
  executarEtapa,
  falha,
  USUARIO_PADRAO,
} from "./contexto.mjs";

export const id = "docker";
export const titulo = "Instala ou valida Docker, serviço, grupo e Compose";
export const limiteSegundos = 900;

const VERSAO_COMPOSE_MINIMA = "2.24.0";

function extrairVersao(texto) {
  const combinacao = /(\d+(?:\.\d+)+)/.exec(String(texto));
  return combinacao ? combinacao[1] : "";
}

function compararVersoes(esquerda, direita) {
  const extrair = (valor) =>
    String(valor)
      .match(/\d+/g)
      ?.map((parte) => Number.parseInt(parte, 10)) ?? [];
  const a = extrair(esquerda);
  const b = extrair(direita);
  const tamanho = Math.max(a.length, b.length);
  for (let indice = 0; indice < tamanho; indice += 1) {
    const atual = a[indice] ?? 0;
    const esperado = b[indice] ?? 0;
    if (atual > esperado) return 1;
    if (atual < esperado) return -1;
  }
  return 0;
}

function verificar(ctx) {
  const versao = ctx.executar("docker", ["--version"], { timeout: 15000 });
  const presente = versao.status === 0;
  const dados = {
    presente,
    versao: presente ? extrairVersao(`${versao.stdout}\n${versao.stderr}`) : "",
    daemon: "ausente",
    composeVersao: "",
    composeSuficiente: false,
  };
  if (!presente) return dados;
  const info = ctx.executar("docker", ["info", "--format", "{{.ServerVersion}}"], {
    timeout: 30000,
  });
  const textoInfo = `${info.stdout ?? ""}\n${info.stderr ?? ""}`;
  if (info.status === 0) dados.daemon = "ativo";
  else if (/permission denied|permissão negada|acesso negado/i.test(textoInfo)) {
    dados.daemon = "sem-permissao";
  } else if (/cannot connect|daemon running|connection refused|\.sock/i.test(textoInfo)) {
    dados.daemon = "parado";
  } else {
    dados.daemon = "indisponivel";
  }
  const compose = ctx.executar("docker", ["compose", "version", "--short"], { timeout: 15000 });
  if (compose.status === 0) {
    dados.composeVersao = extrairVersao(compose.stdout);
    dados.composeSuficiente = compararVersoes(dados.composeVersao, VERSAO_COMPOSE_MINIMA) >= 0;
  }
  return dados;
}

function repoDocker(gerenciador, deteccao) {
  if (gerenciador === "apt") {
    if (deteccao.distro === "ubuntu" || deteccao.distro === "debian") {
      return {
        distribuicao: deteccao.distro,
        codename: deteccao.codename || deteccao.versaoDistro,
      };
    }
    return null;
  }
  if (gerenciador === "dnf") {
    if (deteccao.familia === "fedora") return { distribuicao: "fedora" };
    if (["rhel", "rocky", "almalinux", "centos", "ol", "amzn"].includes(deteccao.distro)) {
      return { distribuicao: deteccao.distro === "rhel" ? "rhel" : "centos" };
    }
  }
  return null;
}

function instalar(ctx) {
  const gerenciador = ctx.deteccao.gerenciador;
  const envApt = { DEBIAN_FRONTEND: "noninteractive" };
  const acoes = [];
  if (gerenciador === "apt") {
    const repo = repoDocker(gerenciador, ctx.deteccao);
    if (!repo) {
      throw falha("E_DOCKER", "O repositório oficial do Docker não cobre esta distribuição.", {
        dica: "Use uma distribuição Tier 1 ou instale o Docker pelo pacote da distro.",
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      });
    }
    if (!repo.codename) {
      throw falha("E_DOCKER", "O codename da distribuição não foi identificado.", {
        dica: "Confira VERSION_CODENAME em /etc/os-release.",
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      });
    }
    acoes.push(
      acao(
        "Prepara o keyring do repositório oficial do Docker",
        "install -m 0755 -d /etc/apt/keyrings",
        true,
      ),
      acao(
        "Baixa a chave pública do repositório oficial do Docker",
        `curl -fsSL https://download.docker.com/linux/${repo.distribuicao}/gpg -o /etc/apt/keyrings/docker.asc`,
        true,
      ),
      acao(
        "Registra o repositório oficial do Docker",
        `deb [arch=${ctx.deteccao.arquitetura} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${repo.distribuicao} ${repo.codename} stable`,
        true,
      ),
      acao("Atualiza o índice do apt", "apt-get update -qq", true),
      acao(
        "Instala o Docker Engine e o plugin Compose",
        "apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
        true,
      ),
    );
    const passos = [
      ["install", ["-m", "0755", "-d", "/etc/apt/keyrings"]],
      [
        "curl",
        [
          "-fsSL",
          `https://download.docker.com/linux/${repo.distribuicao}/gpg`,
          "-o",
          "/etc/apt/keyrings/docker.asc",
        ],
      ],
      ["chmod", ["a+r", "/etc/apt/keyrings/docker.asc"]],
    ];
    for (const [comando, argumentos] of passos) {
      const resultado = comRetentativas(ctx, () =>
        executarEtapa(ctx, comando, argumentos, { timeout: 120000, env: envApt }),
      );
      if (!resultado || resultado.status !== 0) {
        throw falha("E_DOCKER", "Falha ao preparar o repositório oficial do Docker.", {
          dica: "Confira a rede, o DNS e a chave do repositório.",
          documentacao: "docs/instalador.md#distribuições-e-repositórios",
        });
      }
    }
    const linha = `deb [arch=${ctx.deteccao.arquitetura} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/${repo.distribuicao} ${repo.codename} stable\n`;
    ctx.gravarArquivo("/etc/apt/sources.list.d/docker.list", linha);
    for (const [comando, argumentos] of [
      ["apt-get", ["update", "-qq"]],
      [
        "apt-get",
        [
          "install",
          "-y",
          "docker-ce",
          "docker-ce-cli",
          "containerd.io",
          "docker-buildx-plugin",
          "docker-compose-plugin",
        ],
      ],
    ]) {
      const resultado = comRetentativas(ctx, () =>
        executarEtapa(ctx, comando, argumentos, { timeout: 900000, env: envApt }),
      );
      if (!resultado || resultado.status !== 0) {
        throw falha("E_DOCKER", "Falha ao instalar o Docker pelo repositório oficial.", {
          dica: "Confira a saída do apt e o espaço em disco.",
          documentacao: "docs/instalador.md#distribuições-e-repositórios",
        });
      }
    }
    return acoes;
  }

  if (gerenciador === "dnf") {
    const repo = repoDocker(gerenciador, ctx.deteccao);
    if (!repo) {
      throw falha("E_DOCKER", "O repositório oficial do Docker não cobre esta distribuição.", {
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      });
    }
    acoes.push(
      acao("Instala o suporte a repositórios do dnf", "dnf install -y dnf-plugins-core", true),
      acao(
        "Registra o repositório oficial do Docker",
        `dnf config-manager --add-repo https://download.docker.com/linux/${repo.distribuicao}/docker-ce.repo`,
        true,
      ),
      acao(
        "Instala o Docker Engine e o plugin Compose",
        "dnf install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin",
        true,
      ),
    );
    for (const [comando, argumentos] of [
      ["dnf", ["install", "-y", "dnf-plugins-core"]],
      [
        "dnf",
        [
          "config-manager",
          "--add-repo",
          `https://download.docker.com/linux/${repo.distribuicao}/docker-ce.repo`,
        ],
      ],
      [
        "dnf",
        [
          "install",
          "-y",
          "docker-ce",
          "docker-ce-cli",
          "containerd.io",
          "docker-buildx-plugin",
          "docker-compose-plugin",
        ],
      ],
    ]) {
      const resultado = comRetentativas(ctx, () =>
        executarEtapa(ctx, comando, argumentos, { timeout: 900000, env: envApt }),
      );
      if (!resultado || resultado.status !== 0) {
        throw falha("E_DOCKER", "Falha ao instalar o Docker pelo repositório oficial.", {
          dica: "Confira a saída do dnf e o espaço em disco.",
          documentacao: "docs/instalador.md#distribuições-e-repositórios",
        });
      }
    }
    return acoes;
  }

  const pacotes = {
    pacman: ["docker", "docker-compose"],
    zypper: ["docker", "docker-compose"],
    apk: ["docker", "docker-cli-compose"],
  }[gerenciador];
  if (!pacotes) {
    throw falha("E_DOCKER", "O gerenciador de pacotes não é suportado para instalar Docker.", {
      documentacao: "docs/instalador.md#distribuições-e-repositórios",
    });
  }
  const binario = { pacman: "pacman", zypper: "zypper", apk: "apk" }[gerenciador];
  const argumentos =
    gerenciador === "pacman"
      ? ["-S", "--needed", "--noconfirm", ...pacotes]
      : gerenciador === "zypper"
        ? ["--non-interactive", "install", ...pacotes]
        : ["add", "--no-cache", ...pacotes];
  acoes.push(
    acao(
      "Instala o Docker e o plugin Compose pelo pacote da distribuição",
      `${binario} ${argumentos.join(" ")}`,
      true,
    ),
  );
  const resultado = comRetentativas(ctx, () =>
    executarEtapa(ctx, binario, argumentos, { timeout: 900000 }),
  );
  if (!resultado || resultado.status !== 0) {
    throw falha("E_DOCKER", "Falha ao instalar o Docker pelo pacote da distribuição.", {
      documentacao: "docs/instalador.md#distribuições-e-repositórios",
    });
  }
  return acoes;
}

function iniciarServico(ctx) {
  if (ctx.deteccao.iniciador === "systemd") {
    const resultado = executarEtapa(ctx, "systemctl", ["enable", "--now", "docker"], {
      timeout: 120000,
    });
    return resultado.status === 0;
  }
  if (ctx.deteccao.iniciador === "openrc") {
    executarEtapa(ctx, "rc-update", ["add", "docker", "default"], { timeout: 60000 });
    const resultado = executarEtapa(ctx, "rc-service", ["docker", "start"], { timeout: 120000 });
    return resultado.status === 0;
  }
  const systemd = executarEtapa(ctx, "systemctl", ["enable", "--now", "docker"], {
    timeout: 120000,
  });
  if (systemd.status === 0) return true;
  const openrc = executarEtapa(ctx, "rc-service", ["docker", "start"], { timeout: 120000 });
  return openrc.status === 0;
}

function usuarioNoGrupo(ctx, usuario) {
  const resultado = executarEtapa(ctx, "id", ["-nG", usuario], { timeout: 10000 });
  if (resultado.status !== 0) return null;
  return String(resultado.stdout).split(/\s+/).includes("docker");
}

function adicionarAoServico(ctx, usuario) {
  const resultado = executarEtapa(ctx, "usermod", ["-aG", "docker", usuario], { timeout: 30000 });
  if (resultado.status === 0) return true;
  const alternativo = executarEtapa(ctx, "addgroup", [usuario, "docker"], { timeout: 30000 });
  return alternativo.status === 0;
}

export function executar(ctx) {
  const usuario = ctx.usuarioServico || USUARIO_PADRAO;
  const acoes = [];
  const avisos = [];
  let dados = verificar(ctx);
  const precisaInstalar = !dados.presente;
  if (precisaInstalar) {
    acoes.push(...instalar(ctx));
    dados = verificar(ctx);
  }
  if (!dados.presente) {
    throw falha("E_DOCKER", "O Docker não está disponível após a instalação.", {
      dica: "Confira o repositório e a saída do gerenciador de pacotes.",
      documentacao: "docs/instalador.md#distribuições-e-repositórios",
    });
  }
  if (dados.daemon !== "ativo") {
    acoes.push(
      acao("Inicia e habilita o serviço do Docker", "systemctl enable --now docker", true),
    );
    if (!iniciarServico(ctx)) {
      throw falha("E_DOCKER", "O serviço do Docker não iniciou.", {
        dica: "Confira o serviço, o cgroup e o log do daemon.",
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      });
    }
    dados = verificar(ctx);
    if (dados.daemon !== "ativo") {
      throw falha("E_DOCKER", "O daemon do Docker não respondeu após a partida.", {
        dica: "Confira o log do serviço e a permissão da conta.",
        documentacao: "docs/instalador.md#segurança",
      });
    }
  }
  if (!dados.composeSuficiente) {
    if (!dados.composeVersao) {
      throw falha("E_COMPOSE", "O plugin Docker Compose não foi encontrado.", {
        dica: "Instale o docker-compose-plugin 2.24 ou superior.",
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      });
    }
    throw falha(
      "E_COMPOSE",
      `Docker Compose ${dados.composeVersao} está abaixo da versão mínima 2.24.`,
      {
        dica: "Atualize o plugin Docker Compose.",
        documentacao: "docs/instalador.md#distribuições-e-repositórios",
      },
    );
  }
  const noGrupo = usuarioNoGrupo(ctx, usuario);
  if (noGrupo === null) {
    avisos.push(
      avisoEtapa(
        "A_USUARIO_AUSENTE",
        `A conta ${usuario} ainda não existe; o grupo docker será ajustado na etapa usuario.`,
        "docs/instalador.md#segurança",
      ),
    );
  } else if (!noGrupo) {
    acoes.push(
      acao(`Adiciona a conta ${usuario} ao grupo docker`, `usermod -aG docker ${usuario}`, true),
    );
    if (!adicionarAoServico(ctx, usuario)) {
      avisos.push(
        avisoEtapa(
          "A_DOCKER_GRUPO",
          `Não foi possível adicionar ${usuario} ao grupo docker; as rotinas podem exigir ajuste.`,
          "docs/instalador.md#segurança",
        ),
      );
    }
  }
  if (!acoes.length) {
    acoes.push(acao("Docker, serviço e Compose estão presentes e suficientes", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: acoes.every((item) => !item.altera),
      versao: dados.versao,
      daemon: dados.daemon,
      composeVersao: dados.composeVersao,
      composeSuficiente: dados.composeSuficiente,
      usuarioNoGrupo: noGrupo,
    },
  };
}
