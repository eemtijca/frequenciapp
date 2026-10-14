// Exportações locais completas, com proporção visual preservada e confirmação no chamador.
import { encaixarImagemBi } from "./bi-visualizacao";

export function baixarBi(
  conteudo: Blob,
  nome: "frequencibi-tabela.csv" | "frequencibi-grafico.png" | "frequencibi-configuracoes.json",
) {
  const url = URL.createObjectURL(conteudo);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function quebrarTextoImagemBi(
  texto: string,
  medir: (texto: string) => number,
  largura: number,
) {
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of texto.split(/\s+/)) {
    if (atual && medir(`${atual} ${palavra}`) > largura) {
      linhas.push(atual);
      atual = "";
    }
    for (const letra of (atual ? " " : "") + palavra) {
      if (medir(atual + letra) > largura && atual) {
        linhas.push(atual);
        atual = "";
      }
      atual += letra;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

export async function pngBi(
  elemento: HTMLElement,
  titulo: string,
  resumo: string[],
  opcoes: { contexto?: string; legenda?: { nome: string; cor: string }[] } = {},
): Promise<Blob> {
  const svg = elemento.querySelector<SVGSVGElement>("svg.recharts-surface, svg[data-grafico]");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("O navegador não permite exportar a imagem.");
  const quebrar = (texto: string, tamanho: number, largura = 1120) => {
    ctx.font = `${tamanho}px sans-serif`;
    return quebrarTextoImagemBi(texto, (t) => ctx.measureText(t).width, largura);
  };
  const titulos = quebrar(titulo, 28);
  const contexto = opcoes.contexto ? quebrar(opcoes.contexto, 18) : [];
  const legenda = (opcoes.legenda ?? []).map((item) => ({
    ...item,
    linhas: quebrar(item.nome, 18, 1080),
  }));
  const linhas = resumo.flatMap((linha) => quebrar(linha, 20));
  const retangulo = svg?.getBoundingClientRect();
  const larguraSvg = retangulo?.width || 1120;
  const alturaSvg = retangulo?.height || 620;
  const imagem = svg ? encaixarImagemBi(larguraSvg, alturaSvg, 1120, 620) : null;
  const inicioGrafico = 40 + titulos.length * 36 + contexto.length * 26 + 20;
  const inicioLegenda = inicioGrafico + (imagem ? imagem.altura + 24 : 0);
  const inicioResumo =
    inicioLegenda + legenda.reduce((soma, item) => soma + item.linhas.length * 26 + 8, 0) + 34;
  const alturaImagem = Math.ceil(inicioResumo + linhas.length * 28 + 70);
  if (alturaImagem > 8192)
    throw new Error(
      "Há muitos dados para uma imagem legível. Reduza o recorte ou exporte o CSV completo.",
    );
  canvas.height = alturaImagem;

  const estilo = getComputedStyle(elemento);
  const fundo = getComputedStyle(document.body).backgroundColor;
  ctx.fillStyle = !fundo || fundo === "rgba(0, 0, 0, 0)" ? "#1c1b19" : fundo;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = estilo.color;
  ctx.font = "600 28px sans-serif";
  titulos.forEach((linha, i) => ctx.fillText(linha, 40, 40 + i * 36));
  ctx.font = "18px sans-serif";
  contexto.forEach((linha, i) => ctx.fillText(linha, 40, 40 + titulos.length * 36 + i * 26));
  if (svg && imagem) {
    const copia = svg.cloneNode(true) as SVGElement;
    const originais = [svg, ...svg.querySelectorAll("*")];
    const clones = [copia, ...copia.querySelectorAll("*")];
    originais.forEach((orig, i) => {
      const c = clones[i];
      if (!c) return;
      const s = getComputedStyle(orig);
      for (const propriedade of [
        "fill",
        "fill-opacity",
        "stroke",
        "stroke-width",
        "stroke-opacity",
        "color",
        "font-family",
        "font-size",
        "font-weight",
        "opacity",
        "text-anchor",
      ])
        c.setAttribute(propriedade, s.getPropertyValue(propriedade));
    });
    copia.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copia.setAttribute("width", String(larguraSvg));
    copia.setAttribute("height", String(alturaSvg));
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
      ctx.drawImage(
        img,
        40 + (1120 - imagem.largura) / 2,
        inicioGrafico,
        imagem.largura,
        imagem.altura,
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  let y = inicioLegenda;
  ctx.font = "18px sans-serif";
  for (const item of legenda) {
    ctx.fillStyle = item.cor;
    ctx.fillRect(40, y, 14, 14);
    ctx.fillStyle = estilo.color;
    item.linhas.forEach((linha, i) => ctx.fillText(linha, 68, y + 14 + i * 26));
    y += item.linhas.length * 26 + 8;
  }
  ctx.fillStyle = estilo.color;
  ctx.font = "600 20px sans-serif";
  ctx.fillText(`Dados do recorte: ${resumo.length} grupos`, 40, inicioResumo - 10);
  ctx.font = "20px sans-serif";
  linhas.forEach((linha, i) => ctx.fillText(linha, 40, inicioResumo + 24 + i * 28));
  ctx.font = "16px sans-serif";
  ctx.fillText("FrequenciBI | Uso restrito à equipe autorizada", 40, canvas.height - 24);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Não foi possível criar o arquivo."))),
      "image/png",
    ),
  );
}
