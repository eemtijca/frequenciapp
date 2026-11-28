// Provas específicas: normalização, validação do cadastro e contagem das marcas de frequência.
import { describe, expect, it } from "vitest";
import {
  agruparPorLocal,
  caixaDeBusca,
  casarLocaisColados,
  comMarca,
  coordenadaDoTexto,
  distanciaEmMetros,
  enderecoNoOpenStreetMap,
  LIMITE_LATITUDE,
  LIMITE_LOCAL_PROVA_ESPECIFICA,
  LIMITE_LONGITUDE,
  LIMITE_NOME_PROVA_ESPECIFICA,
  normalizarLocalDoAluno,
  normalizarProvaEspecifica,
  ocupacaoDasProvas,
  problemaNaCoordenada,
  problemaNaProvaEspecifica,
  problemaNasCoordenadas,
  problemaNoLocalDoAluno,
  RAIO_DO_MESMO_LOCAL_METROS,
  resolverLocalDoAluno,
  resumirMarcas,
  resumoDaOcupacao,
  rotuloDaContagem,
  rotuloDasCoordenadas,
  type DetalheDaProva,
  type ParticipanteDaProva,
} from "@/domain/provas-especificas";

const valida = {
  nome: "Enem",
  local: "Escola Estadual Central",
  latitude: null,
  longitude: null,
  dia: "2026-11-08",
};
const fortaleza = { latitude: -3.7319, longitude: -38.5267 };

describe("normalização da prova específica", () => {
  it("apara o nome e o local e guarda o local vazio como nulo", () => {
    expect(
      normalizarProvaEspecifica({ nome: "  Enem  ", local: "  Sala 4 ", dia: "2026-11-08" }),
    ).toEqual({
      nome: "Enem",
      local: "Sala 4",
      latitude: null,
      longitude: null,
      dia: "2026-11-08",
    });
    expect(
      normalizarProvaEspecifica({ nome: "Enem", local: "   ", dia: "2026-11-08" }).local,
    ).toBeNull();
    expect(normalizarProvaEspecifica({ nome: "Enem", dia: "2026-11-08" }).local).toBeNull();
  });

  it("arredonda as coordenadas em seis casas e preserva o zero", () => {
    const dados = normalizarProvaEspecifica({
      nome: "Enem",
      latitude: -3.731912345678,
      longitude: -38.526687654321,
      dia: "2026-11-08",
    });
    expect(dados.latitude).toBe(-3.731912);
    expect(dados.longitude).toBe(-38.526688);
    const origem = normalizarProvaEspecifica({
      nome: "Enem",
      latitude: 0,
      longitude: 0,
      dia: "2026-11-08",
    });
    expect([origem.latitude, origem.longitude]).toEqual([0, 0]);
  });

  it("trata número que não é finito como ausente", () => {
    const dados = normalizarProvaEspecifica({
      nome: "Enem",
      latitude: Number.NaN,
      longitude: Number.POSITIVE_INFINITY,
      dia: "2026-11-08",
    });
    expect([dados.latitude, dados.longitude]).toEqual([null, null]);
  });
});

describe("validação da prova específica", () => {
  it("aceita data passada e domingo, como o Enem", () => {
    expect(problemaNaProvaEspecifica(valida)).toBeNull();
    expect(problemaNaProvaEspecifica({ ...valida, ...fortaleza })).toBeNull();
    // 2026-11-08 é domingo; 2020-01-01 já passou.
    expect(problemaNaProvaEspecifica({ ...valida, dia: "2020-01-01" })).toBeNull();
    expect(problemaNaProvaEspecifica({ ...valida, local: null })).toBeNull();
  });

  it("recusa nome vazio, nome e local longos e data inexistente", () => {
    expect(problemaNaProvaEspecifica({ ...valida, nome: "" })).toBe("Informe o nome da prova.");
    expect(
      problemaNaProvaEspecifica({ ...valida, nome: "a".repeat(LIMITE_NOME_PROVA_ESPECIFICA + 1) }),
    ).toBe(`O nome deve ter no máximo ${LIMITE_NOME_PROVA_ESPECIFICA} caracteres.`);
    expect(
      problemaNaProvaEspecifica({
        ...valida,
        local: "a".repeat(LIMITE_LOCAL_PROVA_ESPECIFICA + 1),
      }),
    ).toBe(`O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`);
    expect(problemaNaProvaEspecifica({ ...valida, dia: "2026-02-30" })).toBe(
      "Data da prova inválida.",
    );
  });
});

