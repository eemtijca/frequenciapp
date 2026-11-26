// PDF da Grade: sessão da operação, origem confiável e retrato de uma leitura.
import { prepararPdfDaGrade } from "@/application/relatorio-grade";
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
    return json(await prepararPdfDaGrade(sessao.usuario, await corpoJson(requisicao)));
  });
}
