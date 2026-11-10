// Intercala dois módulos consumidores independentes sobre um repositório sintético com CAS.
import { afterEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ frente: vi.fn(), atualizar: vi.fn(), enviar: vi.fn() }));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    filaPlanilha: {
      findMany: d.frente,
      updateMany: d.atualizar,
      count: async () => 1,
      deleteMany: async () => ({ count: 0 }),
    },
  }),
}));
vi.mock("@/application/planilha", () => ({ enviarAposSalvar: vi.fn() }));
vi.mock("@/application/planilha-comum", () => ({ lerLinha: vi.fn(), modoCompletoAtivo: vi.fn() }));
vi.mock("@/application/planilha-saidas", () => ({ enviarSaidasAposRegistro: vi.fn() }));
vi.mock("@/application/planilha-entradas", () => ({ enviarEntradasAposRegistro: d.enviar }));
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
it.each(["enviado", "falhou"])("o dono vencido não finaliza o novo dono: %s", async (resultado) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
  let item = {
    id: "qa",
    sequencia: 1,
    estado: "AGUARDANDO",
    tipo: "ENTRADAS",
    autorId: "qa",
    turmaId: null,
    dia: new Date(),
    tentativas: 0,
    proximaTentativaEm: null,
    reservadoAte: null as Date | null,
  };
  d.frente.mockImplementation(async () => [{ ...item }]);
  d.atualizar.mockImplementation(async ({ where, data }) => {
    if (where.tentativas !== undefined && item.tentativas !== where.tentativas) return { count: 0 };
    if (
      where.reservadoAte instanceof Date &&
      item.reservadoAte?.getTime() !== where.reservadoAte.getTime()
    )
      return { count: 0 };
    item = {
      ...item,
      ...data,
      tentativas: data.tentativas ? item.tentativas + 1 : item.tentativas,
    };
    return { count: 1 };
  });
  let liberarA: (s: string) => void = () => undefined;
  let liberarB: (s: string) => void = () => undefined;
  let entrouA: () => void = () => undefined;
  let entrouB: () => void = () => undefined;
  const inicioA = new Promise<void>((r) => {
    entrouA = r;
  });
  const inicioB = new Promise<void>((r) => {
    entrouB = r;
  });
  d.enviar
    .mockImplementationOnce(() => {
      entrouA();
      return new Promise<string>((r) => {
        liberarA = r;
      });
    })
    .mockImplementationOnce(() => {
      entrouB();
      return new Promise<string>((r) => {
        liberarB = r;
      });
    });
  vi.resetModules();
  const a = await import("@/application/fila-planilha");
  const trabalhoA = a.processarFila({ limite: 1 });
  await inicioA;
  vi.setSystemTime(new Date("2026-06-15T12:06:00Z"));
  vi.resetModules();
  const b = await import("@/application/fila-planilha");
  const trabalhoB = b.processarFila({ limite: 1 });
  await inicioB;
  const reservaB = { ...item };
  liberarA(resultado);
  const resumoA = await trabalhoA;
  expect(item).toEqual(reservaB);
  expect(resumoA.processados).toBe(0);
  expect(resumoA.concluidos).toBe(0);
  liberarB("enviado");
  expect((await trabalhoB).concluidos).toBe(1);
});
