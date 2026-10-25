// Regressões dos recortes personalizados: dimensões ocultas, ordem semanal e totais por chamada.
import { describe, expect, it } from "vitest";
import {
  agregarBi,
  coberturaBi,
  esquemaFiltrosBi,
  totalBi,
  type DadosBi,
  type GraficoBi,
} from "@/domain/bi-analise";
import { graficoBi } from "@/domain/bi-painel";
import { exigeListaBi, resolverRecorteBi } from "@/domain/bi-recortes";

const filtros = esquemaFiltrosBi.parse({ inicio: "2026-10-01", fim: "2026-10-31" });
const chamadas = [
  {
    id: "qa-ca",
    dia: "2026-10-05",
    turmaId: "qa-ta",
    turma: "QA A",
    serieId: "qa-s",
    serie: "QA Série",
    registrados: 10,
    ausencias: 5,
  },
  {
    id: "qa-cb",
    dia: "2026-10-05",
    turmaId: "qa-tb",
    turma: "QA B",
    serieId: "qa-s",
    serie: "QA Série",
    registrados: 90,
    ausencias: 9,
  },
];

describe("agregação dos gráficos personalizados", () => {
  it.each<GraficoBi["tipo"]>([
    "barras",
    "horizontal",
    "linha",
    "area",
    "rosca",
    "dispersao",
    "tabela",
    "indicador",
  ])("ignora a dimensão secundária ao trocar agrupadas por %s", (tipo) => {
    const config = graficoBi("chamadas", "serie", "infrequencia", tipo, "QA", "turma");
    const pontos = agregarBi(chamadas, config, filtros);
    expect(pontos).toHaveLength(1);
    expect(pontos[0]).toMatchObject({ registros: 2, grupo: "", grupoReferencia: "" });
    expect(pontos[0]?.valor).toBeCloseTo(14);
  });

  it.each<GraficoBi["tipo"]>(["agrupadas", "calor"])(
    "preserva identidades dos subgrupos homônimos em %s",
    (tipo) => {
      const config = graficoBi("chamadas", "serie", "infrequencia", tipo, "QA", "turma");
      const pontos = agregarBi(
        chamadas.map((c) => ({ ...c, turma: "QA Homônima" })),
        config,
        filtros,
      );
      expect(pontos).toHaveLength(2);
      expect(pontos.map((p) => p.grupoReferencia)).toEqual(["qa-ta", "qa-tb"]);
      expect(pontos.map((p) => p.valor)).toEqual([50, 10]);
    },
  );

  it("ordena a semana a partir de segunda-feira, inclusive como dimensão secundária", () => {
    const registros = [11, 7, 5, 9, 6, 10, 8].map((dia) => ({
      id: `qa-${dia}`,
      dia: `2026-10-${String(dia).padStart(2, "0")}`,
      turma: "QA A",
      turmaId: "qa-t",
    }));
    const esperados = [
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo",
    ];
    expect(
      agregarBi(
        registros,
        graficoBi("entradas", "diaSemana", "registros", "barras", "QA"),
        filtros,
      ).map((p) => p.nome),
    ).toEqual(esperados);
    expect(
      agregarBi(
        registros,
        graficoBi("entradas", "turma", "registros", "calor", "QA", "diaSemana"),
        filtros,
      ).map((p) => p.grupo),
    ).toEqual(esperados);
  });

  it("ordena aulas numericamente na dimensão secundária", () => {
    const pontos = agregarBi(
      [10, 2, 1].map((aula) => ({ id: `qa-${aula}`, turma: "QA A", turmaId: "qa-t", aula })),
      graficoBi("faltas", "turma", "registros", "agrupadas", "QA", "aula"),
      filtros,
    );
    expect(pontos.map((p) => p.grupo)).toEqual(["1", "2", "10"]);
  });
});

