// Etapa de saúde: aguarda /api/saude e confere a versão e o commit.
import fs from "node:fs";
import path from "node:path";
import { VERSAO_PROJETO } from "../plano.mjs";
import { acao, avisoEtapa, executarEtapa, falha } from "./contexto.mjs";

export const id = "saude";
export const titulo = "Aguarda /api/saude e confere a versão";
export const limiteSegundos = 600;

function versaoEsperada(ctx) {
  try {
    const dados = JSON.parse(
      fs.readFileSync(path.join(ctx.caminhos.appDir, "package.json"), "utf8"),
    );
    return typeof dados.version === "string" ? dados.version : VERSAO_PROJETO;
  } catch {
    return VERSAO_PROJETO;
  }
}

function consultar(ctx) {
  return executarEtapa(
    ctx,
    "bash",
    [
      ctx.caminhos.appDir + "/scripts/servidor/compose.sh",
      "exec",
      "-T",
      "app",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3000/api/saude').then(async (r) => { const t = await r.text(); process.stdout.write(t); process.exit(r.ok ? 0 : 1); }).catch(() => process.exit(1))",
    ],
    { timeout: 30000 },
  );
}

export function executar(ctx) {
  if (ctx.pularSaude) {
    return {
      estado: "pulada",
      acoes: [acao("Saúde não verificada por causa de --pular-saude", null, false)],
      avisos: [
        avisoEtapa(
          "A_SAUDE_PULADA",
          "O health check foi pulado; a instalação não foi declarada saudável.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, verificado: false },
    };
  }
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Saúde não verificada por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "O health check não foi executado porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, verificado: false },
    };
  }
  const tentativas = ctx.modoTeste ? 2 : 12;
  let ultimo = null;
  for (let indice = 0; indice < tentativas; indice += 1) {
    const resultado = consultar(ctx);
    ultimo = resultado;
    if (resultado.status === 0) {
      try {
        const corpo = JSON.parse(String(resultado.stdout).trim());
        if (corpo?.ok === true) {
          const versao = String(corpo.versao ?? "");
          const esperada = versaoEsperada(ctx);
          if (versao && esperada && versao !== esperada) {
            throw falha("E_SAUDE", "A versão implantada diverge da versão do checkout.", {
              dica: "Confira a imagem, a tag e o COMMIT_SHA do container.",
              documentacao: "docs/instalador.md#aplicar",
            });
          }
          const commit = String(corpo.commit ?? "");
          const esperado = String(ctx.configuracao.commit || ctx.commitDetectado || "");
          if (esperado && commit && commit !== esperado && commit !== "local") {
            throw falha("E_SAUDE", "A versão implantada diverge do commit do plano.", {
              dica: "Confira a imagem e o COMMIT_SHA do container.",
              documentacao: "docs/instalador.md#aplicar",
            });
          }
          return {
            estado: "concluida",
            acoes: [acao("Confere a resposta de /api/saude", "curl -fsS /api/saude", false)],
            avisos: [],
            detalhes: {
              semMudancas: true,
              verificado: true,
              versao: String(corpo.versao ?? ""),
              commit,
            },
          };
        }
      } catch (erro) {
        if (erro?.codigo === "E_SAUDE") throw erro;
        // Resposta inválida é tratada como nova tentativa.
      }
    }
    if (indice < tentativas - 1) ctx.esperar(ctx.modoTeste ? 0 : 5);
  }
  throw falha("E_SAUDE", "A aplicação não respondeu ao health check.", {
    dica: `Confira o log da aplicação e a saída de /api/saude.${
      ultimo?.stderr ? ` Saída: ${String(ultimo.stderr).slice(0, 500)}` : ""
    }`,
    documentacao: "docs/instalador.md#aplicar",
  });
}
