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
  /** D: aluno desistente no dia, que continua na lista gravada da chamada. */
  marca: Marca | "D";
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

/** Saída projetada para conferência; a assinatura protege as aulas exibidas. */
export interface FrequenciaDaSaida extends Omit<FrequenciaParcial, "tipo" | "turno"> {
  tipo: "SAIDA";
  horario: string | null;
  aulasConferiveis: boolean;
  assinatura: string;
  revisaoSeduc: number;
}

export type RegistroPersonalizado = FrequenciaParcial | FrequenciaDaChamada | FrequenciaDaSaida;

/** Registros que precisam de conferência manual na Seduc, inclusive presença em parte do dia. */
export function exigeConferenciaSeduc(
  registro: RegistroPersonalizado | undefined,
): registro is RegistroPersonalizado {
  return (
    registro?.tipo === "SAIDA" ||
    registro?.tipo === "TURNO" ||
    registro?.tipo === "AULAS" ||
    registro?.tipo === "JUSTIFICADA" ||
    (registro?.tipo === "CHAMADA" &&
      (registro.marca === "S" || registro.marca === "FJ" || registro.justificativas.length > 0))
  );
}

export function rotuloFrequenciaPersonalizada(registro: RegistroPersonalizado): string {
  if (registro.tipo === "SAIDA") {
    if (!registro.aulasConferiveis) return "Saída · conferir aulas";
    if (registro.aulas.length === 0) return "Saída · nenhuma aula concluída";
    return `Presente · ${rotuloFrequenciaParcial({ ...registro, tipo: "AULAS", turno: null })}`;
  }
  return registro.tipo === "CHAMADA" ? registro.descricao : rotuloFrequenciaParcial(registro);
}
