// Regras de frequência mínima dos benefícios: leitura por qualquer sessão e criação pela administração.
import { criarBeneficio, listarBeneficios } from "@/application/beneficios-frequencia";
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
    return json({ beneficios: await listarBeneficios() });
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const beneficio = await criarBeneficio(sessao.usuario, await corpoJson(requisicao));
    return json({ beneficio }, 201);
  });
}
