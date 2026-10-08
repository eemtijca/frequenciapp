// Configuração administrativa das fontes externas de indicadores.
import { configurarIndicadores, lerIndicadores } from "@/application/indicadores";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function GET() {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await lerIndicadores());
  });
}
export async function PATCH(requisicao: Request) {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await configurarIndicadores(await corpoJson(requisicao), sessao.usuario.id));
  });
}
