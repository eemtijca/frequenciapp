// Etapa de banco: valida o PostgreSQL 17 e a conexão antes das migrações.
import { acao, avisoEtapa, executarEtapa, falha } from "./contexto.mjs";

export const id = "banco";
export const titulo = "Valida o PostgreSQL 17 e a conexão";
export const limiteSegundos = 600;

function compose(ctx, argumentos) {
  return executarEtapa(
    ctx,
    "bash",
    [ctx.caminhos.appDir + "/scripts/servidor/compose.sh", ...argumentos],
    { timeout: 120000 },
  );
}

export function executar(ctx) {
  if (ctx.naoIniciar) {
    return {
      estado: "pulada",
      acoes: [acao("Banco não validado por causa de --nao-iniciar", null, false)],
      avisos: [
        avisoEtapa(
          "A_NAO_INICIAR",
          "O banco não foi validado porque a pilha não foi iniciada.",
          "docs/instalador.md#aplicar",
        ),
      ],
      detalhes: { semMudancas: true, verificado: false },
    };
  }
  const id = compose(ctx, ["ps", "-q", "db"]);
  if (id.status !== 0 || !String(id.stdout).trim()) {
    throw falha("E_SAUDE", "O container do banco não está em execução.", {
      dica: "Confira a pilha do Compose e o log do banco.",
      documentacao: "docs/instalador.md#situacao",
    });
  }
  const container = String(id.stdout).trim().split(/\s+/)[0];
  const pronto = ctx.executar(
    "docker",
    [
      "exec",
      container,
      "pg_isready",
      "-U",
      ctx.ambiente?.get("POSTGRES_USER") ?? "frequencia",
      "-d",
      ctx.ambiente?.get("POSTGRES_DB") ?? "frequencia",
    ],
    { timeout: 30000 },
  );
  if (pronto.status !== 0) {
    throw falha("E_SAUDE", "O banco não respondeu ao pg_isready.", {
      dica: "Confira o container, o volume e a senha do banco.",
      documentacao: "docs/instalador.md#situacao",
    });
  }
  const versao = ctx.executar("docker", ["exec", container, "postgres", "--version"], {
    timeout: 30000,
  });
  let versaoTexto = "";
  if (versao.status === 0) {
    versaoTexto = String(versao.stdout).trim();
    const combinacao = /(\d+)(?:\.\d+)?/.exec(versaoTexto);
    if (!combinacao || Number(combinacao[1]) !== 17) {
      throw falha("E_VALIDACAO", `O banco não é PostgreSQL 17: ${versaoTexto}.`, {
        dica: "Use a imagem postgres:17 no Compose.",
        documentacao: "docs/instalador.md#auditoria-de-pacotes",
      });
    }
  }
  const consulta = ctx.executar(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-U",
      ctx.ambiente?.get("POSTGRES_USER") ?? "frequencia",
      "-d",
      ctx.ambiente?.get("POSTGRES_DB") ?? "frequencia",
      "-tAc",
      "select 1",
    ],
    { timeout: 30000 },
  );
  if (consulta.status !== 0) {
    throw falha("E_SAUDE", "A conexão autenticada com o banco falhou.", {
      dica: "Confira POSTGRES_USER, POSTGRES_PASSWORD e o banco do Compose.",
      documentacao: "docs/instalador.md#situacao",
    });
  }
  return {
    estado: "concluida",
    acoes: [acao("Confere o PostgreSQL 17 e a resposta do banco", "pg_isready", false)],
    avisos: [],
    detalhes: {
      semMudancas: true,
      container,
      versao: versaoTexto,
      pronto: true,
    },
  };
}
