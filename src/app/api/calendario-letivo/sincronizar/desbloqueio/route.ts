// Libera uma nova sincronização de feriados depois da senha do administrador.
import { desbloquearSincronizacaoFeriados } from "@/application/sincronizar-feriados";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(
      await desbloquearSincronizacaoFeriados(sessao.usuario, await corpoJson(requisicao)),
    );
  });
}
