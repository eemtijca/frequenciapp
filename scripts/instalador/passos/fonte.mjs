// Etapa de fonte: prepara o checkout, valida o commit e ajusta o proprietário.
import fs from "node:fs";
import path from "node:path";
import { acao, avisoEtapa, executarEtapa, falha, sha256Arquivo } from "./contexto.mjs";

export const id = "fonte";
export const titulo = "Prepara o checkout ou a origem da imagem e ajusta o proprietário";
export const limiteSegundos = 900;

function arquivosCompose(configuracao) {
  return [
    "compose.yml",
    "compose.servidor.yml",
    configuracao.proxy === "nginx" ? "compose.servidor-nginx.yml" : "compose.servidor-caddy.yml",
  ];
}

function validarCheckout(destino, configuracao) {
  let info;
  try {
    info = fs.lstatSync(destino);
  } catch {
    throw falha("E_VALIDACAO", `O diretório de origem ${destino} não foi encontrado.`, {
      dica: "Clone o repositório no caminho indicado por --diretorio-fonte.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw falha("E_VALIDACAO", "O diretório de origem precisa ser um diretório regular.", {
      documentacao: "docs/instalador.md#flags",
    });
  }
  const ausentes = arquivosCompose(configuracao).filter(
    (arquivo) => !fs.existsSync(path.join(destino, arquivo)),
  );
  if (ausentes.length) {
    throw falha(
      "E_VALIDACAO",
      `O checkout não contém os arquivos Compose esperados: ${ausentes.join(", ")}.`,
      {
        dica: "Atualize o checkout para a tag ou o commit do plano.",
        documentacao: "docs/instalador.md#aplicar",
      },
    );
  }
}

function ambienteGit() {
  const sudoUid = process.env.SUDO_UID;
  return {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    ...(process.getuid?.() === 0 &&
    /^(?:0|[1-9][0-9]*)$/.test(sudoUid ?? "") &&
    Number.isSafeInteger(Number(sudoUid)) &&
    Number(sudoUid) <= 4294967294
      ? { SUDO_UID: sudoUid }
      : {}),
  };
}

function possuiMetadados(diretorio) {
  try {
    fs.lstatSync(path.join(diretorio, ".git"));
    return true;
  } catch (erro) {
    if (erro.code === "ENOENT") return false;
    throw falha("E_VALIDACAO", "Não foi possível consultar os metadados Git.", {
      dica: "Confira as permissões do diretório de origem.",
      documentacao: "docs/instalador.md#flags",
    });
  }
}

