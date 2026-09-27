// Estado público da integração de saídas, para o botão da vista Saídas.
import { lerEstadoSaidas } from "@/application/planilha-saidas";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ estado: await lerEstadoSaidas() });
  });
}
