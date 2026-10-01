// Exportação da cópia completa com senha administrativa no corpo,
// sessão autorizada, limite de tentativas e proteção CSRF.
import { exportarCopiaConfirmada } from "@/application/exportacoes";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await exportarCopiaConfirmada(sessao.usuario, await corpoJson(requisicao)));
  });
}
