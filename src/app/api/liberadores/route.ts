// Catálogo de quem libera a saída: leitura por qualquer sessão e criação
// pela administração, com auditoria.
import { criarLiberador, listarLiberadores } from "@/application/liberadores";
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
    return json({ liberadores: await listarLiberadores() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const liberador = await criarLiberador(sessao.usuario, await corpoJson(requisicao));
    return json({ liberador }, 201);
  });
}
