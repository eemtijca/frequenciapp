// Ensaio de integração da fila genérica contra um PostgreSQL descartável.
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import {
  cancelarTrabalho,
  chaveDeTrabalho,
  despacharTrabalhosPendentes,
  enfileirarTrabalho,
  executarTrabalhos,
  listarTrabalhos,
  recuperarTrabalhosVencidos,
  reenfileirarTrabalho,
  reservarProximoTrabalho,
  resolverTrabalho,
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

afterEach(async () => {
  await limpar();
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

  it("recupera reserva vencida de tipo seguro", async () => {
    const dados = pedido("reserva-vencida-segura");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);
    expect((await reservarProximoTrabalho("worker-antigo"))?.id).toBe(id);
    await banco().trabalho.update({
      where: { id },
      data: { reservadoAte: new Date(Date.now() - 1_000) },
    });

    expect(await recuperarTrabalhosVencidos()).toBeGreaterThanOrEqual(1);
    const estado = await banco().trabalho.findUnique({ where: { id } });
    expect(estado?.estado).toBe("AGUARDANDO");
    expect(estado?.reservaId).toBeNull();
    expect(estado?.erroCodigo).toBe("reserva_vencida");
  });

  it("leva reserva vencida da preparação mensal para conferência e resolve", async () => {
    const payload = {
      turmaOriginalId: randomUUID(),
      mes: "2026-11",
      autorId: randomUUID(),
    };
    chaves.add(chaveDeTrabalho("PLANILHA_MENSAL_PREPARAR", payload));
    const id = await comTransacao((tx) =>
      enfileirarTrabalho(tx, {
        tipo: "PLANILHA_MENSAL_PREPARAR",
        payload,
        origem: "admin",
      }),
    );
    await despacharTrabalhosPendentes(async () => undefined);
    expect((await reservarProximoTrabalho("worker-incerto"))?.id).toBe(id);
    await banco().trabalho.update({
      where: { id },
      data: { reservadoAte: new Date(Date.now() - 1_000) },
    });

    await recuperarTrabalhosVencidos();
    const conferencia = await banco().trabalho.findUnique({ where: { id } });
    expect(conferencia?.estado).toBe("CONFERENCIA");
    expect(conferencia?.erroCodigo).toBe("reserva_vencida");

    await resolverTrabalho(id, null, "concluido");
    const resolvido = await banco().trabalho.findUnique({ where: { id } });
    expect(resolvido?.estado).toBe("CONCLUIDO");
    expect(resolvido?.resultado).toBe("resolvido");
  });

  it("encerra em conferência quando o manipulador estoura o timeout", async () => {
    const dados = pedido("timeout");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);
    const inicio = Date.now();
    const resumo = await executarTrabalhos(
      {
        EXPURGO_TRABALHOS: async () => new Promise(() => undefined),
      },
      { limite: 1, workerId: "worker-timeout", timeoutMs: 1_000 },
    );
    expect(Date.now() - inicio).toBeLessThan(10_000);
    expect(resumo.conferencia).toBe(1);
    const estado = await banco().trabalho.findUnique({ where: { id } });
    expect(estado?.estado).toBe("CONFERENCIA");
    expect(estado?.erroCodigo).toBe("timeout");
    expect(estado?.erroResumo).not.toContain("Promise");
  });

  it("recusa resolver um trabalho que não está em conferência", async () => {
    const dados = pedido("resolver-invalido");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await expect(resolverTrabalho(id, null, "concluido")).rejects.toMatchObject({ status: 409 });
    expect((await banco().trabalho.findUnique({ where: { id } }))?.estado).toBe("PENDENTE");
  });

  it("não sobrescreve uma reserva renovada por outro worker", async () => {
    const dados = pedido("reserva-renovada");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    await despacharTrabalhosPendentes(async () => undefined);
    const reservado = await reservarProximoTrabalho("worker-renovado");
    expect(reservado?.id).toBe(id);
    await banco().trabalho.update({
      where: { id },
      data: { reservadoAte: new Date(Date.now() + 60_000) },
    });

    await recuperarTrabalhosVencidos();
    const estado = await banco().trabalho.findUnique({ where: { id } });
    expect(estado?.estado).toBe("EM_EXECUCAO");
    expect(estado?.reservaId).toBe(reservado?.reservaId);
  });

  it("mantém o trabalho pendente quando o Redis está fora", async () => {
    const dados = pedido("despacho-resiliente");
    const id = await comTransacao((tx) => enfileirarTrabalho(tx, dados));
    for (let tentativa = 0; tentativa < 6; tentativa += 1) {
      await despacharTrabalhosPendentes(async () => {
        throw new Error("Redis indisponível");
      });
      const atual = await banco().trabalho.findUnique({ where: { id } });
      expect(atual?.estado).not.toBe("FALHOU");
      await banco().trabalho.update({
        where: { id },
        data: { proximoDespachoEm: new Date(Date.now() - 1_000) },
      });
    }

    const aposFalhas = await banco().trabalho.findUnique({ where: { id } });
    expect(aposFalhas?.estado).toBe("PENDENTE");
    expect(aposFalhas?.tentativasDespacho).toBe(6);
    expect(aposFalhas?.erroDespacho).toBeTruthy();

    const publicados: string[] = [];
    await despacharTrabalhosPendentes(async (trabalho) => {
      publicados.push(trabalho.id);
    });
    expect(publicados).toContain(id);
    const disponivel = await banco().trabalho.findUnique({ where: { id } });
    expect(disponivel?.estado).toBe("DISPONIVEL");
    expect(disponivel?.tentativasDespacho).toBe(0);
    expect(disponivel?.erroDespacho).toBeNull();
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
