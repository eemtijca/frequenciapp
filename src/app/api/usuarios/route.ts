// Usuários (professores e administradores): listagem e criação,
// restritas ao administrador.
import { criarUsuario, listarUsuarios } from "@/application/usuarios";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ usuarios: await listarUsuarios() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const usuario = await criarUsuario(sessao.usuario, await corpoJson(requisicao));
    return json({ usuario }, 201);
  });
}
