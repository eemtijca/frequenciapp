// Trabalho de atualização dos indicadores agregados, sem dado de aluno.
import { z } from "zod";
import { atualizarIndicadores } from "@/application/indicadores";
import type { ContextoDoManipulador } from "@/application/fila-trabalhos";
import type { ResultadoDoTrabalho } from "@/domain/trabalho";
import { resultadoDeErro } from "./erros";

const entrada = z.object({}).strict();

export async function executarIndicadores(
  contexto: ContextoDoManipulador,
): Promise<ResultadoDoTrabalho> {
  const dados = entrada.safeParse(contexto.trabalho.payload);
  if (!dados.success) {
    return {
      situacao: "falhou",
      resultado: "payload_invalido",
      erroCodigo: "payload_invalido",
      erroResumo: "O trabalho de indicadores não aceita este conteúdo.",
    };
  }
  try {
    const resultado = await atualizarIndicadores({ agenda: true });
    if (!resultado.atualizado) {
      return { situacao: "concluido", resultado: "sem_trabalho" };
    }
    return { situacao: "concluido", resultado: "atualizado" };
  } catch (erro) {
    return resultadoDeErro(erro, { incerto: false, resultado: "indicadores_falharam" });
  }
}
