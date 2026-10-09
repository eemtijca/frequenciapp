// Verifica a lista histórica, os agregados e a ausência de dados pessoais nas fontes externas.
import { describe, expect, it } from "vitest";
import {
  enderecoPainelPermitido,
  montarIndicadores,
  type ChamadaIndicador,
} from "@/domain/indicadores";
import { loteIndicadores } from "@/infra/google-indicadores";

const turma = { nome: "A", serie: { nome: "QA Ano" } };
describe("Endereços do painel externo", () => {
  it.each([
    "https://lookerstudio.google.com/reporting/QA_relatorio",
    "https://lookerstudio.google.com/reporting/QA_relatorio/page/pagina?filtro=QA",
    "https://analytics.zoho.com/workspace/123456789/view/987654321",
    "https://analytics.zoho.com/workspace/123456789/view/987654321/?filtro=QA",
  ])("aceita uma visualização suportada: %s", (url) => {
    expect(enderecoPainelPermitido(url)).toBe(true);
  });
  it.each([
    "endereco-invalido",
    "javascript:alert(1)",
    "http://analytics.zoho.com/workspace/123456789/view/987654321",
    "https://analytics.zoho.com:8443/workspace/123456789/view/987654321",
    "https://conta@analytics.zoho.com/workspace/123456789/view/987654321",
    "https://conta:senha@lookerstudio.google.com/reporting/QA_relatorio",
    "https://analytics.zoho.com.externo.exemplo/workspace/123456789/view/987654321",
    "https://analytics.zoho.com@externo.exemplo/workspace/123456789/view/987654321",
    "https://externo.exemplo/workspace/123456789/view/987654321",
    "https://analytics.zoho.com/workspace/123456789",
    "https://analytics.zoho.com/workspace/123456789/view/",
    "https://analytics.zoho.com/workspace/QA/view/987654321",
    "https://analytics.zoho.com/workspace/123456789/view/987654321/outro",
    "https://analytics.zoho.com/open-view/987654321",
    "https://lookerstudio.google.com/external/QA_relatorio",
  ])("recusa endereço sem visualização válida: %s", (url) => {
    expect(enderecoPainelPermitido(url)).toBe(false);
  });
});
function chamada(): ChamadaIndicador {
  return {
    dia: "2026-10-05",
    turmaId: "turma-antiga",
    turma,
    horarios: [1, 2].map((ordem) => ({
      id: `aula${ordem}`,
      turmaId: "turma-antiga",
      ordem,
      inicio: "07:00",
      fim: "08:00",
      diasSemana: [1],
      ativo: true,
    })),
    alunos: ["transferido", "justificado", "parcial", "faltoso", "desistente"].map((alunoId) => ({
      alunoId,
      desistenteEm: alunoId === "desistente" ? "2026-10-05" : null,
    })),
    faltas: [
      ...[1, 2].map((n) => ({
        alunoId: "justificado",
        horarioId: `aula${n}`,
        justificativa: "Dat",
      })),
      ...[1, 2].map((n) => ({ alunoId: "faltoso", horarioId: `aula${n}`, justificativa: null })),
      { alunoId: "parcial", horarioId: "aula1", justificativa: null },
    ],
  };
}

describe("Fontes agregadas do painel externo", () => {
  it("preserva a turma da chamada, exclui desistentes a partir da data e conta as quatro marcas", () => {
    const fonte = montarIndicadores([chamada()], [], [])[0];
    expect(fonte?.linhas).toEqual([
      ["2026-10-05", 2026, "2026-10", "QA Ano", "QA Ano A", 4, 1, 1, 1, 1, 2],
    ]);
    const antes = chamada();
    antes.alunos[4] = { alunoId: "desistente", desistenteEm: "2026-10-06" };
    expect(montarIndicadores([antes], [], [])[0]?.linhas[0]?.[5]).toBe(5);
  });
  it("não inventa chamadas ou presentes quando não há lista histórica", () => {
    expect(montarIndicadores([], [], [])[0]?.linhas).toEqual([]);
    const vazia = chamada();
    vazia.alunos = [];
    expect(montarIndicadores([vazia], [], [])[0]?.linhas[0]?.slice(5)).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("mantém a regra de justificativa quando há códigos diferentes para o mesmo aluno", () => {
    const c = chamada();
    c.faltas[0] = { alunoId: "justificado", horarioId: "aula1", justificativa: "T" };
    expect(montarIndicadores([c], [], [])[0]?.linhas[0]?.slice(5)).toEqual([4, 1, 2, 0, 1, 2]);
  });
  it("agrupa movimentos por turma, tipo e hora, sem transportar motivos livres", () => {
    const base = { dia: "2026-10-05", turma, tipo: "Entrada" as const };
    const fontes = montarIndicadores(
      [],
      [
        { ...base, horario: "08:10" },
        { ...base, horario: "08:55" },
        { ...base, tipo: "Saída", horario: null },
      ],
      [],
    );
    expect(fontes[1]?.linhas).toEqual([
      ["2026-10-05", 2026, "2026-10", "QA Ano", "QA Ano A", "Entrada", "08:00", 2],
      ["2026-10-05", 2026, "2026-10", "QA Ano", "QA Ano A", "Saída", "Não informado", 1],
    ]);
  });
  it("conta RS por registro e aulas somente nas seleções explícitas, sem repetir a mesma aula", () => {
    const p = { dia: "2026-10-05", turma, turno: null, registradoSeduc: true };
    const fontes = montarIndicadores(
      [],
      [],
      [
        { ...p, tipo: "AULAS", aulas: [1, 1, 3] },
        { ...p, tipo: "TURNO", turno: "MANHA", aulas: [], registradoSeduc: false },
      ],
    );
    expect(fontes[2]?.linhas.map((l) => l.slice(5))).toEqual([
      ["AULAS", "Não se aplica", 1, 1, 0],
      ["TURNO", "MANHA", 1, 0, 1],
    ]);
    expect(fontes[3]?.linhas.map((l) => l.slice(5))).toEqual([
      [1, 1],
      [3, 1],
    ]);
    expect(JSON.stringify(montarIndicadores([chamada()], [], []))).not.toMatch(
      /transferido|justificado|desistente|aula1|turma-antiga|"Dat"/,
    );
  });
  it("gera substituição em um único lote com datas nativas, limpeza e texto literal", () => {
    const c = chamada();
    c.turma = { nome: "=SUM(A1)", serie: { nome: "QA" } };
    const lote = loteIndicadores(montarIndicadores([c], [], []));
    const primeira = lote.requests[1];
    expect(primeira).toMatchObject({
      updateCells: { fields: "userEnteredValue", range: { sheetId: 0, endRowIndex: 2 } },
    });
    const corpo = JSON.stringify(lote);
    expect(corpo).toContain('"numberValue":46300');
    expect(corpo).toContain('"stringValue":"QA =SUM(A1)"');
    expect(corpo).not.toContain("formulaValue");
    expect(corpo).not.toContain("appendCells");
    expect(lote.requests).toHaveLength(16);
  });
  it("rejeita fonte incompleta e conteúdo excessivo antes de enviar", () => {
    expect(() => loteIndicadores([])).toThrow("incompletas");
    const fontes = montarIndicadores([], [], []);
    const primeira = fontes[0];
    if (!primeira) throw new Error("Fonte sintética ausente.");
    primeira.linhas = Array.from({ length: 20_000 }, () => ["2026-10-05", "x".repeat(100)]);
    expect(() => loteIndicadores(fontes)).toThrow("excedem");
  });
});
