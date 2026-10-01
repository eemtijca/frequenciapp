// Preferência de notificações do próprio dispositivo: leitura, ativação
// e desativação autenticadas, sem acesso a assinaturas de outras contas.
import {
  ativarNotificacoes,
  desativarNotificacoes,
  estadoDasNotificacoes,
} from "@/application/notificacoes";
import {
  corpoJson,
  erroApi,
  executarRota,
  exigirCapacidade,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirCapacidade("receberNotificacoes");
    if (!sessao.ok) return sessao.resposta;
    return json(
      await estadoDasNotificacoes(
        sessao.usuario,
        new URL(requisicao.url).searchParams.get("endpoint"),
      ),
    );
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirCapacidade("receberNotificacoes");
    if (!sessao.ok) return sessao.resposta;
    await ativarNotificacoes(sessao.usuario, await corpoJson(requisicao));
    return json({ ok: true });
  });
}

export async function DELETE(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirCapacidade("receberNotificacoes");
    if (!sessao.ok) return sessao.resposta;
    await desativarNotificacoes(sessao.usuario, await corpoJson(requisicao));
    return json({ ok: true });
  });
}
