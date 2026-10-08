// Descarta um item que ainda aguarda a vez na fila.
import { descartarItem } from "@/application/fila-planilha";
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
    if (!ehUuid(id)) return erroApi("Item da fila inválido.", 400);
    await descartarItem(sessao.usuario, id);
    return json({ ok: true });
  });
}
