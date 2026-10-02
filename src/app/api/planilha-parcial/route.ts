// Configuração administrativa do terceiro arquivo de chamada parcial.
import {
  lerIntegracaoParcialAdmin,
  salvarIntegracaoParcial,
  desconectarPlanilhaParcial,
} from "@/application/planilha-parcial";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ integracao: await lerIntegracaoParcialAdmin() });
  });
}
export async function PATCH(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({
      integracao: await salvarIntegracaoParcial(sessao.usuario, await corpoJson(requisicao)),
    });
  });
}
export async function DELETE(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ integracao: await desconectarPlanilhaParcial(sessao.usuario) });
  });
}
