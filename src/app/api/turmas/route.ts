// Turmas: listagem para toda a coordenação e criação pela administração.
import { criarTurma, listarTodasTurmas } from "@/application/turmas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirAdmin,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ turmas: await listarTodasTurmas() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const turma = await criarTurma(sessao.usuario, await corpoJson(requisicao));
    return json({ turma }, 201);
  });
}
