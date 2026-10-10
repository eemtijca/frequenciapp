// Lista a frequência para conferência na Seduc, priorizando os ajustes personalizados.
import { listarFrequenciasPersonalizadas } from "@/application/frequencia-personalizada";
import { feriadoDoDia } from "@/application/calendario-letivo";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const parametros = new URL(requisicao.url).searchParams;
    const registros = await listarFrequenciasPersonalizadas({
      dia: parametros.get("dia") ?? undefined,
      de: parametros.get("de") ?? undefined,
      ate: parametros.get("ate") ?? undefined,
      turmaId: parametros.get("turmaId") ?? undefined,
    });
    const dia = parametros.get("dia");
    return json({
      registros,
      ...(dia ? { feriado: await feriadoDoDia(dia) } : {}),
    });
  });
}
