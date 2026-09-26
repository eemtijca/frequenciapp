// Planilha: esquema, dataframe, CSV e planejamento conservador.
import { describe, expect, it } from "vitest";
import {
  campoCsv,
  dataDoRotulo,
  detectarEsquema,
  detectarLinhaCabecalho,
  hashTexto,
  montarTurmaPlanilha,
  nomeArquivoCsv,
  paraCsv,
  planejarSincronizacao,
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
});
