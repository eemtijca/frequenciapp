// Edição e exclusão de uma justificativa do catálogo, pela administração.
import { atualizarJustificativa, removerJustificativa } from "@/application/justificativas";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ codigo: string }>;
}

export async function PATCH(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { codigo } = await contexto.params;
    if (!codigo || codigo.length > 20) return erroApi("Justificativa inválida.", 400);
    const justificativa = await atualizarJustificativa(
      sessao.usuario,
      codigo,
      await corpoJson(requisicao),
    );
    return json({ justificativa });
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { codigo } = await contexto.params;
    if (!codigo || codigo.length > 20) return erroApi("Justificativa inválida.", 400);
    await removerJustificativa(sessao.usuario, codigo);
    return json({ ok: true });
  });
}
