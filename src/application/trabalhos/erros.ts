// Tradução de falhas de trabalho para o desfecho seguro da fila.
import { ErroHttp } from "@/infra/erros";
import type { ResultadoDoTrabalho } from "@/domain/trabalho";

/**
 * Falhas de validação não se repetem. Limite, conflito e indisponibilidade
 * podem ser tentados de novo. Em operação com efeito externo incerto, o
 * resultado vira conferência para não repetir uma escrita às cegas.
 */
export function resultadoDeErro(
  erro: unknown,
  opcoes: { incerto: boolean; resultado: string },
): ResultadoDoTrabalho {
  const mensagem =
    erro instanceof Error ? erro.message.slice(0, 300) : "O trabalho terminou com erro.";
  if (erro instanceof ErroHttp) {
    if (erro.status === 400 || erro.status === 404 || erro.status === 422) {
      return {
        situacao: "falhou",
        resultado: "validacao",
        erroCodigo: erro.codigo ?? "validacao",
        erroResumo: mensagem,
      };
    }
  }
  if (opcoes.incerto) {
    return {
      situacao: "conferencia",
      resultado: "sem_confirmacao",
      erroCodigo: erro instanceof ErroHttp ? (erro.codigo ?? "efeito_incerto") : "efeito_incerto",
      erroResumo: mensagem,
    };
  }
  return {
    situacao: "retentavel",
    resultado: opcoes.resultado,
    erroCodigo: erro instanceof ErroHttp ? (erro.codigo ?? "falha_temporaria") : "falha_temporaria",
    erroResumo: mensagem,
  };
}
