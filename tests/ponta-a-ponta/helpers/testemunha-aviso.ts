// Função autocontida: Playwright a serializa para executar no navegador.
export function registrarTestemunha(botao: HTMLElement, tipoEvento: string) {
  const resultado = { recebido: false, confiavel: false, avisoVisivel: false, instante: 0 };
  const observar = (evento: Event) => {
    if (!(evento.target instanceof Node) || !botao.contains(evento.target)) return;
    resultado.recebido = true;
    resultado.confiavel = evento.isTrusted;
    resultado.instante = Date.now();
    const aviso = [...document.querySelectorAll("[data-sonner-toast]")].find(
      (elemento) =>
        elemento.querySelector("[data-title]")?.textContent?.trim() === "Configurações salvas.",
    );
    if (aviso) {
      const retangulos = [...aviso.getClientRects()];
      let visivel = retangulos.some((retangulo) => {
        const esquerda = Math.max(0, retangulo.left);
        const topo = Math.max(0, retangulo.top);
        const direita = Math.min(window.innerWidth, retangulo.right);
        const base = Math.min(window.innerHeight, retangulo.bottom);
        return direita > esquerda && base > topo;
      });
      for (let elemento: Element | null = aviso; elemento; elemento = elemento.parentElement) {
        const estilo = getComputedStyle(elemento);
        if (
          estilo.display === "none" ||
          estilo.visibility !== "visible" ||
          Number(estilo.opacity) === 0
        ) {
          visivel = false;
          break;
        }
      }
      resultado.avisoVisivel = visivel;
    }
    document.removeEventListener(tipoEvento, observar, true);
  };
  document.addEventListener(tipoEvento, observar, true);
  return resultado;
}
