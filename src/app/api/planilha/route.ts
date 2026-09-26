// Configuração da integração com a planilha: leitura e edição pela
// administração, com auditoria.
import { lerIntegracaoAdmin, salvarIntegracao } from "@/application/planilha";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ integracao: await lerIntegracaoAdmin() });
  });
}

export async function PATCH(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const integracao = await salvarIntegracao(sessao.usuario, await corpoJson(requisicao));
    return json({ integracao });
  });
}
