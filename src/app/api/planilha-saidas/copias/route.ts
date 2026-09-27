// Cópias de segurança da aba de saídas, para a administração restaurar.
import { listarCopiasSaidas } from "@/application/planilha-saidas";
import { erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const aba = new URL(requisicao.url).searchParams.get("aba") ?? "";
    return json(await listarCopiasSaidas({ aba }));
  });
}

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    return json(await listarCopiasSaidas(await requisicao.json()));
  });
}