describe("coordenadas da prova", () => {
  it("aceita os extremos e o ponto zero", () => {
    for (const [latitude, longitude] of [
      [90, 180],
      [-90, -180],
      [0, 0],
    ] as const) {
      expect(problemaNaProvaEspecifica({ ...valida, latitude, longitude })).toBeNull();
    }
  });

  it("recusa latitude ou longitude sozinha", () => {
    const mensagem = "Informe a latitude e a longitude juntas.";
    expect(problemaNaProvaEspecifica({ ...valida, latitude: -3.7 })).toBe(mensagem);
    expect(problemaNaProvaEspecifica({ ...valida, longitude: -38.5 })).toBe(mensagem);
  });

  it("recusa valores fora da faixa geográfica", () => {
    expect(problemaNaProvaEspecifica({ ...valida, latitude: 90.000001, longitude: 0 })).toBe(
      "A latitude deve ficar entre -90 e 90.",
    );
    expect(problemaNaProvaEspecifica({ ...valida, latitude: 0, longitude: -180.5 })).toBe(
      "A longitude deve ficar entre -180 e 180.",
    );
  });

  it("escreve as coordenadas com vírgula decimal e monta o endereço do OpenStreetMap", () => {
    expect(rotuloDasCoordenadas(fortaleza.latitude, fortaleza.longitude)).toBe(
      "-3,731900, -38,526700",
    );
    expect(enderecoNoOpenStreetMap(fortaleza.latitude, fortaleza.longitude)).toBe(
      "https://www.openstreetmap.org/?mlat=-3.731900&mlon=-38.526700#map=17/-3.731900/-38.526700",
    );
  });
});

describe("coordenada digitada", () => {
  it("aceita vírgula ou ponto decimal, com sinal e espaços", () => {
    expect(coordenadaDoTexto("-3,7319")).toBe(-3.7319);
    expect(coordenadaDoTexto(" -38.5267 ")).toBe(-38.5267);
    expect(coordenadaDoTexto("10")).toBe(10);
    expect(coordenadaDoTexto("0")).toBe(0);
  });

  it("recusa texto vazio, letras, notação científica e mais de um separador", () => {
    for (const texto of ["", "  ", "abc", "1e3", "1,2,3", "1.2.3", "--1", "+1", "3,", ",5"]) {
      expect(coordenadaDoTexto(texto)).toBeNull();
    }
  });
});

