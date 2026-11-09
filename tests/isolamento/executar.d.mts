// Tipos do executor e da validação de metadados de recursos descartáveis.
export function validarContainer(info: unknown, rodada: string, tipo: string, rede: string): void;
export function executar(argv?: string[]): Promise<number>;
export type FonteNova = { caminho: string; sha256: string };
export function copiarFontes(
  destino: string,
  opcoes?: {
    raizFonte?: string;
    fontesNovas?: FonteNova[];
    versionados?: string[];
  },
): { caminho: string; origem: string; sha256: string }[];
export function ensaiarDistribuicao(
  prova: { rodada: string; rede: string; ipCanario: string },
  deps?: {
    consultar(sql: string): Promise<{
      banco?: string;
      papel?: string;
      objetos?: number;
      admin?: number;
      coordenacao?: number;
      turmas?: number;
      alunos?: number;
      schema?: string;
      conexoes?: number;
    }>;
    servidor(ambiente: NodeJS.ProcessEnv): Promise<{
      saude(): Promise<void>;
      ownership(): Promise<void>;
      encerrar(): Promise<void>;
    }>;
    comando(programa: string, argumentos: string[], ambiente: NodeJS.ProcessEnv): Promise<void>;
    perimetro(): Promise<void>;
  },
): Promise<void>;
