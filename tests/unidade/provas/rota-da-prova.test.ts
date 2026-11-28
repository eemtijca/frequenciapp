// Solver da rota: Held-Karp conferido com força bruta, heurística acima de 12 paradas e origem livre.
import { describe, expect, it } from "vitest";
import {
  aproximarRota,
  conciliarOrdem,
  custoDaOrdem,
  indicesDaOrdem,
  LIMITE_PARADAS_EXATAS,
  matrizEmReta,
  medirTrechos,
  menorRotaPorForcaBruta,
  montarParadas,
  normalizarOrigem,
  problemaNaOrigem,
  resolverRota,
  rotuloDeDistancia,
  rotuloDeDuracao,
  somarTrechos,
  urlNoGoogleMaps,
  urlNoWaze,
  VELOCIDADE_DA_RETA_METROS_POR_SEGUNDO,
} from "@/domain/rota-da-prova";
import type { ParticipanteDaProva } from "@/domain/provas-especificas";

function matriz(linhas: number[][]): number[][] {
  return linhas;
}

function semente(valor: number): () => number {
  let estado = valor;
  return () => {
    estado = (estado * 1103515245 + 12345) % 2147483648;
    return estado;
  };
}

/** Matriz assimétrica com diagonal zero. O índice 0 é a origem. */
function matrizAleatoria(tamanho: number, inicio: number): number[][] {
  const proximo = semente(inicio);
  return Array.from({ length: tamanho }, (_, i) =>
    Array.from({ length: tamanho }, (_, j) => (i === j ? 0 : (proximo() % 400) + 1)),
  );
}

function aluno(
  parcial: Partial<ParticipanteDaProva> & Pick<ParticipanteDaProva, "alunoId" | "nome">,
): ParticipanteDaProva {
  return {
    turmaId: "turma",
    presente: null,
    local: null,
    latitude: null,
    longitude: null,
    ...parcial,
  };
}

