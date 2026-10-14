// Diagnóstico administrativo da configuração mensal, sem gravar na planilha.
import { diagnosticarPlanilha } from "@/application/planilha-diagnostico";
import { executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const mes = new URL(requisicao.url).searchParams.get("mes");
    return json({ diagnostico: await diagnosticarPlanilha(mes) });
  });
}