function prepararCheckout(ctx, destino) {
  const origem = ctx.raizRepositorio;
  if (!origem || !fs.existsSync(origem)) {
    throw falha("E_VALIDACAO", "O checkout de origem do instalador não foi encontrado.", {
      dica: "Execute o instalador a partir do repositório clonado.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  const temGit = possuiMetadados(origem);
  const git = temGit
    ? executarEtapa(ctx, "git", ["-C", origem, "rev-parse", "--is-inside-work-tree"], {
        timeout: 15000,
        env: ambienteGit(),
      })
    : null;
  const acoes = [];
  if (git?.status === 0 && String(git.stdout).trim() === "true") {
    const referencia =
      ctx.configuracao.canal === "release" ? ctx.configuracao.tag : ctx.configuracao.ref || "main";
    const porCommit = /^[a-f0-9]{7,64}$/.test(referencia ?? "");
    const argumentos = [
      "-c",
      "core.hooksPath=/dev/null",
      "clone",
      "--no-local",
      ...(porCommit ? ["--no-checkout"] : ["--depth", "1"]),
    ];
    if (referencia && !porCommit) argumentos.push("--branch", referencia);
    argumentos.push(origem, destino);
    acoes.push(
      acao(
        `Clona o checkout ${referencia || "atual"} para ${destino}`,
        `git clone ${porCommit ? "--no-checkout " : `--depth 1 ${referencia ? `--branch ${referencia} ` : ""}`}${origem} ${destino}`,
        true,
      ),
    );
    const resultado = executarEtapa(ctx, "git", argumentos, {
      timeout: 600000,
      env: ambienteGit(),
    });
    if (resultado.status !== 0) {
      throw falha("E_REDE", "Não foi possível preparar o checkout da aplicação.", {
        dica: "Confira a tag, o commit, a rede e o acesso ao repositório.",
        documentacao: "docs/instalador.md#flags",
      });
    }
    if (porCommit) {
      const selecao = executarEtapa(
        ctx,
        "git",
        [
          "-C",
          destino,
          "-c",
          "core.hooksPath=/dev/null",
          "checkout",
          "--detach",
          `${referencia}^{commit}`,
        ],
        { timeout: 120000, env: ambienteGit() },
      );
      if (selecao.status !== 0) {
        throw falha("E_CANAL", "Não foi possível selecionar o commit Git solicitado.", {
          dica: "Confira se a revisão existe na origem Git.",
          documentacao: "docs/instalador.md#flags",
        });
      }
      acoes.push(
        acao("Seleciona a revisão Git solicitada", `git checkout --detach ${referencia}`, true),
      );
    }
    return acoes;
  }
  if (temGit) {
    if (git.erro === "ENOENT" || git.erro?.code === "ENOENT") {
      throw falha("E_VALIDACAO", "O Git não foi encontrado para consultar a origem.", {
        dica: "Instale o Git e repita a instalação.",
        documentacao: "docs/instalador.md#flags",
      });
    }
    throw falha("E_VALIDACAO", "Não foi possível acessar os metadados Git da origem.", {
      dica: "Confira a propriedade, as permissões e a disponibilidade do Git.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  const resultado = executarEtapa(ctx, "cp", ["-a", `${origem}/.`, `${destino}/`], {
    timeout: 600000,
  });
  if (resultado.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível copiar o checkout para o diretório de origem.", {
      dica: "Confira a permissão do diretório de destino.",
      documentacao: "docs/instalador.md#flags",
      saida: 5,
    });
  }
  acoes.push(acao(`Copia o checkout local para ${destino}`, `cp -a ${origem}/. ${destino}/`, true));
  return acoes;
}

function commitDoCheckout(ctx, destino, referencia = "HEAD") {
  if (!possuiMetadados(destino)) return "";
  let identidade = {};
  if (ctx.uid === 0 && !ctx.modoTeste) {
    const uid = executarEtapa(ctx, "id", ["-u", ctx.usuarioServico], { timeout: 10000 });
    const gid = executarEtapa(ctx, "id", ["-g", ctx.usuarioServico], { timeout: 10000 });
    const uidTexto = uid.stdout.trim();
    const gidTexto = gid.stdout.trim();
    if (
      uid.status === 0 &&
      gid.status === 0 &&
      /^[1-9][0-9]*$/.test(uidTexto) &&
      /^(?:0|[1-9][0-9]*)$/.test(gidTexto) &&
      Number(uidTexto) <= 4294967294 &&
      Number(gidTexto) <= 4294967294 &&
      fs.statSync(destino).uid === Number(uidTexto)
    ) {
      identidade = { uid: Number(uidTexto), gid: Number(gidTexto) };
    }
  }
  const resultado = executarEtapa(
    ctx,
    "git",
    ["-C", destino, "rev-parse", "--verify", `${referencia}^{commit}`],
    {
      timeout: 15000,
      env: ambienteGit(),
      ...identidade,
    },
  );
  const commit = String(resultado.stdout).trim();
  if (resultado.status !== 0 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)) {
    throw falha("E_VALIDACAO", "Não foi possível verificar o commit Git do checkout operacional.", {
      dica: "Confira a propriedade, as permissões e os metadados do checkout.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  return commit;
}

// Expande abreviações por objetos reais antes de comparar o plano com o estado durável.
export function resolverCommitAbreviado(ctx) {
  const informado = ctx.configuracao.commit;
  if (!informado || informado !== ctx.configuracao.ref || [40, 64].includes(informado.length))
    return;
  const diretorio = possuiMetadados(ctx.caminhos.appDir)
    ? ctx.caminhos.appDir
    : ctx.raizRepositorio;
  if (diretorio && possuiMetadados(diretorio)) {
    ctx.configuracao.commit = commitDoCheckout(ctx, diretorio, informado);
  }
}

function conferirCommit(ctx, destino, esperados) {
  const commit = commitDoCheckout(ctx, destino);
  if (esperados.some(Boolean) && !commit) {
    throw falha("E_VALIDACAO", "Não foi possível verificar o commit informado sem metadados Git.", {
      dica: "Use uma origem Git acessível para conferir a revisão.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  if (esperados.some((esperado) => esperado !== commit)) {
    throw falha("E_CANAL", "O commit do checkout diverge do plano ou do estado.", {
      dica: "Atualize o checkout para o commit ou a tag do plano.",
      documentacao: "docs/instalador.md#canal-release-e-main",
    });
  }
  return commit;
}

// A retomada não pode adotar outra revisão nem preparar novamente a fonte.
export function revalidar(ctx) {
  const destino = ctx.caminhos.appDir;
  validarCheckout(destino, ctx.configuracao);
  const esperados = [ctx.estado?.commit ?? ""];
  if (ctx.configuracao.commit) esperados.push(ctx.configuracao.commit);
  const commit = conferirCommit(ctx, destino, esperados);
  if (commit) ctx.commitDetectado = commit;
  const anterior = ctx.estado.etapas.find((etapa) => etapa.id === id);
  return {
    estado: "concluida",
    acoes: [acao("Revalida a revisão registrada sem alterar o checkout", null, false)],
    avisos: [],
    detalhes: { ...anterior?.detalhes, semMudancas: true, diretorio: destino, commit },
  };
}

export function executar(ctx) {
  const destino = ctx.caminhos.appDir;
  const acoes = [];
  const avisos = [];
  let preparou = false;
  let vazio = false;
  try {
    const info = fs.lstatSync(destino);
    vazio = info.isDirectory() && !info.isSymbolicLink() && fs.readdirSync(destino).length === 0;
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
  if (!fs.existsSync(destino) || vazio) {
    fs.mkdirSync(destino, { recursive: true, mode: 0o755 });
    acoes.push(...prepararCheckout(ctx, destino));
    preparou = true;
  }
  validarCheckout(destino, ctx.configuracao);
  const commit = conferirCommit(ctx, destino, [ctx.configuracao.commit].filter(Boolean));
  if (commit) ctx.commitDetectado = commit;
  const migrador = path.join(destino, "docker", "app", "migrar.mjs");
  if (fs.existsSync(migrador)) {
    ctx.migradorSha256 = sha256Arquivo(migrador);
  }
  if (ctx.uid === 0 && !ctx.modoTeste) {
    const resultado = executarEtapa(
      ctx,
      "chown",
      ["-R", `${ctx.usuarioServico}:${ctx.usuarioServico}`, destino],
      {
        timeout: 120000,
      },
    );
    if (resultado.status !== 0) {
      throw falha("E_VALIDACAO", "Não foi possível ajustar o proprietário do checkout.", {
        dica: "Confira a permissão do diretório de origem.",
        documentacao: "docs/instalador.md#flags",
        saida: 5,
      });
    }
    executarEtapa(ctx, "chmod", ["-R", "a+rX,go-w", destino], { timeout: 120000 });
    acoes.push(
      acao(
        "Ajusta o proprietário e as permissões do checkout",
        `chown -R ${ctx.usuarioServico}:${ctx.usuarioServico} ${destino}`,
        true,
      ),
    );
  } else {
    avisos.push(
      avisoEtapa(
        "A_FONTE_TESTE",
        "O checkout de teste é sintético e não recebeu proprietário de root.",
        "docs/instalador.md#testes-em-docker",
      ),
    );
  }
  if (!acoes.length) {
    acoes.push(acao("O checkout já está presente e corresponde ao plano", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: !preparou && acoes.every((item) => !item.altera),
      diretorio: destino,
      commit,
      migradorSha256: ctx.migradorSha256 ?? null,
    },
  };
}
