// Planilha: esquema, dataframe, CSV e planejamento conservador.
import { describe, expect, it } from "vitest";
import {
  blocosDeColunas,
  campoCsv,
  colunasNecessarias,
  leituraDosBlocos,
  colunasDoIntervalo,
  dataDoRotulo,
  detectarEsquema,
  detectarLinhaCabecalho,
  hashTexto,
  montarTurmaPlanilha,
  nomeArquivoCsv,
  paraCsv,
  planejarSincronizacao,
  resultadoDeFalha,
  validarEndpoint,
  type AbaBruta,
  type LeituraAba,
  type OpcoesPlano,
} from "@/domain/planilha";
import type { Aluno, Frequencia } from "@/domain/frequencia";

function aluno(parcial: Partial<Aluno> = {}): Aluno {
  return {
    id: parcial.id ?? "aluno-1",
    nome: parcial.nome ?? "Alice",
    turmaId: parcial.turmaId ?? "turma-a",
    turmaOriginalId: parcial.turmaOriginalId ?? "origem-a",
    ordem: parcial.ordem ?? 1,
    ativo: parcial.ativo ?? true,
    desistenteEm: parcial.desistenteEm ?? null,
  };
}

function frequencia(parcial: Partial<Frequencia> = {}): Frequencia {
  return {
    dia: parcial.dia ?? "2026-09-10",
    turmaId: parcial.turmaId ?? "turma-a",
    revisao: parcial.revisao ?? 1,
    atualizadoEm: parcial.atualizadoEm ?? "2026-09-10T12:00:00Z",
    atualizadoPorNome: parcial.atualizadoPorNome ?? null,
    faltas: parcial.faltas ?? [],
  };
}

const ABA: AbaBruta = {
  nome: "3º ano A",
  valores: [
    ["Aluno", "Turma atual", "10/09", "11/09", "Total"],
    ["Alice", "3º ano A", "P", "", ""],
    ["Bruno", "3º ano A", "", "", ""],
  ],
  formulas: [
    ["", "", "", "", ""],
    ["", "", "", "", "=CONT.SE(...)"],
    ["", "", "", "", ""],
  ],
  linhas: 3,
  colunas: 5,
};

function conteudoDaAba(aba: AbaBruta): LeituraAba {
  return {
    nome: aba.nome,
    valores: aba.valores,
    formula: (aba.formulas ?? []).map((linha) => linha.map((valor) => valor !== "")),
    linhaInicial: 1,
    colunaInicial: 1,
  };
}

function opcoes(parcial: Partial<OpcoesPlano> = {}): OpcoesPlano {
  return {
    modo: "conservador",
    permitirInserirColunas: true,
    permitirNovosAlunos: true,
    ...parcial,
  };
}

describe("validarEndpoint", () => {
  it("aceita o Web App do Apps Script", () => {
    expect(validarEndpoint("https://script.google.com/macros/s/ABC123/exec", false)).toBeNull();
    expect(validarEndpoint("https://script.google.com/macros/s/ABC-123_/exec/", false)).toBeNull();
  });
  it("recusa endereços fora do padrão e sem https", () => {
    expect(validarEndpoint("http://script.google.com/macros/s/ABC/exec", false)).not.toBeNull();
    expect(validarEndpoint("https://exemplo.com/macros/s/ABC/exec", false)).not.toBeNull();
    expect(validarEndpoint("https://script.google.com/macros/s/ABC/dev", false)).not.toBeNull();
    expect(validarEndpoint("não é url", false)).not.toBeNull();
  });
  it("aceita loopback apenas quando o ambiente permite", () => {
    expect(validarEndpoint("http://127.0.0.1:4567/exec", true)).toBeNull();
    expect(validarEndpoint("http://127.0.0.1:4567/exec", false)).not.toBeNull();
  });
});

