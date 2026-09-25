// Saída: encerra a sessão corrente e limpa o cookie.
import { ambiente } from "@/infra/ambiente";
import { sair } from "@/application/sessao";
import { erroApi, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
  await sair(ambiente.authSecret, ambiente.cookiesSeguros);
  return json({ ok: true });
}
