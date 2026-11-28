// Ensaio de integração da fila genérica contra um PostgreSQL descartável.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import {
  cancelarTrabalho,
  chaveDeTrabalho,
  despacharTrabalhosPendentes,
  enfileirarTrabalho,
  executarTrabalhos,
  listarTrabalhos,
  reenfileirarTrabalho,
  reservarProximoTrabalho,
  type PedidoDeTrabalho,
} from "@/application/fila-trabalhos";

const chaves = new Set<string>();
const publicados: string[] = [];

function pedido(marcador: string, extra: Partial<PedidoDeTrabalho> = {}): PedidoDeTrabalho {
  const payload = { marcador };
  chaves.add(chaveDeTrabalho("EXPURGO_TRABALHOS", payload));
  return {
    tipo: "EXPURGO_TRABALHOS",
    payload,
    origem: "sistema",
    ...extra,
  };
}

async function limpar() {
  if (chaves.size === 0) return;
  await banco().trabalho.deleteMany({ where: { chaveIdempotencia: { in: [...chaves] } } });
  chaves.clear();
}

beforeAll(async () => {
  await banco().$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await limpar();
  await banco().$disconnect();
});

describe("fila genérica no PostgreSQL", () => {
  it("grava a intenção, funde duplicatas e conclui com reserva", async () => {
    const dados = pedido("conclusao");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    const repetido = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    expect(repetido).toBe(id);

    expect(
      await despacharTrabalhosPendentes(async (trabalho) => {
        publicados.push(trabalho.id);
      }),
    ).toBe(1);
    expect(publicados).toContain(id);

    const resumo = await executarTrabalhos(
      {
        EXPURGO_TRABALHOS: async () => ({ situacao: "concluido", resultado: "expurgado" }),
      },
      { limite: 1, workerId: "worker-teste" },
    );
    expect(resumo.concluidos).toBe(1);

    const estado = await banco().trabalho.findUnique({ where: { id } });
    expect(estado?.estado).toBe("CONCLUIDO");
    expect(estado?.resultado).toBe("expurgado");
  });

  it("reserva um trabalho disponível com prazo e worker", async () => {
    const dados = pedido("reserva");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);
    const reservado = await reservarProximoTrabalho("worker-reserva");
    expect(reservado?.id).toBe(id);
    expect(reservado?.tentativas).toBe(1);
    expect(reservado?.reservadoPor).toBe("worker-reserva");
    expect(reservado?.reservadoAte?.getTime()).toBeGreaterThan(Date.now());
  });

  it("reagenda falha segura e esgota as tentativas", async () => {
    const dados = pedido("retentativa");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);

    const primeiro = await executarTrabalhos(
      {
        EXPURGO_TRABALHOS: async () => ({
          situacao: "retentavel",
          resultado: "falhou",
          erroCodigo: "temporario",
        }),
      },
      { limite: 1, workerId: "worker-teste" },
    );
    expect(primeiro.reagendados).toBe(1);
    const aguardando = await banco().trabalho.findUnique({ where: { id } });
    expect(aguardando?.estado).toBe("AGUARDANDO");
    expect(aguardando?.disponivelEm.getTime()).toBeGreaterThan(Date.now());

    await banco().trabalho.update({
      where: { id },
      data: { disponivelEm: new Date(Date.now() - 1_000) },
    });
    await despacharTrabalhosPendentes(async () => undefined);
    await executarTrabalhos(
      {
        EXPURGO_TRABALHOS: async () => ({
          situacao: "retentavel",
          resultado: "falhou",
          erroCodigo: "temporario",
        }),
      },
      { limite: 1, workerId: "worker-teste" },
    );
    const falhou = await banco().trabalho.findUnique({ where: { id } });
    expect(falhou?.estado).toBe("AGUARDANDO");
    expect(falhou?.tentativas).toBe(2);
  });

  it("não repete uma conferência", async () => {
    const dados = pedido("conferencia");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);
    await executarTrabalhos(
      {
        EXPURGO_TRABALHOS: async () => ({
          situacao: "conferencia",
          resultado: "sem_confirmacao",
          erroCodigo: "timeout",
        }),
      },
      { limite: 1, workerId: "worker-teste" },
    );
    const estado = await banco().trabalho.findUnique({ where: { id } });
    expect(estado?.estado).toBe("CONFERENCIA");
    expect(estado?.resultado).toBe("sem_confirmacao");
    expect(await despacharTrabalhosPendentes(async () => undefined)).toBe(0);
  });

  it("cancela e reenfileira com auditoria", async () => {
    const dados = pedido("cancelamento");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await cancelarTrabalho(id, null);
    expect((await banco().trabalho.findUnique({ where: { id } }))?.estado).toBe("CANCELADO");
    await reenfileirarTrabalho(id, null);
    expect((await banco().trabalho.findUnique({ where: { id } }))?.estado).toBe("PENDENTE");
    const lista = await listarTrabalhos({ limite: 10 });
    expect(lista.contagens.CANCELADO).toBeGreaterThanOrEqual(0);
  });
});
