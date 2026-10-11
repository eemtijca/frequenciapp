// Contratos públicos do FrequenciBI: recursos escolares, escopos e leitura paginada.
import { z } from "zod";

export const RECURSOS_BI = [
  "series",
  "turmas",
  "alunos",
  "horarios",
  "justificativas",
  "liberadores",
  "feriados",
  "chamadas",
  "faltas",
  "lista",
  "saidas",
  "entradas",
  "parciais",
  "contexto",
] as const;
export type RecursoBi = (typeof RECURSOS_BI)[number];
export const ROTULOS_RECURSOS_BI: Record<RecursoBi, string> = {
  series: "Séries",
  turmas: "Turmas",
  alunos: "Alunos",
  horarios: "Aulas e disciplinas",
  justificativas: "Justificativas",
  liberadores: "Liberadores",
  feriados: "Feriados",
  chamadas: "Chamadas",
  faltas: "Faltas por aula",
  lista: "Lista da chamada e Seduc",
  saidas: "Saídas",
  entradas: "Entradas",
  parciais: "Chamada Parcial",
  contexto: "Contexto",
};
export const esquemaDiaBi = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((dia) => {
    const data = new Date(`${dia}T12:00:00Z`);
    return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === dia;
  }, "Data inválida.");
export const esquemaEscopoBi = z
  .object({
    series: z.array(z.string().uuid()).max(100).optional(),
    turmas: z.array(z.string().uuid()).max(100).optional(),
    inicio: esquemaDiaBi.optional(),
    fim: esquemaDiaBi.optional(),
    recursos: z.array(z.enum(RECURSOS_BI)).max(RECURSOS_BI.length).optional(),
  })
  .strict()
  .refine((e) => !e.inicio || !e.fim || e.inicio <= e.fim, "Confira o período do escopo.");
export type EscopoBi = z.infer<typeof esquemaEscopoBi>;
export type ValorBi = string | number | boolean | null | number[];
export interface LinhaBi {
  id: string;
  [campo: string]: ValorBi;
}
export interface PaginaBi {
  recurso: RecursoBi | "acesso";
  linhas: LinhaBi[];
  pagina: number;
  proximaPagina: number | null;
  consultadoEm: string;
  escopo: EscopoBi;
  recursos: RecursoBi[];
}
export interface ChaveBi {
  id: string;
  rotulo: string;
  criadaEm: string;
  expiraEm: string | null;
  revogadaEm: string | null;
  primeiroUsoEm: string | null;
  ultimoUsoEm: string | null;
  usos: number;
  escopo: EscopoBi;
  estado: "ativa" | "expirada" | "revogada";
  inativa: boolean;
}
export function estadoChaveBi(
  chave: { revogadaEm: Date | null; expiraEm: Date | null },
  agora = new Date(),
): ChaveBi["estado"] {
  return chave.revogadaEm
    ? "revogada"
    : chave.expiraEm && chave.expiraEm <= agora
      ? "expirada"
      : "ativa";
}
export function recursoPermitidoBi(escopo: EscopoBi, recurso: RecursoBi): boolean {
  return !escopo.recursos || escopo.recursos.includes(recurso);
}
/** Interseção obrigatória, inclusive quando o pedido tenta ampliar o período. */
export function periodoBi(escopo: EscopoBi, inicio?: string, fim?: string) {
  const de = [escopo.inicio, inicio]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(-1);
  const ate = [escopo.fim, fim]
    .filter((v): v is string => Boolean(v))
    .sort()
    .at(0);
  return { inicio: de, fim: ate, vazio: Boolean(de && ate && de > ate) };
}

const comum = { senha: z.string().min(1).max(200) };
const cadastro = {
  rotulo: z.string().trim().min(1).max(80),
  escopo: esquemaEscopoBi,
  expiraEm: z.string().datetime().nullable(),
};
const id = { id: z.string().uuid() };
export const esquemaAcaoChaveBi = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("criar"), ...comum, ...cadastro }).strict(),
  z.object({ acao: z.literal("editar"), ...comum, ...id, ...cadastro }).strict(),
  z.object({ acao: z.literal("rotacionar"), ...comum, ...id }).strict(),
  z.object({ acao: z.literal("revogar"), ...comum, ...id }).strict(),
  z.object({ acao: z.literal("revogar-todas"), ...comum }).strict(),
  z.object({ acao: z.literal("limpar"), ...comum }).strict(),
]);
