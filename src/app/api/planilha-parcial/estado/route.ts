// Estado da planilha parcial para a equipe da operação escolar.
import { estadoPlanilhaParcial } from "@/application/planilha-parcial";
import { executarRota, exigirSessao, json } from "@/infra/http";
export const dynamic = "force-dynamic";
export async function GET(): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    return json(await estadoPlanilhaParcial());
  });
}
