// Processa a fila agora, a pedido da administração, incluindo intenções ainda não despachadas.
import { despacharFilaPlanilha } from "@/infra/fila/despacho-planilha";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const resumo = await despacharFilaPlanilha({ limite: 20 });
    return json(resumo);
  });
}
