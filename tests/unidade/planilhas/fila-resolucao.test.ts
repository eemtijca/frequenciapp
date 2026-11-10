// O operador só resolve a pendência por evidência do escopo exato ou confirmação explícita.
import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({
  item: vi.fn(),
  prova: vi.fn(),
  atualizar: vi.fn(),
  auditar: vi.fn(),
}));
const tx = vi.hoisted(() => ({
  filaPlanilha: { findUnique: d.item, updateMany: d.atualizar },
  sincronizacaoPlanilha: { findFirst: d.prova },
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/auditoria", () => ({ auditar: d.auditar }));
import { resolverConferenciaItem } from "@/application/fila-conferencia";
const origemId = "00000000-0000-4000-8000-000000000001";
const dia = new Date("2026-06-15T00:00:00Z");
const iniciadoEm = "2026-06-15T13:00:00.000Z";
const atualizadoEm = new Date("2026-06-15T13:05:00.000Z");

function detalhes(extra: Record<string, unknown> = {}) {
  return {
    versao: 1,
    tipo: "FREQUENCIA",
    completo: true,
    iniciadoEm,
    escopos: [{ origemId, destino: "destino-a" }],
    ...extra,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  d.item.mockResolvedValue({
    id: "i",
    tipo: "FREQUENCIA",
    estado: "CONCLUIDO",
    dia,
    atualizadoEm,
    requerConferencia: true,
    resolvidoEm: null,
    resultado: "sem_confirmacao",
    detalhes: detalhes(),
  });
  d.prova.mockResolvedValue({ id: "recibo" });
  d.atualizar.mockResolvedValue({ count: 1 });
});
type FiltroProva = {
  finalidade: string;
  turmaOriginalId?: string;
  destino: string;
  de: { lte: Date };
  ate: { gte: Date };
  criadoEm: { gte: Date };
  resultado: string;
  puladasOcupadas?: number;
  puladasFormula?: number;
};
it("exige sucesso posterior no mesmo destino, período e origem", async () => {
  await resolverConferenciaItem({ id: "qa" }, "i");
  expect(d.prova).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        finalidade: "FREQUENCIA",
        turmaOriginalId: origemId,
        destino: "destino-a",
        de: { lte: dia },
        ate: { gte: dia },
        resultado: "SUCESSO",
        puladasOcupadas: 0,
        puladasFormula: 0,
        criadoEm: { gte: new Date(iniciadoEm) },
      }),
    }),
  );
  expect(d.atualizar).toHaveBeenCalledWith({
    where: { id: "i", resolvidoEm: null },
    data: { requerConferencia: false, resolvidoEm: expect.any(Date) },
  });
  expect(d.auditar).toHaveBeenCalledWith(
    expect.anything(),
    "qa",
    "fila_planilha.resolverConferencia",
    "fila:i:comprovada",
  );
});

it("um sucesso em outro destino não resolve", async () => {
  d.prova.mockImplementation(async ({ where }: { where: FiltroProva }) =>
    where.destino === "destino-b" ? { id: "p" } : null,
  );
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
  expect(d.atualizar).not.toHaveBeenCalled();
});

it("recusa resolver pendência segura, que deve ser tentada de novo", async () => {
  d.item.mockResolvedValue({
    ...(await d.item()),
    resultado: "sem_mapa",
    detalhes: detalhes({ completo: false, escopos: [{ origemId, destino: null }] }),
  });
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
  expect(d.atualizar).not.toHaveBeenCalled();
});

it.each([
  ["legado sem detalhes", null, "sem_confirmacao"],
  ["detalhe sem instante", detalhes({ iniciadoEm: undefined }), "sem_confirmacao"],
  [
    "escopo incompleto",
    detalhes({ completo: false, escopos: [{ origemId, destino: null }] }),
    "sem_confirmacao",
  ],
])("recorte sem prova exige confirmação: %s", async (_nome, valor, resultado) => {
  d.item.mockResolvedValue({ ...(await d.item()), detalhes: valor, resultado });
  d.prova.mockResolvedValue(null);
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
  await resolverConferenciaItem({ id: "qa" }, "i", { confirmado: true });
  expect(d.atualizar).toHaveBeenCalledWith(
    expect.objectContaining({ data: { requerConferencia: false, resolvidoEm: expect.any(Date) } }),
  );
});

it("confirmação explícita não dispensa recibo de um destino conhecido", async () => {
  d.prova.mockResolvedValue(null);
  await expect(
    resolverConferenciaItem({ id: "qa" }, "i", { confirmado: true }),
  ).rejects.toMatchObject({ status: 409 });
  expect(d.atualizar).not.toHaveBeenCalled();
});

it("movimentação usa a finalidade de saídas e o destino exato", async () => {
  d.item.mockResolvedValue({
    ...(await d.item()),
    tipo: "ENTRADAS",
    detalhes: detalhes({
      tipo: "ENTRADAS",
      escopos: [{ origemId: null, destino: "movimentacao:hash" }],
    }),
  });
  await resolverConferenciaItem({ id: "qa" }, "i");
  expect(d.prova).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({
        finalidade: "SAIDAS",
        destino: "movimentacao:hash",
      }),
    }),
  );
  expect(d.prova.mock.calls[0]?.[0]?.where).not.toHaveProperty("turmaOriginalId");
});

it("uma pendência que mudou durante a conferência não é sobrescrita", async () => {
  d.atualizar.mockResolvedValue({ count: 0 });
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
  expect(d.auditar).not.toHaveBeenCalled();
});

it("recusa item sem pendência ou já resolvido", async () => {
  d.item.mockResolvedValue({
    ...(await d.item()),
    requerConferencia: false,
    resolvidoEm: new Date(),
  });
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
});

it("recusa item que ainda está na fila", async () => {
  d.item.mockResolvedValue({ ...(await d.item()), estado: "AGUARDANDO" });
  await expect(resolverConferenciaItem({ id: "qa" }, "i")).rejects.toMatchObject({ status: 409 });
  expect(d.atualizar).not.toHaveBeenCalled();
});
