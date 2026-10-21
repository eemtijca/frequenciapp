// Edição e exclusão da regra de frequência de um benefício, pela administração.
import { atualizarBeneficio, removerBeneficio } from "@/application/beneficios-frequencia";
import {
  corpoJson,
  ehUuid,
  erroApi,
  executarRota,
  exigirAdmin,
  json,
  origemPermitida,
} from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ id: string }>;
}

export async function PATCH(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Benefício inválido.", 400);
    const beneficio = await atualizarBeneficio(sessao.usuario, id, await corpoJson(requisicao));
    return json({ beneficio });
  });
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { id } = await contexto.params;
    if (!ehUuid(id)) return erroApi("Benefício inválido.", 400);
    await removerBeneficio(sessao.usuario, id);
    return json({ ok: true });
  });
}
