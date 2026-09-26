// Configurações de recursos: leitura por qualquer sessão e atualização pela
// administração, com auditoria.
import { atualizarConfiguracoes, lerConfiguracoes } from "@/application/configuracoes";
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
    return json({ configuracoes: await lerConfiguracoes() });
  });
}

export async function PATCH(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const configuracoes = await atualizarConfiguracoes(sessao.usuario, await corpoJson(requisicao));
    return json({ configuracoes });
  });
}
