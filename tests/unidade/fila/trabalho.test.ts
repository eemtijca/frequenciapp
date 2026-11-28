// Regras puras da fila genérica: esperas, desfechos e estados que aceitam ação.
import { describe, expect, it } from "vitest";
import {
  ESPERAS_TRABALHO_MS,
  MAXIMO_TENTATIVAS_TRABALHO,
  desfechoDoTrabalho,
  esperaDaTentativa,
  estadoAberto,
  podeCancelar,
  podeReenfileirar,
  serializarEscopo,
  type ResultadoDoTrabalho,
} from "@/domain/trabalho";

const agora = new Date("2026-11-28T12:00:00Z");

function retentavel(esperaMs?: number): ResultadoDoTrabalho {
  return {
    situacao: "retentavel",
    resultado: "falhou",
    erroCodigo: "google_indisponivel",
    erroResumo: "O Google não respondeu.",
    ...(esperaMs === undefined ? {} : { esperaMs }),
  };
}

describe("espera da tentativa", () => {
  it("segue a sequência configurada e repete a última espera", () => {
    expect(ESPERAS_TRABALHO_MS).toEqual([30_000, 120_000, 600_000, 1_800_000]);
    expect([1, 2, 3, 4, 5, 6].map(esperaDaTentativa)).toEqual([
      30_000, 120_000, 600_000, 1_800_000, 1_800_000, 1_800_000,
    ]);
  });

  it("trata tentativas inválidas como a primeira", () => {
    expect(esperaDaTentativa(0)).toBe(30_000);
    expect(esperaDaTentativa(-1)).toBe(30_000);
  });
});

describe("desfecho do trabalho", () => {
  it("conclui sem nova tentativa", () => {
    expect(
      desfechoDoTrabalho(
        { situacao: "concluido", resultado: "enviado", detalhes: { linhas: 2 } },
        { tentativasFeitas: 1, maxTentativas: 5, agora },
      ),
    ).toEqual({
      estado: "CONCLUIDO",
      proximaTentativaEm: null,
      resultado: "enviado",
      erroCodigo: null,
      erroResumo: null,
      requerConferencia: false,
      detalhes: { linhas: 2 },
    });
  });

  it("leva escrita incerta para conferência sem retentativa", () => {
    expect(
      desfechoDoTrabalho(
        {
          situacao: "conferencia",
          resultado: "sem_confirmacao",
          erroCodigo: "timeout",
          erroResumo: "Não foi possível confirmar o resultado.",
        },
        { tentativasFeitas: 2, maxTentativas: 5, agora },
      ),
    ).toEqual({
      estado: "CONFERENCIA",
      proximaTentativaEm: null,
      resultado: "sem_confirmacao",
      erroCodigo: "timeout",
      erroResumo: "Não foi possível confirmar o resultado.",
      requerConferencia: true,
      detalhes: undefined,
    });
  });

  it("encerra falha definitiva sem retentativa", () => {
    expect(
      desfechoDoTrabalho(
        {
          situacao: "falhou",
          resultado: "mapa_ausente",
          erroCodigo: "sem_mapa",
          erroResumo: "A aba de destino não foi encontrada.",
        },
        { tentativasFeitas: 1, maxTentativas: 5, agora },
      ),
    ).toMatchObject({
      estado: "FALHOU",
      proximaTentativaEm: null,
      resultado: "mapa_ausente",
      requerConferencia: false,
    });
  });

  it("agenda retentativa segura com a espera da tentativa", () => {
    expect(
      desfechoDoTrabalho(retentavel(), {
        tentativasFeitas: 1,
        maxTentativas: 5,
        agora,
      }),
    ).toMatchObject({
      estado: "AGUARDANDO",
      resultado: "falhou",
      requerConferencia: false,
      proximaTentativaEm: new Date(agora.getTime() + 30_000),
    });
  });

  it("aceita espera explícita do manipulador", () => {
    expect(
      desfechoDoTrabalho(retentavel(5_000), {
        tentativasFeitas: 2,
        maxTentativas: 5,
        agora,
      }),
    ).toMatchObject({
      estado: "AGUARDANDO",
      proximaTentativaEm: new Date(agora.getTime() + 5_000),
    });
  });

  it("esgota as tentativas e falha", () => {
    expect(
      desfechoDoTrabalho(retentavel(), {
        tentativasFeitas: MAXIMO_TENTATIVAS_TRABALHO,
        maxTentativas: MAXIMO_TENTATIVAS_TRABALHO,
        agora,
      }),
    ).toMatchObject({
      estado: "FALHOU",
      proximaTentativaEm: null,
      resultado: "falhou",
    });
  });
});

describe("ações por estado", () => {
  it("mantém abertos apenas os estados que ainda podem executar", () => {
    expect(
      ["PENDENTE", "DISPONIVEL", "EM_EXECUCAO", "AGUARDANDO", "CONFERENCIA"].map((estado) =>
        estadoAberto(
          estado as "PENDENTE" | "DISPONIVEL" | "EM_EXECUCAO" | "AGUARDANDO" | "CONFERENCIA",
        ),
      ),
    ).toEqual([true, true, true, true, true]);
    expect(
      ["CONCLUIDO", "FALHOU", "CANCELADO"].map((estado) =>
        estadoAberto(estado as "CONCLUIDO" | "FALHOU" | "CANCELADO"),
      ),
    ).toEqual([false, false, false]);
  });

  it("permite cancelar apenas o que ainda não terminou", () => {
    expect(
      ["PENDENTE", "DISPONIVEL", "AGUARDANDO"].map((estado) => podeCancelar(estado as never)),
    ).toEqual([true, true, true]);
    expect(
      ["EM_EXECUCAO", "CONCLUIDO", "FALHOU", "CONFERENCIA", "CANCELADO"].map((estado) =>
        podeCancelar(estado as never),
      ),
    ).toEqual([false, false, false, false, false]);
  });

  it("permite reenfileirar apenas falha ou cancelamento", () => {
    expect(["FALHOU", "CANCELADO"].map((estado) => podeReenfileirar(estado as never))).toEqual([
      true,
      true,
    ]);
    expect(
      ["PENDENTE", "DISPONIVEL", "EM_EXECUCAO", "AGUARDANDO", "CONCLUIDO", "CONFERENCIA"].map(
        (estado) => podeReenfileirar(estado as never),
      ),
    ).toEqual([false, false, false, false, false, false]);
  });
});

describe("escopo canônico", () => {
  it("ordena chaves e ignora valores indefinidos", () => {
    expect(serializarEscopo({ mes: "2026-11", turma: "a", vazio: undefined })).toBe(
      '{"mes":"2026-11","turma":"a"}',
    );
    expect(serializarEscopo({ turma: "a", mes: "2026-11" })).toBe('{"mes":"2026-11","turma":"a"}');
  });

  it("preserva a ordem de arrays", () => {
    expect(serializarEscopo({ dias: ["2026-11-01", "2026-11-02"] })).toBe(
      '{"dias":["2026-11-01","2026-11-02"]}',
    );
  });
});
