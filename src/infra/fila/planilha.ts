// Pump da fila FIFO de planilhas: publica somente a cabeça no BullMQ e deixa
// a ordem, a reserva e a retentativa segura no PostgreSQL.
import { banco } from "@/infra/banco";
import { publicarPlanilha } from "./bullmq";

export async function publicarCabecaDaFila(): Promise<void> {
  const agora = new Date();
  const frente = await banco().filaPlanilha.findFirst({
    where: { estado: { in: ["AGUARDANDO", "EM_ANDAMENTO"] } },
    orderBy: { sequencia: "asc" },
  });
  if (!frente) return;

  if (frente.estado === "EM_ANDAMENTO" && frente.reservadoAte && frente.reservadoAte > agora) {
    await publicarPlanilha(
      frente.id,
      `r${frente.reservadoAte.getTime()}`,
      frente.reservadoAte.getTime() - agora.getTime() + 1_000,
    );
    return;
  }

  const delay =
    frente.estado === "AGUARDANDO" && frente.proximaTentativaEm
      ? frente.proximaTentativaEm.getTime() - agora.getTime()
      : 0;
  await publicarPlanilha(frente.id, String(frente.tentativas), delay);
}
