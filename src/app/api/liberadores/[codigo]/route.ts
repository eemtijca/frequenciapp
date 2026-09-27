// Edição e exclusão de quem libera a saída, pela administração.
import { atualizarLiberador, removerLiberador } from "@/application/liberadores";
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
    if (!codigo || codigo.length > 20) return erroApi("Responsável pela liberação inválido.", 400);
    const liberador = await atualizarLiberador(sessao.usuario, codigo, await corpoJson(requisicao));
    return json({ liberador });
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { codigo } = await contexto.params;
    if (!codigo || codigo.length > 20) return erroApi("Responsável pela liberação inválido.", 400);
    await removerLiberador(sessao.usuario, codigo);
    return json({ ok: true });
  });
}
