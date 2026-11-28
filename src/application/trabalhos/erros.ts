// Tradução de falhas de trabalho para o desfecho seguro da fila. A mensagem
// técnica fica no log do servidor; o banco e a interface recebem uma frase curta.
import { ErroHttp } from "@/infra/erros";
import type { ResultadoDoTrabalho } from "@/domain/trabalho";

const RESUMO_VALIDACAO = "O trabalho precisa de correção antes de repetir.";
const RESUMO_INCERTO =
  "Não foi possível confirmar a operação. Confira o destino antes de resolver.";
const RESUMO_TEMPORARIO = "A operação falhou de forma temporária e será repetida.";

function registrarFalha(erro: unknown): void {
  if (erro instanceof ErroHttp) {
    console.warn(`[trabalho] falha de domínio: ${erro.codigo ?? erro.status}`);
    return;
  }
  console.error(
    "[trabalho] falha inesperada",
    erro instanceof Error ? erro.message.slice(0, 300) : "erro desconhecido",
  );
}

/**
 * Falhas de validação não se repetem. Limite, conflito e indisponibilidade
 * podem ser tentados de novo. Em operação com efeito externo incerto, o
 * resultado vira conferência para não repetir uma escrita às cegas.
 */
export function resultadoDeErro(
  erro: unknown,
  opcoes: { incerto: boolean; resultado: string },
): ResultadoDoTrabalho {
  registrarFalha(erro);
  if (erro instanceof ErroHttp) {
    if (erro.status === 400 || erro.status === 404 || erro.status === 422) {
      return {
        situacao: "falhou",
        resultado: "validacao",
        erroCodigo: erro.codigo ?? "validacao",
        erroResumo: RESUMO_VALIDACAO,
      };
    }
  }
  if (opcoes.incerto) {
    return {
      situacao: "conferencia",
      resultado: "sem_confirmacao",
      erroCodigo: erro instanceof ErroHttp ? (erro.codigo ?? "efeito_incerto") : "efeito_incerto",
      erroResumo: RESUMO_INCERTO,
    };
  }
  return {
    situacao: "retentavel",
    resultado: opcoes.resultado,
    erroCodigo: erro instanceof ErroHttp ? (erro.codigo ?? "falha_temporaria") : "falha_temporaria",
    erroResumo: RESUMO_TEMPORARIO,
  };
}
