// Provas específicas: listagem e cadastro pela equipe (administração e coordenação).
import { listarProvasVisiveis } from "@/application/acesso-prova";
import { criarProvaEspecifica } from "@/application/provas-especificas";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirIdentidade,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirIdentidade();
    if (!sessao.ok) return sessao.resposta;
    return json({ provas: await listarProvasVisiveis(sessao.usuario) });
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
