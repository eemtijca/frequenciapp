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
  registradoSeduc: boolean;
  registradoSeducEm: string | null;
  registradoSeducPorNome: string | null;
  revisao: number;
  revisaoSeduc: number;
  criadoEm: string;
  atualizadoEm: string;
}

export type RegistroPersonalizado = FrequenciaParcial | FrequenciaDaChamada;

export function rotuloFrequenciaPersonalizada(registro: RegistroPersonalizado): string {
  return registro.tipo === "CHAMADA" ? registro.descricao : rotuloFrequenciaParcial(registro);
}
