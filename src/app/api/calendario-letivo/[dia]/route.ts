// Exclusão administrativa de um feriado pela data civil, com proteção de origem.
import { removerFeriado } from "@/application/calendario-letivo";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

interface Contexto {
  params: Promise<{ dia: string }>;
}

export async function DELETE(requisicao: Request, contexto: Contexto): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const { dia } = await contexto.params;
    await removerFeriado(sessao.usuario, dia);
    return json({ ok: true });
  });
}
