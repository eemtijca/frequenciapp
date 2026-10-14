// Personalização versionada e importação estrita; segredos e dados escolares nunca são exportados.
import { z } from "zod";
import { esquemaGraficoBi, esquemaFiltrosBi } from "./bi-analise";
const esquemaPainel = z
  .object({
    id: z.string().min(1).max(80),
    nome: z.string().min(1).max(100),
    graficos: z.array(esquemaGraficoBi).max(40),
    filtros: esquemaFiltrosBi,
    anotacao: z.string().max(2000).default(""),
  })
  .strict()
  .refine(
    (p) => new Set(p.graficos.map((g) => g.id)).size === p.graficos.length,
    "Há gráficos repetidos no painel.",
  );
export type PainelBi = z.infer<typeof esquemaPainel>;
export const esquemaPersonalizacaoBi = z
  .object({
    versao: z.literal(2),
    visoes: z.array(esquemaGraficoBi).max(200),
    paineis: z.array(esquemaPainel).max(50),
    preferencias: z
      .object({
        filtros: esquemaFiltrosBi,
        aba: z
          .enum(["geral", "faltas", "movimentos", "parciais", "explorador", "paineis", "ajuda"])
          .default("geral"),
        painelPadrao: z.string().max(80).default(""),
        explorador: esquemaGraficoBi.optional(),
      })
      .strict(),
  })
  .strict()
  .refine(
    (p) =>
      new Set(p.paineis.map((g) => g.id)).size === p.paineis.length &&
      new Set(p.visoes.map((g) => g.id)).size === p.visoes.length,
    "Há identificadores repetidos nas configurações.",
  );
export type PersonalizacaoBi = z.infer<typeof esquemaPersonalizacaoBi>;
export function personalizacaoVaziaBi(): PersonalizacaoBi {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = String(hoje.getMonth() + 1).padStart(2, "0");
  const fim = new Date(Date.UTC(ano, hoje.getMonth() + 1, 0)).getUTCDate();
  return esquemaPersonalizacaoBi.parse({
    versao: 2,
    visoes: [],
    paineis: [],
    preferencias: { filtros: { inicio: `${ano}-${mes}-01`, fim: `${ano}-${mes}-${fim}` } },
  });
}
export function migrarPersonalizacaoBi(entrada: unknown): PersonalizacaoBi {
  if (entrada && typeof entrada === "object" && "versao" in entrada && entrada.versao === 1) {
    const antiga = z
      .object({
        versao: z.literal(1),
        visoes: z.array(esquemaGraficoBi).max(200),
        paineis: z.array(esquemaPainel).max(50),
        filtros: esquemaFiltrosBi,
      })
      .strict()
      .parse(entrada);
    return esquemaPersonalizacaoBi.parse({
      versao: 2,
      visoes: antiga.visoes,
      paineis: antiga.paineis,
      preferencias: { filtros: antiga.filtros },
    });
  }
  return esquemaPersonalizacaoBi.parse(entrada);
}
export function exportarPersonalizacaoBi(entrada: PersonalizacaoBi) {
  return JSON.stringify(esquemaPersonalizacaoBi.parse(entrada), null, 2);
}
