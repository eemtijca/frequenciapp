// Confirmação manual e auditada do lançamento da revisão corrente na Seduc.
import { confirmarSeduc } from "@/application/frequencia-parcial";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Registro parcial inválido.", 400);
    return json({
      registro: await confirmarSeduc(sessao.usuario, id, await corpoJson(requisicao)),
    });
  });
}