describe("dataDoRotulo", () => {
  it("reconhece os formatos usados em cabeçalho", () => {
    expect(dataDoRotulo("10/09", 2026)).toBe("2026-09-10");
    expect(dataDoRotulo("1/9/26", 2026)).toBe("2026-09-01");
    expect(dataDoRotulo("10/09/2026", 2026)).toBe("2026-09-10");
    expect(dataDoRotulo("2026-09-10", 2026)).toBe("2026-09-10");
  });
  it("recusa datas impossíveis e textos comuns", () => {
    expect(dataDoRotulo("31/02", 2026)).toBeNull();
    expect(dataDoRotulo("Total", 2026)).toBeNull();
    expect(dataDoRotulo("Aluno", 2026)).toBeNull();
  });
});

describe("campoCsv", () => {
  it("neutraliza fórmulas e escapa separadores", () => {
    expect(campoCsv("=1+1")).toBe("'=1+1");
    expect(campoCsv("+55")).toBe("'+55");
    expect(campoCsv("-Ana")).toBe("'-Ana");
    expect(campoCsv("@Ana")).toBe("'@Ana");
    expect(campoCsv('Ana "Tia"')).toBe('"Ana ""Tia"""');
    expect(campoCsv("Ana;Maria")).toBe('"Ana;Maria"');
  });
});

describe("dataframe e CSV", () => {
  const dias = ["2026-09-10", "2026-09-11"];
  const alunos = [aluno(), aluno({ id: "aluno-2", nome: "Bruno", ordem: 2 })];
  const frequencias = [frequencia({ faltas: [{ alunoId: "aluno-2", horarios: ["aula-1"] }] })];
  const turma = montarTurmaPlanilha(
    "origem-a",
    "3º ano A",
    alunos,
    frequencias,
    [
      {
        id: "aula-1",
        turmaId: "turma-a",
        ordem: 1,
        inicio: "07:00",
        fim: "07:50",
        diasSemana: [1, 2, 3, 4, 5],
        ativo: true,
      },
    ],
    dias,
    (id) => (id === "turma-a" ? "3º ano A" : id),
  );

  it("monta as marcas da turma de origem", () => {
    expect(turma.linhas).toHaveLength(2);
    expect(turma.linhas[0]?.marcas["2026-09-10"]).toBe("P");
    expect(turma.linhas[1]?.marcas["2026-09-10"]).toBe("F");
    expect(turma.linhas[1]?.marcas["2026-09-11"]).toBeUndefined();
  });

  it("gera CSV com BOM, contagens e célula vazia", () => {
    const csv = paraCsv(turma);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    const linhas = csv.replace("\uFEFF", "").trim().split("\r\n");
    expect(linhas[0]).toBe("Aluno;Turma atual;10/09;11/09;Faltas;Justificadas;Total (F + FJ)");
    expect(linhas[1]).toBe("Alice;3º ano A;P;;0;0;0");
    expect(linhas[2]).toBe("Bruno;3º ano A;F;;1;0;1");
  });

  it("gera nome de arquivo sem acento", () => {
    expect(nomeArquivoCsv(turma)).toBe("frequenciapp-grade-3o-ano-a-2026-09-10-a-2026-09-11.csv");
  });

  it("escreve a desistência ao lado do nome no CSV sem apagar marcas antigas", () => {
    const comDesistente = montarTurmaPlanilha(
      "origem-a",
      "3º ano A",
      [aluno({ desistenteEm: "2026-09-11" })],
      [frequencia()],
      [],
      dias,
      () => "3º ano A",
    );
    expect(paraCsv(comDesistente)).toContain("Alice (DESISTENTE);3º ano A;P;");
  });
});

