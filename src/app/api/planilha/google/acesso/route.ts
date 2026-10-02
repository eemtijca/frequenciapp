// Entrega um token breve ao Google Picker, somente para a administração.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { idDaIntegracao } from "@/application/planilha-comum";
import { dadosDoPicker, renovarAcesso } from "@/infra/google-oauth";
import { ErroHttp } from "@/infra/erros";
import { executarRota, exigirAdmin, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const finalidade = z
      .enum(["FREQUENCIA", "SAIDAS", "PARCIAL"])
      .safeParse(new URL(requisicao.url).searchParams.get("finalidade") ?? "FREQUENCIA");
    if (!finalidade.success) throw new ErroHttp("Finalidade da planilha inválida.", 400);
    const principal = await banco().integracaoPlanilha.findUnique({ where: { id: "principal" } });
    const especifica =
      finalidade.data !== "FREQUENCIA"
        ? await banco().integracaoPlanilha.findUnique({
            where: { id: idDaIntegracao(finalidade.data) },
          })
        : null;
    const token = especifica?.googleRefreshToken ?? principal?.googleRefreshToken;
    if (!token) throw new ErroHttp("Conecte a conta Google primeiro.", 400);
    return json({ acesso: await renovarAcesso(token), ...dadosDoPicker() });
  });
}
