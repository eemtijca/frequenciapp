// Fila FIFO dos envios à planilha: ordem, espera, reserva vencida, desfecho e classes de item.
import { describe, expect, it } from "vitest";
import {
  classeDoItem,
  desfechoDoItem,
  esperaDaTentativa,
  MAXIMO_TENTATIVAS_FILA,
  proximoDaFila,
  requerConferencia,
  resumirSituacoes,
  retrySeguro,
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
  it.each(["falhou", "limite", "nao_processado", "falha_preparo"])(
    "resultado repetível agenda nova tentativa até o limite: %s",
    (situacao) => {
      expect(desfechoDoItem(situacao, 1, AGORA)).toEqual({
        estado: "AGUARDANDO",
        requerConferencia: false,
        resultado: situacao,
        proximaTentativaEm: depois(30_000),
      });
      expect(desfechoDoItem(situacao, MAXIMO_TENTATIVAS_FILA, AGORA)).toEqual({
        estado: "FALHOU",
        requerConferencia: false,
        resultado: situacao,
        proximaTentativaEm: null,
      });
    },
  );

  it("pendência segura encerra e pede ação do operador", () => {
    for (const situacao of ["sem_mapa", "pendente_manual", "sem_autor"]) {
      expect(desfechoDoItem(situacao, 1, AGORA)).toEqual({
        estado: "CONCLUIDO",
        resultado: situacao,
        requerConferencia: true,
        proximaTentativaEm: null,
      });
    }
  });

  it("sucesso e escrita incerta encerram como sucesso ou conferência", () => {
    for (const situacao of ["enviado", "desligado", "sem_trabalho"]) {
      expect(desfechoDoItem(situacao, 1, AGORA)).toEqual({
        estado: "CONCLUIDO",
        resultado: situacao,
        requerConferencia: false,
        proximaTentativaEm: null,
      });
    }
    expect(desfechoDoItem("sem_confirmacao", 1, AGORA)).toEqual({
      estado: "CONCLUIDO",
      resultado: "sem_confirmacao",
      requerConferencia: true,
      proximaTentativaEm: null,
    });
  });
});

describe("resumirSituacoes", () => {
  it("mantém separados sucesso, preparo e origem não processada", () => {
    expect(resumirSituacoes(["enviado", "nao_processado"])).toBe("nao_processado");
    expect(resumirSituacoes(["enviado", "falha_preparo"])).toBe("falha_preparo");
    expect(resumirSituacoes(["enviado", "falhou"])).toBe("falhou");
    expect(resumirSituacoes(["enviado", "sem_mapa"])).toBe("sem_mapa");
    expect(resumirSituacoes(["enviado", "pendente_manual"])).toBe("pendente_manual");
  });

  it("escrita possível em qualquer origem força conferência", () => {
    expect(resumirSituacoes(["enviado", "sem_confirmacao"])).toBe("sem_confirmacao");
    expect(resumirSituacoes(["sem_mapa", "sem_confirmacao"])).toBe("sem_confirmacao");
  });

  it("preserva o desligado e a ausência de origens", () => {
    expect(resumirSituacoes(["desligado", "enviado"])).toBe("enviado");
    expect(resumirSituacoes([])).toBe("desligado");
  });
});

describe("conferência e reprocessamento", () => {
  it("separa o que exige conferência do que apenas pede nova tentativa", () => {
    expect(requerConferencia("sem_confirmacao")).toBe(true);
    expect(requerConferencia("sem_mapa")).toBe(true);
    expect(requerConferencia("falha_preparo")).toBe(false);
    expect(requerConferencia("nao_processado")).toBe(false);
    expect(retrySeguro("sem_mapa")).toBe(true);
    expect(retrySeguro("falha_preparo")).toBe(true);
    expect(retrySeguro("sem_confirmacao")).toBe(false);
    expect(retrySeguro(null)).toBe(false);
  });

  it("classifica o item para a interface e a API", () => {
    expect(classeDoItem({ estado: "AGUARDANDO", resultado: null })).toBe("aberto");
    expect(classeDoItem({ estado: "CONCLUIDO", resultado: "enviado" })).toBe("sucesso");
    expect(classeDoItem({ estado: "FALHOU", resultado: "falha_preparo" })).toBe("preparo");
    expect(classeDoItem({ estado: "CONCLUIDO", resultado: "nao_processado" })).toBe(
      "origem_nao_processada",
    );
    expect(classeDoItem({ estado: "CONCLUIDO", resultado: "sem_mapa" })).toBe(
      "origem_nao_processada",
    );
    expect(classeDoItem({ estado: "CONCLUIDO", resultado: "sem_confirmacao" })).toBe("conferencia");
    expect(classeDoItem({ estado: "FALHOU", resultado: "falhou" })).toBe("falha");
  });
});