describe("detectarEsquema", () => {
  it("acha o cabeçalho, a coluna de aluno, os dias e o total", () => {
    const esquema = detectarEsquema(ABA, 2026);
    expect(esquema.cabecalho).toBe(1);
    expect(esquema.colunas[0]).toMatchObject({ tipo: "aluno", letra: "A" });
    expect(esquema.colunas[1]).toMatchObject({ tipo: "turma" });
    expect(esquema.colunas[2]).toMatchObject({ tipo: "dia", data: "2026-09-10" });
    expect(esquema.colunas[3]).toMatchObject({ tipo: "dia", data: "2026-09-11" });
    expect(esquema.colunas[4]).toMatchObject({ tipo: "total", formula: true });
    expect(esquema.ultimaLinhaDados).toBe(3);
  });

  it("acha o cabeçalho fora da primeira linha", () => {
    const aba: AbaBruta = {
      nome: "3º ano B",
      valores: [
        ["Frequência do mês", "", "", ""],
        ["Aluno", "Turma atual", "10/09", "Total"],
        ["Ana", "3º ano B", "P", "0"],
      ],
    };
    expect(detectarLinhaCabecalho(aba.valores, 2026)).toBe(2);
    const esquema = detectarEsquema(aba, 2026);
    expect(esquema.cabecalho).toBe(2);
    expect(esquema.colunas[2]).toMatchObject({ tipo: "dia", data: "2026-09-10" });
  });

  it("muda a assinatura quando o cabeçalho muda", () => {
    const esquema = detectarEsquema(ABA, 2026);
    const alterada = detectarEsquema(
      {
        ...ABA,
        valores: [["Aluno", "Turma atual", "10/09", "12/09", "Total"], ...ABA.valores.slice(1)],
      },
      2026,
    );
    expect(esquema.assinatura).not.toBe(alterada.assinatura);
  });

  it("registra mesclagem que cobre colunas", () => {
    const esquema = detectarEsquema({ ...ABA, mesclagens: ["C1:D1"] }, 2026);
    expect(esquema.mesclagens).toEqual(["C1:D1"]);
    expect(esquema.bloqueio).toContain("C1:D1");
  });

  it("marca a aba criada pela integração", () => {
    const esquema = detectarEsquema({ ...ABA, criada: true }, 2026);
    expect(esquema.criada).toBe(true);
  });

  it("produz hash estável", () => {
    expect(hashTexto("abc")).toBe(hashTexto("abc"));
    expect(hashTexto("abc")).not.toBe(hashTexto("abd"));
  });
});

