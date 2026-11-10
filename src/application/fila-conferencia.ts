// Encerra a atenção da fila por evidência do mesmo destino e período ou por confirmação
// explícita quando o recorte antigo não permite provar o escopo.
import { z } from "zod";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";
import { requerConferencia, retrySeguro } from "@/domain/fila-planilha";

export const esquemaEscopoConferencia = z.object({
  versao: z.literal(1),
  tipo: z.enum(["FREQUENCIA", "SAIDAS", "ENTRADAS"]).optional(),
  completo: z.boolean(),
  falhaPreparo: z.string().nullable().optional(),
  iniciadoEm: z.iso.datetime().optional(),
  escopos: z
    .array(
      z.object({
        origemId: z.uuid().nullable(),
        destino: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});

const esquemaCorpoResolucao = z.object({ confirmado: z.literal(true).optional() }).strict();

interface ItemParaResolver {
  id: string;
  tipo: "FREQUENCIA" | "SAIDAS" | "ENTRADAS";
  estado: "AGUARDANDO" | "EM_ANDAMENTO" | "CONCLUIDO" | "FALHOU" | "DESCARTADO";
  dia: Date;
  requerConferencia: boolean;
  resolvidoEm: Date | null;
  resultado: string | null;
  detalhes: unknown;
}

function exigirConfirmacao(mensagem: string): never {
  throw new ErroHttp(mensagem, 409);
}

/**
 * Resolve uma pendência de conferência. Quando o detalhe registra o instante da
 * tentativa e o destino exato, exige um sucesso posterior nesse mesmo escopo.
 * Recortes antigos, incompletos ou com destino desconhecido exigem a confirmação
 * explícita do operador, que fica na auditoria.
 */
export async function resolverConferenciaItem(
  usuario: { id: string },
  id: string,
  entrada?: unknown,
): Promise<void> {
  const validacao = esquemaCorpoResolucao.safeParse(entrada ?? {});
  if (!validacao.success) throw new ErroHttp("Confirmação inválida.", 400);
  const confirmado = validacao.data.confirmado === true;
  await comTransacao(async (tx) => {
    const item = (await tx.filaPlanilha.findUnique({ where: { id } })) as ItemParaResolver | null;
    if (!item) throw new ErroHttp("Item da fila não encontrado.", 404);
    if (item.estado === "AGUARDANDO" || item.estado === "EM_ANDAMENTO")
      throw new ErroHttp(
        "O item ainda está na fila. Aguarde o processamento antes de confirmar.",
        409,
      );
    const pendente =
      item.requerConferencia || (!item.resolvidoEm && requerConferencia(item.resultado));
    if (!pendente) throw new ErroHttp("Este item não tem conferência pendente.", 409);
    if (retrySeguro(item.resultado))
      throw new ErroHttp(
        "Esta pendência não tem escrita incerta. Corrija o motivo e use Tentar novamente.",
        409,
      );
    const dados = esquemaEscopoConferencia.safeParse(item.detalhes);
    const iniciadoEm =
      dados.success && dados.data.iniciadoEm ? new Date(dados.data.iniciadoEm) : null;
    if (!dados.success || !iniciadoEm) {
      if (!confirmado)
        exigirConfirmacao(
          "O recorte antigo não permite provar o destino. Confirme a conferência na planilha.",
        );
    } else {
      const finalidade =
        dados.data.tipo === "FREQUENCIA" || !dados.data.tipo ? "FREQUENCIA" : "SAIDAS";
      let faltaEscopo = !dados.data.completo;
      for (const alvo of dados.data.escopos) {
        if (alvo.destino === null || (finalidade === "FREQUENCIA" && alvo.origemId === null)) {
          faltaEscopo = true;
          continue;
        }
        const prova = await tx.sincronizacaoPlanilha.findFirst({
          where: {
            finalidade,
            ...(finalidade === "FREQUENCIA" ? { turmaOriginalId: alvo.origemId } : {}),
            destino: alvo.destino,
            de: { lte: item.dia },
            ate: { gte: item.dia },
            resultado: "SUCESSO",
            // Vínculos pulados também são registrados como ocupadas pelo produtor.
            puladasOcupadas: 0,
            puladasFormula: 0,
            criadoEm: { gte: iniciadoEm },
          },
          select: { id: true },
        });
        if (!prova)
          exigirConfirmacao(
            "Não há conferência concluída para todo o mesmo escopo. A pendência foi preservada.",
          );
      }
      if (faltaEscopo && !confirmado)
        exigirConfirmacao(
          "Parte do escopo não tem destino comprovado. Confirme a conferência na planilha.",
        );
    }
    const atualizados = await tx.filaPlanilha.updateMany({
      where: { id, resolvidoEm: null },
      data: { requerConferencia: false, resolvidoEm: new Date() },
    });
    if (atualizados.count !== 1)
      throw new ErroHttp("A pendência mudou. Recarregue a fila antes de confirmar.", 409);
    await auditar(
      tx,
      usuario.id,
      "fila_planilha.resolverConferencia",
      `fila:${id}:${confirmado ? "confirmada" : "comprovada"}`,
    );
  });
}
