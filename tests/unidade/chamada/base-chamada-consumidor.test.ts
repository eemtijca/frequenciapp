// Confere a seleção da base através do consumidor real, de consultas ordenadas
// sintéticas e da regra pura que desempata transferências no mesmo dia.
import { beforeEach, expect, it, vi } from "vitest";
import { ORDEM_BASE_CHAMADA, compararBases, escolherBase } from "@/domain/base-chamada";
const d = vi.hoisted(() => ({ chamadas: vi.fn() }));
const tx = vi.hoisted(() => ({
  frequencia: { findMany: d.chamadas },
  frequenciaParcial: { findMany: async () => [] },
  justificativa: { findMany: async () => [] },
}));
vi.mock("@/infra/transacoes", () => ({ comTransacao: (f: (t: typeof tx) => unknown) => f(tx) }));
vi.mock("@/infra/ambiente", () => ({ ambiente: { fuso: "America/Fortaleza" } }));
vi.mock("@/application/saidas-parciais", async (original) => ({
  ...(await original<typeof import("@/application/saidas-parciais")>()),
  consultarSaidasParciais: async () => [],
}));
import { listarFrequenciasPersonalizadas } from "@/application/frequencia-personalizada";
const alunoA = "00000000-0000-4000-8000-000000000001";
const alunoB = "00000000-0000-4000-8000-000000000002";
const turmaId = "00000000-0000-4000-8000-000000000003";
const aulas = [1, 2].map((n) => ({
  id: `a${n}`,
  ordem: n,
  inicio: "07:00",
  fim: "08:00",
  ativo: true,
  diasSemana: [1, 2, 3, 4, 5],
  disciplinas: null,
}));
interface ChamadaSintetica {
  id: string;
  turmaId: string;
  dia: Date;
  revisao: number;
  criadoEm: Date;
  atualizadoEm: Date;
  turma: { serie: { nome: string }; nome: string; horarios: typeof aulas };
  aulas: { horarioId: string }[];
  faltas: { alunoId: string; horarioId: string; justificativa: string | null }[];
  alunos: {
    alunoId: string;
    aluno: { nome: string; desistenteEm: null };
    registradoSeducEm: null;
    revisaoSeduc: number;
  }[];
}
function chamada(
  id: string,
  criado: number,
  atualizado: number,
  alunoIds: string[] = [alunoA],
): ChamadaSintetica {
  const nomes: Record<string, string> = { [alunoA]: "QA Aluno A", [alunoB]: "QA Aluno B" };
  return {
    id,
    turmaId,
    dia: new Date("2026-06-15T12:00:00Z"),
    revisao: 1,
    criadoEm: new Date(criado),
    atualizadoEm: new Date(atualizado),
    turma: { serie: { nome: "QA" }, nome: id, horarios: aulas },
    aulas: aulas.map((a) => ({ horarioId: a.id })),
    faltas: [] as { alunoId: string; horarioId: string; justificativa: string | null }[],
    alunos: alunoIds.map((alunoId) => ({
      alunoId,
      aluno: { nome: nomes[alunoId] ?? alunoId, desistenteEm: null as null },
      registradoSeducEm: null as null,
      revisaoSeduc: 0,
    })),
  };
}
let linhas: ChamadaSintetica[];
beforeEach(() => {
  linhas = [chamada("antiga", 100, 400, [alunoA]), chamada("nova", 200, 300, [alunoA, alunoB])];
  d.chamadas.mockImplementation(async ({ orderBy }: { orderBy: Record<string, string>[] }) =>
    [...linhas].sort((a, b) => {
      for (const regra of orderBy) {
        const campo = Object.keys(regra)[0] as "id" | "criadoEm" | "atualizadoEm";
        const va = a[campo],
          vb = b[campo];
        if (va < vb) return regra[campo] === "desc" ? 1 : -1;
        if (va > vb) return regra[campo] === "desc" ? -1 : 1;
      }
      return 0;
    }),
  );
});
it("a ordem compartilhada é criação decrescente com identificador crescente", () => {
  expect(ORDEM_BASE_CHAMADA).toEqual([{ criadoEm: "desc" }, { id: "asc" }]);
  expect(
    escolherBase([
      { id: "b", criadoEm: new Date(200) },
      { id: "a", criadoEm: new Date(200) },
      { id: "c", criadoEm: new Date(100) },
    ]),
  ).toEqual({ id: "a", criadoEm: new Date(200) });
  expect(
    compararBases({ id: "b", criadoEm: new Date(200) }, { id: "a", criadoEm: new Date(200) }),
  ).toBe(1);
});
it("editar somente colega não troca a base dos dois alunos, independentemente da entrada", async () => {
  for (const ordem of [linhas, [...linhas].reverse()]) {
    linhas = ordem;
    const registros = await listarFrequenciasPersonalizadas({ dia: "2026-06-15" });
    expect(registros.map((registro) => registro.turmaNome)).toEqual(["QA nova", "QA nova"]);
  }
});
it("a grade atual não muda cobertura integral do retrato", async () => {
  const base = chamada("base", 100, 100);
  base.faltas = [1, 2].map((n) => ({ alunoId: alunoA, horarioId: `a${n}`, justificativa: null }));
  base.turma.horarios = [...aulas, ...aulas.map((a) => ({ ...a, id: "nova", ordem: 3 }))];
  linhas = [base];
  const registro = (await listarFrequenciasPersonalizadas({ dia: "2026-06-15" })).find(
    (item) => item.alunoId === alunoA,
  );
  expect(registro?.tipo === "CHAMADA" ? registro.marca : null).toBe("F");
});
