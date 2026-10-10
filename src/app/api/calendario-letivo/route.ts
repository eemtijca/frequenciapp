// Consulta do calendário escolar e cadastro administrativo de feriados anuais.
import { anoDoCalendario, criarFeriado, listarFeriados } from "@/application/calendario-letivo";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirAdmin,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const ano = anoDoCalendario(new URL(requisicao.url).searchParams.get("ano"));
    return json({ feriados: await listarFeriados(ano) });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const feriado = await criarFeriado(sessao.usuario, await corpoJson(requisicao));
    return json({ feriado }, 201);
  });
}
