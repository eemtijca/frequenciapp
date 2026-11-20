// Horário das provas bimestrais: leitura das provas de hoje em diante e cadastro pela administração.
import { adicionarProvasBimestrais, listarProvasBimestrais } from "@/application/provas-bimestrais";
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
    return json({ provas: await listarProvasBimestrais() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const provas = await adicionarProvasBimestrais(sessao.usuario, await corpoJson(requisicao));
    return json({ provas }, 201);
  });
}
