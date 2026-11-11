// Etapa de pacotes: instala apenas o que falta ou está abaixo da versão mínima.
import { comandoInstalacao } from "../pacotes.mjs";
import { acao, avisoEtapa, comRetentativas, falha, executarEtapa } from "./contexto.mjs";

export const id = "pacotes";
export const titulo = "Instala os pacotes e utilitários que faltam";
export const limiteSegundos = 1800;

const BASE = new Set([
  "bash",
  "curl",
  "ca-certificates",
  "git",
  "jq",
  "openssl",
  "tar",
  "gzip",
  "flock",
  "sha256sum",
]);

function pacotesNecessarios(ctx) {
  const necessarios = new Set(BASE);
  if (ctx.configuracao.criptografia === "age") necessarios.add("age");
  else necessarios.add("gpg");
  if (ctx.configuracao.destino || ctx.configuracao.configRclone) necessarios.add("rclone");
  return necessarios;
}

function reauditar(ctx) {
  if (typeof ctx.auditarPacotes === "function") {
    return ctx.auditarPacotes({
      familia: ctx.deteccao.familia,
      gerenciador: ctx.deteccao.gerenciador,
      executar: ctx.executar,
      comandoExiste: ctx.comandoExiste,
    });
  }
  return ctx.auditoria;
}

function argumentosInstalacao(gerenciador, nomes, reinstalar) {
  if (gerenciador === "apt") {
    return [
      "install",
      "-y",
      "--no-install-recommends",
      ...(reinstalar ? ["--reinstall"] : []),
      ...nomes,
    ];
  }
  if (gerenciador === "dnf") {
    return [reinstalar ? "reinstall" : "install", "-y", ...nomes];
  }
  if (gerenciador === "pacman") {
    return ["-S", "--needed", "--noconfirm", ...nomes];
  }
  if (gerenciador === "zypper") {
    return [
      "--non-interactive",
      reinstalar ? "install" : "install",
      "--no-recommends",
      "--auto-agree-with-licenses",
      ...nomes,
    ];
  }
  if (gerenciador === "apk") {
    return ["add", "--no-cache", ...nomes];
  }
  return null;
}

function binarioGerenciador(gerenciador) {
  return (
    {
      apt: "apt-get",
      dnf: "dnf",
      pacman: "pacman",
      zypper: "zypper",
      apk: "apk",
    }[gerenciador] ?? null
  );
}

function atualizarIndice(ctx, gerenciador) {
  if (gerenciador === "apt") {
    const resultado = executarEtapa(ctx, "apt-get", ["update", "-qq"], {
      timeout: 600000,
      env: { DEBIAN_FRONTEND: "noninteractive" },
    });
    return resultado.status === 0;
  }
  if (gerenciador === "zypper") {
    const resultado = executarEtapa(ctx, "zypper", ["--non-interactive", "refresh"], {
      timeout: 600000,
    });
    return resultado.status === 0;
  }
  if (gerenciador === "pacman") {
    const resultado = executarEtapa(ctx, "pacman", ["-Sy"], { timeout: 600000 });
    return resultado.status === 0;
  }
  return true;
}

export function executar(ctx) {
  const auditoria = reauditar(ctx);
  if (!auditoria) {
    throw falha("E_PACOTE", "A auditoria de pacotes não pôde ser concluída.", {
      dica: "Confira o gerenciador de pacotes e repita o aplicar.",
      documentacao: "docs/instalador.md#auditoria-de-pacotes",
    });
  }
  const necessarios = pacotesNecessarios(ctx);
  const selecionados = auditoria.pacotes.filter(
    (pacote) => necessarios.has(pacote.pacote) && !["docker", "compose"].includes(pacote.pacote),
  );
  const forcar = Boolean(ctx.forcarPacotes);
  const instalar = selecionados.filter(
    (pacote) => forcar || pacote.acao === "instalar" || pacote.acao === "atualizar",
  );
  const acoes = [];
  const avisos = [...(auditoria.avisos ?? [])];
  if (!instalar.length) {
    acoes.push(acao("Nenhum pacote obrigatório precisa ser instalado ou atualizado", null, false));
    return {
      estado: "concluida",
      acoes,
      avisos,
      detalhes: {
        semMudancas: true,
        gerenciador: auditoria.gerenciador,
        resumo: auditoria.resumo,
      },
    };
  }

  const gerenciador = auditoria.gerenciador;
  const binario = binarioGerenciador(gerenciador);
  const argumentos = argumentosInstalacao(
    gerenciador,
    instalar.map((pacote) => pacote.nome),
    forcar,
  );
  if (!binario || !argumentos) {
    throw falha("E_PACOTE", "O gerenciador de pacotes não é suportado pelo aplicar.", {
      dica: "Use uma distribuição Tier 1 ou Tier 2 da matriz do instalador.",
      documentacao: "docs/instalador.md#distribuições-e-repositórios",
    });
  }
  acoes.push(
    acao(
      `Atualiza o índice do ${gerenciador} antes de instalar`,
      gerenciador === "apt"
        ? "apt-get update -qq"
        : gerenciador === "zypper"
          ? "zypper --non-interactive refresh"
          : gerenciador === "pacman"
            ? "pacman -Sy"
            : null,
      true,
    ),
  );
  for (const pacote of instalar) {
    acoes.push(
      acao(`Instala o pacote ${pacote.nome}`, comandoInstalacao(gerenciador, [pacote.nome]), true),
    );
  }

  const atualizou = comRetentativas(ctx, () => atualizarIndice(ctx, gerenciador));
  if (!atualizou) {
    throw falha("E_PACOTE", "Falha ao atualizar o índice do gerenciador de pacotes.", {
      dica: "Confira a rede e o repositório da distribuição.",
      documentacao: "docs/instalador.md#auditoria-de-pacotes",
    });
  }
  const resultado = comRetentativas(ctx, () =>
    executarEtapa(ctx, binario, argumentos, {
      timeout: 1800000,
      env: gerenciador === "apt" ? { DEBIAN_FRONTEND: "noninteractive" } : {},
    }),
  );
  if (!resultado || resultado.status !== 0) {
    throw falha("E_PACOTE", "Falha ao instalar os pacotes obrigatórios.", {
      dica: "Confira a saída do gerenciador, a rede e o espaço em disco.",
      documentacao: "docs/instalador.md#auditoria-de-pacotes",
    });
  }
  if (forcar) {
    avisos.push(
      avisoEtapa(
        "A_PACOTES_FORCADOS",
        "A reinstalação explícita de pacotes foi solicitada com --forcar-pacotes.",
        "docs/instalador.md#auditoria-de-pacotes",
      ),
    );
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: false,
      gerenciador,
      instalados: instalar.map((pacote) => pacote.nome),
      resumo: auditoria.resumo,
    },
  };
}