describe("ocupação do local", () => {
  const ponto = { latitude: -3.7319, longitude: -38.5267 };

  it("mede a distância em metros pela fórmula de haversine", () => {
    expect(distanciaEmMetros(ponto, ponto)).toBe(0);
    // Um grau de latitude vale cerca de 111,2 km em qualquer longitude.
    expect(
      distanciaEmMetros({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }),
    ).toBeCloseTo(111_195, -1);
    // Dois milésimos de grau de latitude, perto do equador, são cerca de 22 m.
    const perto = distanciaEmMetros(ponto, {
      latitude: ponto.latitude + 0.0002,
      longitude: ponto.longitude,
    });
    expect(perto).toBeGreaterThan(21);
    expect(perto).toBeLessThan(23);
    // A longitude encolhe com a latitude: um grau a 60 graus vale metade do equador.
    expect(
      distanciaEmMetros({ latitude: 60, longitude: 0 }, { latitude: 60, longitude: 1 }),
    ).toBeCloseTo(55_600, -2);
  });

  it("é simétrica e o raio do mesmo lugar é de 100 m", () => {
    const outro = { latitude: ponto.latitude + 0.0005, longitude: ponto.longitude + 0.0005 };
    expect(distanciaEmMetros(ponto, outro)).toBeCloseTo(distanciaEmMetros(outro, ponto), 6);
    expect(RAIO_DO_MESMO_LOCAL_METROS).toBe(100);
  });

  it("confere o par de coordenadas isoladamente", () => {
    expect(problemaNasCoordenadas(null, null)).toBeNull();
    expect(problemaNasCoordenadas(0, 0)).toBeNull();
    expect(problemaNasCoordenadas(10, null)).toBe("Informe a latitude e a longitude juntas.");
    expect(problemaNasCoordenadas(91, 0)).toBe("A latitude deve ficar entre -90 e 90.");
    expect(problemaNasCoordenadas(0, 181)).toBe("A longitude deve ficar entre -180 e 180.");
  });

  it("confere uma coordenada isolada com os limites do domínio", () => {
    expect(problemaNaCoordenada(0, LIMITE_LATITUDE, "latitude")).toBeNull();
    expect(problemaNaCoordenada(90, LIMITE_LATITUDE, "latitude")).toBeNull();
    expect(problemaNaCoordenada(-90.1, LIMITE_LATITUDE, "latitude")).toBe(
      "A latitude deve ficar entre -90 e 90.",
    );
    expect(problemaNaCoordenada(180.1, LIMITE_LONGITUDE, "longitude")).toBe(
      "A longitude deve ficar entre -180 e 180.",
    );
  });

  it("monta uma caixa folgada em graus ao redor do ponto", () => {
    const caixa = caixaDeBusca(fortaleza, 100);
    expect(caixa.latitude.gte).toBeLessThan(fortaleza.latitude);
    expect(caixa.latitude.lte).toBeGreaterThan(fortaleza.latitude);
    expect(caixa.longitude.gte).toBeLessThan(fortaleza.longitude);
    expect(caixa.longitude.lte).toBeGreaterThan(fortaleza.longitude);
    expect(caixa.latitude.lte - caixa.latitude.gte).toBeCloseTo(0.0027, 4);
  });

  it("limita o número do selo em 999+", () => {
    expect(rotuloDaContagem(0)).toBe("0");
    expect(rotuloDaContagem(18)).toBe("18");
    expect(rotuloDaContagem(999)).toBe("999");
    expect(rotuloDaContagem(1000)).toBe("999+");
  });

  it("resume a ocupação com o singular e o plural certos", () => {
    const prova = { id: "a", nome: "Enem", dia: "2026-11-29", alunos: 1, atual: false };
    expect(resumoDaOcupacao({ alunos: 0, provas: [] })).toBe(
      "Nenhum aluno inscrito em provas neste local.",
    );
    expect(resumoDaOcupacao({ alunos: 1, provas: [prova] })).toBe(
      "Neste local: 1 aluno em 1 prova.",
    );
    expect(resumoDaOcupacao({ alunos: 18, provas: [prova, { ...prova, id: "b" }] })).toBe(
      "Neste local: 18 alunos em 2 provas.",
    );
  });
});

describe("contagem das marcas", () => {
  it("separa presentes, ausentes e pendentes", () => {
    expect(resumirMarcas([true, true, false, null, null, null])).toEqual({
      total: 6,
      presentes: 2,
      ausentes: 1,
      pendentes: 3,
    });
  });

  it("devolve zeros para uma lista vazia", () => {
    expect(resumirMarcas([])).toEqual({ total: 0, presentes: 0, ausentes: 0, pendentes: 0 });
  });
});

describe("marca de um participante", () => {
  const detalhe: DetalheDaProva = {
    prova: {
      id: "prova-1",
      nome: "Enem",
      local: "Escola Central",
      latitude: null,
      longitude: null,
      dia: "2026-11-08",
      total: 2,
      presentes: 0,
      ausentes: 0,
    },
    participantes: [
      {
        alunoId: "aluno-1",
        nome: "Ana",
        turmaId: "turma-1",
        presente: null,
        local: null,
        latitude: null,
        longitude: null,
      },
      {
        alunoId: "aluno-2",
        nome: "Bruno",
        turmaId: "turma-1",
        presente: null,
        local: null,
        latitude: null,
        longitude: null,
      },
    ],
  };

  it("marca só o aluno escolhido e recalcula os contadores", () => {
    const marcado = comMarca(detalhe, "aluno-1", true);
    expect(marcado.participantes).toEqual([
      {
        alunoId: "aluno-1",
        nome: "Ana",
        turmaId: "turma-1",
        presente: true,
        local: null,
        latitude: null,
        longitude: null,
      },
      {
        alunoId: "aluno-2",
        nome: "Bruno",
        turmaId: "turma-1",
        presente: null,
        local: null,
        latitude: null,
        longitude: null,
      },
    ]);
    expect(marcado.prova).toMatchObject({ total: 2, presentes: 1, ausentes: 0 });
  });

  it("limpa e troca a marca sem mexer no outro aluno", () => {
    const ausente = comMarca(detalhe, "aluno-1", false);
    const limpo = comMarca(ausente, "aluno-1", null);
    expect(limpo.participantes[0]?.presente).toBeNull();
    expect(limpo.participantes[1]?.presente).toBeNull();
    expect(limpo.prova).toMatchObject({ presentes: 0, ausentes: 0 });
  });

  it("mantém o local próprio ao marcar a frequência", () => {
    const comLocal: DetalheDaProva = {
      ...detalhe,
      participantes: detalhe.participantes.map((item) =>
        item.alunoId === "aluno-1" ? { ...item, local: "Campus Betânia" } : item,
      ),
    };
    expect(comMarca(comLocal, "aluno-1", true).participantes[0]?.local).toBe("Campus Betânia");
  });
});

