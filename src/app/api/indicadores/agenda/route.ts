// Atualiza o retrato agregado pela agenda. Com a fila habilitada, grava a
// intenção e deixa o worker executar; sem a fila, mantém o caminho direto.
import { atualizarIndicadores } from "@/application/indicadores";
import { despacharTrabalhosPendentes, enfileirarTrabalho } from "@/application/fila-trabalhos";
import { ambiente } from "@/infra/ambiente";
import { publicarTrabalho } from "@/infra/fila/bullmq";
import { comTransacao } from "@/infra/transacoes";
import { janelaDeCincoMinutos } from "@/domain/trabalho";
import { segredoDaAgendaConfere } from "@/infra/web-push";
import { erroApi, executarRota, json } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const tipoLiberado =
  ambiente.fila.tiposHabilitados.length === 0 ||
  ambiente.fila.tiposHabilitados.includes("INDICADORES_ATUALIZAR");

export async function GET(requisicao: Request) {
  return executarRota(async () => {
    if (!segredoDaAgendaConfere(requisicao.headers.get("authorization")))
      return erroApi("Acesso não permitido.", 403);
    if (ambiente.fila.trabalhosHabilitada && ambiente.fila.driver === "redis" && tipoLiberado) {
      const trabalhoId = await comTransacao((tx) =>
        enfileirarTrabalho(tx, {
          tipo: "INDICADORES_ATUALIZAR",
          payload: { janela: janelaDeCincoMinutos(new Date()) },
          origem: "agenda",
        }),
      );
      await despacharTrabalhosPendentes(publicarTrabalho).catch(() =>
        console.error("Os indicadores aguardam nova tentativa de despacho."),
      );
      return json({ trabalhoId, despachado: true }, 202);
    }
    return json(await atualizarIndicadores({ agenda: true }));
  });
}
