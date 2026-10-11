// Exportações locais com nomes neutros; o chamador confirma o uso de dados pessoais antes de baixar.
export function baixarBi(
  conteudo: Blob,
  nome: "frequencibi-tabela.csv" | "frequencibi-grafico.png" | "frequencibi-configuracoes.json",
) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function pngBi(
  elemento: HTMLElement,
  titulo: string,
  resumo: string[],
): Promise<Blob> {
  const svg = elemento.querySelector("svg.recharts-surface, svg[data-grafico]");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não permite exportar a imagem.");
  const estilo = getComputedStyle(elemento);
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#1c1b19";
  ctx.fillRect(0, 0, 1200, 800);
  ctx.fillStyle = estilo.color;
  ctx.font = "600 28px sans-serif";
  ctx.fillText(titulo.slice(0, 80), 40, 48);
  if (svg) {
    const copia = svg.cloneNode(true) as SVGElement;
    const originais = [svg, ...svg.querySelectorAll("*")];
    const clones = [copia, ...copia.querySelectorAll("*")];
    originais.forEach((orig, i) => {
      const c = clones[i];
      if (!c) return;
      const s = getComputedStyle(orig);
      for (const propriedade of [
        "fill",
        "stroke",
        "font-family",
        "font-size",
        "font-weight",
        "opacity",
      ])
        c.setAttribute(propriedade, s.getPropertyValue(propriedade));
    });
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const url = URL.createObjectURL(
      new Blob([new XMLSerializer().serializeToString(copia)], { type: "image/svg+xml" }),
    );
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Não foi possível preparar a imagem."));
        img.src = url;
      });
      ctx.drawImage(img, 40, 80, 1120, 620);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    ctx.font = "20px sans-serif";
    resumo.slice(0, 22).forEach((linha, i) => ctx.fillText(linha.slice(0, 110), 40, 100 + i * 28));
  }
  ctx.font = "16px sans-serif";
  ctx.fillText("FrequenciBI | Uso restrito à equipe autorizada", 40, 770);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Não foi possível criar o arquivo."))),
      "image/png",
    ),
  );
}
