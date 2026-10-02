// Remoção de frequência parcial com verificação da revisão e auditoria.
import { removerFrequenciaParcial } from "@/application/frequencia-parcial";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export async function DELETE(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Registro parcial inválido.", 400);
    await removerFrequenciaParcial(sessao.usuario, id, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
