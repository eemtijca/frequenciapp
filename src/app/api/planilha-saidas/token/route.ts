// Token da integração de saídas: gerar um novo ou revelar o atual, com senha.
import { gerarTokenSaidas, revelarTokenSaidas } from "@/application/planilha-saidas";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const corpo = (await corpoJson(requisicao)) as { acao?: string } | null;
    if (corpo?.acao === "revelar") {
      return json(await revelarTokenSaidas(sessao.usuario, corpo));
    }
    return json(await gerarTokenSaidas(sessao.usuario, corpo));
  });
}