describe("melhor rota a partir da origem", () => {
  it("escolhe a primeira parada pelo custo desde a origem, não pelo meio do grupo", () => {
    // Em distância, A é a entrada barata. Em tempo, a malha chega por B.
    const distancia = matriz([
      [0, 10, 12],
      [10, 0, 100],
      [12, 100, 0],
    ]);
    const tempo = matriz([
      [0, 100, 5],
      [100, 0, 5],
      [5, 5, 0],
    ]);
    const porDistancia = resolverRota(distancia, false);
    const porTempo = resolverRota(tempo, false);
    expect(porDistancia.exata).toBe(true);
    expect(porDistancia.ordem).toEqual([0, 1]);
    expect(porTempo.ordem).toEqual([1, 0]);
    expect(porTempo.custo).toBe(10);
  });

  it("inclui a volta à origem no custo e pode trocar a ordem", () => {
    const custos = matriz([
      [0, 2, 4],
      [1, 0, 3],
      [50, 3, 0],
    ]);
    const ida = resolverRota(custos, false);
    const volta = resolverRota(custos, true);
    expect(ida.ordem).toEqual([0, 1]);
    expect(ida.custo).toBe(5);
    expect(volta.ordem).toEqual([1, 0]);
    expect(volta.custo).toBe(8);
    expect(volta.custo).toBe(custoDaOrdem(custos, volta.ordem, true));
  });

  it("bate com a força bruta em matrizes assimétricas, com e sem volta", () => {
    for (const paradas of [1, 2, 3, 4, 5, 6, 7]) {
      for (const inicio of [3, 17, 41]) {
        const custos = matrizAleatoria(paradas + 1, inicio * 100 + paradas);
        for (const voltar of [false, true]) {
          const exata = resolverRota(custos, voltar);
          const bruta = menorRotaPorForcaBruta(custos, voltar);
          expect(exata.exata, `${paradas} paradas, semente ${inicio}`).toBe(true);
          expect(exata.custo).toBe(bruta.custo);
          expect(custoDaOrdem(custos, exata.ordem, voltar)).toBe(bruta.custo);
          expect([...exata.ordem].sort((a, b) => a - b)).toEqual(
            bruta.ordem.map((_, i) => i).sort((a, b) => a - b),
          );
        }
      }
    }
  });

  it("marca como aproximada acima de 12 paradas e visita cada uma uma vez", () => {
    const paradas = LIMITE_PARADAS_EXATAS + 1;
    const custos = matrizAleatoria(paradas + 1, 99);
    const rota = resolverRota(custos, true);
    expect(rota.exata).toBe(false);
    expect([...rota.ordem].sort((a, b) => a - b)).toEqual(
      Array.from({ length: paradas }, (_, indice) => indice),
    );
    expect(rota.custo).toBe(custoDaOrdem(custos, rota.ordem, true));
  });

  it("a heurística encontra o ótimo nas instâncias pequenas da força bruta", () => {
    for (const paradas of [3, 4, 5, 6]) {
      for (const inicio of [7, 19]) {
        const custos = matrizAleatoria(paradas + 1, inicio + paradas);
        for (const voltar of [false, true]) {
          const bruta = menorRotaPorForcaBruta(custos, voltar);
          const aproximada = aproximarRota(custos, voltar);
          expect(aproximada.custo).toBe(bruta.custo);
        }
      }
    }
  });

  it("separa o trecho de viagem, o urbano e a volta", () => {
    const distancia = matriz([
      [0, 40, 10],
      [40, 0, 5],
      [10, 5, 0],
    ]);
    const duracao = matriz([
      [0, 80, 10],
      [80, 0, 4],
      [10, 4, 0],
    ]);
    const ordem = resolverRota(duracao, true).ordem;
    expect(ordem).toEqual([1, 0]);
    const trechos = medirTrechos(distancia, duracao, ordem, true);
    expect(trechos.map((trecho) => trecho.tipo)).toEqual(["viagem", "urbano", "volta"]);
    const totais = somarTrechos(trechos);
    expect(totais.viagem.duracaoSegundos).toBe(10);
    expect(totais.urbano.duracaoSegundos).toBe(4);
    expect(totais.volta.duracaoSegundos).toBe(80);
    expect(totais.geral.duracaoSegundos).toBe(94);
    expect(totais.geral.distanciaMetros).toBe(10 + 5 + 40);
  });
});

