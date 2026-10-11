// Administração de chaves com sessão, origem própria e senha em todas as mutações.
import { administrarChaveBi, listarChavesBi } from "@/application/chaves-bi";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ chaves: await listarChavesBi() });
  });
}
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await administrarChaveBi(sessao.usuario, await corpoJson(requisicao)));
  });
}
