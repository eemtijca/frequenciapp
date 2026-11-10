// Caracteriza as heurísticas legadas sem tratar cadastro ou turma atual como matrícula.
import { readFileSync } from "node:fs";
import {
  avaliarComposicaoHistorica,
  diagnosticarListasHistoricas,
} from "@/domain/listas-historicas";
import { describe, expect, it } from "vitest";
it("separa inconsistência estrutural de suspeita sem corrigir nem expor nomes", () => {
  const chamadas = [
    { id: "f", dia: "2026-01-05", turmaId: "a", alunos: ["transferido"], faltas: ["falta"] },
  ];
  const fonte = JSON.stringify(chamadas);
  const resultado = diagnosticarListasHistoricas(chamadas, [
    { id: "transferido", turmaId: "b", turmaOriginalId: "b", criadoEm: "2025-01-01" },
    { id: "importado", turmaId: "a", turmaOriginalId: "a", criadoEm: "2026-02-01" },
  ]);
  expect(resultado.find((r) => r.alunoId === "falta")?.classificacao).toBe(
    "INCONSISTENCIA_ESTRUTURAL_CONFIRMADA",
  );
  expect(resultado.find((r) => r.alunoId === "transferido")?.classificacao).toBe(
    "INCERTEZA_HISTORICA",
  );
  expect(resultado.find((r) => r.alunoId === "importado")?.razoes).toContain("CADASTRO_POSTERIOR");
  expect(JSON.stringify(chamadas)).toBe(fonte);
  expect(JSON.stringify(resultado)).not.toContain("nome");
});
it("a migração original infere lista por cadastro e turma, não por matrícula", () => {
  const sql = readFileSync(
    "prisma/migrations/20260928124039_lista_da_chamada/migration.sql",
    "utf8",
  );
  expect(sql).toContain('"a"."turma_id" = "f"."turma_id"');
  expect(sql).toContain('"a"."criado_em"');
  const chamada = { turmaId: "a", dia: "2026-01-05" };
  const inferir = (a: { turmaId: string; criadoEm: string }) =>
    a.turmaId === chamada.turmaId && a.criadoEm <= chamada.dia;
  expect(inferir({ turmaId: "a", criadoEm: "2025-12-01" })).toBe(true); // Pode ter chegado após a chamada.
  expect(inferir({ turmaId: "b", criadoEm: "2025-12-01" })).toBe(false); // Pode ter saído após a chamada.
  expect(inferir({ turmaId: "a", criadoEm: "2026-02-01" })).toBe(false); // Importação tardia não prova ausência.
});
it("a reparadora é aditiva e não remove inclusões falsas", () => {
  const sql = readFileSync(
    "prisma/migrations/20261013224456_recupera_lista_chamadas_antigas/migration.sql",
    "utf8",
  );
  expect(sql).toContain('"a"."turma_original_id"');
  expect(sql).toContain("ON CONFLICT DO NOTHING");
  expect(sql).not.toMatch(/DELETE\s+FROM/i);
});
describe("composição histórica", () => {
  const turma = { id: "t1", criadoEm: "2026-01-01" };
  const aluno = {
    id: "a1",
    turmaId: "t1",
    turmaOriginalId: "t1",
    ativo: true,
    criadoEm: "2026-02-01",
    desistenteEm: null,
  };
  it("aceita cadastro anterior na mesma turma e origem", () => {
    expect(avaliarComposicaoHistorica(turma, [aluno], "2026-06-15")).toEqual({
      compativel: true,
      razoes: [],
      alunosDivergentes: [],
    });
  });
  it("recusa cadastro posterior, transferência de entrada e de saída", () => {
    expect(
      avaliarComposicaoHistorica(turma, [{ ...aluno, criadoEm: "2026-06-16" }], "2026-06-15"),
    ).toMatchObject({ compativel: false, razoes: ["CADASTRO_POSTERIOR"] });
    expect(
      avaliarComposicaoHistorica(turma, [{ ...aluno, turmaOriginalId: "t2" }], "2026-06-15"),
    ).toMatchObject({ compativel: false, razoes: ["VINCULO_INDETERMINADO"] });
    expect(
      avaliarComposicaoHistorica(
        turma,
        [{ ...aluno, turmaId: "t2", turmaOriginalId: "t1" }],
        "2026-06-15",
      ),
    ).toMatchObject({ compativel: false, razoes: ["VINCULO_INDETERMINADO"] });
  });
  it("ignora quem já havia desistido na data, mas recusa inativo sem data", () => {
    expect(
      avaliarComposicaoHistorica(
        turma,
        [{ ...aluno, ativo: false, desistenteEm: "2026-05-01" }],
        "2026-06-15",
      ).compativel,
    ).toBe(true);
    expect(
      avaliarComposicaoHistorica(
        turma,
        [{ ...aluno, ativo: false, desistenteEm: null }],
        "2026-06-15",
      ),
    ).toMatchObject({ compativel: false, razoes: ["VINCULO_INDETERMINADO"] });
  });
  it("recusa turma criada depois da data mesmo sem alunos", () => {
    expect(
      avaliarComposicaoHistorica({ ...turma, criadoEm: "2026-06-16" }, [], "2026-06-15"),
    ).toEqual({
      compativel: false,
      razoes: ["TURMA_CRIADA_DEPOIS"],
      alunosDivergentes: [],
    });
  });
});
