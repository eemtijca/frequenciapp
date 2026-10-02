// Chamada parcial: enviar com guarda de acesso, origem e resposta sem cache.
import { enviarParciais } from "@/application/planilha-parcial";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";
export const dynamic = "force-dynamic";
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await enviarParciais(sessao.usuario, await corpoJson(requisicao)));
  });
}
