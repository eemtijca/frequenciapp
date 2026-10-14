// Links de análise não herdam filtros pessoais do navegador que recebe o endereço.
import { describe, expect, it } from "vitest";
import { esquemaFiltrosBi } from "@/domain/bi-analise";
import { receberFiltrosBi } from "@/domain/bi-compartilhamento";

const locais = esquemaFiltrosBi.parse({
  inicio: "2026-09-01",
  fim: "2026-09-30",
  serieId: "qa-serie",
  turmaId: "qa-turma",
  alunoId: "qa-aluno",
  busca: "QA Nome",
  justificativa: "QA Motivo",
  tipo: "F",
  turno: "TARDE",
  situacao: "ativo",
});

describe("recortes compartilhados do BI", () => {
  it("abre o período de toda a escola limpando filtros anteriores sem alterar a configuração recebida", () => {
    const antes = JSON.stringify(locais);
    const recebido = receberFiltrosBi(
      locais,
      new URLSearchParams("inicio=2026-10-01&fim=2026-10-31"),
    );
    expect(recebido.temCompartilhados).toBe(true);
    expect(recebido.resultado.success).toBe(true);
    if (!recebido.resultado.success) return;
    expect(recebido.resultado.data).toEqual(
      esquemaFiltrosBi.parse({ inicio: "2026-10-01", fim: "2026-10-31" }),
    );
    expect(JSON.stringify(locais)).toBe(antes);
  });

  it("preserva somente recortes explícitos permitidos e rejeita busca pessoal na URL", () => {
    const recebido = receberFiltrosBi(
      locais,
      new URLSearchParams("serieId=qa-outra&busca=QA%20Externo&chave=segredo"),
    );
    expect(recebido.resultado.success).toBe(true);
    if (!recebido.resultado.success) return;
    expect(recebido.resultado.data).toEqual(
      esquemaFiltrosBi.parse({ inicio: locais.inicio, fim: locais.fim, serieId: "qa-outra" }),
    );
  });

  it("mantém preferências ao abrir sem link e rejeita período inválido sem substituí-las", () => {
    const normal = receberFiltrosBi(locais, new URLSearchParams());
    expect(normal.temCompartilhados).toBe(false);
    expect(normal.resultado.success && normal.resultado.data).toEqual(locais);
    expect(
      receberFiltrosBi(locais, new URLSearchParams("inicio=2026-11-01&fim=2026-10-01")).resultado
        .success,
    ).toBe(false);
  });
});
