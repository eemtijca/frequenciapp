// Volta ao modo conservador. Qualquer sessão pode encerrar a janela.
import { desativarModoCompleto } from "@/application/planilha";
import { erroApi, executarRota, exigirSessao, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await desativarModoCompleto(sessao.usuario));
  });
}
