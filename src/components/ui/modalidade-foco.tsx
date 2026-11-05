"use client";

// Distingue o ponteiro do teclado sem alterar o foco do navegador.
import { useEffect } from "react";

export type OrigemFoco = "ponteiro" | "teclado";
// Cobre o foco síncrono de abertura e a devolução após as animações de saída.
const JANELA_PONTEIRO_MS = 1000;
const restauracoes = new WeakMap<EventTarget, OrigemFoco>();

/** Mantém a origem de uma devolução de foco conhecida, inclusive após animações. */
export function restaurarFoco(elemento: HTMLElement | null, origem?: OrigemFoco) {
  if (!elemento) return;
  if (origem) restauracoes.set(elemento, origem);
  try {
    elemento.focus({ preventScroll: true });
  } finally {
    restauracoes.delete(elemento);
  }
}

export function ModalidadeFoco() {
  useEffect(() => {
    const raiz = document.documentElement;
    let alvoPonteiro: EventTarget | null = null;
    let focoDesconhecido: Element | null = null;
    let antesDoPonteiro: {
      foco: Element | null;
      modalidade: string | undefined;
      desconhecido: boolean;
    } | null = null;
    let limpezaPonteiro: ReturnType<typeof setTimeout> | undefined;
    let ultimoPonteiroEm = Number.NEGATIVE_INFINITY;
    const ponteiroRecente = () => performance.now() - ultimoPonteiroEm < JANELA_PONTEIRO_MS;
    const limparMarcador = () => {
      raiz.removeAttribute("data-foco-desconhecido");
      focoDesconhecido = null;
    };
    const marcarDesconhecido = (alvo: Element) => {
      limparMarcador();
      focoDesconhecido = alvo;
      raiz.setAttribute("data-foco-desconhecido", "");
    };
    const ponteiro = (evento: PointerEvent) => {
      if (evento.isTrusted) {
        clearTimeout(limpezaPonteiro);
        antesDoPonteiro = {
          foco: document.activeElement,
          modalidade: raiz.dataset.modalidadeFoco,
          desconhecido: focoDesconhecido === document.activeElement,
        };
        alvoPonteiro = evento.target;
        ultimoPonteiroEm = performance.now();
        raiz.dataset.modalidadeFoco = "ponteiro";
        // Um novo gesto de ponteiro torna obsoleto qualquer foco desconhecido.
        limparMarcador();
      }
    };
    const pertenceAoPonteiro = (alvo: EventTarget | null) => {
      if (!(alvo instanceof Node) || !(alvoPonteiro instanceof Node)) return false;
      if (alvo.contains(alvoPonteiro)) return true;
      const elemento = alvoPonteiro instanceof Element ? alvoPonteiro : alvoPonteiro.parentElement;
      return elemento?.closest("label")?.control === alvo;
    };
    const foco = (evento: FocusEvent) => {
      const alvo = evento.target;
      const origem = alvo ? restauracoes.get(alvo) : undefined;
      if (origem) raiz.dataset.modalidadeFoco = origem;
      if (origem === "ponteiro") ultimoPonteiroEm = performance.now();
      if (origem === "teclado") ultimoPonteiroEm = Number.NEGATIVE_INFINITY;
      const diretoDoPonteiro = origem === "ponteiro" || pertenceAoPonteiro(alvo);
      // O foco programático que decorre de um clique ou toque recente é do
      // ponteiro, ainda que o navegador o trate como :focus-visible.
      const doPonteiro = origem !== "teclado" && (diretoDoPonteiro || ponteiroRecente());
      limparMarcador();
      alvoPonteiro = null;
      if (doPonteiro) {
        raiz.dataset.modalidadeFoco = "ponteiro";
        return;
      }
      if (origem === "teclado" || raiz.dataset.modalidadeFoco === "teclado") return;
      if (alvo instanceof Element) marcarDesconhecido(alvo);
      if (raiz.dataset.modalidadeFoco === "ponteiro") delete raiz.dataset.modalidadeFoco;
    };
    const desfoco = (evento: FocusEvent) => {
      limparMarcador();
      if (
        raiz.dataset.modalidadeFoco === "ponteiro" &&
        !pertenceAoPonteiro(evento.relatedTarget) &&
        !ponteiroRecente()
      ) {
        delete raiz.dataset.modalidadeFoco;
      }
    };
    // O foco por toque ou por label pode ocorrer depois de pointerup.
    const fimClique = (evento: MouseEvent) => {
      if (evento.isTrusted) limpezaPonteiro = setTimeout(() => (alvoPonteiro = null), 0);
    };
    const restaurarFocoAnterior = (cancelado = false) => {
      const focoAtual = document.activeElement;
      const focoDoPonteiro = pertenceAoPonteiro(focoAtual);
      alvoPonteiro = null;
      ultimoPonteiroEm = Number.NEGATIVE_INFINITY;
      if (antesDoPonteiro && focoAtual === antesDoPonteiro.foco) {
        if (antesDoPonteiro.modalidade) raiz.dataset.modalidadeFoco = antesDoPonteiro.modalidade;
        else delete raiz.dataset.modalidadeFoco;
        if (antesDoPonteiro.desconhecido && antesDoPonteiro.foco) {
          marcarDesconhecido(antesDoPonteiro.foco);
        }
      } else if (
        cancelado &&
        !focoDoPonteiro &&
        focoAtual instanceof Element &&
        focoAtual !== document.body
      ) {
        // Um gesto cancelado não pode apagar o foco programático que ocorreu
        // durante ele.
        delete raiz.dataset.modalidadeFoco;
        marcarDesconhecido(focoAtual);
      }
      antesDoPonteiro = null;
    };
    const cancelarPonteiro = (evento: PointerEvent) => {
      if (evento.isTrusted) restaurarFocoAnterior(true);
    };
    const soltarPonteiro = (evento: PointerEvent) => {
      if (!evento.isTrusted || !(alvoPonteiro instanceof Element)) return;
      const origem =
        alvoPonteiro.closest("button, a, input, select, textarea, label, [role]") ?? alvoPonteiro;
      const destino = document.elementFromPoint(evento.clientX, evento.clientY);
      if (!destino || !origem.contains(destino)) restaurarFocoAnterior();
    };
    const teclasNavegacao = new Set([
      "Tab",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "Home",
      "End",
      "PageUp",
      "PageDown",
    ]);
    const teclasAtivacao = new Set(["Enter", " ", "Escape"]);
    const teclado = (evento: KeyboardEvent) => {
      const alvo = evento.target;
      const editaTexto =
        (alvo instanceof HTMLInputElement &&
          ["text", "search", "tel", "url", "email", "password", "number"].includes(alvo.type)) ||
        (alvo instanceof Element && alvo.getAttribute("role") === "spinbutton") ||
        alvo instanceof HTMLTextAreaElement ||
        (alvo instanceof HTMLElement && alvo.isContentEditable);
      // Algumas buscas editáveis usam setas verticais para navegar opções, não o cursor.
      const navegaOpcoes =
        alvo instanceof Element &&
        alvo.hasAttribute("aria-activedescendant") &&
        (evento.key === "ArrowUp" || evento.key === "ArrowDown");
      const navegaPorTeclado =
        evento.key === "Tab" ||
        evento.key === "Escape" ||
        (!editaTexto && (teclasNavegacao.has(evento.key) || teclasAtivacao.has(evento.key))) ||
        navegaOpcoes;
      if (
        evento.isTrusted &&
        navegaPorTeclado &&
        !evento.metaKey &&
        !evento.ctrlKey &&
        !evento.altKey
      ) {
        raiz.dataset.modalidadeFoco = "teclado";
        ultimoPonteiroEm = Number.NEGATIVE_INFINITY;
        alvoPonteiro = null;
        limparMarcador();
      }
    };
    document.addEventListener("pointerdown", ponteiro, true);
    document.addEventListener("click", fimClique, true);
    document.addEventListener("pointercancel", cancelarPonteiro, true);
    document.addEventListener("pointerup", soltarPonteiro, true);
    document.addEventListener("focusin", foco, true);
    document.addEventListener("focusout", desfoco, true);
    document.addEventListener("keydown", teclado, true);
    return () => {
      document.removeEventListener("pointerdown", ponteiro, true);
      document.removeEventListener("click", fimClique, true);
      document.removeEventListener("pointercancel", cancelarPonteiro, true);
      document.removeEventListener("pointerup", soltarPonteiro, true);
      document.removeEventListener("focusin", foco, true);
      document.removeEventListener("focusout", desfoco, true);
      document.removeEventListener("keydown", teclado, true);
      clearTimeout(limpezaPonteiro);
      limparMarcador();
      delete raiz.dataset.modalidadeFoco;
    };
  }, []);
  return null;
}
