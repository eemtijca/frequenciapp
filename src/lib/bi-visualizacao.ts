// Prepara rótulos, cores e recortes visuais do BI sem confundir falta de base com ausência de dados.
import type { GraficoBi, PontoBi } from "@/domain/bi-analise";

export const CORES_BI = {
  escola: ["#37ad84", "#c84b50", "#559cd6", "#ab81d0", "#d7ab51", "#7fac9b"],
  verde: ["#37ad84", "#258263", "#66c4a2", "#467f68", "#9bd7c2", "#6f9986"],
  azul: ["#559cd6", "#3678ad", "#83b7df", "#596eac", "#a1c8e6", "#6c91b1"],
  vermelho: ["#d6666b", "#aa4049", "#e69599", "#b47863", "#efb4b6", "#c68a91"],
  violeta: ["#ab81d0", "#8258a9", "#c5a4e0", "#8772af", "#d8bfe8", "#a08dbd"],
} as const;

export function formatarValorBi(valor: number | null, medida: GraficoBi["medida"]) {
  if (valor === null) return "Sem base de cálculo";
  const percentual = ["infrequencia", "taxaPresenca", "taxaSeduc"].includes(medida);
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${percentual ? "%" : ""}`;
}

export function rotuloEixoBi(texto: string) {
  const data = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  return data ? `${data[3]}/${data[2]}` : texto.length > 18 ? `${texto.slice(0, 15)}...` : texto;
}

export function rotularPontosBi(originais: PontoBi[]) {
  const referencias = new Map<string, Set<string>>();
  const grupos = new Map<string, Set<string>>();
  for (const p of originais) {
    const r = referencias.get(p.nome) ?? new Set<string>();
    r.add(p.referencia);
    referencias.set(p.nome, r);
    const g = grupos.get(p.grupo) ?? new Set<string>();
    g.add(p.grupoReferencia);
    grupos.set(p.grupo, g);
  }
  const sufixo = (valores: Set<string> | undefined, referencia: string) =>
    valores && valores.size > 1 ? ` [${[...valores].indexOf(referencia) + 1}]` : "";
  return originais.map((p) => ({
    ...p,
    nome: p.nome + sufixo(referencias.get(p.nome), p.referencia),
    grupo: p.grupo + sufixo(grupos.get(p.grupo), p.grupoReferencia),
  }));
}

export function prepararCalorBi(pontos: PontoBi[]) {
  const colunas = [...new Set(pontos.map((p) => p.nome))].slice(0, 20);
  const linhas = [...new Set(pontos.map((p) => p.grupo))].slice(0, 12);
  const celulas = new Map(pontos.map((p) => [JSON.stringify([p.nome, p.grupo]), p]));
  const visiveis = pontos.filter((p) => colunas.includes(p.nome) && linhas.includes(p.grupo));
  return {
    colunas,
    linhas,
    celulas,
    maximo: Math.max(1, ...visiveis.map((p) => p.valor ?? 0)),
    omitidos: pontos.length - visiveis.length,
  };
}

export function paginaTabelaBi(pagina: number, quantidade: number) {
  return Math.min(pagina, Math.max(0, Math.ceil(quantidade / 50) - 1));
}

export function encaixarImagemBi(
  largura: number,
  altura: number,
  maxLargura: number,
  maxAltura: number,
) {
  const escala = Math.min(maxLargura / Math.max(1, largura), maxAltura / Math.max(1, altura));
  return { largura: largura * escala, altura: altura * escala };
}
