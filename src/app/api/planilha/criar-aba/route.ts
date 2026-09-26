// Criação de aba nova com o cabeçalho mínimo, para uma turma sem aba.
import { criarAba } from "@/application/planilha";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await criarAba(sessao.usuario, await corpoJson(requisicao)));
  });
}
