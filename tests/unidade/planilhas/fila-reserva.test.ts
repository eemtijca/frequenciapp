// Intercala dois módulos consumidores independentes sobre um repositório sintético com CAS.
import { afterEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ frente: vi.fn(), atualizar: vi.fn(), enviar: vi.fn() }));
const m = vi.hoisted(() => ({ registrarFilaProcessada: vi.fn() }));
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
vi.mock("@/infra/metricas", () => ({ registrarFilaProcessada: m.registrarFilaProcessada }));
vi.mock("@/application/planilha", () => ({ enviarAposSalvar: vi.fn() }));
vi.mock("@/application/planilha-comum", () => ({ lerLinha: vi.fn(), modoCompletoAtivo: vi.fn() }));
vi.mock("@/application/planilha-saidas", () => ({ enviarSaidasAposRegistro: vi.fn() }));
vi.mock("@/application/planilha-entradas", () => ({ enviarEntradasAposRegistro: d.enviar }));

function itemFila(id: string, sequencia = 1, estado = "AGUARDANDO") {
  return {
    id,
    sequencia,
    estado,
    tipo: "ENTRADAS" as const,
    autorId: "qa",
    turmaId: null,
    dia: new Date("2026-06-15T00:00:00Z"),
    tentativas: 0,
    proximaTentativaEm: null as Date | null,
    reservadoAte: null as Date | null,
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  m.registrarFilaProcessada.mockClear();
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
  const resumoA = (await trabalhoA).resumo;
  expect(item).toEqual(reservaB);
  expect(resumoA.processados).toBe(0);
  expect(resumoA.concluidos).toBe(0);
  expect(m.registrarFilaProcessada).not.toHaveBeenCalled();
  liberarB("enviado");
  expect((await trabalhoB).resumo.concluidos).toBe(1);
  expect(m.registrarFilaProcessada).toHaveBeenCalledTimes(1);
  expect(m.registrarFilaProcessada).toHaveBeenCalledWith({ concluidos: 1, falhas: 0 });
});

it("só o primeiro chamador lidera e os concorrentes compartilham o mesmo resumo", async () => {
  let pendente = true;
  let liberarFrente: () => void = () => undefined;
  d.frente.mockImplementation(() => {
    if (!pendente) return Promise.resolve([]);
    return new Promise((resolver) => {
      liberarFrente = () => {
        pendente = false;
        resolver([]);
      };
    });
  });
  vi.resetModules();
  const modulo = await import("@/application/fila-planilha");
  const lider = modulo.processarFila({ limite: 1 });
  const seguidorA = modulo.processarFila({ limite: 1 });
  const seguidorB = modulo.processarFila({ limite: 1 });
  liberarFrente();
  const [resultadoLider, resultadoA, resultadoB] = await Promise.all([lider, seguidorA, seguidorB]);
  expect(resultadoLider.compartilhado).toBe(false);
  expect(resultadoA.compartilhado).toBe(true);
  expect(resultadoB.compartilhado).toBe(true);
  expect(resultadoA.resumo).toEqual(resultadoLider.resumo);
  expect(resultadoB.resumo).toEqual(resultadoLider.resumo);
  // A rodada repetida atende os seguidores uma vez, sem uma execução por chamada.
  expect(d.frente).toHaveBeenCalledTimes(2);
  expect(m.registrarFilaProcessada).not.toHaveBeenCalled();
});

