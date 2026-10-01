// Registro mínimo do preparo de CSV, restrito ao escopo de exportação
// da conta, sem receber arquivos nem senhas.
import { registrarPreparacaoDownload } from "@/application/exportacoes";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirSessao,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    await registrarPreparacaoDownload(sessao.usuario, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
