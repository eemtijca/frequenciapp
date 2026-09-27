// Edição de um diretor de turma: nome, situação e turmas acompanhadas.
import { atualizarDiretor } from "@/application/diretores";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    const diretor = await atualizarDiretor(sessao.usuario, id, await corpoJson(requisicao));
    return json({ diretor });
  });
}
