// Expurgo diário de trabalhos encerrados, preservando conferências pendentes.
import { z } from "zod";
import { banco } from "@/infra/banco";
import type { ContextoDoManipulador } from "@/application/fila-trabalhos";
import type { ResultadoDoTrabalho } from "@/domain/trabalho";

const entrada = z.object({}).strict();
const DIA = 86_400_000;

export async function executarExpurgo(
  contexto: ContextoDoManipulador,
): Promise<ResultadoDoTrabalho> {
  const dados = entrada.safeParse(contexto.trabalho.payload);
  if (!dados.success) {
    return {
      situacao: "falhou",
      resultado: "payload_invalido",
      erroCodigo: "payload_invalido",
      erroResumo: "O expurgo não aceita este conteúdo.",
    };
  }
  const agora = Date.now();
  const [concluidos, encerrados] = await Promise.all([
    banco().trabalho.deleteMany({
      where: {
        estado: "CONCLUIDO",
        atualizadoEm: { lt: new Date(agora - 7 * DIA) },
      },
    }),
    banco().trabalho.deleteMany({
      where: {
        estado: { in: ["FALHOU", "CANCELADO"] },
        atualizadoEm: { lt: new Date(agora - 30 * DIA) },
      },
    }),
  ]);
  return {
    situacao: "concluido",
    resultado: "expurgado",
    detalhes: { concluidos: concluidos.count, encerrados: encerrados.count },
  };
}
