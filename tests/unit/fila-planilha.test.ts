// Fila FIFO dos envios à planilha: ordem, espera, reserva vencida e desfecho dos itens.
import { describe, expect, it } from "vitest";
import {
  desfechoDoItem,
  esperaDaTentativa,
  MAXIMO_TENTATIVAS_FILA,
  proximoDaFila,
  resumirSituacoes,
  type ItemParaOrdem,
} from "@/domain/fila-planilha";

const AGORA = new Date("2026-10-07T12:00:00Z");
const depois = (ms: number) => new Date(AGORA.getTime() + ms);

function item(extra: Partial<ItemParaOrdem> & { sequencia: number }): ItemParaOrdem {
  return {
    id: `i${extra.sequencia}`,
    estado: "AGUARDANDO",
    proximaTentativaEm: null,
    reservadoAte: null,
    ...extra,
  };
}

describe("proximoDaFila", () => {
  it("sem itens abertos a fila está vazia", () => {
    expect(proximoDaFila([], AGORA)).toEqual({ acao: "vazia" });
    expect(proximoDaFila([item({ sequencia: 1, estado: "CONCLUIDO" })], AGORA)).toEqual({
      acao: "vazia",
    });
  });

  it("processa o de menor sequência, independentemente da ordem recebida", () => {
    const itens = [item({ sequencia: 9 }), item({ sequencia: 3 }), item({ sequencia: 5 })];
    const decisao = proximoDaFila(itens, AGORA);
    expect(decisao.acao === "processar" && decisao.item.sequencia).toBe(3);
  });

  it("aceita sequências bigint", () => {
    const itens = [item({ sequencia: 2 }), { ...item({ sequencia: 1 }), sequencia: BigInt(1) }];
    const decisao = proximoDaFila(itens, AGORA);
    expect(decisao.acao === "processar" && decisao.item.id).toBe("i1");
  });

  it("o item em espera de nova tentativa bloqueia os de trás", () => {
    const itens = [
      item({ sequencia: 1, proximaTentativaEm: depois(30_000) }),
      item({ sequencia: 2 }),
    ];
    expect(proximoDaFila(itens, AGORA)).toEqual({
      acao: "aguardar",
      motivo: "espera",
      ate: depois(30_000),
    });
  });

  it("depois da espera o item volta a ser o escolhido", () => {
    const itens = [item({ sequencia: 1, proximaTentativaEm: depois(-1) }), item({ sequencia: 2 })];
    const decisao = proximoDaFila(itens, AGORA);
    expect(decisao.acao === "processar" && decisao.item.sequencia).toBe(1);
  });

  it("reserva viva de outro consumidor bloqueia; reserva vencida é retomada", () => {
    const viva = [item({ sequencia: 1, estado: "EM_ANDAMENTO", reservadoAte: depois(60_000) })];
    expect(proximoDaFila(viva, AGORA)).toMatchObject({ acao: "aguardar", motivo: "reserva" });
    const vencida = [item({ sequencia: 1, estado: "EM_ANDAMENTO", reservadoAte: depois(-1) })];
    expect(proximoDaFila(vencida, AGORA).acao).toBe("processar");
  });

  it("itens encerrados à frente não bloqueiam", () => {
    const itens = [
      item({ sequencia: 1, estado: "FALHOU" }),
      item({ sequencia: 2, estado: "DESCARTADO" }),
      item({ sequencia: 3 }),
    ];
    const decisao = proximoDaFila(itens, AGORA);
    expect(decisao.acao === "processar" && decisao.item.sequencia).toBe(3);
  });
});

describe("esperaDaTentativa", () => {
  it("cresce e se mantém na última faixa", () => {
    expect(esperaDaTentativa(1)).toBe(30_000);
    expect(esperaDaTentativa(2)).toBe(120_000);
    expect(esperaDaTentativa(3)).toBe(600_000);
    expect(esperaDaTentativa(4)).toBe(1_800_000);
    expect(esperaDaTentativa(9)).toBe(1_800_000);
    expect(esperaDaTentativa(0)).toBe(30_000);
  });
});

describe("desfechoDoItem", () => {
  it("falha confirmada agenda nova tentativa até o limite", () => {
    expect(desfechoDoItem("falhou", 1, AGORA)).toEqual({
      estado: "AGUARDANDO",
      resultado: "falhou",
      proximaTentativaEm: depois(30_000),
    });
    expect(desfechoDoItem("falhou", MAXIMO_TENTATIVAS_FILA, AGORA)).toEqual({
      estado: "FALHOU",
      resultado: "falhou",
      proximaTentativaEm: null,
    });
  });

  it("qualquer outra situação encerra o item sem repetir", () => {
    for (const situacao of [
      "enviado",
      "desligado",
      "sem_mapa",
      "pendente_manual",
      "sem_confirmacao",
    ]) {
      expect(desfechoDoItem(situacao, 1, AGORA)).toEqual({
        estado: "CONCLUIDO",
        resultado: situacao,
        proximaTentativaEm: null,
      });
    }
  });
});

describe("resumirSituacoes", () => {
  it("a pior situação resume o envio de várias turmas", () => {
    expect(resumirSituacoes(["enviado", "falhou", "sem_mapa"])).toBe("falhou");
    expect(resumirSituacoes(["enviado", "sem_confirmacao"])).toBe("sem_confirmacao");
    expect(resumirSituacoes(["enviado", "pendente_manual"])).toBe("pendente_manual");
    expect(resumirSituacoes(["desligado", "enviado"])).toBe("enviado");
    expect(resumirSituacoes([])).toBe("desligado");
  });
});
