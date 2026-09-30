// Tipos de aviso e horários da escola, restritos à Gestão e auditados.
import {
  atualizarConfiguracaoNotificacoes,
  lerConfiguracaoNotificacoes,
} from "@/application/notificacoes-configuracao";
import { ambiente } from "@/infra/ambiente";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET() {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({ configuracao: await lerConfiguracaoNotificacoes(), fuso: ambiente.fuso });
  });
}

export async function PATCH(requisicao: Request) {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json({
      configuracao: await atualizarConfiguracaoNotificacoes(
        sessao.usuario,
        await corpoJson(requisicao),
      ),
      fuso: ambiente.fuso,
    });
  });
}
