// Trabalho de preparação mensal de uma turma, com a mesma trava da aplicação.
import { z } from "zod";
import { prepararMesDaFrequencia } from "@/application/planilha-mensal";
import type { ContextoDoManipulador } from "@/application/fila-trabalhos";
import { mesValido } from "@/domain/planilha-mensal";
import type { ResultadoDoTrabalho } from "@/domain/trabalho";
import { resultadoDeErro } from "./erros";

const entrada = z
  .object({
    turmaOriginalId: z.string().uuid(),
    mes: z.string().refine(mesValido, "Informe um mês válido."),
    autorId: z.string().uuid(),
  })
  .strict();

export async function executarPlanilhaMensal(
  contexto: ContextoDoManipulador,
): Promise<ResultadoDoTrabalho> {
  const dados = entrada.safeParse(contexto.trabalho.payload);
  if (!dados.success) {
    return {
      situacao: "falhou",
      resultado: "payload_invalido",
      erroCodigo: "payload_invalido",
      erroResumo: "O trabalho de preparação mensal não aceita este conteúdo.",
    };
  }
  try {
    const resultado = await prepararMesDaFrequencia(
      { id: dados.data.autorId },
      { turmaOriginalId: dados.data.turmaOriginalId, mes: dados.data.mes },
    );
    return {
      situacao: "concluido",
      resultado: "preparado",
      detalhes: {
        aba: resultado.aba,
        mes: resultado.mes,
        criada: resultado.criada,
        atualizada: resultado.atualizada,
      },
    };
  } catch (erro) {
    return resultadoDeErro(erro, { incerto: true, resultado: "preparacao_falhou" });
  }
}
