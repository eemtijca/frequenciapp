// Atualização e exclusão de um usuário pelo administrador: dados,
// senha, papel, situação e conjunto de turmas atribuídas.
import { atualizarUsuario, removerUsuario } from "@/application/usuarios";
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
    if (!ehUuid(id)) return erroApi("Usuário inválido.", 400);
    const usuario = await atualizarUsuario(sessao.usuario, id, await corpoJson(requisicao));
    return json({ usuario });
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Usuário inválido.", 400);
    await removerUsuario(sessao.usuario, id);
    return json({ ok: true });
  });
}
