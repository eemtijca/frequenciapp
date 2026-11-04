"use client";

// Distingue o ponteiro do teclado sem alterar o foco do navegador.
import { useEffect } from "react";

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
    const limparMarcador = () => {
      focoDesconhecido?.removeAttribute("data-foco-desconhecido");
      focoDesconhecido = null;
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
        raiz.dataset.modalidadeFoco = "ponteiro";
        if (pertenceAoPonteiro(document.activeElement)) limparMarcador();
      }
    };
    const pertenceAoPonteiro = (alvo: EventTarget | null) => {
      if (!(alvo instanceof Node) || !(alvoPonteiro instanceof Node)) return false;
      if (alvo.contains(alvoPonteiro)) return true;
      const elemento = alvoPonteiro instanceof Element ? alvoPonteiro : alvoPonteiro.parentElement;
      return elemento?.closest("label")?.control === alvo;
    };
    const foco = (evento: FocusEvent) => {
      const diretoDoPonteiro = pertenceAoPonteiro(evento.target);
      limparMarcador();
      if (!diretoDoPonteiro && raiz.dataset.modalidadeFoco !== "teclado") {
        if (evento.target instanceof Element) {
          focoDesconhecido = evento.target;
          focoDesconhecido.setAttribute("data-foco-desconhecido", "");
        }
      }
      if (raiz.dataset.modalidadeFoco === "ponteiro" && !diretoDoPonteiro) {
        delete raiz.dataset.modalidadeFoco;
      }
      alvoPonteiro = null;
    };
    const desfoco = (evento: FocusEvent) => {
      limparMarcador();
      if (raiz.dataset.modalidadeFoco === "ponteiro" && !pertenceAoPonteiro(evento.relatedTarget)) {
        delete raiz.dataset.modalidadeFoco;
      }
    };
    // O foco por toque ou por label pode ocorrer depois de pointerup.
    const fimClique = (evento: MouseEvent) => {
      if (evento.isTrusted) limpezaPonteiro = setTimeout(() => (alvoPonteiro = null), 0);
    };
    const restaurarFocoAnterior = () => {
      alvoPonteiro = null;
      if (antesDoPonteiro && document.activeElement === antesDoPonteiro.foco) {
        if (antesDoPonteiro.modalidade) raiz.dataset.modalidadeFoco = antesDoPonteiro.modalidade;
        else delete raiz.dataset.modalidadeFoco;
        if (antesDoPonteiro.desconhecido && antesDoPonteiro.foco) {
          focoDesconhecido = antesDoPonteiro.foco;
          focoDesconhecido.setAttribute("data-foco-desconhecido", "");
        }
      }
      antesDoPonteiro = null;
    };
    const cancelarPonteiro = (evento: PointerEvent) => {
      if (evento.isTrusted) restaurarFocoAnterior();
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
      if (
        evento.isTrusted &&
        (evento.key === "Tab" || !editaTexto || navegaOpcoes) &&
        !evento.metaKey &&
        !evento.ctrlKey &&
        !evento.altKey &&
        teclasNavegacao.has(evento.key)
      ) {
        raiz.dataset.modalidadeFoco = "teclado";
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
