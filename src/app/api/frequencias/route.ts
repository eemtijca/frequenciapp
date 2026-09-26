// Frequências: consulta por dia, turma, período ou mês, e salvamento
// compartilhado com revisão, justificativa e proteção de duplicata.
import {
  carregarFrequencia,
  diaValidoOuParametro,
  listarFrequenciasDoMes,
  listarFrequenciasDoPeriodo,
  mesValidoOuParametro,
  salvarFrequencia,
} from "@/application/frequencias";
import { LIMITE_DIAS_PERIODO } from "@/domain/frequencia";
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

    const turmaId = parametros.get("turmaId")?.trim() ?? "";
    const registradoPor = parametros.get("registradoPor")?.trim() ?? "";
    if (turmaId && !ehUuid(turmaId)) return erroApi("Turma inválida.", 400);
    if (registradoPor && !ehUuid(registradoPor)) return erroApi("Autoria inválida.", 400);

    const mes = mesValidoOuParametro(parametros.get("mes"));
    if (mes) {
      return json({
        frequencias: await listarFrequenciasDoMes(mes, {
          ...(turmaId ? { turmaId } : {}),
          ...(registradoPor ? { registradoPor } : {}),
        }),
      });
    }

    const deBruto = parametros.get("de");
    const ateBruto = parametros.get("ate");
    if (deBruto !== null || ateBruto !== null) {
      const de = diaValidoOuParametro(deBruto);
      const ate = diaValidoOuParametro(ateBruto);
      if (!de || !ate) {
        return erroApi("Período inválido. Use de=YYYY-MM-DD e ate=YYYY-MM-DD.", 400);
      }
      if (ate < de) return erroApi("A data final deve ser igual ou posterior à inicial.", 400);
      const totalDias =
        Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) +
        1;
      if (totalDias > LIMITE_DIAS_PERIODO) {
        return erroApi("O período é grande demais. Escolha até 366 dias.", 400);
      }
      return json({
        frequencias: await listarFrequenciasDoPeriodo(de, ate, turmaId ? { turmaId } : {}),
      });
    }

    const dia = diaValidoOuParametro(parametros.get("dia"));
    if (dia === null) {
      return erroApi(
        "Informe um mês (mes=YYYY-MM), um dia (dia=YYYY-MM-DD) ou um período (de e ate).",
        400,
      );
    }
    // Sem turma, a consulta devolve o dia inteiro, para o Painel.
    if (!turmaId) {
      return json({ frequencias: await listarFrequenciasDoPeriodo(dia, dia) });
    }
    return json({ frequencia: await carregarFrequencia(turmaId, dia) });
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
        "Esta frequência foi atualizada por outra pessoa. A versão mais recente está abaixo; confira as marcações e salve de novo.",
        409,
        { conflito: true, frequencia: resultado.frequencia },
      );
    }
    return json({ frequencia: resultado.frequencia });
  });
}
