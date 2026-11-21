// Remove elementos de estilo e script do HTML renderizado nos testes.
// O estado é percorrido com índices, sem expressão regular de sanitização.
function removerElemento(html: string, tag: "style" | "script"): string {
  const abertura = `<${tag}`;
  const fechamento = `</${tag}`;
  let resultado = "";
  let posicao = 0;

  while (posicao < html.length) {
    const inicio = html.indexOf(abertura, posicao);
    if (inicio === -1) {
      resultado += html.slice(posicao);
      break;
    }
    resultado += html.slice(posicao, inicio);
    const fim = html.indexOf(fechamento, inicio + abertura.length);
    if (fim === -1) break;
    const fechaTag = html.indexOf(">", fim + fechamento.length);
    if (fechaTag === -1) break;
    posicao = fechaTag + 1;
  }

  return resultado;
}

/** Remove as folhas de estilo injetadas pelo Emotion no HTML de teste. */
export function semEstilos(html: string): string {
  return removerElemento(html, "style");
}

/** Extrai o texto visível, descartando estilos, scripts e marcação. */
export function textoVisivel(html: string): string {
  return removerElemento(removerElemento(html, "style"), "script")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
