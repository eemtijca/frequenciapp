// Despacho da fila de planilhas conforme o transporte configurado.
import { ambiente } from "@/infra/ambiente";
import { processarFilaDaAgenda, type ResultadoDoProcessamento } from "@/application/fila-planilha";
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
import { publicarCabecaDaFila } from "./planilha";

export async function despacharFilaPlanilha(): Promise<ResultadoDoProcessamento["resumo"] | null> {
  if (ambiente.fila.planilhaTransporte === "bullmq") {
    await despacharIntencoesEscolares().catch(() =>
      console.error("Intenções escolares aguardam nova tentativa."),
    );
    await publicarCabecaDaFila();
    return null;
  }
  return (await processarFilaDaAgenda()).resumo;
}
