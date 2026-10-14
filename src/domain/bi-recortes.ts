// Recortes do BI compatíveis com cada base, com totais por chamada derivados da lista histórica.
import { enriquecerBi, filtrarBi, numeroBi, type DadosBi, type FiltrosBi } from "./bi-analise";
import type { LinhaBi, RecursoBi } from "./bi";

export type RecorteBi =
  | { disponivel: true; linhas: LinhaBi[]; filtros: FiltrosBi; fonte: RecursoBi }
  | { disponivel: false; motivo: string };

const TOTAIS_CHAMADA = [
  "registrados",
  "presentes",
  "faltas",
  "justificadas",
  "ausencias",
  "presencaParcial",
] as const;

export function exigeListaBi(recurso: RecursoBi, filtros: FiltrosBi) {
  return (
    recurso === "chamadas" &&
    Boolean(filtros.alunoId || filtros.busca || filtros.situacao || filtros.tipo)
  );
}

export function resolverRecorteBi(
  dados: DadosBi,
  recurso: RecursoBi,
  filtros: FiltrosBi,
): RecorteBi {
  if (filtros.justificativa && !["faltas", "saidas", "entradas"].includes(recurso))
    return {
      disponivel: false,
      motivo: "Esta base não permite recorte por justificativa.",
    };
  if (filtros.turno && recurso !== "parciais")
    return { disponivel: false, motivo: "Esta base não permite recorte por turno." };
  if (filtros.tipo && !["chamadas", "faltas", "lista", "parciais"].includes(recurso))
    return { disponivel: false, motivo: "Esta base não permite recorte por tipo de frequência." };

  if (exigeListaBi(recurso, filtros)) {
    if (!dados.lista)
      return {
        disponivel: false,
        motivo: "A lista da chamada é necessária para calcular este recorte.",
      };
    if (filtros.situacao && !dados.alunos)
      return {
        disponivel: false,
        motivo: "O cadastro de alunos é necessário para conferir a situação atual.",
      };
    const candidatos = filtrarBi(dados.lista, {
      ...filtros,
      alunoId: "",
      busca: "",
      situacao: "",
    });
    if (
      (filtros.alunoId && candidatos.some((l) => typeof l.alunoId !== "string")) ||
      (filtros.busca && candidatos.some((l) => typeof l.aluno !== "string"))
    )
      return {
        disponivel: false,
        motivo: "A lista não identifica os alunos. Atualize os dados para calcular o recorte.",
      };
    if (filtros.situacao) {
      const cadastrados = new Set((dados.alunos ?? []).map((a) => a.id));
      if (candidatos.some((l) => !cadastrados.has(String(l.alunoId))))
        return {
          disponivel: false,
          motivo: "A situação atual de alguns alunos não está disponível neste recorte.",
        };
    }
    const lista = enriquecerBi({ lista: dados.lista, alunos: dados.alunos }).lista ?? [];
    const chamadas = new Map<string, LinhaBi>();
    for (const linha of filtrarBi(lista, filtros)) {
      if (typeof linha.frequenciaId !== "string" || !linha.frequenciaId)
        return {
          disponivel: false,
          motivo: "A lista não identifica a chamada. Atualize os dados para calcular o recorte.",
        };
      let chamada = chamadas.get(linha.frequenciaId);
      if (!chamada) {
        chamada = { id: linha.frequenciaId };
        for (const campo of [
          "dia",
          "turmaId",
          "turma",
          "serieId",
          "serie",
          "autoria",
          "criadoPorNome",
          "atualizadoPorNome",
        ]) {
          const valor = linha[campo];
          if (valor !== undefined) chamada[campo] = valor;
        }
        for (const campo of TOTAIS_CHAMADA) chamada[campo] = 0;
        chamadas.set(linha.frequenciaId, chamada);
      }
      for (const campo of TOTAIS_CHAMADA)
        chamada[campo] = numeroBi(chamada[campo]) + numeroBi(linha[campo]);
    }
    return {
      disponivel: true,
      linhas: [...chamadas.values()],
      filtros: { ...filtros, alunoId: "", busca: "", situacao: "", tipo: "" },
      fonte: "lista",
    };
  }
  if (!dados[recurso])
    return { disponivel: false, motivo: "Esta base não está disponível neste recorte." };
  if (filtros.situacao && recurso !== "alunos" && !dados.alunos)
    return {
      disponivel: false,
      motivo: "O cadastro de alunos é necessário para conferir a situação atual.",
    };
  if (
    (filtros.alunoId || filtros.busca || filtros.situacao) &&
    !["alunos", "faltas", "lista", "saidas", "entradas", "parciais"].includes(recurso)
  )
    return { disponivel: false, motivo: "Esta base não permite recorte por aluno." };
  return { disponivel: true, linhas: dados[recurso], filtros, fonte: recurso };
}
