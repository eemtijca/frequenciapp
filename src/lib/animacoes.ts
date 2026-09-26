// Preferência de animações por dispositivo. O script de partida do layout
// aplica o atributo antes da pintura e este store mantém tudo em sincronia.
const CHAVE = "frequenciapp.animacoes";
const ATRIBUTO = "data-animacoes";

const ouvintes = new Set<() => void>();
let valor: boolean | null = null;

/**
 * Script executado antes do primeiro paint, no mesmo molde do tema. Evita
 * que as animações apareçam por um quadro quando a preferência está desligada.
 */
export const SCRIPT_ANIMACOES = `try{var a=localStorage.getItem("${CHAVE}");document.documentElement.setAttribute("${ATRIBUTO}",a==="desligadas"?"desligadas":"ligadas")}catch(e){document.documentElement.setAttribute("${ATRIBUTO}","ligadas")}`;

/** Verdadeiro quando as animações do aplicativo estão ligadas. */
export function animacoesLigadas(): boolean {
  if (typeof document === "undefined") return true;
  if (valor !== null) return valor;
  const doAtributo = document.documentElement.getAttribute(ATRIBUTO);
  if (doAtributo === "desligadas") {
    valor = false;
  } else if (doAtributo === "ligadas") {
    valor = true;
  } else {
    try {
      valor = window.localStorage.getItem(CHAVE) !== "desligadas";
    } catch {
      valor = true;
    }
  }
  return valor;
}

/** Liga ou desliga as animações e persiste a escolha no dispositivo. */
export function definirAnimacoes(ligadas: boolean): void {
  valor = ligadas;
  try {
    window.localStorage.setItem(CHAVE, ligadas ? "ligadas" : "desligadas");
  } catch {
    // Sem armazenamento local a preferência vale apenas nesta visita.
  }
  document.documentElement.setAttribute(ATRIBUTO, ligadas ? "ligadas" : "desligadas");
  for (const ouvinte of ouvintes) ouvinte();
}

/** Assinatura para useSyncExternalStore. */
export function assinarAnimacoes(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}
