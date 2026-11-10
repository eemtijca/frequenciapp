// Verifica decisões de escrita após abertura assíncrona, validade, expurgo e remoção condicional da chave local.
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TTL_SEGREDO_BI_MS,
  cacheBi,
  consumirSegredoBiExpirado,
  esquecerSegredoBi,
  expurgarBiNoLogout,
  guardarSegredoBi,
  identificadorCacheBi,
  lerSegredoBi,
  limparTudoBi,
} from "@/lib/bi-armazenamento";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
function armazenamentoLocal(inicial: Record<string, string> = {}) {
  const copias = new Map(Object.entries(inicial));
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => copias.get(chave) ?? null,
    setItem: (chave: string, valor: string) => copias.set(chave, valor),
    removeItem: (chave: string) => copias.delete(chave),
  });
  return copias;
}
function simularIndexedDb(chaves: string[]) {
  const restantes = new Set(chaves);
  const ordem = [...chaves];
  let indice = 0;
  vi.stubGlobal("indexedDB", {
    open: () => {
      const db = {
        close: vi.fn(),
        transaction: () => {
          const tx: { oncomplete: () => void; objectStore: () => unknown } = {
            oncomplete: () => undefined,
            objectStore: () => ({
              openCursor: () => {
                const pedido: {
                  result: { key: string; delete: () => void; continue: () => void } | null;
                  onsuccess: () => void;
                } = { result: null, onsuccess: () => undefined };
                const avancar = () =>
                  queueMicrotask(() => {
                    const chave = ordem[indice];
                    indice += 1;
                    if (chave === undefined) {
                      pedido.result = null;
                      pedido.onsuccess();
                      tx.oncomplete();
                      return;
                    }
                    pedido.result = {
                      key: chave,
                      delete: () => {
                        restantes.delete(chave);
                      },
                      continue: avancar,
                    };
                    pedido.onsuccess();
                  });
                avancar();
                return pedido;
              },
            }),
          };
          return tx;
        },
      };
      const pedido = { result: db, onsuccess: () => undefined };
      queueMicrotask(() => pedido.onsuccess());
      return pedido;
    },
  });
  return restantes;
}
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
  it("expira a chave guardada depois de sete dias e descarta o formato antigo", () => {
    const copias = armazenamentoLocal();
    const agora = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    guardarSegredoBi("ficticia");
    expect(lerSegredoBi()).toBe("ficticia");
    agora.mockReturnValue(1_000_000 + TTL_SEGREDO_BI_MS + 1);
    expect(lerSegredoBi()).toBe("");
    expect(consumirSegredoBiExpirado()).toBe("ficticia");
    expect(copias.has("frequencibi:chave")).toBe(false);
    copias.set("frequencibi:chave", "formato-antigo");
    expect(lerSegredoBi()).toBe("");
    expect(consumirSegredoBiExpirado()).toBe("formato-antigo");
    expect(copias.has("frequencibi:chave")).toBe(false);
  });
  it("logout remove a chave e os retratos dela, preservando outra chave", async () => {
    const idA = await identificadorCacheBi("chave-a");
    const idB = await identificadorCacheBi("chave-b");
    const copias = armazenamentoLocal({
      "frequencibi:chave": JSON.stringify({ chave: "chave-a", guardadoEm: Date.now() }),
    });
    const restantes = simularIndexedDb([
      `${idA}:acesso`,
      `${idA}:turmas`,
      `${idB}:acesso`,
      "outro:acesso",
    ]);
    await expurgarBiNoLogout();
    expect(copias.has("frequencibi:chave")).toBe(false);
    expect([...restantes]).toEqual([`${idB}:acesso`, "outro:acesso"]);
  });
  it("logout não apaga a chave nova gravada por outra aba durante o expurgo", async () => {
    const idA = await identificadorCacheBi("chave-a");
    const idB = await identificadorCacheBi("chave-b");
    const copias = armazenamentoLocal({
      "frequencibi:chave": JSON.stringify({ chave: "chave-a", guardadoEm: Date.now() }),
    });
    const restantes = simularIndexedDb([`${idA}:acesso`, `${idB}:acesso`]);
    const expurgo = expurgarBiNoLogout();
    copias.set(
      "frequencibi:chave",
      JSON.stringify({ chave: "chave-b", guardadoEm: Date.now() + 1 }),
    );
    await expurgo;
    expect(JSON.parse(copias.get("frequencibi:chave") ?? "{}")).toMatchObject({
      chave: "chave-b",
    });
    expect([...restantes]).toEqual([`${idB}:acesso`]);
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
