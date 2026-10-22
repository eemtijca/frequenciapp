// Ordem das turmas no almoço de segunda a sábado, para a consulta em Horários e a edição na Gestão.
import { lerOrdemAlmoco } from "@/application/ordem-almoco";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json({ dias: await lerOrdemAlmoco() });
  });
}
