// Consulta e registro de entradas atrasadas pela equipe escolar.
import { after } from "next/server";
import { criarEntrada, esquemaFiltroEntradas, listarEntradas } from "@/application/entradas";
import { enviarEntradasAposRegistro } from "@/application/planilha-entradas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";
export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const params = new URL(requisicao.url).searchParams;
    const dados = esquemaFiltroEntradas.safeParse({
      de: params.get("de"),
      ate: params.get("ate"),
      turmaId: params.get("turmaId") ?? undefined,
    });
    if (!dados.success) return erroApi(dados.error.issues[0]?.message ?? "Período inválido.", 400);
    return json({ entradas: await listarEntradas(dados.data) });
  });
}
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const entrada = await criarEntrada(sessao.usuario, await corpoJson(requisicao));
    // A resposta sai antes; o envio à planilha nunca atrasa nem derruba o registro.
    after(() => enviarEntradasAposRegistro(sessao.usuario, entrada.dia));
    return json({ ok: true }, 201);
  });
}
