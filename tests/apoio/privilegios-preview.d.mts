// Tipos do verificador de privilégios do schema de preview.
export interface PapelPrivilegiosPreview {
  login: boolean;
  herda: boolean;
  superusuario: boolean;
  criaPapel: boolean;
  criaBanco: boolean;
  replica: boolean;
  ignoraRls: boolean;
}

export interface MembershipPrivilegiosPreview {
  papel: string;
  membro: string;
  herda: boolean;
  set: boolean;
  admin: boolean;
}

export interface ObjetoPrivilegiosPreview {
  nome: string;
  dono: string;
  publico: number;
  appSeleciona?: boolean;
  appInsere?: boolean;
  appAtualiza?: boolean;
  appRemove?: boolean;
  appUso?: boolean;
  appExecuta?: boolean;
  appUsa?: boolean;
}

export interface RelatorioPrivilegiosPreview {
  administrador: string;
  papeis: Record<string, PapelPrivilegiosPreview>;
  membrosSaida: number;
  membrosEntrada: MembershipPrivilegiosPreview[];
  schemaPreview: {
    dono: string;
    migradorUso: boolean;
    migradorCria: boolean;
    appUso: boolean;
    appCria: boolean;
    publico: number;
  };
  tabelas: ObjetoPrivilegiosPreview[];
  sequencias: ObjetoPrivilegiosPreview[];
  funcoes: ObjetoPrivilegiosPreview[];
  tipos: ObjetoPrivilegiosPreview[];
  banco: {
    migradorConecta: boolean;
    migradorCria: boolean;
    appConecta: boolean;
    appCria: boolean;
  };
  schemaAlheio: {
    appUso: boolean;
    appSeleciona: boolean;
    migradorUso: boolean;
    migradorSeleciona: boolean;
  };
  publicoAlheio: { appSeleciona: boolean };
}

export function conferirPrivilegios(
  relatorio: unknown,
  opcoes?: { exigirMembership?: boolean },
): string[];
