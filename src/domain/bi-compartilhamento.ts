// Filtros recebidos por link substituem recortes locais sem transportar busca, notas ou credenciais.
import { esquemaFiltrosBi, type FiltrosBi } from "./bi-analise";

export const CAMPOS_LINK_BI = [
  "inicio",
  "fim",
  "serieId",
  "turmaId",
  "alunoId",
  "tipo",
  "turno",
  "situacao",
] as const;

export function receberFiltrosBi(atuais: FiltrosBi, parametros: URLSearchParams) {
  const compartilhados = Object.fromEntries(
    CAMPOS_LINK_BI.filter((campo) => parametros.has(campo)).map((campo) => [
      campo,
      parametros.get(campo),
    ]),
  );
  const temCompartilhados = Object.keys(compartilhados).length > 0;
  return {
    temCompartilhados,
    resultado: esquemaFiltrosBi.safeParse(
      temCompartilhados ? { inicio: atuais.inicio, fim: atuais.fim, ...compartilhados } : atuais,
    ),
  };
}
