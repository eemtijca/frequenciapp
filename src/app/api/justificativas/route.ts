// Catálogo de justificativas: leitura por qualquer sessão e criação pela
// administração, com auditoria.
import { criarJustificativa, listarJustificativas } from "@/application/justificativas";
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
    return json({ justificativas: await listarJustificativas() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const justificativa = await criarJustificativa(sessao.usuario, await corpoJson(requisicao));
    return json({ justificativa }, 201);
  });
}
