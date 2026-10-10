// Feriados suspendem avisos escolares e pendências, inclusive na conferência final do envio.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({ feriado: false, feriadoNaReserva: false }));
const consultas = vi.hoisted(() => ({
  turmas: vi.fn(),
  chamadas: vi.fn(),
  participantes: vi.fn(),
  assinaturas: vi.fn(),
  assinatura: vi.fn(),
  reservar: vi.fn(),
  criarEntrega: vi.fn(),
}));
vi.mock("@/infra/ambiente", () => ({
  ambiente: { fuso: "UTC", push: { publicKey: "publica-sintetica" } },
}));
vi.mock("@/infra/web-push", () => ({
  pushConfigurado: () => true,
  conferirParVapid: vi.fn(),
  enviarPush: vi.fn(),
}));
vi.mock("@/application/calendario-letivo", () => ({
  feriadoDoDia: async () =>
    estado.feriado ? { dia: "2026-10-12", nome: "Feriado sintético" } : null,
}));
vi.mock("@/application/notificacoes-configuracao", () => ({
  lerConfiguracaoNotificacoes: async () => ({
    resumoDiario: true,
    novasChamadas: true,
    chamadasPendentes: true,
    horarioResumo: "00:00",
    horarioPendencias: "00:00",
  }),
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    turma: { count: consultas.turmas },
    frequencia: { findMany: consultas.chamadas },
    alunoDaChamada: { findMany: consultas.participantes },
    assinaturaPush: {
      findMany: consultas.assinaturas,
      findFirst: consultas.assinatura,
    },
    entregaPush: {
      createMany: consultas.criarEntrega,
      findUnique: async () => ({ id: "entrega-sintetica" }),
      updateMany: consultas.reservar,
      deleteMany: async () => ({ count: 0 }),
    },
  }),
}));

import { contarChamadasPendentes, enviarAvisosDaAgenda } from "@/application/notificacoes-agenda";
import { enviarPush } from "@/infra/web-push";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-12T18:00:00Z"));
  vi.clearAllMocks();
  estado.feriado = false;
  estado.feriadoNaReserva = false;
  consultas.turmas.mockResolvedValue(2);
  consultas.chamadas.mockResolvedValue([]);
  consultas.participantes.mockResolvedValue([{ aluno: { turmaOriginalId: "origem-sintetica" } }]);
  consultas.assinaturas.mockResolvedValue([{ id: "assinatura-sintetica" }]);
  consultas.assinatura.mockResolvedValue(null);
  consultas.criarEntrega.mockResolvedValue({ count: 1 });
  consultas.reservar.mockImplementation(async () => {
    if (estado.feriadoNaReserva) estado.feriado = true;
    return { count: 1 };
  });
});
afterEach(() => vi.useRealTimers());

describe("agenda em feriados", () => {
  it("não cobra turmas pendentes em feriado, sem consultar a grade", async () => {
    estado.feriado = true;
    expect(await contarChamadasPendentes("2026-10-12")).toBe(0);
    expect(consultas.turmas).not.toHaveBeenCalled();
  });

  it("mantém a contagem pela grade e pelas turmas participantes em dia letivo", async () => {
    expect(await contarChamadasPendentes("2026-10-12")).toBe(2);
    expect(consultas.turmas).toHaveBeenCalledWith({
      where: {
        alunos: {
          some: {
            ativo: true,
            OR: [
              { desistenteEm: null },
              { desistenteEm: { gt: new Date("2026-10-12T12:00:00Z") } },
            ],
          },
        },
        horarios: { some: { ativo: true, diasSemana: { has: 1 } } },
        frequencias: { none: { dia: new Date("2026-10-12T12:00:00Z") } },
      },
    });
  });

  it("suspende resumo, pendências e avisos de novas chamadas mesmo com todos habilitados", async () => {
    estado.feriado = true;
    expect(await enviarAvisosDaAgenda()).toEqual({
      configurada: true,
      enviadas: 0,
      expiradas: 0,
      falhas: 0,
      ignoradas: 0,
    });
    expect(consultas.chamadas).not.toHaveBeenCalled();
    expect(consultas.participantes).not.toHaveBeenCalled();
    expect(consultas.turmas).not.toHaveBeenCalled();
    expect(consultas.assinaturas).not.toHaveBeenCalled();
    expect(consultas.criarEntrega).not.toHaveBeenCalled();
    expect(enviarPush).not.toHaveBeenCalled();
  });

  it("reconfere o calendário após reservar a entrega e cancela o envio ao virar feriado", async () => {
    estado.feriadoNaReserva = true;
    expect((await enviarAvisosDaAgenda()).ignoradas).toBe(1);
    expect(consultas.criarEntrega).toHaveBeenCalledOnce();
    expect(consultas.reservar).toHaveBeenLastCalledWith({
      where: { id: "entrega-sintetica", reservadaEm: expect.any(Date) },
      data: { reservadaEm: null },
    });
    expect(consultas.assinatura).not.toHaveBeenCalled();
    expect(consultas.chamadas).not.toHaveBeenCalled();
    expect(consultas.turmas).not.toHaveBeenCalled();
    expect(enviarPush).not.toHaveBeenCalled();
  });
});
