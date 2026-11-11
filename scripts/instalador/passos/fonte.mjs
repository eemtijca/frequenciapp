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

function prepararCheckout(ctx, destino) {
  const origem = ctx.raizRepositorio;
  if (!origem || !fs.existsSync(origem)) {
    throw falha("E_VALIDACAO", "O checkout de origem do instalador não foi encontrado.", {
      dica: "Execute o instalador a partir do repositório clonado.",
      documentacao: "docs/instalador.md#flags",
    });
  }
  const git = executarEtapa(ctx, "git", ["-C", origem, "rev-parse", "--is-inside-work-tree"], {
    timeout: 15000,
  });
  const acoes = [];
  if (git.status === 0 && String(git.stdout).trim() === "true") {
    const referencia =
      ctx.configuracao.canal === "release" ? ctx.configuracao.tag : ctx.configuracao.ref || "main";
    const argumentos = ["clone", "--depth", "1"];
    if (referencia) argumentos.push("--branch", referencia);
    argumentos.push(origem, destino);
    acoes.push(
      acao(
        `Clona o checkout ${referencia || "atual"} para ${destino}`,
        `git clone --depth 1 ${referencia ? `--branch ${referencia} ` : ""}${origem} ${destino}`,
        true,
      ),
    );
    const resultado = executarEtapa(ctx, "git", argumentos, { timeout: 600000 });
    if (resultado.status !== 0) {
      throw falha("E_REDE", "Não foi possível preparar o checkout da aplicação.", {
        dica: "Confira a tag, o commit, a rede e o acesso ao repositório.",
        documentacao: "docs/instalador.md#flags",
      });
    }
    return acoes;
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

function commitDoCheckout(ctx, destino) {
  const resultado = executarEtapa(ctx, "git", ["-C", destino, "rev-parse", "HEAD"], {
    timeout: 15000,
  });
  return resultado.status === 0 ? String(resultado.stdout).trim() : "";
}

export function executar(ctx) {
  const destino = ctx.caminhos.appDir;
  const acoes = [];
  const avisos = [];
  let preparou = false;
  if (!fs.existsSync(destino)) {
    fs.mkdirSync(destino, { recursive: true, mode: 0o755 });
    acoes.push(...prepararCheckout(ctx, destino));
    preparou = true;
  }
  validarCheckout(destino, ctx.configuracao);
  const commit = commitDoCheckout(ctx, destino);
  if (commit) ctx.commitDetectado = commit;
  if (ctx.configuracao.commit && commit && ctx.configuracao.commit !== commit) {
    throw falha("E_CANAL", "O commit do checkout diverge do plano.", {
      dica: "Atualize o checkout para o commit ou a tag do plano.",
      documentacao: "docs/instalador.md#canal-release-e-main",
    });
  }
  const migrador = path.join(destino, "docker", "app", "migrar.mjs");
  if (fs.existsSync(migrador)) {
    ctx.migradorSha256 = sha256Arquivo(migrador);
  }
  if (ctx.uid === 0 && !ctx.modoTeste) {
    const resultado = executarEtapa(ctx, "chown", ["-R", "root:root", destino], {
      timeout: 120000,
    });
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
        `chown -R root:root ${destino}`,
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
