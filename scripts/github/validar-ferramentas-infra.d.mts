// Executor injetável para validar ferramentas sem banco, daemon ou rede nas unidades.
export function validarInfra(executar: (comando: string, args: string[], entrada?: string) => Promise<string>): Promise<void>;
