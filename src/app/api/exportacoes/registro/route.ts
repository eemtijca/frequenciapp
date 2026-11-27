// Registro mínimo do preparo de CSV, PDF ou relação, restrito ao escopo da
// conta: grade e relatório pela consulta; relação pela administração.
import { registrarPreparacaoDownload } from "@/application/exportacoes";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirCapacidade,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirCapacidade("consultar");
    if (!sessao.ok) return sessao.resposta;
    await registrarPreparacaoDownload(sessao.usuario, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
