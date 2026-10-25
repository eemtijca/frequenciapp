// Exportação PNG preserva os dados declarados, identifica legendas e recusa cortes silenciosos.
import { afterEach, describe, expect, it, vi } from "vitest";
import { pngBi, quebrarTextoImagemBi } from "@/lib/bi-exportacao";

function preparar(svg = false) {
  const ctx = {
    font: "",
    fillStyle: "",
    fillRect: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
    measureText: (t: string) => ({ width: t.length * 10 }),
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ctx,
    toBlob: vi.fn((cb: (b: Blob) => void) => cb(new Blob(["QA PNG"], { type: "image/png" }))),
  };
  const clone = { setAttribute: vi.fn(), querySelectorAll: () => [] };
  const grafico = {
    querySelectorAll: () => [],
    cloneNode: () => clone,
    getBoundingClientRect: () => ({ width: 400, height: 400 }),
  };
  const elemento = {
    querySelector: () => (svg ? grafico : null),
    textContent: "QA SEGREDO NÃO EXPORTADO",
  } as unknown as HTMLElement;
  vi.stubGlobal("document", { body: {}, createElement: () => canvas });
  vi.stubGlobal("getComputedStyle", () => ({
    color: "#eee",
    backgroundColor: "#111",
    getPropertyValue: () => "#eee",
  }));
  vi.stubGlobal(
    "XMLSerializer",
    class {
      serializeToString() {
        return "<svg/>";
      }
    },
  );
  vi.stubGlobal(
    "Image",
    class {
      onload: (() => void) | undefined;
      set src(_valor: string) {
        this.onload?.();
      }
    },
  );
  return { elemento, ctx, canvas, clone };
}

afterEach(() => vi.unstubAllGlobals());

describe("imagem do FrequenciBI", () => {
  it("quebra textos extensos sem truncar nomes ou palavras longas", () => {
    const texto = "QA Nome extremamentecompridoparatestar a quebra";
    const linhas = quebrarTextoImagemBi(texto, (t) => t.length, 10);
    expect(linhas.every((l) => l.length <= 10)).toBe(true);
    expect(linhas.join("").replaceAll(" ", "")).toBe(texto.replaceAll(" ", ""));
  });

  it("inclui todos os grupos além do antigo limite de 22 e não lê conteúdo escolar extra do cartão", async () => {
    const { elemento, ctx } = preparar();
    const resumo = Array.from({ length: 50 }, (_, i) => `QA Turma ${i + 1}: ${i}%`);
    await expect(pngBi(elemento, "QA Análise", resumo)).resolves.toBeInstanceOf(Blob);
    const textos = ctx.fillText.mock.calls.map((c) => c[0]);
    expect(textos).toContain("Dados do recorte: 50 grupos");
    expect(textos).toContain("QA Turma 50: 49%");
    expect(textos).not.toContain("QA SEGREDO NÃO EXPORTADO");
  });

  it("mantém rosca circular e associa cores da legenda aos nomes no PNG", async () => {
    const { elemento, ctx, clone } = preparar(true);
    await pngBi(elemento, "QA Rosca", ["QA A: 12", "QA B: 15"], {
      contexto: "Ausências | 2026-10-01 a 2026-10-31",
      legenda: [
        { nome: "QA A", cor: "#37ad84" },
        { nome: "QA B", cor: "#559cd6" },
      ],
    });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    const desenho = ctx.drawImage.mock.calls[0];
    expect(desenho?.[3]).toBe(620);
    expect(desenho?.[4]).toBe(620);
    expect(clone.setAttribute).toHaveBeenCalledWith("width", "400");
    expect(ctx.fillText.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining(["QA A", "QA B", "QA A: 12", "QA B: 15"]),
    );
  });

  it("recusa recorte grande demais para PNG em vez de gerar imagem incompleta", async () => {
    const { elemento, canvas } = preparar();
    await expect(
      pngBi(
        elemento,
        "QA Extenso",
        Array.from({ length: 500 }, (_, i) => `QA ${i}`),
      ),
    ).rejects.toThrow("exporte o CSV completo");
    expect(canvas.toBlob).not.toHaveBeenCalled();
  });
});
