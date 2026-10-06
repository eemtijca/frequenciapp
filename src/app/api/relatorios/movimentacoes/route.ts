// Relatório de saídas e entradas restrito à equipe escolar, sem gravações.
import { consultarRelatorioMovimentacoes } from "@/application/relatorio-movimentacoes";
import { executarRota, exigirSessao, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirSessao();
    if (!sessao.ok) return sessao.resposta;
    const parametros = new URL(requisicao.url).searchParams;
    return json(
      await consultarRelatorioMovimentacoes({
        de: parametros.get("de"),
        ate: parametros.get("ate"),
        turmaId: parametros.get("turmaId") ?? undefined,
      }),
    );
  });
}
