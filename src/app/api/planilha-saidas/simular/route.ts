// Prévia do envio das saídas para a planilha, sem gravar nada.
import { simularEnvioSaidas } from "@/application/planilha-saidas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await simularEnvioSaidas(sessao.usuario, await corpoJson(requisicao)));
  });
}