describe("planejarSincronizacao", () => {
  const dias = ["2026-09-10", "2026-09-11"];
  const alunos = [aluno(), aluno({ id: "aluno-2", nome: "Bruno", ordem: 2 })];
  const frequencias = [frequencia({ faltas: [{ alunoId: "aluno-2", horarios: ["aula-1"] }] })];
  const turma = montarTurmaPlanilha(
    "origem-a",
    "3º ano A",
    alunos,
    frequencias,
    [],
    dias,
    () => "3º ano A",
  );
  const esquema = detectarEsquema(ABA, 2026);
  const conteudo = conteudoDaAba(ABA);

  it("preenche apenas célula vazia e avisa o que já tem valor", () => {
    const plano = planejarSincronizacao(esquema, turma, conteudo, opcoes());
    expect(plano.preencher.map((celula) => celula.celula)).toEqual(["C3"]);
    expect(plano.preencher[0]).toMatchObject({ valor: "F", alunoNome: "Bruno" });
    expect(plano.substituir).toHaveLength(0);
    // 11/09 tem coluna e a turma não teve frequência: nada a preencher.
    expect(plano.resumo.preencher).toBe(1);
    expect(plano.novasColunas).toHaveLength(0);
  });

  it("nunca substitui no modo conservador, mesmo com a opção ligada", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["Alice", "3º ano A", "P", "", ""],
        ["Bruno", "3º ano A", "P", "", ""],
      ],
    };
    const plano = planejarSincronizacao(
      detectarEsquema(aba, 2026),
      turma,
      conteudoDaAba(aba),
      opcoes({ substituirDivergencias: true }),
    );
    expect(plano.substituir).toHaveLength(0);
    expect(plano.resumo.puladasOcupadas).toBe(1);
  });

  it("substitui divergência no modo completo, exceto fórmula", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["Alice", "3º ano A", "P", "", ""],
        ["Bruno", "3º ano A", "P", "", ""],
      ],
    };
    const plano = planejarSincronizacao(
      detectarEsquema(aba, 2026),
      turma,
      conteudoDaAba(aba),
      opcoes({ modo: "completo", substituirDivergencias: true }),
    );
    expect(plano.substituir).toHaveLength(1);
    expect(plano.substituir[0]).toMatchObject({ celula: "C3", anterior: "P", valor: "F" });
  });

  it("protege célula com fórmula mesmo no modo completo", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["Alice", "3º ano A", "P", "", ""],
        ["Bruno", "3º ano A", "P", "", ""],
      ],
      formulas: [
        ["", "", "", "", ""],
        ["", "", "", "", ""],
        ["", "", "=HOJE()", "", ""],
      ],
    };
    const plano = planejarSincronizacao(
      detectarEsquema(aba, 2026),
      turma,
      conteudoDaAba(aba),
      opcoes({ modo: "completo", substituirDivergencias: true }),
    );
    expect(plano.substituir).toHaveLength(0);
    expect(plano.resumo.puladasFormula).toBe(1);
  });

  it("planeja coluna nova antes do total quando autorizado", () => {
    const diasTres = ["2026-09-10", "2026-09-11", "2026-09-12"];
    const turmaTresDias = montarTurmaPlanilha(
      "origem-a",
      "3º ano A",
      alunos,
      diasTres.map((dia) =>
        frequencia({ dia, faltas: [{ alunoId: "aluno-2", horarios: ["aula-1"] }] }),
      ),
      [],
      diasTres,
      () => "3º ano A",
    );
    const primeira = planejarSincronizacao(esquema, turmaTresDias, conteudo, opcoes());
    expect(primeira.novasColunas.map((coluna) => coluna.dia)).toEqual(["2026-09-12"]);
    expect(primeira.novasColunas[0]).toMatchObject({ antesDe: "E", indice: 5 });
    expect(primeira.preencher.map((celula) => celula.celula)).toContain("E2");
    const semColuna = planejarSincronizacao(
      detectarEsquema(
        {
          ...ABA,
          valores: [
            ["Aluno", "Turma atual", "10/09", "Total"],
            ["Alice", "3º ano A", "P", ""],
            ["Bruno", "3º ano A", "", ""],
          ],
        },
        2026,
      ),
      turmaTresDias,
      {
        ...conteudo,
        valores: [
          ["Aluno", "Turma atual", "10/09", "Total"],
          ["Alice", "3º ano A", "P", ""],
          ["Bruno", "3º ano A", "", ""],
        ],
      },
      opcoes(),
    );
    expect(semColuna.novasColunas.map((coluna) => coluna.dia)).toEqual([
      "2026-09-11",
      "2026-09-12",
    ]);
    expect(semColuna.novasColunas[0]?.antesDe).toBe("D");
  });

  it("recusa novos dias e alunos quando não autorizado", () => {
    const plano = planejarSincronizacao(
      esquema,
      turma,
      conteudo,
      opcoes({ permitirInserirColunas: false, permitirNovosAlunos: false }),
    );
    expect(plano.novasColunas).toHaveLength(0);
    expect(plano.novosAlunos).toHaveLength(0);
  });

  it("acrescenta aluno novo quando autorizado", () => {
    const turmaTres = montarTurmaPlanilha(
      "origem-a",
      "3º ano A",
      [...alunos, aluno({ id: "aluno-3", nome: "Carla", ordem: 3 })],
      frequencias,
      [],
      dias,
      () => "3º ano A",
    );
    const plano = planejarSincronizacao(esquema, turmaTres, conteudo, opcoes());
    expect(plano.novosAlunos).toHaveLength(1);
    expect(plano.novosAlunos[0]).toMatchObject({ nome: "Carla", linha: 4 });
    expect(plano.preencher.map((celula) => celula.celula)).toContain("C4");
  });

  it("pula nome duplicado na planilha", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["Alice", "3º ano A", "P", "", ""],
        ["Alice", "3º ano A", "", "", ""],
      ],
    };
    const plano = planejarSincronizacao(
      detectarEsquema(aba, 2026),
      turma,
      conteudoDaAba(aba),
      opcoes({ permitirNovosAlunos: false }),
    );
    expect(plano.resumo.ambiguidades).toBe(1);
    expect(plano.preencher).toHaveLength(0);
  });

  it("só remove linha marcada como criada pela integração", () => {
    const conteudoMarcado: LeituraAba = { ...conteudo, linhasCriadas: [3] };
    const plano = planejarSincronizacao(
      esquema,
      turma,
      conteudoMarcado,
      opcoes({ modo: "completo", removerLinhas: [2, 3] }),
    );
    expect(plano.removerLinhas).toEqual([{ linha: 3, nome: "Bruno" }]);
  });

  it("lista como candidata a linha criada para aluno fora da turma", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["Alice", "3º ano A", "P", "", ""],
        ["Bruno", "3º ano A", "P", "", ""],
        ["Carla", "3º ano A", "P", "", ""],
      ],
    };
    const conteudoMarcado: LeituraAba = { ...conteudoDaAba(aba), linhasCriadas: [3, 4] };
    const plano = planejarSincronizacao(esquema, turma, conteudoMarcado, opcoes());
    expect(plano.candidatosRemocaoLinhas).toEqual([{ linha: 4, nome: "Carla" }]);
    expect(plano.removerLinhas).toHaveLength(0);
  });

  it("lista colunas criadas pela integração como candidatas", () => {
    const conteudoMarcado: LeituraAba = { ...conteudo, colunasCriadas: [3, 4] };
    const plano = planejarSincronizacao(esquema, turma, conteudoMarcado, opcoes());
    expect(plano.candidatosRemocaoColunas.map((item) => item.coluna)).toEqual([3, 4]);
    expect(plano.removerColunas).toHaveLength(0);
  });

  it("é idempotente: aplicar o plano zera a próxima simulação", () => {
    const plano = planejarSincronizacao(esquema, turma, conteudo, opcoes());
    const depois = conteudo.valores.map((linha) => linha.slice());
    for (const celula of plano.preencher) {
      const linha = depois[celula.linha - 1];
      if (linha) linha[celula.coluna - 1] = celula.valor;
    }
    const segunda = planejarSincronizacao(
      esquema,
      turma,
      { ...conteudo, valores: depois },
      opcoes(),
    );
    expect(segunda.preencher).toHaveLength(0);
    expect(segunda.resumo.puladasOcupadas).toBe(0);
  });

  it("não planeja nada quando a mesclagem cobre coluna de dia", () => {
    const comMescla = detectarEsquema({ ...ABA, mesclagens: ["C1:D1"] }, 2026);
    const plano = planejarSincronizacao(
      comMescla,
      turma,
      conteudo,
      opcoes({ modo: "completo", substituirDivergencias: true }),
    );
    expect(plano.bloqueado).toBe(true);
    expect(plano.preencher).toHaveLength(0);
    expect(plano.substituir).toHaveLength(0);
    expect(plano.avisos[0]).toContain("mesclagem");
  });

  it("atualiza nome e turma atual no modo completo, nunca no conservador", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [
        ABA.valores[0] ?? [],
        ["  alice  ", "Outra turma", "P", "", ""],
        ["Bruno", "3º ano A", "", "", ""],
      ],
    };
    const esquemaNome = detectarEsquema(aba, 2026);
    const conteudoNome = conteudoDaAba(aba);
    const completo = planejarSincronizacao(
      esquemaNome,
      turma,
      conteudoNome,
      opcoes({ modo: "completo", substituirDivergencias: true }),
    );
    expect(completo.substituir.find((celula) => celula.campo === "nome")).toMatchObject({
      celula: "A2",
      valor: "Alice",
      anterior: "alice",
    });
    expect(completo.substituir.find((celula) => celula.campo === "turma")).toMatchObject({
      celula: "B2",
      valor: "3º ano A",
      anterior: "Outra turma",
    });
    const conservador = planejarSincronizacao(esquemaNome, turma, conteudoNome, opcoes());
    expect(conservador.substituir.filter((celula) => celula.campo)).toHaveLength(0);
  });
});

