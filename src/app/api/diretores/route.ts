// Diretores de turma: lista e cadastro pela administração, com auditoria.
import { criarDiretor, listarDiretores } from "@/application/diretores";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ diretores: await listarDiretores() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const diretor = await criarDiretor(sessao.usuario, await corpoJson(requisicao));
    return json({ diretor }, 201);
  });
}
