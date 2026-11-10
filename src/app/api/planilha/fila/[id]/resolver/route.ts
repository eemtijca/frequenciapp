// Resolução explícita de conferência pela administração, sem reenviar qualquer dado.
import { resolverConferenciaItem } from "@/application/fila-conferencia";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";
export const dynamic = "force-dynamic";
export async function POST(
  requisicao: Request,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Item da fila inválido.", 400);
    await resolverConferenciaItem(sessao.usuario, id, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
