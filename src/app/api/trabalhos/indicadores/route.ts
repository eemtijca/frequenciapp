// Enfileira a atualização dos indicadores para o worker dedicado.
import { despacharTrabalhosPendentes, enfileirarTrabalho } from "@/application/fila-trabalhos";
import { ambiente } from "@/infra/ambiente";
import { publicarTrabalho } from "@/infra/fila/bullmq";
import { comTransacao } from "@/infra/transacoes";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    if (!ambiente.fila.trabalhosHabilitada || ambiente.fila.driver !== "redis")
      return erroApi("A fila de trabalhos não está habilitada nesta instalação.", 409);
    if (
      ambiente.fila.tiposHabilitados.length > 0 &&
      !ambiente.fila.tiposHabilitados.includes("INDICADORES_ATUALIZAR")
    )
      return erroApi("A atualização de indicadores não está liberada na fila.", 409);
    const trabalhoId = await comTransacao((tx) =>
      enfileirarTrabalho(tx, {
        tipo: "INDICADORES_ATUALIZAR",
        payload: {},
        origem: "admin",
        autorId: sessao.usuario.id,
      }),
    );
    await despacharTrabalhosPendentes(publicarTrabalho).catch(() =>
      console.error("O trabalho aguarda nova tentativa de despacho."),
    );
    return json({ trabalhoId }, 202);
  });
}
