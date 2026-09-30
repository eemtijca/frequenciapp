// Entradas atrasadas: horário civil e registro independente da chamada.
export interface EntradaAtrasada {
  id: string;
  alunoId: string;
  nome: string;
  turmaId: string;
  turmaRotulo: string;
  dia: string;
  horario: string;
  motivo: string;
  registradoPorNome: string;
  criadoEm: string;
}

export function ehHorarioEntrada(valor: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(valor);
}
