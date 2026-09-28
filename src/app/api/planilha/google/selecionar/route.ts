// Confere a planilha escolhida no Picker e invalida o mapa anterior.
import { z } from "zod";
import { Prisma } from "../../../../../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { renovarAcesso } from "@/infra/google-oauth";
import { lerPlanilhaEscolhida } from "@/infra/google-planilhas";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const dados = z
      .object({
        id: z.string().regex(/^[\w-]{10,200}$/),
        finalidade: z.enum(["FREQUENCIA", "SAIDAS"]).default("FREQUENCIA"),
      })
      .safeParse(await corpoJson(requisicao));
    if (!dados.success) throw new ErroHttp("Escolha uma planilha válida.", 400);
    const principal = await banco().integracaoPlanilha.findUnique({ where: { id: "principal" } });
    const saidas =
      dados.data.finalidade === "SAIDAS"
        ? await banco().integracaoPlanilha.findUnique({ where: { id: "saidas" } })
        : null;
    const token = saidas?.googleRefreshToken ?? principal?.googleRefreshToken;
    if (!token) throw new ErroHttp("Conecte a conta Google primeiro.", 400);
    const planilha = await lerPlanilhaEscolhida(dados.data.id, await renovarAcesso(token));
    const id = dados.data.finalidade === "SAIDAS" ? "saidas" : "principal";
    await comTransacao(async (tx) => {
      await tx.integracaoPlanilha.upsert({
        where: { id },
        update: {
          provedor: "GOOGLE",
          googleRefreshToken: token,
          googlePlanilhaId: planilha.spreadsheetId,
          googlePlanilhaNome: planilha.properties.title,
          ativa: false,
          esquema: Prisma.DbNull,
          assinaturaEsquema: null,
          esquemaEm: null,
          atualizadoPorId: sessao.usuario.id,
        },
        create: {
          id,
          finalidade: dados.data.finalidade,
          provedor: "GOOGLE",
          googleRefreshToken: token,
          googlePlanilhaId: planilha.spreadsheetId,
          googlePlanilhaNome: planilha.properties.title,
          atualizadoPorId: sessao.usuario.id,
        },
      });
      await auditar(tx, sessao.usuario.id, "planilha.google.selecionar", `integracao:${id}`);
    });
    return json({ planilha: { nome: planilha.properties.title, abas: planilha.sheets.length } });
  });
}
