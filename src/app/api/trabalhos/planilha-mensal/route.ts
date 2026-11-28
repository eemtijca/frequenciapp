// Enfileira a preparação mensal de uma turma para o worker dedicado.
import { z } from "zod";
import { despacharTrabalhosPendentes, enfileirarTrabalho } from "@/application/fila-trabalhos";
import { ambiente } from "@/infra/ambiente";
import { mesValido } from "@/domain/planilha-mensal";
import { publicarTrabalho } from "@/infra/fila/bullmq";
import { comTransacao } from "@/infra/transacoes";
import { corpoJson, erroApi, executarRota, exigirAdmin, json, origemPermitida } from "@/infra/http";

export const dynamic = "force-dynamic";

const entrada = z
  .object({
    turmaOriginalId: z.string().uuid(),
    mes: z.string().refine(mesValido, "Informe um mês válido."),
  })
  .strict();

export async function POST(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!origemPermitida(requisicao)) return erroApi("Origem não permitida.", 403);
    const sessao = await exigirAdmin();
    if (!sessao.ok) return sessao.resposta;
    const dados = entrada.safeParse(await corpoJson(requisicao));
    if (!dados.success) return erroApi("Informe a turma e o mês da preparação.", 400);
    if (!ambiente.fila.trabalhosHabilitada || ambiente.fila.driver !== "redis")
      return erroApi("A fila de trabalhos não está habilitada nesta instalação.", 409);
    if (
      ambiente.fila.tiposHabilitados.length > 0 &&
      !ambiente.fila.tiposHabilitados.includes("PLANILHA_MENSAL_PREPARAR")
    )
      return erroApi("A preparação mensal não está liberada na fila.", 409);
    const trabalhoId = await comTransacao((tx) =>
      enfileirarTrabalho(tx, {
        tipo: "PLANILHA_MENSAL_PREPARAR",
        payload: {
          turmaOriginalId: dados.data.turmaOriginalId,
          mes: dados.data.mes,
          autorId: sessao.usuario.id,
        },
        origem: "admin",
        autorId: sessao.usuario.id,
      }),
    );
    await despacharTrabalhosPendentes(publicarTrabalho).catch(() =>
      console.error("O trabalho aguarda nova tentativa de despacho."),
    );
    return json({ trabalhoId }, 202);
  });
}
