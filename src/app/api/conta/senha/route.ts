// Troca da própria senha: exige a senha atual e encerra as outras
// sessões abertas em outros dispositivos.
import { ambiente } from "@/infra/ambiente";
import { trocarSenha } from "@/application/sessao";
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
    await trocarSenha(sessao.usuario, await corpoJson(requisicao), ambiente.authSecret);
    return json({ ok: true });
  });
}
