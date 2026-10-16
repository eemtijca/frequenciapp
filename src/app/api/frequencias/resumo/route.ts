// Acumulado por aluno, com período opcional para a consulta mensal da Chamada.
import { diaValidoOuParametro, resumoAcumulado } from "@/application/frequencias";
import { erroApi, executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const parametros = new URL(requisicao.url).searchParams;
    const ate = diaValidoOuParametro(parametros.get("ate"));
    if (!ate) return erroApi("Informe a data limite (ate=YYYY-MM-DD).", 400);
    const deBruto = parametros.get("de");
    const de = deBruto === null ? undefined : diaValidoOuParametro(deBruto);
    if (de === null) return erroApi("Informe a data inicial (de=YYYY-MM-DD).", 400);
    if (de && de > ate) return erroApi("A data final deve ser igual ou posterior à inicial.", 400);
    return json({ resumo: await resumoAcumulado(ate, de) });
  });
}
