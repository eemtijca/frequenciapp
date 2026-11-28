// Busca de endereço ou cidade para a origem da rota. Não grava o texto nem o ponto.
import { buscarOrigemDaRota } from "@/application/rota-da-prova";
import { executarRota, exigirIdentidade, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirIdentidade();
    if (!sessao.ok) return sessao.resposta;
    const consulta = new URL(requisicao.url).searchParams.get("q") ?? "";
    return json({ lugares: await buscarOrigemDaRota(sessao.usuario, consulta) });
  });
}