describe("local próprio do aluno", () => {
  const prova = {
    local: "Campus central",
    latitude: -3.7319,
    longitude: -38.5267,
  };
  const vazio = { local: null, latitude: null, longitude: null };

  function participante(
    parcial: Partial<ParticipanteDaProva> & Pick<ParticipanteDaProva, "alunoId" | "nome">,
  ): ParticipanteDaProva {
    return {
      turmaId: "turma-1",
      presente: null,
      ...vazio,
      ...parcial,
    };
  }

  it("herda texto e ponto da prova quando o aluno não tem local", () => {
    expect(normalizarLocalDoAluno({ local: "  " })).toEqual(vazio);
    expect(problemaNoLocalDoAluno(vazio)).toBeNull();
    expect(resolverLocalDoAluno(vazio, prova)).toEqual({ ...prova, proprio: false });
  });

  it("usa o texto próprio e não herda o ponto da prova quando não há coordenadas", () => {
    const proprio = normalizarLocalDoAluno({ local: " Campus Betânia " });
    expect(proprio).toEqual({ local: "Campus Betânia", latitude: null, longitude: null });
    expect(problemaNoLocalDoAluno(proprio)).toBeNull();
    expect(resolverLocalDoAluno(proprio, prova)).toEqual({ ...proprio, proprio: true });
  });

  it("guarda o ponto próprio junto com o nome e recusa ponto sem nome", () => {
    const comPonto = normalizarLocalDoAluno({
      local: "Campus Junco",
      latitude: -3.731912345,
      longitude: -38.526712345,
    });
    expect(comPonto.latitude).toBe(-3.731912);
    expect(comPonto.longitude).toBe(-38.526712);
    expect(problemaNoLocalDoAluno(comPonto)).toBeNull();
    expect(resolverLocalDoAluno(comPonto, prova).proprio).toBe(true);
    expect(problemaNoLocalDoAluno({ local: null, latitude: -3.7, longitude: -38.5 })).toBe(
      "Informe o nome do local junto com o ponto no mapa.",
    );
    expect(problemaNoLocalDoAluno({ local: "Sala", latitude: -3.7, longitude: null })).toBe(
      "Informe a latitude e a longitude juntas.",
    );
  });

  it("agrupa pelo local efetivo e conta o comparecimento de cada lugar", () => {
    const grupos = agruparPorLocal(
      [
        participante({ alunoId: "1", nome: "Ana", presente: true }),
        participante({ alunoId: "2", nome: "Bruno", presente: false, local: "Campus Betânia" }),
        participante({ alunoId: "3", nome: "Caio", presente: null, local: "campus betania" }),
        participante({ alunoId: "4", nome: "Dani", presente: true, local: "Campus Junco" }),
      ],
      prova,
    );
    expect(grupos).toEqual([
      {
        chave: "campus betania",
        local: "Campus Betânia",
        total: 2,
        presentes: 0,
        ausentes: 1,
        pendentes: 1,
      },
      {
        chave: "campus central",
        local: "Campus central",
        total: 1,
        presentes: 1,
        ausentes: 0,
        pendentes: 0,
      },
      {
        chave: "campus junco",
        local: "Campus Junco",
        total: 1,
        presentes: 1,
        ausentes: 0,
        pendentes: 0,
      },
    ]);
  });

  it("conta no mapa só quem tem ponto efetivo naquele lugar", () => {
    const ponto = { latitude: -3.7319, longitude: -38.5267 };
    const outro = { latitude: -3.8, longitude: -38.6 };
    const base = {
      id: "prova-1",
      nome: "UVA",
      dia: "2027-01-10",
      latitude: ponto.latitude,
      longitude: ponto.longitude,
      emEdicao: false,
      pontoHerdado: null,
    };
    const ocupacao = ocupacaoDasProvas(ponto, [
      {
        ...base,
        participantes: [
          { alunoId: "herda", ...vazio },
          { alunoId: "texto", local: "Campus Junco", latitude: null, longitude: null },
          {
            alunoId: "longe",
            local: "Outro",
            latitude: outro.latitude,
            longitude: outro.longitude,
          },
        ],
      },
    ]);
    expect(ocupacao.alunos).toBe(1);
    expect(ocupacao.provas).toEqual([
      { id: "prova-1", nome: "UVA", dia: "2027-01-10", alunos: 1, atual: false },
    ]);

    const noOutro = ocupacaoDasProvas(outro, [
      {
        ...base,
        participantes: [
          { alunoId: "herda", ...vazio },
          {
            alunoId: "longe",
            local: "Outro",
            latitude: outro.latitude,
            longitude: outro.longitude,
          },
        ],
      },
    ]);
    expect(noOutro.alunos).toBe(1);
    expect(noOutro.provas[0]?.alunos).toBe(1);

    const emEdicao = ocupacaoDasProvas(outro, [
      {
        ...base,
        emEdicao: true,
        pontoHerdado: outro,
        participantes: [
          { alunoId: "herda", ...vazio },
          {
            alunoId: "longe",
            local: "Outro",
            latitude: ponto.latitude,
            longitude: ponto.longitude,
          },
        ],
      },
    ]);
    expect(emEdicao).toEqual({
      alunos: 1,
      provas: [{ id: "prova-1", nome: "UVA", dia: "2027-01-10", alunos: 1, atual: true }],
    });
  });
});

