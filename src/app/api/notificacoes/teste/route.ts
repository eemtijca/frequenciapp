// Teste voluntário de envio para a própria assinatura, limitado por dispositivo.
import { testarNotificacoes } from "@/application/notificacoes";
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
    const sessao = await exigirCapacidade("verEstatisticasDasTurmas");
    if (!sessao.ok) return sessao.resposta;
    await testarNotificacoes(sessao.usuario, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
