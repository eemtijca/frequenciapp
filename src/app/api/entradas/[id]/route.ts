// Correção de entrada atrasada com remoção auditada.
import { removerEntrada } from "@/application/entradas";
import { ehUuid, erroApi, executarRota, exigirSessao, json, origemPermitida } from "@/infra/http";

export async function DELETE(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Entrada inválida.", 400);
    await removerEntrada(sessao.usuario, id);
    return json({ ok: true });
  });
}
