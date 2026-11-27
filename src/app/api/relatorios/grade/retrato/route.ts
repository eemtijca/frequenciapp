// Retrato consistente da Grade para o relatório em PDF, sem cache e sem escrita.
import { obterRetratoGrade } from "@/application/relatorio-grade";
import { erroApi, executarRota, exigirCapacidade, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirCapacidade("consultar");
    if (!sessao.ok) return sessao.resposta;

    const parametros = new URL(requisicao.url).searchParams;
    const turmaOriginalId = parametros.get("turmaOriginalId")?.trim() ?? "";
    const de = parametros.get("de")?.trim() ?? "";
    const ate = parametros.get("ate")?.trim() ?? "";
    if (!turmaOriginalId || !de || !ate) {
      return erroApi("Informe a turma de origem e o período do relatório.", 400);
    }
    return json(await obterRetratoGrade({ turmaOriginalId, de, ate }));
  });
}
