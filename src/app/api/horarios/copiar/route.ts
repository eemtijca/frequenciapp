// Cópia completa e atômica dos horários entre turmas pela administração.
import { copiarHorarios } from "@/application/horarios";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const horarios = await copiarHorarios(sessao.usuario, await corpoJson(requisicao));
    return json({ horarios }, 201);
  });
}
