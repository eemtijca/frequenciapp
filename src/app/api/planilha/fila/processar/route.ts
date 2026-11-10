// Processa a fila agora, a pedido da administração, incluindo intenções ainda não despachadas.
import { processarFila } from "@/application/fila-planilha";
import { despacharIntencoesEscolares } from "@/application/outbox-escolar";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    await despacharIntencoesEscolares().catch(() =>
      console.error("Intenções escolares aguardam nova tentativa."),
    );
    return json(await processarFila({ limite: 20 }));
  });
}
