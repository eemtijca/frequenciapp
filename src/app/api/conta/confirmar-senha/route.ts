// Confirmação da própria senha em ações sensíveis da interface, com limite de tentativas.
import { confirmarSenhaDoUsuario } from "@/application/confirmacao-senha";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    await confirmarSenhaDoUsuario(sessao.usuario.id, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