describe("cobertura no período autorizado", () => {
  const dados: DadosBi = {
    alunos: [{ id: "qa-a", turmaId: "qa-t", ativo: true, desistenteEm: null }],
    feriados: [],
    chamadas: [5, 6, 7, 8, 9, 12].map((dia) => ({
      id: `qa-c${dia}`,
      turmaId: "qa-t",
      dia: `2026-10-${String(dia).padStart(2, "0")}`,
    })),
  };

  it("limita numerador e denominador aos cinco dias autorizados ao selecionar o mês", () => {
    expect(coberturaBi(dados, filtros, { inicio: "2026-10-05", fim: "2026-10-09" })).toEqual({
      salvas: 5,
      esperadas: 5,
      taxa: 100,
    });
  });

  it("fica sem base quando o período pedido não intersecta o escopo", () => {
    expect(coberturaBi(dados, filtros, { inicio: "2026-11-01", fim: "2026-11-30" })).toBeNull();
  });
});

describe("recortes individuais de chamadas", () => {
  const dados: DadosBi = {
    chamadas,
    alunos: [
      { id: "qa-a", alunoId: "qa-a", ativo: true, desistenteEm: null },
      { id: "qa-b", alunoId: "qa-b", ativo: false, desistenteEm: null },
    ],
    lista: [
      {
        id: "qa-la",
        frequenciaId: "qa-ca",
        alunoId: "qa-a",
        aluno: "QA Ana",
        tipo: "F",
        dia: "2026-10-05",
        turmaId: "qa-ta",
        turma: "QA A",
        serieId: "qa-s",
        serie: "QA Série",
      },
      {
        id: "qa-lb",
        frequenciaId: "qa-ca",
        alunoId: "qa-b",
        aluno: "QA Bia",
        tipo: "P",
        dia: "2026-10-05",
        turmaId: "qa-ta",
        turma: "QA A",
        serieId: "qa-s",
        serie: "QA Série",
      },
      {
        id: "qa-lc",
        frequenciaId: "qa-cb",
        alunoId: "qa-a",
        aluno: "QA Ana",
        tipo: "P",
        dia: "2026-10-06",
        turmaId: "qa-tb",
        turma: "QA B",
        serieId: "qa-s",
        serie: "QA Série",
      },
    ],
  };

  it.each([{ alunoId: "qa-a" }, { busca: "Ana" }, { situacao: "ativo" }])(
    "calcula taxa e chamadas distintas para %j",
    (individual) => {
      const recorte = resolverRecorteBi(dados, "chamadas", { ...filtros, ...individual });
      expect(recorte.disponivel).toBe(true);
      if (!recorte.disponivel) return;
      expect(recorte.fonte).toBe("lista");
      expect(totalBi(recorte.linhas, "registros", recorte.filtros)).toBe(2);
      expect(totalBi(recorte.linhas, "registrados", recorte.filtros)).toBe(2);
      expect(totalBi(recorte.linhas, "infrequencia", recorte.filtros)).toBe(50);
      expect(totalBi(recorte.linhas, "diasChamada", recorte.filtros)).toBe(2);
      expect(recorte.linhas.map((l) => l.turmaId)).toEqual(["qa-ta", "qa-tb"]);
    },
  );

  it("consolida dois alunos na mesma chamada sem duplicar a contagem", () => {
    const recorte = resolverRecorteBi(dados, "chamadas", {
      ...filtros,
      busca: "QA",
      turmaId: "qa-ta",
    });
    expect(recorte.disponivel).toBe(true);
    if (!recorte.disponivel) return;
    expect(totalBi(recorte.linhas, "registros", recorte.filtros)).toBe(1);
    expect(totalBi(recorte.linhas, "registrados", recorte.filtros)).toBe(2);
    expect(totalBi(recorte.linhas, "infrequencia", recorte.filtros)).toBe(50);
  });

  it("pondera o recorte de nomes pela quantidade de alunos, sem tirar média das taxas diárias", () => {
    const recorte = resolverRecorteBi(dados, "chamadas", { ...filtros, busca: "QA" });
    expect(recorte.disponivel).toBe(true);
    if (!recorte.disponivel) return;
    expect(totalBi(recorte.linhas, "registros", recorte.filtros)).toBe(2);
    expect(totalBi(recorte.linhas, "registrados", recorte.filtros)).toBe(3);
    expect(totalBi(recorte.linhas, "infrequencia", recorte.filtros)).toBeCloseTo(100 / 3);
  });

  it("aplica o tipo na lista antes de totalizar chamadas e preserva o denominador vazio", () => {
    const recorte = resolverRecorteBi(dados, "chamadas", { ...filtros, tipo: "F" });
    expect(recorte.disponivel).toBe(true);
    if (!recorte.disponivel) return;
    expect(totalBi(recorte.linhas, "registros", recorte.filtros)).toBe(1);
    expect(totalBi(recorte.linhas, "infrequencia", recorte.filtros)).toBe(100);
    const vazio = resolverRecorteBi(dados, "chamadas", { ...filtros, tipo: "FJ" });
    expect(vazio.disponivel).toBe(true);
    if (!vazio.disponivel) return;
    expect(totalBi(vazio.linhas, "registrados", vazio.filtros)).toBe(0);
    expect(totalBi(vazio.linhas, "infrequencia", vazio.filtros)).toBeNull();
  });

  it("mantém a base agregada quando o recorte é por período, série ou turma", () => {
    const f = { ...filtros, turmaId: "qa-ta" };
    expect(exigeListaBi("chamadas", f)).toBe(false);
    expect(resolverRecorteBi(dados, "chamadas", f)).toEqual({
      disponivel: true,
      linhas: chamadas,
      filtros: f,
      fonte: "chamadas",
    });
  });

  it("distingue lista vazia de base indisponível e não inventa turmas sem alunos no recorte", () => {
    const f = { ...filtros, alunoId: "qa-a" };
    expect(resolverRecorteBi({}, "chamadas", f)).toMatchObject({ disponivel: false });
    expect(resolverRecorteBi({ lista: [] }, "chamadas", f)).toMatchObject({
      disponivel: true,
      linhas: [],
    });
    expect(resolverRecorteBi(dados, "chamadas", { ...f, alunoId: "qa-ausente" })).toMatchObject({
      disponivel: true,
      linhas: [],
    });
  });

  it("recusa situação sem cadastro, registros sem chamada e filtros incompatíveis", () => {
    expect(
      resolverRecorteBi({ lista: dados.lista }, "chamadas", { ...filtros, situacao: "ativo" }),
    ).toMatchObject({ disponivel: false });
    expect(
      resolverRecorteBi({ lista: [{ id: "qa", alunoId: "qa-a", tipo: "P" }] }, "chamadas", {
        ...filtros,
        alunoId: "qa-a",
      }),
    ).toMatchObject({ disponivel: false });
    for (const adicional of [{ turno: "MANHA" }, { justificativa: "QA Transporte" }])
      expect(resolverRecorteBi(dados, "chamadas", { ...filtros, ...adicional })).toMatchObject({
        disponivel: false,
      });
    expect(
      resolverRecorteBi({ turmas: [] }, "turmas", { ...filtros, alunoId: "qa-a" }),
    ).toMatchObject({ disponivel: false });
    expect(
      resolverRecorteBi({ lista: dados.lista, alunos: [] }, "chamadas", {
        ...filtros,
        situacao: "ativo",
      }),
    ).toMatchObject({ disponivel: false });
    expect(
      resolverRecorteBi(
        { lista: [{ id: "qa", frequenciaId: "qa-ca", alunoId: "qa-a", tipo: "P" }] },
        "chamadas",
        { ...filtros, busca: "Ana" },
      ),
    ).toMatchObject({ disponivel: false });
  });
});
