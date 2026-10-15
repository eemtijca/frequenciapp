// Registra presenças personalizadas e justificativas por período, com atualização da chamada.
import { after } from "next/server";
import { chamadasDaJustificativa } from "@/application/justificativas-antecipadas";
import { enfileirarSeLigado, processarFila } from "@/application/fila-planilha";
import { listarFrequenciasParciais, salvarPeriodoParcial } from "@/application/frequencia-parcial";
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
    const registros = await salvarPeriodoParcial(sessao.usuario, await corpoJson(requisicao));
    const justificadas = registros.filter((r) => r.tipo === "JUSTIFICADA");
    let aviso: string | undefined;
    try {
      if (justificadas[0]) {
        const chamadas = await chamadasDaJustificativa(
          justificadas[0].alunoId,
          justificadas.map((r) => r.dia),
        );
        let enfileirada = false;
        for (const chamada of chamadas)
          enfileirada =
            (await enfileirarSeLigado("FREQUENCIA", { ...chamada, autorId: sessao.usuario.id })) ||
            enfileirada;
        if (enfileirada) after(() => processarFila());
      }
    } catch {
      console.error(
        "[planilha] justificativa salva; falha ao preparar a atualização da frequência.",
      );
      aviso =
        "Justificativa salva. Confira o envio automático em Gestão e reenvie pela prévia se necessário.";
    }
    return json({ registro: registros[0], registros, ...(aviso ? { aviso } : {}) });
  });
}
