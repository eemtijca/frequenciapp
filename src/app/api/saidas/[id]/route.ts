// Remoção de uma saída antecipada para correção.
import { removerSaida } from "@/application/saidas";
import { ehUuid, erroApi, executarRota, exigirSessao, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Saída inválida.", 400);
    await removerSaida(sessao.usuario, id);
    return json({ ok: true });
  });
}
