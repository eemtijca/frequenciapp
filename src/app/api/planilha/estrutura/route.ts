// Leitura da estrutura da planilha e sugestão de mapa por turma de origem.
import { z } from "zod";
import { lerEstrutura } from "@/application/planilha";
import { ErroHttp } from "@/infra/erros";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const dados = z
      .object({ mes: z.string().optional() })
      .strict()
      .safeParse(requisicao.body === null ? {} : await corpoJson(requisicao));
    if (!dados.success) throw new ErroHttp("Dados de conferência inválidos.", 400);
    return json(await lerEstrutura(dados.data.mes));
  });
}
