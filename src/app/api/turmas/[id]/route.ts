// Atualização e exclusão de uma turma pelo administrador.
import { atualizarTurma, removerTurma } from "@/application/turmas";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";

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
    if (!ehUuid(id)) return erroApi("Turma inválida.", 400);
    const turma = await atualizarTurma(sessao.usuario, id, await corpoJson(requisicao));
    return json({ turma });
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Turma inválida.", 400);
    await removerTurma(sessao.usuario, id);
    return json({ ok: true });
  });
}
