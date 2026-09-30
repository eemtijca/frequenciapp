// Aviso diário: reserva concorrente, confirmação por dia, repetição de
// falhas e retirada de assinaturas expiradas, sem banco ou rede externos.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

interface Entrega {
  id: string;
  reservadaEm: Date | null;
  enviadaEm: Date | null;
}
const estado = vi.hoisted(() => ({
  entrega: null as Entrega | null,
  ativa: true,
  canceladaNaReserva: false,
}));
const assinatura = {
  id: "assinatura-sintetica",
  endpoint: "https://fcm.googleapis.com/fcm/send/sintetico",
  p256dh: "sintetica",
  auth: "sintetica",
};

vi.mock("@/infra/ambiente", () => ({
  ambiente: { fuso: "America/Fortaleza", push: { publicKey: "publica-sintetica" } },
}));
vi.mock("@/infra/web-push", () => ({
  pushConfigurado: () => true,
  conferirParVapid: vi.fn(),
  enviarPush: vi.fn(),
}));
vi.mock("@/infra/banco", () => ({
  banco: () => ({
    configuracaoNotificacoes: {
      findUnique: async () => ({
        resumoDiario: true,
        novasChamadas: false,
        chamadasPendentes: false,
        horarioResumo: "00:00",
        horarioPendencias: "17:00",
      }),
    },
    alunoDaChamada: { findMany: async () => [{ aluno: { turmaOriginalId: "origem-sintetica" } }] },
    assinaturaPush: {
      findMany: async () => [{ id: assinatura.id }],
      findFirst: async () => (estado.ativa ? assinatura : null),
      deleteMany: async () => {
        estado.ativa = false;
        estado.entrega = null;
        return { count: 1 };
      },
    },
    entregaPush: {
      createMany: async () => {
        if (estado.canceladaNaReserva)
          throw new PrismaClientKnownRequestError("Assinatura cancelada", {
            code: "P2003",
            clientVersion: "teste",
          });
        estado.entrega ??= { id: "entrega-sintetica", reservadaEm: null, enviadaEm: null };
        return { count: 1 };
      },
      findUnique: async () => estado.entrega,
      updateMany: async ({
        where,
        data,
      }: {
        where: { reservadaEm?: Date; OR?: unknown; enviadaEm?: null };
        data: { reservadaEm?: Date | null; enviadaEm?: Date };
      }) => {
        const entrega = estado.entrega;
        if (
          !entrega ||
          (where.OR && (entrega.enviadaEm || entrega.reservadaEm)) ||
          (where.reservadaEm && entrega.reservadaEm?.getTime() !== where.reservadaEm.getTime())
        )
          return { count: 0 };
        if (data.reservadaEm !== undefined) entrega.reservadaEm = data.reservadaEm;
        if (data.enviadaEm !== undefined) entrega.enviadaEm = data.enviadaEm;
        return { count: 1 };
      },
      deleteMany: async () => ({ count: 0 }),
    },
  }),
}));

import { enviarResumosDiarios } from "@/application/notificacoes";
import { enviarPush } from "@/infra/web-push";

beforeEach(() => {
  estado.entrega = null;
  estado.ativa = true;
  estado.canceladaNaReserva = false;
  vi.mocked(enviarPush).mockReset();
});

describe("entregas diárias de push", () => {
  it("duas execuções concorrentes enviam uma vez e não repetem depois de confirmar", async () => {
    vi.mocked(enviarPush).mockImplementation(async () => {
      await new Promise((resolver) => setTimeout(resolver, 10));
      return "enviada";
    });
    const resultados = await Promise.all([enviarResumosDiarios(), enviarResumosDiarios()]);
    expect(resultados.reduce((total, item) => total + item.enviadas, 0)).toBe(1);
    expect(resultados.reduce((total, item) => total + item.ignoradas, 0)).toBe(1);
    expect((await enviarResumosDiarios()).enviadas).toBe(0);
    expect(enviarPush).toHaveBeenCalledOnce();
    expect(estado.entrega?.enviadaEm).toBeInstanceOf(Date);
  });
  it("uma falha temporária libera a reserva e a execução seguinte pode confirmar", async () => {
    vi.mocked(enviarPush).mockResolvedValueOnce("falha").mockResolvedValueOnce("enviada");
    expect((await enviarResumosDiarios()).falhas).toBe(1);
    expect(estado.entrega?.reservadaEm).toBeNull();
    expect(estado.entrega?.enviadaEm).toBeNull();
    expect((await enviarResumosDiarios()).enviadas).toBe(1);
    expect(enviarPush).toHaveBeenCalledTimes(2);
  });
  it("remove a assinatura quando o provedor informa expiração", async () => {
    vi.mocked(enviarPush).mockResolvedValueOnce("expirada");
    expect((await enviarResumosDiarios()).expiradas).toBe(1);
    expect(estado.ativa).toBe(false);
    expect(estado.entrega).toBeNull();
  });
  it("ignora o cancelamento entre a seleção e a criação da reserva", async () => {
    estado.canceladaNaReserva = true;
    expect((await enviarResumosDiarios()).ignoradas).toBe(1);
    expect(enviarPush).not.toHaveBeenCalled();
  });
  it("não envia quando a assinatura deixa de ser elegível depois da seleção", async () => {
    estado.ativa = false;
    expect((await enviarResumosDiarios()).ignoradas).toBe(1);
    expect(enviarPush).not.toHaveBeenCalled();
    expect(estado.entrega?.reservadaEm).toBeNull();
  });
});
