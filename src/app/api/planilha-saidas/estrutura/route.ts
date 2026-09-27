// Leitura das abas da planilha de saídas e sugestão da aba de registro.
import { lerEstruturaSaidas } from "@/application/planilha-saidas";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await lerEstruturaSaidas());
  });
}