describe("linha reta e origem livre", () => {
  it("estima o tempo da linha reta a 50 km/h e não escolhe uma cidade sozinha", () => {
    const pontos = [
      { latitude: -3.9, longitude: -40.75 },
      { latitude: -3.7, longitude: -40.4 },
      { latitude: -3.68, longitude: -40.3 },
    ];
    const { distanciaMetros, duracaoSegundos } = matrizEmReta(pontos);
    const primeira = distanciaMetros[0]?.[1] ?? 0;
    const segunda = distanciaMetros[0]?.[2] ?? 0;
    expect(primeira).toBeGreaterThan(0);
    expect(primeira).toBeLessThan(segunda);
    expect(duracaoSegundos[0]?.[1]).toBeCloseTo(primeira / VELOCIDADE_DA_RETA_METROS_POR_SEGUNDO);
    const rota = resolverRota(distanciaMetros, false);
    expect(rota.ordem[0]).toBe(0);
  });

  it("não traz cidade padrão: o texto vazio fica vazio e um exemplo sem ponto é recusado", () => {
    const vazia = normalizarOrigem({});
    expect(problemaNaOrigem(vazia)).toBeNull();
    expect(vazia.texto).toBe("");
    expect(vazia.latitude).toBeNull();
    expect(vazia.longitude).toBeNull();
    expect(
      problemaNaOrigem(normalizarOrigem({ texto: "Mucambo, CE", latitude: null, longitude: null })),
    ).toMatch(/ponto de partida/);
    expect(
      problemaNaOrigem(normalizarOrigem({ texto: "  ", latitude: -3.9, longitude: -40.7 })),
    ).toMatch(/endereço ou a cidade/);
    const pronta = normalizarOrigem({
      texto: "  Rua da Escola, 10  ",
      latitude: -3.91234567,
      longitude: -40.74567891,
    });
    expect(pronta.texto).toBe("Rua da Escola, 10");
    expect(pronta.latitude).toBe(-3.912346);
    expect(problemaNaOrigem(pronta)).toBeNull();
  });

  it("agrupa pelo local efetivo e deixa sem ponto quem não tem coordenada", () => {
    const prova = { local: "Campus Centro", latitude: -3.69, longitude: -40.35 };
    const grupos = montarParadas(
      [
        aluno({ alunoId: "1", nome: "Bia", local: null, latitude: null, longitude: null }),
        aluno({
          alunoId: "2",
          nome: "Caio",
          local: "Campus Norte",
          latitude: -3.67,
          longitude: -40.34,
        }),
        aluno({
          alunoId: "3",
          nome: "Ana",
          local: "Campus Norte",
          latitude: null,
          longitude: null,
        }),
        aluno({
          alunoId: "4",
          nome: "Davi",
          local: "Campus Norte",
          latitude: -3.67,
          longitude: -40.34,
        }),
      ],
      prova,
    );
    expect(grupos.paradas.map((parada) => parada.local)).toEqual(["Campus Centro", "Campus Norte"]);
    expect(grupos.paradas[0]?.alunos.map((item) => item.nome)).toEqual(["Bia"]);
    expect(grupos.paradas[1]?.alunos.map((item) => item.nome)).toEqual(["Caio", "Davi"]);
    expect(grupos.semCoordenada).toHaveLength(1);
    expect(grupos.semCoordenada[0]?.local).toBe("Campus Norte");
    expect(grupos.semCoordenada[0]?.alunos.map((item) => item.nome)).toEqual(["Ana"]);
  });

  it("preserva a ordem salva e acrescenta parada nova no fim", () => {
    const paradas = [{ chave: "a" }, { chave: "b" }, { chave: "c" }];
    expect(conciliarOrdem(["c", "sumiu", "a"], paradas)).toEqual(["c", "a", "b"]);
    expect(indicesDaOrdem(["c", "a", "b"], paradas)).toEqual([2, 0, 1]);
    expect(indicesDaOrdem(["a"], paradas)).toBeNull();
  });
});

describe("textos e links de navegação", () => {
  it("formata distância e duração em português", () => {
    expect(rotuloDeDistancia(350)).toBe("350 m");
    expect(rotuloDeDistancia(12_400)).toBe("12,4 km");
    expect(rotuloDeDuracao(90)).toBe("2 min");
    expect(rotuloDeDuracao(3_900)).toBe("1 h 5 min");
  });

  it("monta o Google Maps com a volta à origem e o Waze na próxima parada", () => {
    const origem = { latitude: -3.9, longitude: -40.75 };
    const paradas = [
      { latitude: -3.7, longitude: -40.35 },
      { latitude: -3.69, longitude: -40.33 },
    ];
    const ida = urlNoGoogleMaps(origem, paradas, false);
    expect(ida.truncada).toBe(false);
    expect(ida.url).toContain("origin=-3.900000%2C-40.750000");
    expect(ida.url).toContain("destination=-3.690000%2C-40.330000");
    expect(ida.url).toContain("waypoints=-3.700000%2C-40.350000");
    const volta = urlNoGoogleMaps(origem, paradas, true);
    expect(volta.url).toContain("destination=-3.900000%2C-40.750000");
    expect(volta.url).toContain("-3.690000%2C-40.330000");
    const primeira = paradas[0];
    expect(primeira).toBeDefined();
    if (!primeira) return;
    expect(urlNoWaze(primeira)).toBe(
      "https://www.waze.com/ul?ll=-3.700000%2C-40.350000&navigate=yes",
    );
  });
});
