// Preferências da própria conta, compartilhadas entre seus dispositivos.
import { atualizarPreferenciasNotificacoes } from "@/application/notificacoes-configuracao";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirCapacidade,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function PATCH(requisicao: Request) {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirCapacidade("receberNotificacoes");
    if (!sessao.ok) return sessao.resposta;
    return json({
      preferencias: await atualizarPreferenciasNotificacoes(
        sessao.usuario,
        await corpoJson(requisicao),
      ),
    });
  });
}