describe("planejarSincronizacao: código do aluno na linha", () => {
  const dias = ["2026-09-10"];
  const frequencias = [frequencia({ faltas: [{ alunoId: "aluno-2", horarios: ["a"] }] })];
  const turmaDe = (lista: Aluno[]) =>
    montarTurmaPlanilha("origem-a", "3º ano A", lista, frequencias, [], dias, () => "3º ano B");
  const alunos = [aluno(), aluno({ id: "aluno-2", nome: "Bruno", ordem: 2 })];
  const esquema = detectarEsquema(ABA, 2026);

  it("vincula pelo nome único e manda gravar o código", () => {
    const plano = planejarSincronizacao(esquema, turmaDe(alunos), conteudoDaAba(ABA), opcoes());
    expect(plano.vincular).toEqual([
      { linha: 2, coluna: 1, nome: "Alice", alunoId: "aluno-1" },
      { linha: 3, coluna: 1, nome: "Bruno", alunoId: "aluno-2" },
    ]);
    expect(plano.resumo.vincular).toBe(2);
  });

  it("sinaliza desistência no nome da linha vinculada, preservando os dias ocupados", () => {
    const lista = [
      aluno({ desistenteEm: "2026-09-11" }),
      aluno({ id: "aluno-2", nome: "Bruno", ordem: 2 }),
    ];
    const conteudo = {
      ...conteudoDaAba(ABA),
      alunosDasLinhas: [{ linha: 2, alunoId: "aluno-1" }],
    };
    const plano = planejarSincronizacao(
      esquema,
      turmaDe(lista),
      conteudo,
      opcoes({ sinalizarSituacao: true }),
    );
    expect(plano.sinalizar).toMatchObject([
      { celula: "A2", anterior: "Alice", valor: "Alice (DESISTENTE)" },
    ]);
    expect(plano.preencher.some((item) => item.celula === "C2")).toBe(false);
    expect(plano.limpar).toEqual([]);
  });

  it("vincula pelo nome e sinaliza a situação no mesmo plano", () => {
    const plano = planejarSincronizacao(
      esquema,
      turmaDe([aluno({ desistenteEm: "2026-09-11" })]),
      conteudoDaAba(ABA),
      opcoes({ sinalizarSituacao: true }),
    );
    expect(plano.vincular).toMatchObject([{ linha: 2, alunoId: "aluno-1" }]);
    expect(plano.sinalizar).toMatchObject([{ celula: "A2", valor: "Alice (DESISTENTE)" }]);
  });

  it("não troca nome editado à mão pela situação de desistência", () => {
    const aba = {
      ...ABA,
      valores: [ABA.valores[0] ?? [], ["Outro nome", "", "", "", ""], ...ABA.valores.slice(2)],
    };
    const plano = planejarSincronizacao(
      esquema,
      turmaDe([aluno({ desistenteEm: "2026-09-11" })]),
      { ...conteudoDaAba(aba), alunosDasLinhas: [{ linha: 2, alunoId: "aluno-1" }] },
      opcoes({ sinalizarSituacao: true }),
    );
    expect(plano.sinalizar).toEqual([]);
    expect(plano.avisos).toContain(
      "O nome de Alice foi alterado na planilha; confira a situação manualmente.",
    );
  });

  it("acha o aluno pelo código mesmo com o nome trocado na planilha", () => {
    const aba: AbaBruta = {
      ...ABA,
      valores: [ABA.valores[0] ?? [], ["Alice", "", "", "", ""], ["B. Souza", "", "", "", ""]],
    };
    const conteudo = {
      ...conteudoDaAba(aba),
      alunosDasLinhas: [
        { linha: 2, alunoId: "aluno-1" },
        { linha: 3, alunoId: "aluno-2" },
      ],
    };
    const plano = planejarSincronizacao(esquema, turmaDe(alunos), conteudo, opcoes());
    expect(plano.vincular).toEqual([]);
    expect(plano.novosAlunos).toEqual([]);
    expect(plano.preencher.map((celula) => [celula.celula, celula.valor])).toEqual([
      ["C2", "P"],
      ["C3", "F"],
    ]);
  });

  it("não usa o nome quando há dois alunos com o mesmo nome na turma", () => {
    const homonimos = [aluno(), aluno({ id: "aluno-2", nome: "alice", ordem: 2 })];
    const plano = planejarSincronizacao(esquema, turmaDe(homonimos), conteudoDaAba(ABA), opcoes());
    expect(plano.vincular).toEqual([]);
    expect(plano.preencher).toEqual([]);
    expect(plano.resumo.ambiguidades).toBe(2);
    expect(plano.avisos[0]).toContain("mais de um aluno chamado Alice");
  });

  it("cria a linha nova depois da última linha lida, mesmo com o esquema defasado", () => {
    // O esquema salvo conhece até a linha 3; a leitura já tem Carla na 4.
    const aba: AbaBruta = {
      ...ABA,
      valores: [...ABA.valores, ["Carla", "3º ano B", "", "", ""]],
      linhas: 4,
    };
    const novos = [...alunos, aluno({ id: "aluno-3", nome: "Diego", ordem: 3 })];
    const plano = planejarSincronizacao(esquema, turmaDe(novos), conteudoDaAba(aba), opcoes());
    expect(plano.novosAlunos).toEqual([
      { alunoId: "aluno-3", nome: "Diego", turmaAtual: "3º ano B", linha: 5 },
    ]);
  });

  it("aponta para remoção a linha criada cujo código saiu da turma", () => {
    const aba: AbaBruta = { ...ABA, valores: [...ABA.valores, ["Carla", "", "", "", ""]] };
    const conteudo = {
      ...conteudoDaAba(aba),
      linhasCriadas: [4],
      alunosDasLinhas: [{ linha: 4, alunoId: "aluno-9" }],
    };
    const plano = planejarSincronizacao(esquema, turmaDe(alunos), conteudo, opcoes());
    expect(plano.candidatosRemocaoLinhas).toEqual([{ linha: 4, nome: "Carla" }]);
  });
});

