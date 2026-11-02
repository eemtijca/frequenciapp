import { afterEach, describe, expect, it, vi } from "vitest";
import { registrarTestemunha } from "../../ponta-a-ponta/helpers/testemunha-aviso";

class NoFalso {}

function montarTestemunha(
  retangulo: { left: number; top: number; right: number; bottom: number },
  tipoEvento = "touchstart",
) {
  const botao = new NoFalso();
  const aviso = Object.assign(new NoFalso(), {
    parentElement: null,
    querySelector: () => ({ textContent: "Configurações salvas." }),
    getClientRects: () => [retangulo],
  });
  Object.assign(botao, { contains: (elemento: unknown) => elemento === botao });
  const ouvintes = new Map<string, (evento: unknown) => void>();
  const elementFromPoint = vi.fn<(_x: number, _y: number) => NoFalso | null>(() => aviso);
  vi.stubGlobal("Node", NoFalso);
  vi.stubGlobal("window", { innerWidth: 100, innerHeight: 100 });
  vi.stubGlobal("document", {
    querySelectorAll: () => [aviso],
    addEventListener: (tipo: string, callback: (evento: unknown) => void) => {
      ouvintes.set(tipo, callback);
    },
    removeEventListener: (tipo: string, callback: (evento: unknown) => void) => {
      if (ouvintes.get(tipo) === callback) ouvintes.delete(tipo);
    },
    elementFromPoint,
  });
  vi.stubGlobal("getComputedStyle", () => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
  }));
  const resultado = registrarTestemunha(botao as unknown as HTMLElement, tipoEvento);
  return {
    resultado,
    elementFromPoint,
    aviso,
    botao,
    emitir: (tipo = tipoEvento, target = botao, isTrusted = true) =>
      ouvintes.get(tipo)?.({ target, isTrusted }),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("testemunha do aviso", () => {
  it("aceita aviso potencialmente visível sem receber ponteiro sob menu modal", () => {
    const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 });
    const corpo = Object.assign(new NoFalso(), { parentElement: null });
    Object.assign(teste.aviso, { parentElement: corpo });
    const menu = new NoFalso();
    teste.elementFromPoint.mockReturnValue(menu);
    vi.stubGlobal("getComputedStyle", () => ({
      display: "block",
      visibility: "visible",
      opacity: "1",
      pointerEvents: "none",
    }));
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(true);
    expect(teste.elementFromPoint).not.toHaveBeenCalled();
  });

  it.each([
    { left: 120, top: 10, right: 160, bottom: 30 },
    { left: -20, top: 10, right: 0, bottom: 30 },
    { left: 0, top: 100, right: 30, bottom: 150 },
  ])("rejeita caixa sem área na viewport %o", (retangulo) => {
    const teste = montarTestemunha(retangulo);
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(false);
  });

  it("aceita interseção parcial com a viewport", () => {
    const teste = montarTestemunha({ left: -100, top: -10, right: 20, bottom: 30 });
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(true);
  });

  it.each([
    { display: "none", visibility: "visible", opacity: "1" },
    { display: "block", visibility: "hidden", opacity: "1" },
    { display: "block", visibility: "visible", opacity: "0" },
  ])("rejeita estilo oculto %o", (estilo) => {
    const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 });
    vi.stubGlobal("getComputedStyle", () => estilo);
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(false);
  });

  it("rejeita opacidade zero em ancestral", () => {
    const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 });
    const ancestral = Object.assign(new NoFalso(), { parentElement: null });
    Object.assign(teste.aviso, { parentElement: ancestral });
    vi.stubGlobal("getComputedStyle", (elemento: unknown) => ({
      display: "block",
      visibility: "visible",
      opacity: elemento === ancestral ? "0" : "1",
    }));
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(false);
  });

  it("exige o texto exato do aviso", () => {
    const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 });
    teste.aviso.querySelector = () => ({ textContent: "Configurações salvas. Outro aviso" });
    teste.emitir();
    expect(teste.resultado.avisoVisivel).toBe(false);
  });

  it.each(["touchstart", "pointerdown"])("registra evento confiável %s em Gestão", (tipo) => {
    const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 }, tipo);
    teste.emitir(tipo, teste.botao, true);
    expect(teste.resultado).toMatchObject({ recebido: true, confiavel: true, avisoVisivel: true });
  });

  it.each(["touchstart", "pointerdown"])(
    "registra apenas evento %s com alvo Gestão e sua confiabilidade",
    (tipo) => {
      const teste = montarTestemunha({ left: 10, top: 10, right: 90, bottom: 90 }, tipo);
      teste.emitir(tipo === "touchstart" ? "pointerdown" : "touchstart");
      teste.emitir(tipo, new NoFalso());
      expect(teste.resultado.recebido).toBe(false);
      teste.emitir(tipo, teste.botao, false);
      expect(teste.resultado).toMatchObject({
        recebido: true,
        confiavel: false,
        avisoVisivel: true,
      });
      teste.emitir(tipo, teste.botao, true);
      expect(teste.resultado.confiavel).toBe(false);
    },
  );
});
