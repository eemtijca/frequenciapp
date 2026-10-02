// Consulta e registro de presenças parciais pela equipe, separados da chamada.
import {
  listarFrequenciasParciais,
  salvarFrequenciaParcial,
} from "@/application/frequencia-parcial";
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
    return json({
      registros: await listarFrequenciasParciais({
        dia: params.get("dia") ?? undefined,
        de: params.get("de") ?? undefined,
        ate: params.get("ate") ?? undefined,
        turmaId: params.get("turmaId") ?? undefined,
      }),
    });
  });
}
export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const registro = await salvarFrequenciaParcial(sessao.usuario, await corpoJson(requisicao));
    return json({ registro });
  });
}
