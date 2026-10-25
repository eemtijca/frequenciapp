// Conferência manual das aulas concluídas antes de uma saída antecipada.
import { confirmarSaidaSeduc } from "@/application/saidas-parciais";
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
    if (!ehUuid(id)) return erroApi("Saída inválida.", 400);
    return json({
      registro: await confirmarSaidaSeduc(sessao.usuario, id, await corpoJson(requisicao)),
    });
  });
}
