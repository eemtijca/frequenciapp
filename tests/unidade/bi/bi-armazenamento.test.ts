// Verifica decisões de escrita após abertura assíncrona e remoção condicional da chave local.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cacheBi, esquecerSegredoBi, limparTudoBi } from "@/lib/bi-armazenamento";
afterEach(() => vi.unstubAllGlobals());
describe("armazenamento privado do BI", () => {
  it("limpar tudo tenta os demais depósitos mesmo quando uma remoção local falha", async () => {
    const remover = vi.fn((chave: string) => {
      if (chave.endsWith(":chave")) throw new DOMException("Bloqueado", "SecurityError");
    });
    vi.stubGlobal("localStorage", {
      "frequencibi:chave": "ficticia",
      "frequencibi:personalizacao": "{}",
      removeItem: remover,
    });
    const abrir = vi.fn(() => {
      const pedido = { onerror: null } as unknown as IDBOpenDBRequest;
      queueMicrotask(() => pedido.onerror?.(new Event("error")));
      return pedido;
    });
    vi.stubGlobal("indexedDB", { open: abrir });
    await expect(limparTudoBi()).rejects.toThrow();
    expect(remover).toHaveBeenCalledWith("frequencibi:personalizacao");
    expect(abrir).toHaveBeenCalledOnce();
  });
  it("não apaga chave substituída por outra aba", () => {
    const copias = new Map([["frequencibi:chave", "nova"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => copias.get(k) ?? null,
      removeItem: (k: string) => copias.delete(k),
    });
    esquecerSegredoBi("antiga");
    expect(copias.get("frequencibi:chave")).toBe("nova");
    esquecerSegredoBi("nova");
    expect(copias.has("frequencibi:chave")).toBe(false);
  });
  it("reconfere geração depois de abrir IndexedDB e antes de criar transação", async () => {
    const pedido = { onsuccess: null } as unknown as IDBOpenDBRequest;
    const transaction = vi.fn();
    const close = vi.fn();
    Object.assign(pedido, { result: { transaction, close } });
    vi.stubGlobal("indexedDB", { open: () => pedido });
    let valido = true;
    const gravar = cacheBi("gravar", "id:acesso", { linhas: [] }, () => valido);
    valido = false;
    pedido.onsuccess?.(new Event("success"));
    await expect(gravar).resolves.toBeUndefined();
    expect(transaction).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
