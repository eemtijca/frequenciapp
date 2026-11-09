// Contratos de clientes e estado de encerramento do container exclusivo.
export type ResultadoCliente = { codigo: number | null; sinal: string | null; saida?: string };
export function acompanharContainer(
  id: string,
  deps: {
    logs(id: string): Promise<ResultadoCliente>;
    esperar(id: string): Promise<ResultadoCliente & { saida: string }>;
    inspecionar(id: string): { State?: { Running?: boolean; ExitCode?: number } };
  },
): Promise<number>;
