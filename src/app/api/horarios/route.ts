// Aulas da turma: listagem pela administração e criação.
import { criarHorario, listarHorariosDaTurma } from "@/application/horarios";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const turmaId = new URL(requisicao.url).searchParams.get("turmaId")?.trim() ?? "";
    if (!ehUuid(turmaId)) return erroApi("Informe a turma (turmaId).", 400);
    return json({ horarios: await listarHorariosDaTurma(turmaId) });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const horario = await criarHorario(sessao.usuario, await corpoJson(requisicao));
    return json({ horario }, 201);
  });
}
