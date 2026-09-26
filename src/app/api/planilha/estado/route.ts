// Estado público da integração com a planilha, para o selo e o envio da Grade.
import { lerEstadoPlanilha } from "@/application/planilha";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ estado: await lerEstadoPlanilha() });
  });
}
