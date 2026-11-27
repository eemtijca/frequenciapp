// Uma prova específica: leitura com os alunos, edição de nome, local e data, e remoção.
import {
  editarProvaEspecifica,
  lerProvaEspecifica,
  removerProvaEspecifica,
} from "@/application/provas-especificas";
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

export async function GET(_requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    return json(await lerProvaEspecifica(id));
  });
}

export async function PATCH(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    await editarProvaEspecifica(sessao.usuario, id, await corpoJson(requisicao));
    return json(await lerProvaEspecifica(id));
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    await removerProvaEspecifica(sessao.usuario, id);
    return json({ ok: true });
  });
}
