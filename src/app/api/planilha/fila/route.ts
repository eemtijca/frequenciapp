// Estado da fila de envios automáticos às planilhas, para a administração.
import { lerEstadoDaFila } from "@/application/fila-planilha";
import { executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await lerEstadoDaFila());
  });
}
