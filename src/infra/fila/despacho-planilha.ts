// Despacho da fila de planilhas conforme o transporte configurado.
import { ambiente } from "@/infra/ambiente";
import { banco } from "@/infra/banco";
import { processarFilaDaAgenda } from "@/application/fila-planilha";
import type { ResumoDoProcessamento } from "@/domain/fila-planilha";
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
import { publicarCabecaDaFila } from "./planilha";

/** Publica a cabeça no BullMQ ou processa direto, conforme o transporte. */
export async function despacharFilaPlanilha(
  opcoes: { limite?: number } = {},
): Promise<ResumoDoProcessamento> {
  if (ambiente.fila?.planilhaTransporte === "bullmq") {
    await despacharIntencoesEscolares().catch(() =>
      console.error("Intenções escolares aguardam nova tentativa."),
    );
    await publicarCabecaDaFila();
    const [abertos, proximo] = await Promise.all([
      banco().filaPlanilha.count({
        where: { estado: { in: ["AGUARDANDO", "EM_ANDAMENTO"] } },
      }),
      banco().filaPlanilha.findFirst({
        where: { estado: "AGUARDANDO", proximaTentativaEm: { not: null } },
        orderBy: { proximaTentativaEm: "asc" },
        select: { proximaTentativaEm: true },
      }),
    ]);
    return {
      processados: 0,
      concluidos: 0,
      falhas: 0,
      abertos,
      aguardandoAte: proximo?.proximaTentativaEm?.toISOString() ?? null,
      despachado: true,
    };
  }
  const resultado = await processarFilaDaAgenda(opcoes);
  return { ...resultado.resumo, despachado: false };
}
