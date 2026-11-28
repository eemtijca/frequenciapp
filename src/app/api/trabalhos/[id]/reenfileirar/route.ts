// Reenfileira um trabalho com falha ou cancelado, com auditoria.
import { reenfileirarTrabalho } from "@/application/fila-trabalhos";
import { ehUuid, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function POST(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Trabalho inválido.", 400);
    await reenfileirarTrabalho(id, sessao.usuario.id);
    return json({ ok: true });
  });
}
