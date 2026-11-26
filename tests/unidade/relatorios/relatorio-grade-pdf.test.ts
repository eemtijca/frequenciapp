// Fumaça da geração do PDF: o adaptador devolve um arquivo PDF válido
// a partir do modelo do retrato, sem depender do servidor.
import { describe, expect, it } from "vitest";
import { gerarRelatorioGradePdf } from "@/lib/relatorio-grade-pdf";
import type { RelatorioGrade, RetratoGrade } from "@/domain/relatorio-grade";

const relatorio: RelatorioGrade = {
  versao: 1,
  turmaOriginalId: "turma-a",
  turmaOriginal: "1º ano A",
  de: "2026-09-01",
  ate: "2026-09-30",
  dias: ["2026-09-01", "2026-09-02"],
  alunos: [
    {
      alunoId: "aluno-a",
      nome: "Aluno Ação",
      turmaAtual: "1º ano B",
      desistente: false,
      faltas: 1,
      justificadas: 1,
      parciais: 1,
      diasComRegistro: 2,
      totalHistorico: 4,
      ocorrencias: [
        {
          dia: "2026-09-01",
          marca: "F",
          aulasPrevistas: 3,
          aulasFaltadas: 3,
          aulasFaltadasRotulos: ["1ª aula · 07:00 às 07:50"],
          justificativas: [],
          referenciaAulas: "retrato",
        },
        {
          dia: "2026-09-02",
          marca: "FJ",
          aulasPrevistas: 3,
          aulasFaltadas: 3,
          aulasFaltadasRotulos: [],
          justificativas: ["Doente"],
          referenciaAulas: "retrato",
        },
      ],
    },
    {
      alunoId: "aluno-b",
      nome: "Aluno Sem Falta",
      turmaAtual: "1º ano A",
      desistente: false,
      faltas: 0,
      justificadas: 0,
      parciais: 0,
      diasComRegistro: 2,
      totalHistorico: 0,
      ocorrencias: [],
    },
  ],
  totais: { alunos: 2, faltas: 1, justificadas: 1, parciais: 1 },
};

const retrato: RetratoGrade["retrato"] = {
  em: "2026-09-30T14:00:00.000Z",
  emTexto: "30/09/2026, 11:00:00",
  fuso: "America/Fortaleza",
  hash: "a".repeat(64),
};

describe("gerarRelatorioGradePdf", () => {
  it("gera um PDF com assinatura e conteúdo", async () => {
    const blob = await gerarRelatorioGradePdf(relatorio, retrato);
    expect(blob.type).toBe("application/pdf");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
