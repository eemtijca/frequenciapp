// Ocupação de um lugar no mapa: alunos distintos das provas marcadas a até 100 m do ponto informado.
import { lerOcupacaoDoLocal } from "@/application/provas-especificas";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const { searchParams } = new URL(requisicao.url);
    return json(await lerOcupacaoDoLocal(Object.fromEntries(searchParams)));
  });
}
