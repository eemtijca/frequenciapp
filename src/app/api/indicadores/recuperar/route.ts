// Operação administrativa da planilha dedicada ao painel externo.
import { recuperarIndicadores } from "@/application/indicadores";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida, corpoJson } from "@/infra/http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(requisicao: Request) {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await recuperarIndicadores(await corpoJson(requisicao), sessao.usuario.id));
  });
}
