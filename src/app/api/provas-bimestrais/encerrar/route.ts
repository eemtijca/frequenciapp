// Encerramento do período de provas: apaga o horário de provas de todas as turmas, com confirmação.
import { encerrarProvasBimestrais } from "@/application/provas-bimestrais";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await encerrarProvasBimestrais(sessao.usuario, await corpoJson(requisicao)));
  });
}
