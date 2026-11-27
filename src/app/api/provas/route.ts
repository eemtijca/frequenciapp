// Provas específicas: listagem e cadastro pela equipe (administração e coordenação).
import { criarProvaEspecifica, listarProvasEspecificas } from "@/application/provas-especificas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ provas: await listarProvasEspecificas() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const prova = await criarProvaEspecifica(sessao.usuario, await corpoJson(requisicao));
    return json({ prova }, 201);
  });
}
