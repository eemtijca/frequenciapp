// Alunos de uma prova específica: define a lista completa de inscritos.
import { definirParticipantes, lerProvaEspecifica } from "@/application/provas-especificas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PUT(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    await definirParticipantes(sessao.usuario, id, await corpoJson(requisicao));
    return json(await lerProvaEspecifica(id));
  });
}
