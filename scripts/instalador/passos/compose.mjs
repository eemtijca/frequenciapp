// Etapa de Compose: valida a configuração, sobe a pilha e adota a identidade.
import fs from "node:fs";
import path from "node:path";
import { acao, avisoEtapa, executarEtapa, falha } from "./contexto.mjs";

export const id = "compose";
export const titulo = "Monta, valida e sobe a pilha";
export const limiteSegundos = 1800;

function script(ctx, nome) {
  return path.join(ctx.caminhos.appDir, "scripts", "servidor", nome);
}

function compose(ctx, argumentos, opcoes = {}) {
  return executarEtapa(ctx, "bash", [script(ctx, "compose.sh"), ...argumentos], {
    timeout: opcoes.timeout ?? 1800000,
  });
}

function lerServicos(texto) {
  const servicos = [];
  const bruto = String(texto ?? "").trim();
  if (!bruto) return servicos;
  if (bruto.startsWith("[")) {
    try {
      const lista = JSON.parse(bruto);
      if (Array.isArray(lista)) return lista;
    } catch {
      return servicos;
    }
  }
  for (const linha of bruto.split(/\r?\n/)) {
    if (!linha.trim()) continue;
    try {
      servicos.push(JSON.parse(linha));
    } catch {
      // Linhas que não são JSON são ignoradas.
    }
  }
  return servicos;
}

function pilhaSaudavel(ctx) {
  const resultado = compose(ctx, ["ps", "--format", "json"], { timeout: 60000 });
  if (resultado.status !== 0) return { saudavel: false, servicos: [] };
  const servicos = lerServicos(resultado.stdout);
  const porServico = new Map(servicos.map((item) => [item.Service ?? item.service, item]));
  const app = porServico.get("app");
  const banco = porServico.get("db");
  const proxy = porServico.get(ctx.configuracao.proxy);
  const emExecucao = (item) => item && /running/i.test(String(item.State ?? item.Status ?? ""));
  const saudavel =
    Boolean(app && banco && proxy) &&
    emExecucao(app) &&
    emExecucao(banco) &&
    emExecucao(proxy) &&
    /healthy/i.test(String(app.Health ?? ""));
  return { saudavel, servicos };
}

function conferirIdentidade(ctx, adotar) {
  const argumentos = adotar ? ["--adotar", "--confirmar"] : ["--conferir"];
  const resultado = executarEtapa(ctx, "bash", [script(ctx, "identidade.sh"), ...argumentos], {
    timeout: 120000,
  });
  return resultado.status === 0;
}

function ajustarProprietarioIdentidade(ctx) {
  if (ctx.uid !== 0 || ctx.modoTeste) return false;
  const usuario = ctx.usuarioServico;
  const uid = executarEtapa(ctx, "id", ["-u", usuario], { timeout: 10000 });
  const gid = executarEtapa(ctx, "id", ["-g", usuario], { timeout: 10000 });
  if (uid.status !== 0 || gid.status !== 0) return false;
  const numeroUid = Number(String(uid.stdout).trim());
  const numeroGid = Number(String(gid.stdout).trim());
  if (!Number.isFinite(numeroUid) || !Number.isFinite(numeroGid)) return false;
  const informacao = fs.statSync(ctx.caminhos.identidade);
  if (informacao.uid === numeroUid && informacao.gid === numeroGid) return false;
  const resultado = executarEtapa(
    ctx,
    "chown",
    [`${numeroUid}:${numeroGid}`, ctx.caminhos.identidade],
    { timeout: 30000 },
  );
  if (resultado.status !== 0) {
    throw falha("E_VALIDACAO", "Não foi possível ajustar o proprietário da identidade.", {
      dica: "Confira a conta de implantação e a permissão de root.",
      documentacao: "docs/instalador.md#segurança",
      saida: 5,
    });
  }
  return true;
}

export function executar(ctx) {
  const acoes = [];
  const avisos = [];
  const validacao = compose(ctx, ["config", "--quiet"], { timeout: 120000 });
  if (validacao.status !== 0) {
    throw falha("E_COMPOSE", "A configuração do Compose não é válida.", {
      dica: "Confira app.env, ops.env e os arquivos Compose do checkout.",
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  acoes.push(acao("Valida a configuração do Compose", "docker compose config --quiet", false));
  if (ctx.naoIniciar) {
    avisos.push(
      avisoEtapa(
        "A_NAO_INICIAR",
        "A pilha não foi iniciada por causa de --nao-iniciar; a configuração foi validada.",
        "docs/instalador.md#aplicar",
      ),
    );
    return {
      estado: "concluida",
      acoes,
      avisos,
      detalhes: { semMudancas: true, pilhaIniciada: false, identidadeAdotada: false },
    };
  }
  const antes = pilhaSaudavel(ctx);
  let iniciou = false;
  if (!antes.saudavel || ctx.forcar) {
    const resultado = compose(ctx, ["up", "-d", "--remove-orphans"], { timeout: 1800000 });
    if (resultado.status !== 0) {
      throw falha("E_COMPOSE", "Não foi possível subir a pilha do Compose.", {
        dica: "Confira o log dos containers, a imagem e o banco.",
        documentacao: "docs/instalador.md#aplicar",
      });
    }
    iniciou = true;
    acoes.push(acao("Sobe a pilha com o Compose", "docker compose up -d --remove-orphans", true));
  } else {
    acoes.push(acao("A pilha já está em execução e saudável", null, false));
  }
  const identidadeExiste = fs.existsSync(ctx.caminhos.identidade);
  let identidadeAdotada = false;
  if (!identidadeExiste) {
    if (!conferirIdentidade(ctx, true)) {
      throw falha("E_COMPOSE", "Não foi possível adotar a identidade operacional da pilha.", {
        dica: "Confira os containers, volumes e labels do projeto.",
        documentacao: "docs/instalador.md#aplicar",
      });
    }
    identidadeAdotada = true;
    acoes.push(
      acao("Adota a identidade operacional da pilha", "identidade.sh --adotar --confirmar", true),
    );
    if (ajustarProprietarioIdentidade(ctx)) {
      acoes.push(
        acao(
          `Ajusta a identidade para a conta ${ctx.usuarioServico}`,
          `chown ${ctx.usuarioServico}:${ctx.usuarioServico} identidade.json`,
          true,
        ),
      );
    }
  } else if (!conferirIdentidade(ctx, false)) {
    throw falha("E_VALIDACAO", "A identidade operacional da pilha divergiu do registro.", {
      dica: "Revise containers, volumes e labels antes de continuar.",
      documentacao: "docs/instalador.md#aplicar",
    });
  } else {
    if (ajustarProprietarioIdentidade(ctx)) {
      acoes.push(
        acao(
          `Ajusta a identidade para a conta ${ctx.usuarioServico}`,
          `chown ${ctx.usuarioServico}:${ctx.usuarioServico} identidade.json`,
          true,
        ),
      );
    }
    acoes.push(acao("A identidade operacional já está conferida", null, false));
  }
  return {
    estado: "concluida",
    acoes,
    avisos,
    detalhes: {
      semMudancas: !iniciou && !identidadeAdotada,
      pilhaIniciada: true,
      identidadeAdotada,
      projeto: ctx.caminhos.projetoCompose,
    },
  };
}
