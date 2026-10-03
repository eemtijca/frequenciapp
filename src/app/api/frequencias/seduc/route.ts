// Confirmação manual da Seduc por aluno da chamada salva, restrita à equipe.
import { confirmarSeducChamada } from "@/application/seduc-chamada";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({
      confirmacao: await confirmarSeducChamada(sessao.usuario, await corpoJson(requisicao)),
    });
  });
}
