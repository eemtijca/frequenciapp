// Leitura do bloqueio da sincronização de feriados, restrita à administração.
import { lerEstadoSincronizacao } from "@/application/sincronizar-feriados";
import { executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await lerEstadoSincronizacao());
  });
}
