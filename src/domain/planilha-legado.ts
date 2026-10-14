// Contratos da conferência de alunos e marcas antes da retirada de uma aba antiga.
import { z } from "zod";
import { mesValido } from "./planilha-mensal";

const mes = z.string().refine(mesValido);
const linha = z.number().int().min(2).max(2000);
const esquemaResolucaoAntiga = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("aluno"), mes, linhaAntiga: linha, linhaMensal: linha }).strict(),
  z
    .object({
      tipo: z.literal("frequencia"),
      mes,
      celulaAntiga: z.string().regex(/^[A-Z]{1,3}[1-9][0-9]{0,3}$/),
      manter: z.enum(["antiga", "mensal"]),
    })
    .strict(),
  z.object({ tipo: z.literal("adicionar-aluno"), mes, linhaAntiga: linha }).strict(),
]);
export type ResolucaoAntiga = z.infer<typeof esquemaResolucaoAntiga>;
export const esquemaResolucoesAntigas = z
  .array(esquemaResolucaoAntiga)
  .max(5000)
  .refine(
    (itens) => new Set(itens.map(chaveResolucaoAntiga)).size === itens.length,
    "Há escolhas repetidas para a mesma pendência.",
  );

export function chaveResolucaoAntiga(item: ResolucaoAntiga): string {
  return item.tipo !== "frequencia"
    ? `aluno:${item.mes}:${item.linhaAntiga}`
    : `frequencia:${item.mes}:${item.celulaAntiga}`;
}

interface LocalAntigo {
  aba: string;
  celula: string;
  url: string;
}
interface PendenciaBase {
  id: string;
  mes: string;
  aluno: string;
  mensagem: string;
  origem: LocalAntigo;
  destino: LocalAntigo;
}
export type PendenciaAntiga =
  | (PendenciaBase & {
      tipo: "aluno";
      linhaAntiga: number;
      opcoes: { linha: number; nome: string; url: string }[];
    })
  | (PendenciaBase & {
      tipo: "frequencia";
      dia: string;
      antiga: string;
      mensal: string;
    });

export interface ComplementosAntigos {
  formulas: number;
  notas: number;
  totais: number;
  amostras: { celula: string; tipo: "fórmula" | "nota" | "total" }[];
}

export interface PreviaAntiga {
  aba: string;
  impressao: string;
  preenchidas: number;
  conferidas: number;
  substituidas: number;
  mantidas: number;
  resolucoesAplicadas: number;
  alunosIncluidos: number;
  pendencias: PendenciaAntiga[];
  totalPendencias: number;
  complementos: ComplementosAntigos;
  urlAntiga: string;
  destinos: { mes: string; aba: string }[];
  removida: boolean;
}
