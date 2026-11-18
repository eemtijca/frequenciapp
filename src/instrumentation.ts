// Instrumentação do servidor: inicializa o registro Prometheus no runtime Node.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { inicializarMetricas } = await import("@/infra/metricas");
  inicializarMetricas();
}
