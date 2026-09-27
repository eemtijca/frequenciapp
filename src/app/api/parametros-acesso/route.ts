// Parâmetros de acesso: validade da palavra-chave, sessão do diretor, limites
// de tentativa, categorias visíveis e limite de risco. Só a administração.
import { atualizarParametrosAcesso, lerParametrosAcesso } from "@/application/parametros-acesso";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ parametros: await lerParametrosAcesso() });
  });
}

export async function PATCH(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const parametros = await atualizarParametrosAcesso(sessao.usuario, await corpoJson(requisicao));
    return json({ parametros });
  });
}
