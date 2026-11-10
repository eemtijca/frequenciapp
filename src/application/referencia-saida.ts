// Valida o retrato mínimo da saída, incluindo identidade e horários válidos.
import { z } from "zod";
import { ehHoraValida } from "@/domain/frequencia";
export const esquemaAulasReferencia = z
  .object({
    versao: z.literal(1),
    aulas: z
      .array(
        z
          .object({
            id: z.uuid(),
            ordem: z.number().int().min(1).max(99),
            inicio: z.string().refine(ehHoraValida),
            fim: z.string().refine(ehHoraValida),
          })
          .strict(),
      )
      .max(99),
  })
  .strict()
  .refine(
    ({ aulas }) =>
      new Set(aulas.map((a) => a.id)).size === aulas.length &&
      new Set(aulas.map((a) => a.ordem)).size === aulas.length &&
      aulas.every((a) => a.inicio < a.fim),
    "Aulas de referência incoerentes.",
  );
export const camposReferenciaSaida = {
  turmaHistoricaId: z.uuid().nullish(),
  turmaHistoricaNome: z.string().trim().min(1).max(200).nullish(),
  aulasReferencia: esquemaAulasReferencia.nullish(),
  origemReferencia: z.enum(["MATRICULA_VIGENTE", "CHAMADA_HISTORICA", "DESCONHECIDA"]).optional(),
};
export function referenciaSaidaCoerente(dados: {
  turmaHistoricaId?: string | null;
  turmaHistoricaNome?: string | null;
  aulasReferencia?: unknown;
  origemReferencia?: string;
}): boolean {
  if (Boolean(dados.turmaHistoricaId) !== Boolean(dados.turmaHistoricaNome)) return false;
  if (dados.origemReferencia === "DESCONHECIDA" || dados.origemReferencia === undefined)
    return dados.aulasReferencia == null;
  return Boolean(dados.turmaHistoricaId && dados.turmaHistoricaNome && dados.aulasReferencia);
}