describe("leitura parcial da aba", () => {
  const esquema = detectarEsquema(ABA, 2026);

  it("pede só aluno, turma, total e os dias do período que já têm coluna", () => {
    expect(colunasNecessarias(esquema, ["2026-09-11"])).toEqual([1, 2, 4, 5]);
    expect(colunasNecessarias(esquema, ["2026-09-28"])).toEqual([1, 2, 5]);
  });

  it("junta colunas vizinhas em faixas", () => {
    expect(blocosDeColunas([5, 1, 2, 4, 9, 2])).toEqual([
      { coluna: 1, colunas: 2 },
      { coluna: 4, colunas: 2 },
      { coluna: 9, colunas: 1 },
    ]);
  });

  it("monta a leitura com cada faixa na posição real e o resto vazio", () => {
    const leitura = leituraDosBlocos("3º ano A", 1, [
      { coluna: 1, colunas: 1, valores: [["Aluno"], ["Alice"]], formula: [[false], [false]] },
      { coluna: 4, colunas: 1, valores: [["11/09"], ["F"]], formula: [[false], [true]] },
    ]);
    expect(leitura.valores).toEqual([
      ["Aluno", "", "", "11/09"],
      ["Alice", "", "", "F"],
    ]);
    expect(leitura.formula[1]).toEqual([false, false, false, true]);
  });

  it("cria a linha nova depois da última linha da aba, mesmo fora das colunas lidas", () => {
    const turma = montarTurmaPlanilha(
      "origem-a",
      "3º ano A",
      [aluno(), aluno({ id: "aluno-9", nome: "Nova", ordem: 9 })],
      [],
      [],
      ["2026-09-11"],
      () => "3º ano A",
    );
    const plano = planejarSincronizacao(
      esquema,
      turma,
      { ...conteudoDaAba(ABA), ultimaLinhaAba: 7 },
      opcoes(),
    );
    expect(plano.novosAlunos[0]?.linha).toBe(8);
  });
});

describe("auxiliares da integração", () => {
  it("classifica falha de rede como parcial e recusa como falha", () => {
    expect(resultadoDeFalha(true)).toBe("FALHA");
    expect(resultadoDeFalha(false)).toBe("PARCIAL");
  });

  it("converte intervalo A1 em índices de coluna", () => {
    expect(colunasDoIntervalo("C1")).toEqual([3]);
    expect(colunasDoIntervalo("C1:E1")).toEqual([3, 4, 5]);
    expect(colunasDoIntervalo("A1:A1")).toEqual([1]);
  });
});
