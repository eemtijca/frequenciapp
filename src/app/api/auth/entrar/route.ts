// Entrada do usuário: e-mail e senha, sessão em cookie HttpOnly.
// Contas desativadas e excesso de tentativas têm mensagens próprias.
import { ambiente } from "@/infra/ambiente";
import { entrar } from "@/application/sessao";
import { corpoJson, erroApi, executarRota, ipDoPedido, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const corpo = await corpoJson(requisicao);
    const origem = ipDoPedido(requisicao);
    const resultado = await entrar(corpo, ambiente.authSecret, ambiente.cookiesSeguros, origem);
    if (!resultado.ok) return erroApi(resultado.erro, resultado.status);
    return json({ usuario: resultado.usuario });
  });
}
