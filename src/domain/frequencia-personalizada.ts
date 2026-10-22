// Lista de conferência para a Seduc: chamada diária salva e ajustes personalizados.
import type { Marca } from "./frequencia";
import { rotuloFrequenciaParcial, type FrequenciaParcial } from "./frequencia-parcial";

export interface FrequenciaDaChamada {
  tipo: "CHAMADA";
  id: string;
  alunoId: string;
  dia: string;
  turmaId: string;
  alunoNome: string;
  turmaNome: string;
  marca: Marca;
  descricao: string;
  justificativas: string[];
  justificativa?: string | null;
  observacao?: string | null;
  registradoSeduc: boolean;
  registradoSeducEm: string | null;
  registradoSeducPorNome: string | null;
  revisao: number;
  revisaoSeduc: number;
  criadoEm: string;
  atualizadoEm: string;
}

export type RegistroPersonalizado = FrequenciaParcial | FrequenciaDaChamada;

/** Registros que precisam de conferência manual na Seduc, inclusive presença em parte do dia. */
export function exigeConferenciaSeduc(
  registro: RegistroPersonalizado | undefined,
): registro is RegistroPersonalizado {
  return (
    registro?.tipo === "TURNO" ||
    registro?.tipo === "AULAS" ||
    registro?.tipo === "JUSTIFICADA" ||
    (registro?.tipo === "CHAMADA" &&
      (registro.marca === "S" || registro.marca === "FJ" || registro.justificativas.length > 0))
  );
}

export function rotuloFrequenciaPersonalizada(registro: RegistroPersonalizado): string {
  return registro.tipo === "CHAMADA" ? registro.descricao : rotuloFrequenciaParcial(registro);
}
