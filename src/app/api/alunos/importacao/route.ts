// Importação das relações de turma pela administração: prévia ou aplicação.
import { importarRelacoes } from "@/application/importacao-alunos";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await importarRelacoes(sessao.usuario, await corpoJson(requisicao)));
  });
}
