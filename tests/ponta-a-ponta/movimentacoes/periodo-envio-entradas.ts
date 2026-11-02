import { validarDiaCivil } from "../helpers/navegacao-periodo";

/** Escolhe o mês anterior à data exibida, evitando o mês da fixture de Entradas. */
export function periodoHistoricoDistinto(
  referencia: string,
  mesEntradas: string,
): { de: string; ate: string } {
  validarDiaCivil(referencia);
  const ano = Number(referencia.slice(0, 4));
  const mes = Number(referencia.slice(5, 7));
  let inicio = new Date(Date.UTC(ano, mes - 2, 1));
  if (inicio.toISOString().slice(0, 7) === mesEntradas) {
    inicio = new Date(Date.UTC(ano, mes - 3, 1));
  }
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
  return { de: inicio.toISOString().slice(0, 10), ate: fim.toISOString().slice(0, 10) };
}
