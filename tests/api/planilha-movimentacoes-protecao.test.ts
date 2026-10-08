// Proteções de movimentações contra PostgreSQL real, sem planilhas ou dados de produção.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import pg from "pg";
import { banco } from "@/infra/banco";
import type { LinhaIntegracao } from "@/application/planilha-comum";
import {
  iniciarEnvioMovimentacao,
  concluirEnvioMovimentacao,
  haEnvioMovimentacaoSemConfirmacao,
} from "@/application/planilha-movimentacoes-envios";
import {
  CHAVE_TRAVA_MOVIMENTACOES,
  comTravaPlanilhaMovimentacoes,
  controleTravaPlanilhaMovimentacoes,
} from "@/infra/trava-planilha-movimentacoes";

const marcador = `qa-salvaguarda-${randomUUID()}`;
const linha: LinhaIntegracao = {
  ativa: true,
  envioAutomatico: true,
  googlePlanilhaId: marcador,
  googlePlanilhaNome: "QA Movimentações",
  googleRefreshToken: null,
  esquema: null,
  assinaturaEsquema: null,
  esquemaEm: null,
  modo: "CONSERVADOR",
  modoCompletoAte: null,
  atualizadoEm: new Date(),
};
const periodo = { de: "2026-10-05", ate: "2026-10-09" };
let autorId = "";
let conexao: pg.Client;

beforeAll(async () => {
  conexao = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await conexao.connect();
  const usuario = await banco().usuario.findFirst({
    where: { email: "direcao@escola.exemplo" },
    select: { id: true },
  });
  if (!usuario) throw new Error("Administrador sintético ausente.");
  autorId = usuario.id;
});
beforeEach(async () => {
  await banco().sincronizacaoPlanilha.deleteMany({ where: { planoHash: marcador } });
});
afterAll(async () => {
  await banco().sincronizacaoPlanilha.deleteMany({ where: { planoHash: marcador } });
  await conexao?.end();
  await banco().$disconnect();
});

async function tentativa(aba = "Saídas", dias = periodo, destino = linha) {
  return iniciarEnvioMovimentacao(autorId, destino, aba, dias, marcador, "conservador");
}
async function sucesso(dias = periodo, puladasOcupadas = 0) {
  const id = await tentativa("Saídas", dias);
  await concluirEnvioMovimentacao(id, "SUCESSO", { puladasOcupadas });
}

describe("recuperação durável da automação", () => {
  it("uma tentativa interrompida permanece pendente e isola arquivo e aba", async () => {
    await tentativa();
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(true);
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Entradas")).toBe(false);
    expect(
      await haEnvioMovimentacaoSemConfirmacao(
        { ...linha, googlePlanilhaId: `${marcador}-outro` },
        "Saídas",
      ),
    ).toBe(false);
  });
  it("sucesso de outro período ou com dados pulados não libera uma tentativa pendente", async () => {
    await tentativa();
    await sucesso({ de: "2026-10-06", ate: "2026-10-09" });
    await sucesso(periodo, 1);
    const falha = await tentativa();
    await concluirEnvioMovimentacao(falha, "FALHA", {}, "Recusa sintética.");
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(true);
  });
  it("conferência posterior de todo o período libera a automação sem apagar o histórico", async () => {
    const inicial = await tentativa();
    await sucesso();
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(false);
    expect(
      (await banco().sincronizacaoPlanilha.findUnique({ where: { id: inicial } }))?.resultado,
    ).toBe("PARCIAL");
    await tentativa();
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(true);
  });
  it("reconcilia registros antigos de saídas sem bloquear a aba Entradas", async () => {
    const antigo = await tentativa();
    await banco().sincronizacaoPlanilha.update({ where: { id: antigo }, data: { destino: null } });
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Entradas")).toBe(false);
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(true);
    await sucesso();
    expect(await haEnvioMovimentacaoSemConfirmacao(linha, "Saídas")).toBe(false);
  });
});

describe("exclusão entre instâncias", () => {
  it("recusa outro processo antes de executar leitura ou escrita", async () => {
    await conexao.query("BEGIN");
    try {
      await conexao.query("SELECT pg_advisory_xact_lock($1::integer, $2::integer)", [
        CHAVE_TRAVA_MOVIMENTACOES.namespace,
        CHAVE_TRAVA_MOVIMENTACOES.recurso,
      ]);
      const tarefa = vi.fn();
      await expect(comTravaPlanilhaMovimentacoes(tarefa)).rejects.toMatchObject({ status: 409 });
      expect(tarefa).not.toHaveBeenCalled();
    } finally {
      await conexao.query("ROLLBACK");
    }
    expect(await comTravaPlanilhaMovimentacoes(async () => "liberada")).toBe("liberada");
  });
  it("mantém a mesma proteção no caminho automático que chama o manual", async () => {
    await comTravaPlanilhaMovimentacoes(async () => {
      const controle = controleTravaPlanilhaMovimentacoes();
      expect(controle).toBeDefined();
      await comTravaPlanilhaMovimentacoes(async () => {
        expect(controleTravaPlanilhaMovimentacoes()).toBe(controle);
        controle?.conferir();
      });
    });
    expect(controleTravaPlanilhaMovimentacoes()).toBeUndefined();
  });
});
