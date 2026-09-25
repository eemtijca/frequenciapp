// Prazos de sessão: lembrada por 30 dias ou restrita ao dia, com cookie de
// sessão que some ao fechar o navegador.

export const DIAS_DE_SESSAO_LEMBRADA = 30;
export const HORAS_DE_SESSAO = 12;

/** Duração da sessão em milissegundos conforme a escolha de manter conectado. */
export function duracaoDaSessao(lembrar: boolean): number {
  const horas = lembrar ? DIAS_DE_SESSAO_LEMBRADA * 24 : HORAS_DE_SESSAO;
  return horas * 60 * 60 * 1000;
}
