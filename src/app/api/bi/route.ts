// Endpoint exclusivo de leitura por chave; o cookie do aplicativo não concede acesso.
import { exigirChaveBi } from "@/application/chaves-bi";
import { lerDadosBi } from "@/application/leitura-bi";
import { executarRota, json } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const hash = await exigirChaveBi(requisicao);
    const resposta = json(await lerDadosBi(hash, requisicao));
    resposta.headers.set("Vary", "Authorization");
    resposta.headers.set("X-Robots-Tag", "noindex, nofollow");
    return resposta;
  });
}
