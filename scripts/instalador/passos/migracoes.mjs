// Etapa de migrações: aplica as migrações pendentes pelo migrador do projeto.
import { acao, avisoEtapa, executarEtapa, falha } from "./contexto.mjs";

export const id = "migracoes";
export const titulo = "Aplica as migrações pendentes";
export const limiteSegundos = 1800;

export function executar(ctx) {
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Migrações não aplicadas por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "As migrações não foram aplicadas porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, aplicadas: false },
    };
  }
  const resultado = executarEtapa(
    ctx,
    "bash",
    [
      ctx.caminhos.appDir + "/scripts/servidor/compose.sh",
      "exec",
      "-T",
      "app",
      "node",
      "./docker/app/migrar.mjs",
    ],
    { timeout: 1800000 },
  );
  const saida = `${resultado.stdout}\n${resultado.stderr}`.trim();
  if (resultado.status !== 0) {
    throw falha("E_SAUDE", "Falha ao aplicar as migrações do banco.", {
      dica: "Confira o log do migrador e o estado do banco antes de repetir.",
      documentacao: "docs/instalador.md#aplicar",
    });
  }
  const semMudancas = /já está na última revisão/i.test(saida);
  return {
    estado: "concluida",
    acoes: [
      acao(
        semMudancas
          ? "Confere que o banco já está na última revisão"
          : "Aplica as migrações pendentes",
        "docker compose exec -T app node ./docker/app/migrar.mjs",
        !semMudancas,
      ),
    ],
    avisos: [],
    detalhes: {
      semMudancas,
      aplicadas: !semMudancas,
      saida: saida.split(/\r?\n/).slice(-5).join("\n"),
    },
  };
}
