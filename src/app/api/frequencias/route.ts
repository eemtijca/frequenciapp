// Frequências: consulta por dia e turma, lista do mês e salvamento
// com proteção de duplicata e conflito de revisão.
import {
  carregarFrequencia,
  diaValidoOuParametro,
  listarFrequenciasDoMes,
  mesValidoOuParametro,
  salvarFrequencia,
} from "@/application/frequencias";
import {
  corpoJson,
  ehUuid,
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
    const parametros = new URL(requisicao.url).searchParams;

    const mes = mesValidoOuParametro(parametros.get("mes"));
    if (mes) return json({ frequencias: await listarFrequenciasDoMes(sessao.usuario.id, mes) });

    const dia = diaValidoOuParametro(parametros.get("dia"));
    if (dia === null) {
      return erroApi("Informe um mês (mes=YYYY-MM) ou um dia (dia=YYYY-MM-DD).", 400);
    }
    const turmaId = parametros.get("turmaId")?.trim() ?? "";
    if (!ehUuid(turmaId)) return erroApi("Informe a turma (turmaId).", 400);
    return json({ frequencia: await carregarFrequencia(sessao.usuario.id, dia, turmaId) });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const resultado = await salvarFrequencia(sessao.usuario, await corpoJson(requisicao));
    if (resultado.situacao === "conflito") {
      return erroApi(
        "Esta frequência foi salva em outro aparelho. A versão mais recente está abaixo; confira as marcações e salve de novo.",
        409,
        { conflito: true, frequencia: resultado.frequencia },
      );
    }
    return json({ frequencia: resultado.frequencia });
  });
}
