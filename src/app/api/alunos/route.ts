// Alunos: listagem pelo escopo de quem pede, criação pelo
// administrador. Filtro opcional por turma e origem em massa.
import { criarAluno, definirOrigemEmMassa, listarTodosAlunos } from "@/application/alunos";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const turmaId = new URL(requisicao.url).searchParams.get("turmaId");
    if (turmaId !== null && !ehUuid(turmaId)) return erroApi("Turma inválida.", 400);
    let alunos = await listarTodosAlunos();
    if (turmaId !== null) {
      alunos = alunos.filter((aluno) => aluno.turmaId === turmaId);
    }
    return json({ alunos });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const aluno = await criarAluno(sessao.usuario, await corpoJson(requisicao));
    return json({ aluno }, 201);
  });
}

export async function PATCH(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const resultado = await definirOrigemEmMassa(sessao.usuario, await corpoJson(requisicao));
    return json(resultado);
  });
}
