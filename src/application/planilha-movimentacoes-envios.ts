// Tentativas duráveis de movimentação, com destino isolado e retomada após conferência do período.
import { banco, objetoDoBanco } from "@/infra/banco";
import { hashTexto } from "@/domain/planilha";
import { ABA_ENTRADAS } from "@/domain/planilha-entradas";
import type { LinhaIntegracao } from "./planilha-comum";

export const AVISO_ENVIO_MOVIMENTACAO =
  "Não foi possível confirmar o envio. Confira a aba e faça uma prévia do mesmo período antes de repetir.";

export function destinoMovimentacao(linha: LinhaIntegracao, aba: string): string {
  return `movimentacao:${hashTexto(JSON.stringify([linha.googlePlanilhaId, aba]))}`;
}

/** Um sucesso só reconcilia tentativas anteriores do mesmo destino e período coberto. */
export async function haEnvioMovimentacaoSemConfirmacao(linha: LinhaIntegracao, aba: string) {
  const destino = destinoMovimentacao(linha, aba);
  const tabela = objetoDoBanco("sincronizacoes_planilha");
  // Registros antigos sem destino pertencem às saídas; entradas só tinham auditoria.
  const aceitarLegado = aba !== ABA_ENTRADAS;
  const pendentes = await banco().$queryRaw<{ id: string }[]>`
    SELECT p.id FROM ${tabela} p
    WHERE p.finalidade = 'SAIDAS' AND p.resultado = 'PARCIAL'
      AND (p.destino = ${destino} OR (${aceitarLegado} AND p.destino IS NULL))
      AND NOT EXISTS (
        SELECT 1 FROM ${tabela} s
        WHERE s.finalidade = 'SAIDAS' AND s.resultado = 'SUCESSO'
          AND s.puladas_ocupadas = 0 AND s.puladas_formula = 0
          AND (s.destino = ${destino} OR (p.destino IS NULL AND s.destino IS NULL))
          AND s.de <= p.de AND s.ate >= p.ate AND s.criado_em > p.criado_em
      )
    LIMIT 1
  `;
  return pendentes.length > 0;
}

/** Falha neste registro impede chamar o Google; interrupção posterior deixa a tentativa pendente. */
export async function iniciarEnvioMovimentacao(
  usuarioId: string,
  linha: LinhaIntegracao,
  aba: string,
  periodo: { de: string; ate: string },
  planoHash: string,
  modalidade: "conservador" | "completo",
) {
  const registro = await banco().sincronizacaoPlanilha.create({
    data: {
      finalidade: "SAIDAS",
      destino: destinoMovimentacao(linha, aba),
      de: new Date(`${periodo.de}T12:00:00Z`),
      ate: new Date(`${periodo.ate}T12:00:00Z`),
      modalidade: modalidade === "completo" ? "COMPLETO" : "CONSERVADOR",
      planoHash,
      resultado: "PARCIAL",
      erro: `${aba === ABA_ENTRADAS ? "Entradas" : "Saídas"}: ${AVISO_ENVIO_MOVIMENTACAO}`,
      autorId: usuarioId,
    },
    select: { id: true },
  });
  return registro.id;
}

export async function concluirEnvioMovimentacao(
  id: string,
  resultado: "SUCESSO" | "PARCIAL" | "FALHA",
  contagens: {
    preenchidas?: number;
    substituidas?: number;
    linhasCriadas?: number;
    removidasLinhas?: number;
    puladasOcupadas?: number;
    puladasFormula?: number;
  },
  erro?: string,
) {
  await banco().sincronizacaoPlanilha.update({
    where: { id },
    data: {
      resultado,
      erro: erro?.slice(0, 300) ?? null,
      preenchidas: resultado === "SUCESSO" ? (contagens.preenchidas ?? 0) : 0,
      substituidas: resultado === "SUCESSO" ? (contagens.substituidas ?? 0) : 0,
      linhasCriadas: resultado === "SUCESSO" ? (contagens.linhasCriadas ?? 0) : 0,
      removidasLinhas: resultado === "SUCESSO" ? (contagens.removidasLinhas ?? 0) : 0,
      puladasOcupadas: contagens.puladasOcupadas ?? 0,
      puladasFormula: contagens.puladasFormula ?? 0,
    },
  });
}
