// Alunos com faltas acima do limite de algum benefício no mês, para o alerta da Chamada.
import { alertasDeBeneficiosDoMes } from "@/application/beneficios-frequencia";
import { ehMesValido } from "@/domain/frequencia";
import { erroApi, executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const mes = new URL(requisicao.url).searchParams.get("mes") ?? "";
    if (!ehMesValido(mes)) return erroApi("Informe o mês (mes=YYYY-MM).", 400);
    return json({ mes, alertas: await alertasDeBeneficiosDoMes(mes) });
  });
}