describe("lista colada de locais", () => {
  const alunos = [
    { alunoId: "ana", nome: "Ana Souza" },
    { alunoId: "bruno", nome: "Bruno Lima" },
    { alunoId: "caio", nome: "Caio Lima" },
  ];

  it("casa por nome sem acento, com tabulação, ponto e vírgula ou barra vertical", () => {
    const texto = [
      "Nome;Local",
      "ana   souza;Campus Betânia",
      "Bruno Lima\tCampus Junco",
      "Caio Lima | IFCE",
    ].join("\n");
    expect(casarLocaisColados(texto, alunos)).toEqual({
      casados: [
        { alunoId: "ana", nome: "Ana Souza", local: "Campus Betânia" },
        { alunoId: "bruno", nome: "Bruno Lima", local: "Campus Junco" },
        { alunoId: "caio", nome: "Caio Lima", local: "IFCE" },
      ],
      recusados: [],
    });
  });

  it("repete o mesmo local uma vez e recusa sem par, ambíguo, divergente e linha inválida", () => {
    const texto = [
      "Ana Souza;Campus Betânia",
      "Ana Souza;Campus Betânia",
      "Pessoa de fora;Campus X",
      "Bruno Lima;Campus A",
      "Bruno Lima;Campus B",
      "Caio Lima;Escola Maria",
      "linha sem separador",
      ";Campus",
      `Dani;${"a".repeat(LIMITE_LOCAL_PROVA_ESPECIFICA + 1)}`,
    ].join("\n");
    const homonimos = [...alunos, { alunoId: "caio-2", nome: "Caio Lima" }];
    const resultado = casarLocaisColados(texto, homonimos);
    expect(resultado.casados).toEqual([
      { alunoId: "ana", nome: "Ana Souza", local: "Campus Betânia" },
    ]);
    expect(resultado.recusados.map((item) => item.motivo)).toEqual([
      "Não há aluno com esse nome nesta prova.",
      "O nome aparece mais de uma vez com locais diferentes.",
      "O nome aparece mais de uma vez com locais diferentes.",
      "Há mais de um aluno com esse nome nesta prova.",
      "Informe o nome e o local separados por tabulação, ponto e vírgula ou barra vertical.",
      "Informe o nome do aluno.",
      `O local deve ter no máximo ${LIMITE_LOCAL_PROVA_ESPECIFICA} caracteres.`,
    ]);
  });
});
