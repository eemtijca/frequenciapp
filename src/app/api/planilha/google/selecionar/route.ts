// Confere a planilha escolhida no Picker e invalida o mapa anterior.
import { z } from "zod";
import { Prisma } from "../../../../../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { idDaIntegracao } from "@/application/planilha-comum";
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
        finalidade: z.enum(["FREQUENCIA", "SAIDAS", "PARCIAL"]).default("FREQUENCIA"),
      })
      .safeParse(await corpoJson(requisicao));
    if (!dados.success) throw new ErroHttp("Escolha uma planilha válida.", 400);
    const principal = await banco().integracaoPlanilha.findUnique({ where: { id: "principal" } });
    const especifica =
      dados.data.finalidade !== "FREQUENCIA"
        ? await banco().integracaoPlanilha.findUnique({
            where: { id: idDaIntegracao(dados.data.finalidade) },
          })
        : null;
    const token = especifica?.googleRefreshToken ?? principal?.googleRefreshToken;
    if (!token) throw new ErroHttp("Conecte a conta Google primeiro.", 400);
    const planilha = await lerPlanilhaEscolhida(dados.data.id, await renovarAcesso(token));
    const id = idDaIntegracao(dados.data.finalidade);
    await comTransacao(async (tx) => {
      const conflito = await tx.integracaoPlanilha.findFirst({
        where: {
          id: { not: id },
          googlePlanilhaId: planilha.spreadsheetId,
          ...(dados.data.finalidade === "PARCIAL" ? {} : { finalidade: "PARCIAL" }),
        },
        select: { id: true },
      });
      if (conflito)
        throw new ErroHttp(
          "A chamada parcial precisa de um terceiro arquivo, separado das outras planilhas.",
          409,
        );
      await tx.integracaoPlanilha.upsert({
        where: { id },
        update: {
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
