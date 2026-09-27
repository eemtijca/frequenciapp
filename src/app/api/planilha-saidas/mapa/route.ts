// Aba única de saídas e colunas reconhecidas, salvas junto do esquema lido.
import { salvarMapaSaidas } from "@/application/planilha-saidas";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const integracao = await salvarMapaSaidas(sessao.usuario, await corpoJson(requisicao));
    return json({ integracao });
  });
}
