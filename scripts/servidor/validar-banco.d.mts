// Contrato do validador de identidade entre runtime, migração e backup.
export interface ResultadoIdentidadeBanco {
  database: string;
  schema: string;
  avisos: string[];
}

export function validarIdentidadeBanco(
  ambiente?: Record<string, string | undefined>,
): ResultadoIdentidadeBanco;
