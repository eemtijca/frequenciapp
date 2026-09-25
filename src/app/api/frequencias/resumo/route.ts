// Acumulado de faltas por aluno desde a primeira chamada salva, usado na
// Chamada, no Resumo de faltas e no Painel.
import { diaValidoOuParametro, resumoAcumulado } from "@/application/frequencias";
import { erroApi, executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const ate = diaValidoOuParametro(new URL(requisicao.url).searchParams.get("ate"));
    if (!ate) return erroApi("Informe a data limite (ate=YYYY-MM-DD).", 400);
    return json({ resumo: await resumoAcumulado(ate) });
  });
}
