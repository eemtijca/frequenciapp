import { diaDaSemanaIso, diaSeguinte, mesSeguinte } from "@/domain/frequencia";

/** Segunda a quinta do mês anterior ao dia efetivamente exibido pela aplicação. */
export function datasDoPainel(referencia: string): [string, string, string, string] {
  const primeiro = `${mesSeguinte(referencia.slice(0, 7), -1)}-01`;
  const segunda = diaSeguinte(primeiro, (8 - diaDaSemanaIso(primeiro)) % 7);
  return [segunda, diaSeguinte(segunda, 1), diaSeguinte(segunda, 2), diaSeguinte(segunda, 3)];
}
