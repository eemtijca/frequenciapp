// Texto e formatação do índice de chamadas, com meses recentes e links por turma.
import { rotuloMes } from "./frequencia";

export interface LinkChamada {
  aba: string;
  mes: string;
  url: string;
}

export function montarIndiceChamadas(planilhaUrl: string, abas: readonly LinkChamada[]) {
  const tituloIndice = "Índice das chamadas";
  const linhas = [tituloIndice, `Planilha: ${planilhaUrl}`];
  const estilos: Record<string, unknown>[] = [];
  const paragrafo = (inicio: number, fim: number, tipo: string) => ({
    updateParagraphStyle: {
      range: { startIndex: inicio, endIndex: fim },
      paragraphStyle: { namedStyleType: tipo },
      fields: "namedStyleType",
    },
  });
  estilos.push(paragrafo(1, tituloIndice.length + 1, "TITLE"));
  const ordenadas = [...abas].sort(
    (a, b) => b.mes.localeCompare(a.mes) || a.aba.localeCompare(b.aba, "pt-BR", { numeric: true }),
  );
  let anterior = "";
  for (const aba of ordenadas) {
    if (aba.mes !== anterior) {
      linhas.push("");
      const inicio = linhas.join("\n").length + 2;
      const titulo = rotuloMes(aba.mes);
      linhas.push(titulo);
      estilos.push(paragrafo(inicio, inicio + titulo.length, "HEADING_1"));
      anterior = aba.mes;
    }
    const inicio = linhas.join("\n").length + 2;
    linhas.push(aba.aba);
    estilos.push({
      updateTextStyle: {
        range: { startIndex: inicio, endIndex: inicio + aba.aba.length },
        textStyle: { link: { url: aba.url } },
        fields: "link",
      },
    });
  }
  return { texto: linhas.join("\n"), estilos };
}
