// Turmas: escopo de quem pede (atribuídas e origens para professor,
// todas para administrador) e criação pelo administrador.
import { criarTurma, escopoDeTurmas } from "@/application/turmas";
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
    const escopo = await escopoDeTurmas(sessao.usuario);
    return json({ turmas: escopo.turmas, origens: escopo.origens });
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
