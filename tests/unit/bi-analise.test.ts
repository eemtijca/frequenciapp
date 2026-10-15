// Regras do BI com massa sintética: taxas ponderadas, históricos, CSV seguro e preferências versionadas.
import { describe, expect, it } from "vitest";
import {
  agregarBi,
  compararPeriodoBi,
  coberturaBi,
  csvBi,
  destaquesBi,
  enriquecerBi,
  esquemaFiltrosBi,
  esquemaGraficoBi,
  filtrarBi,
  metaBi,
  totalBi,
} from "@/domain/bi-analise";
import { graficoBi, painelCuradoBi } from "@/domain/bi-painel";
import {
  exportarPersonalizacaoBi,
  migrarPersonalizacaoBi,
  personalizacaoVaziaBi,
} from "@/domain/bi-personalizacao";
import type { LinhaBi } from "@/domain/bi";
const filtros = esquemaFiltrosBi.parse({ inicio: "2026-10-01", fim: "2026-10-31" });
const chamadas: LinhaBi[] = [
  {
    id: "a",
    dia: "2026-10-01",
    turmaId: "ta",
    turma: "QA A",
    serieId: "s",
    serie: "QA Série",
    registrados: 10,
    ausencias: 5,
    presentes: 5,
  },
  {
    id: "b",
    dia: "2026-10-02",
    turmaId: "ta",
    turma: "QA A",
    serieId: "s",
    serie: "QA Série",
    registrados: 90,
    ausencias: 9,
    presentes: 81,
  },
  {
    id: "c",
    dia: "2026-09-30",
    turmaId: "tb",
    turma: "QA B",
    serieId: "s",
    serie: "QA Série",
    registrados: 50,
    ausencias: 50,
    presentes: 0,
  },
];
describe("análises do BI", () => {
  it("pondera pela quantidade registrada, preserva a taxa sem denominador e distingue zero de vazio", () => {
    expect(totalBi(chamadas, "infrequencia", filtros)).toBeCloseTo(14);
    expect(totalBi(chamadas, "taxaPresenca", filtros)).toBeCloseTo(86);
    expect(totalBi([], "infrequencia", filtros)).toBeNull();
    expect(totalBi([], "registros", filtros)).toBe(0);
    expect(
      totalBi([{ id: "zero", registrados: 0, ausencias: 0 }], "infrequencia", filtros),
    ).toBeNull();
  });
  it("não mistura homônimos nem turmas históricas de um aluno transferido", () => {
    const ls: LinhaBi[] = [
      { id: "x", alunoId: "p1", aluno: "QA Nome", turmaId: "antiga", turma: "QA Antiga" },
      { id: "y", alunoId: "p2", aluno: "QA Nome", turmaId: "nova", turma: "QA Nova" },
    ];
    const g = agregarBi(ls, graficoBi("faltas", "aluno", "registros", "barras", "QA"), filtros);
    expect(g.map((g) => g.referencia)).toEqual(["p1", "p2"]);
    expect(totalBi(ls, "alunos", filtros)).toBe(2);
    expect(filtrarBi(ls, { ...filtros, turmaId: "nova" })).toHaveLength(1);
  });
  it("calcula a infrequência por aluno usando as marcas consolidadas da lista, sem incluir desistência", () => {
    const dados = enriquecerBi({
      lista: [
        { id: "p", alunoId: "a", tipo: "P" },
        { id: "f", alunoId: "a", tipo: "FJ" },
        { id: "s", alunoId: "b", tipo: "S" },
        { id: "x", alunoId: "a", tipo: "Sem marca" },
      ],
    });
    expect(totalBi(dados.lista ?? [], "infrequencia", { ...filtros, alunoId: "a" })).toBe(50);
    expect(totalBi(dados.lista ?? [], "registrados", filtros)).toBe(3);
    expect(totalBi(dados.lista ?? [], "presencaParcial", filtros)).toBe(1);
  });
  it("filtra situação atual sem alterar a turma gravada no evento", () => {
    const dados = enriquecerBi({
      alunos: [{ id: "p", alunoId: "p", ativo: true, desistenteEm: "2026-10-09", turmaId: "nova" }],
      faltas: [{ id: "f", alunoId: "p", turmaId: "antiga" }],
    });
    expect(filtrarBi(dados.faltas ?? [], { ...filtros, situacao: "ativo" })).toHaveLength(0);
    expect(filtrarBi(dados.faltas ?? [], { ...filtros, situacao: "desistente" })[0]?.turmaId).toBe(
      "antiga",
    );
  });
  it("expande aulas parciais apenas na dimensão de aula, sem duplicar os totais", () => {
    const ls: LinhaBi[] = [
      { id: "p", alunoId: "a", tipo: "AULAS", aulas: [1, 3], registradoSeduc: true },
      { id: "q", alunoId: "b", tipo: "DIA_INTEIRO", aulas: [], registradoSeduc: false },
    ];
    expect(totalBi(ls, "aulas", filtros)).toBe(2);
    expect(totalBi(ls, "alunos", filtros)).toBe(2);
    expect(totalBi(ls, "confirmacoes", filtros)).toBe(1);
    expect(totalBi(ls, "pendentes", filtros)).toBe(1);
    expect(totalBi(ls, "taxaSeduc", filtros)).toBe(50);
    expect(
      agregarBi(ls, graficoBi("parciais", "aula", "registros", "barras", "QA"), filtros).map(
        (p) => p.nome,
      ),
    ).toEqual(["1", "3"]);
    expect(totalBi(ls, "registros", { ...filtros, tipo: "DIA_INTEIRO" })).toBe(1);
  });
  it("usa a autoria disponível no contrato da chamada, priorizando a atualização", () => {
    const g = agregarBi(
      [{ id: "a", criadoPorNome: "QA Criação", atualizadoPorNome: "QA Revisão" }],
      graficoBi("chamadas", "autoria", "registros", "barras", "QA"),
      filtros,
    );
    expect(g[0]?.nome).toBe("QA Revisão");
  });
  it("organiza semana na segunda-feira e preserva semana na virada de ano", () => {
    const p = agregarBi(
      [{ id: "q", dia: "2027-01-01" }],
      graficoBi("entradas", "semana", "registros", "barras", "QA"),
      esquemaFiltrosBi.parse({}),
    );
    expect(p[0]?.nome).toBe("2026-12-28");
  });
  it("compara intervalos inclusivos e ajusta ano bissexto", () => {
    expect(compararPeriodoBi(filtros, "anterior")).toMatchObject({
      inicio: "2026-08-31",
      fim: "2026-09-30",
    });
    expect(
      compararPeriodoBi({ ...filtros, inicio: "2024-02-29", fim: "2024-03-01" }, "ano"),
    ).toMatchObject({ inicio: "2023-02-28", fim: "2023-03-01" });
  });
  it("estima cobertura por turma-dia, descontando feriados e incluindo sábado com chamada", () => {
    const f = { ...filtros, inicio: "2026-10-05", fim: "2026-10-10" };
    const c = coberturaBi(
      {
        alunos: [{ id: "a", turmaId: "t", ativo: true }],
        feriados: [{ id: "fer", dia: "2026-10-06" }],
        chamadas: [
          { id: "c", turmaId: "t", dia: "2026-10-05" },
          { id: "s", turmaId: "t", dia: "2026-10-10" },
        ],
      },
      f,
    );
    expect(c).toEqual({ salvas: 2, esperadas: 5, taxa: 40 });
  });
  it("recusa datas impossíveis e análises incompatíveis importadas", () => {
    expect(esquemaFiltrosBi.safeParse({ ...filtros, inicio: "2026-02-30" }).success).toBe(false);
    expect(esquemaFiltrosBi.safeParse({ ...filtros, inicio: "2026-11-01" }).success).toBe(false);
    expect(
      esquemaGraficoBi.safeParse({
        ...graficoBi("chamadas", "dia", "registros", "barras", "QA"),
        medida: "confirmacoes",
      }).success,
    ).toBe(false);
    for (const aba of ["geral", "faltas", "movimentos", "parciais"])
      for (const g of painelCuradoBi(aba)) expect(esquemaGraficoBi.safeParse(g).success).toBe(true);
  });
  it("não cria destaque de taxa em grupos pequenos e destaca os maiores com amostra suficiente", () => {
    expect(destaquesBi({ chamadas }, filtros).some((s) => s.includes("maior infrequência"))).toBe(
      false,
    );
    const dados = {
      chamadas: Array.from({ length: 5 }, (_, i) => ({ ...chamadas[0], id: String(i) }) as LinhaBi),
    };
    expect(destaquesBi(dados, filtros).join(" ")).toContain("maior infrequência");
    expect(metaBi(null, 20)).toBeNull();
    expect(metaBi(14, 20)).toBe(false);
    expect(metaBi(20, 20)).toBe(true);
  });
  it("neutraliza fórmulas e escapa texto livre em CSV sem alterar números negativos", () => {
    const csv = csvBi([
      { Aluno: '\t=HYPERLINK("x")', Nota: "Linha 1\nLinha 2", Valor: -2 },
      { Aluno: "+QA", Nota: "@QA", Valor: 0 },
      { Aluno: ["=QA()", "QA"], Nota: "QA", Valor: 1 },
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'\t=HYPERLINK");
    expect(csv).toContain('""x""');
    expect(csv).toContain('"-2"');
    expect(csv).toContain("'+QA");
    expect(csv).toContain("'@QA");
    expect(csv).toContain(`"'=QA(), QA"`);
  });
  it("agrupa uma massa de vários anos sem perder contagens distintas", () => {
    const ls = Array.from({ length: 100_000 }, (_, i) => ({
      id: String(i),
      dia: `202${i % 7}-10-01`,
      alunoId: `a${i % 400}`,
      turmaId: `t${i % 9}`,
      turma: `QA ${i % 9}`,
    }));
    const g = agregarBi(
      ls,
      graficoBi("lista", "turma", "registros", "barras", "QA"),
      esquemaFiltrosBi.parse({}),
    );
    expect(g.reduce((n, p) => n + (p.valor ?? 0), 0)).toBe(100_000);
    expect(totalBi(ls, "alunos", esquemaFiltrosBi.parse({}))).toBe(400);
  });
});
describe("preferências locais", () => {
  it("migra a versão anterior preservando visão, filtros, meta e nota", () => {
    const visao = {
      ...graficoBi("chamadas", "turma", "infrequencia", "barras", "QA Visão"),
      meta: 20,
      anotacao: "QA Nota",
    };
    const p = migrarPersonalizacaoBi({ versao: 1, visoes: [visao], paineis: [], filtros });
    expect(p.versao).toBe(2);
    expect(p.visoes[0]).toEqual(visao);
    expect(p.preferencias.filtros).toEqual(filtros);
  });
  it("não exporta chave ou bases e recusa arquivos futuros ou com campos secretos", () => {
    const p = personalizacaoVaziaBi();
    expect(exportarPersonalizacaoBi(p)).not.toMatch(/chave|segredo|linhas/);
    expect(() => migrarPersonalizacaoBi({ ...p, versao: 99 })).toThrow();
    expect(() => migrarPersonalizacaoBi({ ...p, chave: "QA Segredo" })).toThrow();
    expect(() => exportarPersonalizacaoBi({ ...p, chave: "QA" } as typeof p)).toThrow();
  });
});