it("acumula a transição da primeira rodada quando um concorrente pede outra", async () => {
  let chamadas = 0;
  d.frente.mockImplementation(async () => {
    chamadas += 1;
    return chamadas === 1 ? [itemFila("qa")] : [];
  });
  d.atualizar.mockResolvedValue({ count: 1 });
  let liberar: (situacao: string) => void = () => undefined;
  let entrou: () => void = () => undefined;
  const inicio = new Promise<void>((resolver) => {
    entrou = resolver;
  });
  d.enviar.mockImplementationOnce(() => {
    entrou();
    return new Promise<string>((resolver) => {
      liberar = resolver;
    });
  });
  vi.resetModules();
  const modulo = await import("@/application/fila-planilha");
  const lider = modulo.processarFila({ limite: 1 });
  await inicio;
  const seguidor = modulo.processarFila({ limite: 1 });
  liberar("enviado");
  const [resultadoLider, resultadoSeguidor] = await Promise.all([lider, seguidor]);
  expect(resultadoLider.compartilhado).toBe(false);
  expect(resultadoSeguidor.compartilhado).toBe(true);
  expect(resultadoLider.resumo).toMatchObject({ processados: 1, concluidos: 1, falhas: 0 });
  expect(resultadoSeguidor.resumo).toEqual(resultadoLider.resumo);
  expect(m.registrarFilaProcessada).toHaveBeenCalledTimes(1);
  expect(m.registrarFilaProcessada).toHaveBeenCalledWith({ concluidos: 1, falhas: 0 });
  expect(d.frente).toHaveBeenCalledTimes(2);
});

it("soma duas rodadas com transições distintas", async () => {
  let chamadas = 0;
  d.frente.mockImplementation(async () => {
    chamadas += 1;
    if (chamadas === 1) return [itemFila("qa")];
    if (chamadas === 2) return [itemFila("qb", 2)];
    return [];
  });
  d.atualizar.mockResolvedValue({ count: 1 });
  let liberar: (situacao: string) => void = () => undefined;
  let entrou: () => void = () => undefined;
  const inicio = new Promise<void>((resolver) => {
    entrou = resolver;
  });
  d.enviar
    .mockImplementationOnce(() => {
      entrou();
      return new Promise<string>((resolver) => {
        liberar = resolver;
      });
    })
    .mockResolvedValueOnce("enviado");
  vi.resetModules();
  const modulo = await import("@/application/fila-planilha");
  const lider = modulo.processarFila({ limite: 2 });
  await inicio;
  const seguidor = modulo.processarFila({ limite: 2 });
  liberar("enviado");
  const [resultadoLider, resultadoSeguidor] = await Promise.all([lider, seguidor]);
  expect(resultadoLider.resumo).toMatchObject({ processados: 2, concluidos: 2, falhas: 0 });
  expect(resultadoSeguidor.resumo).toEqual(resultadoLider.resumo);
  expect(m.registrarFilaProcessada).toHaveBeenCalledTimes(2);
  expect(m.registrarFilaProcessada).toHaveBeenNthCalledWith(1, { concluidos: 1, falhas: 0 });
  expect(m.registrarFilaProcessada).toHaveBeenNthCalledWith(2, { concluidos: 1, falhas: 0 });
  expect(d.frente).toHaveBeenCalledTimes(3);
});

it("conta falha na tentativa e concluido na tentativa seguinte", async () => {
  d.frente.mockResolvedValue([itemFila("qa")]);
  d.atualizar.mockResolvedValue({ count: 1 });
  d.enviar.mockResolvedValueOnce("falhou").mockResolvedValueOnce("enviado");
  vi.resetModules();
  const modulo = await import("@/application/fila-planilha");
  const primeira = await modulo.processarFila({ limite: 1 });
  expect(primeira.resumo).toMatchObject({ processados: 1, concluidos: 0, falhas: 1 });
  expect(m.registrarFilaProcessada).toHaveBeenLastCalledWith({ concluidos: 0, falhas: 1 });
  const segunda = await modulo.processarFila({ limite: 1 });
  expect(segunda.resumo).toMatchObject({ processados: 1, concluidos: 1, falhas: 0 });
  expect(m.registrarFilaProcessada).toHaveBeenLastCalledWith({ concluidos: 1, falhas: 0 });
  expect(m.registrarFilaProcessada).toHaveBeenCalledTimes(2);
});
