// Verifica retomada e falhas locais do dispatcher sem afirmar concorrência PostgreSQL.
import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ buscar: vi.fn(), marcar: vi.fn(), fila: vi.fn(), criar: vi.fn() }));
const tx = vi.hoisted(() => ({
  intencaoEnvioEscolar: { findFirst: d.buscar, update: d.marcar },
  filaPlanilha: { findFirst: d.fila, create: d.criar },
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/application/planilha-comum", () => ({ idDaIntegracao: (f: string) => f }));
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
const intencao = {
  id: "i",
  tipo: "ENTRADAS",
  turmaId: null,
  dia: new Date("2026-06-15T12:00:00Z"),
  autorId: "qa",
  eventoId: "evento",
  revisaoEvento: 3,
  sequencia: 17n,
  politica: "AUTOMATICO_CONSERVADOR_V1",
  criadoEm: new Date("2026-06-15T13:00:00Z"),
  despachadoEm: null,
};
beforeEach(() => {
  vi.resetAllMocks();
});
it("funde com fila existente e repetição não duplica o recibo", async () => {
  let pendente = true;
  d.buscar.mockImplementation(async () => (pendente ? intencao : null));
  d.fila.mockResolvedValue({ id: "fila" });
  d.marcar.mockImplementation(async () => {
    pendente = false;
  });
  expect(await despacharIntencoesEscolares()).toBe(1);
  expect(await despacharIntencoesEscolares()).toBe(0);
  expect(d.criar).not.toHaveBeenCalled();
  expect(d.marcar).toHaveBeenCalledTimes(1);
});
it("cria fila somente com campos permitidos e confirma a intenção completa", async () => {
  let pendente = true;
  d.buscar.mockImplementation(async () => (pendente ? intencao : null));
  d.fila.mockResolvedValue(null);
  d.criar.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const permitidos = ["tipo", "dia", "turmaId", "autorId", "estado", "tentativas"].sort();
    if (Object.keys(data).sort().join() !== permitidos.join())
      throw new Error("QA_CAMPOS_FORA_DO_MODELO_FILA");
    expect(data).toEqual({
      tipo: "ENTRADAS",
      dia: intencao.dia,
      turmaId: null,
      autorId: "qa",
      estado: "AGUARDANDO",
      tentativas: 0,
    });
    return { id: "fila-propria", sequencia: 99n };
  });
  d.marcar.mockImplementation(async () => {
    pendente = false;
  });
  expect(await despacharIntencoesEscolares()).toBe(1);
  expect(d.criar).toHaveBeenCalledTimes(1);
  expect(d.marcar).toHaveBeenCalledWith({
    where: { id: "i", despachadoEm: null },
    data: { despachadoEm: expect.any(Date) },
  });
  expect(d.criar.mock.invocationCallOrder[0]).toBeLessThan(
    d.marcar.mock.invocationCallOrder[0] ?? 0,
  );
});

it("falha na fila conserva intenção não despachada", async () => {
  d.buscar.mockResolvedValue(intencao);
  d.fila.mockResolvedValue(null);
  d.criar.mockRejectedValue(new Error("QA_FILA"));
  await expect(despacharIntencoesEscolares()).rejects.toThrow("QA_FILA");
  expect(d.marcar).not.toHaveBeenCalled();
});
