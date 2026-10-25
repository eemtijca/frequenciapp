// Eventos de push e toque no aviso do worker real, executados em VM
// para conferir conteúdo, foco e destino sem serviços externos.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

function worker(janelas: { url: string; focus: () => Promise<void> }[] = []) {
  const manipuladores = new Map<string, (evento: unknown) => void>();
  const mostrar = vi.fn(async (_titulo: string, _opcoes: Record<string, unknown>) => undefined);
  const abrir = vi.fn(async () => undefined);
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), {
    URL,
    self: {
      addEventListener: (tipo: string, funcao: (evento: unknown) => void) =>
        manipuladores.set(tipo, funcao),
      location: { origin: "https://app.exemplo.test" },
      registration: { showNotification: mostrar },
      clients: { matchAll: async () => janelas, openWindow: abrir },
    },
  });
  async function disparar(tipo: string, evento: Record<string, unknown>) {
    let espera: Promise<unknown> | undefined;
    const funcao = manipuladores.get(tipo);
    if (!funcao) throw new Error("Evento ausente no worker.");
    funcao({
      ...evento,
      waitUntil: (promessa: Promise<unknown>) => {
        espera = promessa;
      },
    });
    await espera;
  }
  return { mostrar, abrir, disparar };
}

describe("push no service worker", () => {
  it("mostra o aviso com ícones locais e etiqueta", async () => {
    const atual = worker();
    await atual.disparar("push", {
      data: {
        json: () => ({
          titulo: "Outro título",
          corpo: "Acompanhamento disponível.",
          etiqueta: "resumo-frequencia-2026-09-30",
          url: "https://atacante.test",
        }),
      },
    });
    expect(atual.mostrar).toHaveBeenCalledWith("FrequenciApp", {
      body: "Acompanhamento disponível.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "resumo-frequencia-2026-09-30",
    });
  });
  it("mostra um aviso genérico quando o payload está inválido ou ausente", async () => {
    const atual = worker();
    await atual.disparar("push", {
      data: {
        json: () => {
          throw new Error("JSON inválido");
        },
      },
    });
    await atual.disparar("push", {});
    expect(atual.mostrar).toHaveBeenCalledTimes(2);
    expect(atual.mostrar.mock.calls[0]?.[0]).toBe("FrequenciApp");
  });
  it("foca a janela do aplicativo sem navegar uma chamada em edição", async () => {
    const focar = vi.fn(async () => undefined);
    const atual = worker([{ url: "https://app.exemplo.test/?visao=chamada", focus: focar }]);
    const fechar = vi.fn();
    await atual.disparar("notificationclick", { notification: { close: fechar } });
    expect(fechar).toHaveBeenCalledOnce();
    expect(focar).toHaveBeenCalledOnce();
    expect(atual.abrir).not.toHaveBeenCalled();
  });
  it("abre somente a raiz do aplicativo quando não há janela própria", async () => {
    const atual = worker([{ url: "https://outro.exemplo.test", focus: vi.fn() }]);
    await atual.disparar("notificationclick", { notification: { close: vi.fn() } });
    expect(atual.abrir).toHaveBeenCalledWith("/");
  });
});
