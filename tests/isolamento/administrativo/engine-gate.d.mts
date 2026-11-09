// Declara a barreira local com clientes host e persistência fornecidos pelo provisionador.
export interface ReceitaContainer {
  Hostname?: string;
  User?: string;
  Entrypoint?: string[];
  WorkingDir?: string;
  Image: string;
  Cmd: string[];
  Env: string[];
  Labels: Record<string, string>;
  HostConfig: {
    ReadonlyRootfs?: boolean;
    Tmpfs?: Record<string, string>;
    NetworkMode: string;
    CapDrop: string[];
    SecurityOpt: string[];
    Memory: number;
    NanoCpus: number;
    PidsLimit: number;
    LogConfig: { Type: string; Config: Record<string, string> };
  };
}
export interface IdentidadePostgres {
  banco: string;
  papel: string;
  objetos: 0;
  somenteLeitura: true;
}
export interface ImagemAdministrativa {
  volumes: string[];
  perfil?: "postgres-nativo";
  id?: string;
  config?: Record<string, unknown>;
}
export interface BarreiraEngine {
  /** Host apenas: consulta fixa, sem entrada SQL, sem liberação do supervisor genérico. */
  consultarPrimeiraIdentidade(
    handle: string,
    persistirExec: (id: string) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<IdentidadePostgres>;
  /** Fachada host privada. Somente create/json/start/stop exatos; sem servidor HTTP aberto. */
  atender(metodo: string, caminho: string, corpo?: unknown): Promise<unknown>;
  /** Reserva anterior à inspeção; concorrente com outros execs, não com lifecycle. */
  executar(
    handle: string,
    variante: string,
    entrada: AsyncIterable<Buffer>,
    signal: AbortSignal,
  ): Promise<ExecSupervisionado>;
  /** Reserva lifecycle desde a intenção. Fechamento impede envio novo e publicação do handle. */
  criar(slot: string, signal?: AbortSignal): Promise<string>;
  iniciar(handle: string, signal?: AbortSignal): Promise<void>;
  consultar(handle: string): Promise<{ estado: "iniciado" | "parado"; codigo: number }>;
  inventario(): { handle: string; slot: string; estado: string }[];
  parar(handle: string): Promise<void>;
  encerrar(
    coletar: () => Promise<void>,
  ): Promise<{ removidos: string[]; preservados: string[]; falhas: string[] }>;
}
export function criarBarreiraEngine(opcoes: {
  rodada: string;
  receitas: Record<string, ReceitaContainer>;
  imagens: Record<string, ImagemAdministrativa>;
  /** Resolver somente após commit durável; falhar impede a próxima transição. */
  persistir: (registro: unknown) => Promise<void>;
  supervisionar?: Supervisionar;
  /** Prazo por chamada host, de 1 a 60.000 ms. Default: 5.000 ms.
   * Não cancela efeito remoto: start/stop incertos bloqueiam reutilização. */
  prazoMs?: number;
  /** Cliente host confiável; nunca exposto ao runner. null no GET significa 404 confirmado. */
  requisitar: (metodo: string, caminho: string, corpo?: unknown) => Promise<unknown>;
}): BarreiraEngine;

export interface ResultadoExec {
  codigo: number | null;
  sinal: "SIGTERM" | "SIGINT" | "SIGHUP" | "SIGPIPE" | "SIGKILL" | null;
  grupoEncerrado: boolean;
}
export interface ExecSupervisionado {
  stdout: AsyncIterable<Buffer>;
  stderr: AsyncIterable<Buffer>;
  resultado: Promise<ResultadoExec>;
  cancelar(): Promise<ResultadoExec>;
}
export type Supervisionar = (opcoes: {
  id: string;
  argv: string[];
  entrada: AsyncIterable<Buffer>;
  signal: AbortSignal;
}) => Promise<ExecSupervisionado>;
