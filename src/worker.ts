// Processo dedicado da fila: consome BullMQ, executa trabalhos e expõe saúde.
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { criarRegistroDeManipuladores } from "@/application/trabalhos/registro";
import { iniciarWorkers } from "@/worker/filas";
import { iniciarSaude } from "@/worker/saude";

function encerrarComTimeout(tarefa: Promise<unknown>, timeoutMs: number): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(() => {
      console.error("[worker] tempo de encerramento esgotado");
      resolver();
    }, timeoutMs);
    void tarefa.finally(() => {
      clearTimeout(temporizador);
      resolver();
    });
  });
}

async function principal(): Promise<void> {
  const manipuladores = criarRegistroDeManipuladores();
  const workers = await iniciarWorkers(manipuladores);
  const saude = iniciarSaude();
  console.warn(
    `[worker] pronto na porta ${ambiente.fila.workerPorta} com ${Object.keys(manipuladores).length} tipos`,
  );

  let encerrando = false;
  const encerrar = async (sinal: string) => {
    if (encerrando) return;
    encerrando = true;
    console.warn(`[worker] encerrando por ${sinal}`);
    await encerrarComTimeout(
      Promise.allSettled([saude.parar(), workers.encerrar(), banco().$disconnect()]),
      ambiente.fila.workerShutdownTimeout * 1_000,
    );
    process.exit(0);
  };

  process.on("SIGTERM", () => void encerrar("SIGTERM"));
  process.on("SIGINT", () => void encerrar("SIGINT"));
}

principal().catch((erro) => {
  console.error("[worker] falha na partida", erro instanceof Error ? erro.message : "erro");
  process.exit(1);
});
