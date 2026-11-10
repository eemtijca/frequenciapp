// Caracteriza o hook real com hooks mínimos e armazenamento sintético; não prova PWA ou IndexedDB real.
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  estados: [] as unknown[],
  efeitos: [] as (() => unknown)[],
  rede: vi.fn(),
  identificar: vi.fn(),
  lerSegredo: vi.fn(),
  cache: vi.fn(),
  segredo: vi.fn(),
  esquecer: vi.fn(),
  guardados: new Map<string, unknown>(),
}));
vi.mock("react", () => ({
  useState: (inicial: unknown) => {
    const i = h.estados.length;
    h.estados.push(inicial);
    return [
      inicial,
      (v: unknown) => {
        h.estados[i] = typeof v === "function" ? v(h.estados[i]) : v;
      },
    ];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (acao: unknown) => acao,
  useEffect: (acao: () => unknown) => {
    h.efeitos.push(acao);
  },
}));
vi.mock("@/lib/api-cliente", async (original) => ({
  ...(await original<object>()),
  pedir: h.rede,
}));
vi.mock("@/lib/bi-armazenamento", () => ({
  cacheBi: h.cache,
  identificadorCacheBi: h.identificar,
  lerSegredoBi: h.lerSegredo,
  guardarSegredoBi: h.segredo,
  esquecerSegredoBi: h.esquecer,
}));
import { useDadosBi } from "@/lib/use-dados-bi";
import { ErroApi } from "@/lib/api-cliente";
const pagina = {
  escopo: { turmas: ["t"] },
  recursos: ["turmas"],
  linhas: [],
  proximaPagina: null,
  consultadoEm: "2026-01-01T00:00:00Z",
};
function promessa<T>() {
  let liberar: (v: T) => void = () => undefined;
  const valor = new Promise<T>((resolve) => {
    liberar = resolve;
  });
  return { valor, liberar };
}
function reconferirPeloBotao(contexto: Record<string, unknown>): () => void {
  const texto = readFileSync("src/components/bi/vista-bi.tsx", "utf8");
  const fonte = ts.createSourceFile(
    "vista-bi.tsx",
    texto,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const callbacks: ts.Expression[] = [];
  function visitar(no: ts.Node) {
    if (
      ts.isJsxElement(no) &&
      no.openingElement.tagName.getText(fonte) === "Button" &&
      no.children.some(
        (filho) => ts.isJsxText(filho) && filho.text.trim() === "Conferir chave novamente",
      )
    ) {
      for (const atributo of no.openingElement.attributes.properties) {
        if (
          ts.isJsxAttribute(atributo) &&
          atributo.name.getText(fonte) === "onClick" &&
          atributo.initializer &&
          ts.isJsxExpression(atributo.initializer) &&
          atributo.initializer.expression
        )
          callbacks.push(atributo.initializer.expression);
      }
    }
    ts.forEachChild(no, visitar);
  }
  visitar(fonte);
  const callback = callbacks[0];
  if (callbacks.length !== 1 || !callback)
    throw new Error("Callback único do botão de reconferência não encontrado.");
  const codigo = ts.transpileModule(`const acao = ${callback.getText(fonte)}; acao;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return runInNewContext(codigo, contexto) as () => void;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  h.identificar.mockReset().mockImplementation(async (chave: string) => `id-${chave}`);
  h.lerSegredo.mockReset().mockReturnValue("");
  h.estados.length = 0;
  h.efeitos.length = 0;
  h.guardados.clear();
  vi.stubGlobal("navigator", { onLine: true });
  h.rede.mockResolvedValue(pagina);
  h.esquecer.mockReset();
  h.segredo.mockReset();
  h.cache.mockImplementation(
    async (acao: string, id: string, valor?: unknown, valido?: () => boolean) => {
      if (valido && !valido()) return undefined;
      if (acao === "ler") return h.guardados.get(id);
      if (acao === "gravar") h.guardados.set(id, valor);
      if (acao === "limpar")
        for (const chave of h.guardados.keys()) if (chave.startsWith(id)) h.guardados.delete(chave);
    },
  );
});
describe("contratos já existentes de acesso do BI", () => {
  for (const status of [401, 403]) {
    it(`recusa ${status} expurga chave e retratos mas não personalização`, async () => {
      const fonte = useDadosBi();
      await fonte.entrar("atual");
      await fonte.carregar("turmas", { inicio: "", fim: "" });
      h.rede.mockRejectedValueOnce(new ErroApi("Recusado", status));
      await expect(fonte.carregar("turmas", { inicio: "", fim: "" }, true)).rejects.toThrow(
        "O acesso foi encerrado",
      );
      expect(h.guardados.size).toBe(0);
      expect(h.esquecer).toHaveBeenCalledWith("atual");
      expect(h.estados[0]).toBeNull();
      expect(h.estados[1]).toEqual({});
      expect(h.cache.mock.calls.filter(([acao, id]) => acao === "limpar" && id === "")).toEqual([]);
    });
  }
  it("recarga offline usa acesso guardado sem prometer revalidar revogação remota", async () => {
    h.guardados.set("id-atual:acesso", pagina);
    h.rede.mockRejectedValueOnce(new TypeError("Sem rede"));
    vi.stubGlobal("navigator", { onLine: false });
    const fonte = useDadosBi();
    await fonte.entrar("atual");
    expect(h.estados[0]).toMatchObject({ chave: "atual", pagina });
    expect(h.estados[6]).toBe(true);
  });
  it("redução de escopo apaga os retratos anteriores da mesma chave", async () => {
    h.guardados.set("id-atual:acesso", pagina);
    h.guardados.set("id-atual:turmas", { linhas: [{ id: "antiga" }] });
    h.rede.mockResolvedValueOnce({ ...pagina, escopo: { turmas: [] } });
    const fonte = useDadosBi();
    await fonte.entrar("atual");
    expect(h.guardados.has("id-atual:turmas")).toBe(false);
    expect(h.guardados.get("id-atual:acesso")).toMatchObject({ escopo: { turmas: [] } });
  });
});

describe("reconexão automática", () => {
  it("preserva acesso e retratos enquanto a conferência falha", async () => {
    const janela = new EventTarget();
    vi.stubGlobal("window", janela);
    h.lerSegredo.mockReturnValue("atual");
    const fonte = useDadosBi();
    h.efeitos[0]?.();
    await vi.waitFor(() => expect(h.estados[0]).toMatchObject({ chave: "atual" }));
    const retrato = await fonte.carregar("turmas", { inicio: "", fim: "" });
    const acessoAntes = h.estados[0];
    const retratosAntes = h.estados[1];
    h.rede.mockRejectedValueOnce(new ErroApi("Muitas consultas. Aguarde um minuto.", 429));
    janela.dispatchEvent(new Event("online"));
    await vi.waitFor(() => expect(h.estados[4]).toBe("Muitas consultas. Aguarde um minuto."));
    expect(h.estados[0]).toBe(acessoAntes);
    expect(h.estados[1]).toBe(retratosAntes);
    expect(h.estados[1]).toEqual({ turmas: retrato });
  });
});

describe("persistência opcional do BI", () => {
  for (const persistir of [false, true]) {
    it(`botão real de reconferência mantém persistir=${persistir} nos novos retratos`, async () => {
      const fonte = useDadosBi();
      await fonte.entrar("atual", persistir);
      await fonte.carregar("turmas", { inicio: "", fim: "" });
      h.cache.mockClear();
      h.segredo.mockClear();
      h.rede.mockClear();
      let reconferencia: Promise<void> | undefined;
      const entrar = vi.fn((...args: Parameters<typeof fonte.entrar>) => {
        reconferencia = fonte.entrar(...args);
        return reconferencia;
      });
      const clicar = reconferirPeloBotao({ acesso: h.estados[0], entrar });
      clicar();
      expect(entrar).toHaveBeenCalledOnce();
      expect(reconferencia).toBeInstanceOf(Promise);
      await reconferencia;
      const retrato = await fonte.carregar("turmas", { inicio: "", fim: "" }, true);
      expect(h.rede).toHaveBeenCalledTimes(2);
      expect(h.estados[1]).toMatchObject({ turmas: retrato });
      expect(h.estados[0]).toMatchObject({ chave: "atual", persistir });
      if (persistir) {
        expect(h.segredo).toHaveBeenCalledExactlyOnceWith("atual");
        expect(h.guardados.get("id-atual:acesso")).toEqual(pagina);
        expect(h.cache.mock.calls.filter(([acao]) => acao === "gravar")).toHaveLength(2);
      } else {
        expect(h.segredo).not.toHaveBeenCalled();
        expect(h.guardados.size).toBe(0);
        expect(h.cache.mock.calls.filter(([acao]) => acao === "gravar" || acao === "ler")).toEqual(
          [],
        );
      }
    });
  }
  it("consulta só em memória quando a persistência é recusada", async () => {
    h.guardados.set("id-atual:acesso", pagina);
    const fonte = useDadosBi();
    await fonte.entrar("atual", false);
    await fonte.carregar("turmas", { inicio: "", fim: "" });
    expect(h.segredo).not.toHaveBeenCalled();
    expect(h.esquecer).toHaveBeenCalled();
    expect(h.guardados.size).toBe(0);
    expect(h.cache.mock.calls.filter(([acao]) => acao === "gravar" || acao === "ler")).toEqual([]);
    expect(h.estados[0]).toMatchObject({ chave: "atual", persistir: false });
  });
  it("revalidação limpa memória e tarefas do acesso anterior", async () => {
    const fonte = useDadosBi();
    await fonte.entrar("antiga");
    await fonte.carregar("turmas", { inicio: "", fim: "" });
    const pausa = promessa<typeof pagina>();
    h.rede.mockReturnValueOnce(pausa.valor);
    const nova = fonte.entrar("atual");
    expect(h.estados[0]).toBeNull();
    expect(h.estados[1]).toEqual({});
    pausa.liberar(pagina);
    await nova;
  });
});

describe("esquecimento durante o hash pendente", () => {
  for (const origem of ["abertura guardada", "reconferência pelo botão"]) {
    for (const limpeza of ["esquecer chave", "clear"]) {
      it(`${origem}: ${limpeza} recebido antes do digest impede acesso e persistência antigos`, async () => {
        const real =
          await vi.importActual<typeof import("@/lib/bi-armazenamento")>("@/lib/bi-armazenamento");
        const id = await real.identificadorCacheBi("atual");
        h.identificar.mockImplementation(real.identificadorCacheBi);
        const janela = new EventTarget();
        vi.stubGlobal("window", janela);
        const fonte = useDadosBi();
        if (origem === "reconferência pelo botão") {
          await fonte.entrar("atual");
          await fonte.carregar("turmas", { inicio: "", fim: "" });
        } else h.lerSegredo.mockReturnValue("atual");
        h.guardados.set(`${id}:acesso`, pagina);
        h.cache.mockClear();
        h.segredo.mockClear();
        h.esquecer.mockClear();
        h.rede.mockClear();
        const pausa = promessa<void>();
        const digestReal = crypto.subtle.digest.bind(crypto.subtle);
        let hashPendente = true;
        const digest = vi.fn(async (algoritmo: AlgorithmIdentifier, dados: BufferSource) => {
          await pausa.valor;
          const resultado = await digestReal(algoritmo, dados);
          hashPendente = false;
          return resultado;
        });
        vi.stubGlobal("crypto", { subtle: { digest } });
        const desmontar = h.efeitos[0]?.();
        let entrada: Promise<void> | undefined;
        if (origem === "reconferência pelo botão")
          reconferirPeloBotao({
            acesso: h.estados[0],
            entrar: (...args: Parameters<typeof fonte.entrar>) => {
              entrada = fonte.entrar(...args);
              return entrada;
            },
          })();
        try {
          expect(digest).toHaveBeenCalledOnce();
          expect(hashPendente).toBe(true);
          expect(h.rede).not.toHaveBeenCalled();
          const recebido = vi.fn();
          janela.addEventListener("storage", recebido);
          const alheio = new Event("storage");
          Object.assign(alheio, { key: "frequencibi:chave", oldValue: "outra", newValue: null });
          janela.dispatchEvent(alheio);
          expect(h.esquecer).not.toHaveBeenCalled();
          const evento = new Event("storage");
          Object.assign(evento, {
            key: limpeza === "clear" ? null : "frequencibi:chave",
            oldValue: limpeza === "clear" ? null : "atual",
            newValue: null,
          });
          janela.dispatchEvent(evento);
          expect(recebido).toHaveBeenCalledTimes(2);
          expect(hashPendente).toBe(true);
          // Representa a limpeza concluída pela outra aba antes de liberar o hash.
          h.guardados.clear();
          pausa.liberar();
          await entrada;
          await vi.waitFor(() => expect(h.estados[2]).toBe(false));
          expect(hashPendente).toBe(false);
          expect.soft(h.estados[0]).toBeNull();
          expect.soft(h.segredo).not.toHaveBeenCalled();
          expect.soft(h.guardados.size).toBe(0);
          expect.soft(h.rede).not.toHaveBeenCalled();
          expect
            .soft(h.cache.mock.calls.filter(([acao]) => acao === "ler" || acao === "gravar"))
            .toEqual([]);
          expect(h.estados[1]).toEqual({});
        } finally {
          pausa.liberar();
          await entrada;
          if (typeof desmontar === "function") desmontar();
        }
      });
    }
  }
});

describe("esquecimento do BI", () => {
  it("esquecer durante a conferência limpa o cache da chave em consulta", async () => {
    h.guardados.set("id-atual:acesso", pagina);
    const pausa = promessa<typeof pagina>();
    h.rede.mockReturnValueOnce(pausa.valor);
    const fonte = useDadosBi();
    const entrada = fonte.entrar("atual");
    await vi.waitFor(() => expect(h.rede).toHaveBeenCalledOnce());
    await fonte.esquecer();
    pausa.liberar(pagina);
    await entrada;
    expect(h.guardados.size).toBe(0);
  });
  it("evento de esquecimento de outra aba invalida somente a chave correspondente", async () => {
    const janela = new EventTarget();
    vi.stubGlobal("window", janela);
    const fonte = useDadosBi();
    await fonte.entrar("atual");
    const desmontar = h.efeitos[0]?.();
    const outro = new Event("storage");
    Object.assign(outro, { key: "frequencibi:chave", oldValue: "outra", newValue: null });
    janela.dispatchEvent(outro);
    expect(h.estados[0]).toMatchObject({ chave: "atual" });
    const evento = new Event("storage");
    Object.assign(evento, { key: "frequencibi:chave", oldValue: "atual", newValue: null });
    janela.dispatchEvent(evento);
    await vi.waitFor(() => expect(h.estados[0]).toBeNull());
    expect(h.estados[1]).toEqual({});
    if (typeof desmontar === "function") desmontar();
  });
  it("resposta antiga de acesso não recria cache nem chave depois de esquecer", async () => {
    const pausa = promessa<void>();
    let chegou = false;
    h.cache.mockImplementation(
      async (acao: string, id: string, valor?: unknown, valido?: () => boolean) => {
        if (acao === "ler") {
          chegou = true;
          await pausa.valor;
        }
        if (valido && !valido()) return undefined;
        if (acao === "gravar") h.guardados.set(id, valor);
      },
    );
    const fonte = useDadosBi();
    const entrada = fonte.entrar("antiga");
    await vi.waitFor(() => expect(chegou).toBe(true));
    await fonte.esquecer();
    pausa.liberar();
    await entrada;
    expect(h.guardados.size).toBe(0);
    expect(h.segredo).not.toHaveBeenCalled();
    expect(h.estados[0]).toBeNull();
  });
  it("falha ao remover chave não impede tentativa de expurgar retratos", async () => {
    const fonte = useDadosBi();
    await fonte.entrar("atual");
    h.esquecer.mockImplementation(() => {
      throw new DOMException("Bloqueado", "SecurityError");
    });
    await fonte.esquecer();
    expect(h.guardados.size).toBe(0);
    expect(h.estados[0]).toBeNull();
    expect(h.estados[5]).toContain("armazenamento");
  });
  it("401 antigo não apaga acesso mais recente", async () => {
    const pausa = promessa<typeof pagina>();
    h.rede
      .mockImplementationOnce(async () => {
        await pausa.valor;
        throw new ErroApi("Recusado", 401);
      })
      .mockResolvedValue(pagina);
    const fonte = useDadosBi();
    const anterior = fonte.entrar("antiga");
    await vi.waitFor(() => expect(h.rede).toHaveBeenCalledOnce());
    await fonte.entrar("atual");
    pausa.liberar(pagina);
    await anterior;
    expect(h.estados[0]).toMatchObject({ chave: "atual" });
    expect(h.esquecer).not.toHaveBeenCalled();
  });
});

// Só as APIs de dispositivo são simuladas: abertura, transação e cursor são dirigidos pelo cacheBi real.
async function usarCacheReal() {
  const real =
    await vi.importActual<typeof import("@/lib/bi-armazenamento")>("@/lib/bi-armazenamento");
  const dados = new Map<string, unknown>();
  const local = new Map<string, string>();
  const excluidos: string[] = [];
  const transacoes = vi.fn();
  let proxima:
    | { chegou: ReturnType<typeof promessa<void>>; liberar: ReturnType<typeof promessa<void>> }
    | undefined;
  vi.stubGlobal("localStorage", {
    getItem: (chave: string) => local.get(chave) ?? null,
    setItem: (chave: string, valor: string) => local.set(chave, valor),
    removeItem: (chave: string) => local.delete(chave),
  });
  vi.stubGlobal("indexedDB", {
    open: vi.fn(() => {
      const pausa = proxima;
      proxima = undefined;
      const db = {
        close: vi.fn(),
        transaction: (nome: string, modo: string) => {
          transacoes(nome, modo);
          const tx = { oncomplete: () => undefined, objectStore: () => store };
          const concluir = () => tx.oncomplete();
          const store = {
            get: (id: string) => {
              const pedido = { result: dados.get(id), onsuccess: () => undefined };
              queueMicrotask(() => {
                pedido.onsuccess();
                concluir();
              });
              return pedido;
            },
            put: (valor: unknown, id: string) => {
              dados.set(id, valor);
              queueMicrotask(concluir);
            },
            openCursor: () => {
              const chaves = [...dados.keys()];
              let indice = 0;
              const pedido: {
                result: { key: string; delete: () => void; continue: () => void } | null;
                onsuccess: () => void;
              } = { result: null, onsuccess: () => undefined };
              const avancar = () =>
                queueMicrotask(() => {
                  const key = chaves[indice++];
                  pedido.result =
                    key === undefined
                      ? null
                      : {
                          key,
                          delete: () => {
                            excluidos.push(key);
                            dados.delete(key);
                          },
                          continue: avancar,
                        };
                  pedido.onsuccess();
                  if (key === undefined) concluir();
                });
              avancar();
              return pedido;
            },
          };
          return tx;
        },
      };
      const pedido = { result: db, onsuccess: () => undefined };
      void (async () => {
        if (pausa) {
          pausa.chegou.liberar();
          await pausa.liberar.valor;
        } else await Promise.resolve();
        pedido.onsuccess();
      })();
      return pedido;
    }),
  });
  h.identificar.mockImplementation(real.identificadorCacheBi);
  h.cache.mockImplementation(real.cacheBi);
  h.esquecer.mockImplementation(real.esquecerSegredoBi);
  h.segredo.mockImplementation(real.guardarSegredoBi);
  return {
    dados,
    local,
    excluidos,
    transacoes,
    identificar: real.identificadorCacheBi,
    segurarAbertura: () => {
      const pausa = { chegou: promessa<void>(), liberar: promessa<void>() };
      proxima = pausa;
      return { chegou: pausa.chegou.valor, liberar: () => pausa.liberar.liberar() };
    },
  };
}

describe("expurgo concorrente por chave no cache real", () => {
  it("entrada de outra chave não cancela o expurgo retido antes da transação", async () => {
    const cache = await usarCacheReal();
    const idA = await cache.identificar("chave-a");
    const idB = await cache.identificar("chave-b");
    const fonte = useDadosBi();
    await fonte.entrar("chave-a");
    await fonte.carregar("turmas", { inicio: "", fim: "" });
    const anteriores = [...cache.dados.keys()];
    expect(anteriores).toHaveLength(2);
    expect(anteriores.every((id) => id.startsWith(`${idA}:`))).toBe(true);
    const transacoesAntes = cache.transacoes.mock.calls.length;
    const pausa = cache.segurarAbertura();
    const expurgo = fonte.esquecer();
    await pausa.chegou;
    try {
      expect(cache.transacoes).toHaveBeenCalledTimes(transacoesAntes);
      expect(cache.local.has("frequencibi:chave")).toBe(false);
      expect(h.estados[0]).toBeNull();
      expect(h.estados[1]).toEqual({});
      await fonte.entrar("chave-b");
      const retratoB = await fonte.carregar("turmas", { inicio: "", fim: "" });
      const dadosB = [...cache.dados.entries()].filter(([id]) => id.startsWith(`${idB}:`));
      expect(dadosB).toHaveLength(2);
      expect(cache.excluidos).toEqual([]);
      pausa.liberar();
      await expurgo;
      expect.soft(anteriores.filter((id) => cache.dados.has(id))).toEqual([]);
      expect.soft(cache.excluidos).toEqual(anteriores);
      expect([...cache.dados.entries()]).toEqual(dadosB);
      expect(cache.local.get("frequencibi:chave")).toBe("chave-b");
      expect(h.estados[0]).toMatchObject({ chave: "chave-b", persistir: true });
      expect(h.estados[1]).toEqual({ turmas: retratoB });
    } finally {
      pausa.liberar();
      await expurgo;
    }
  });

  it("falha da outra chave não cancela o expurgo nem repõe o segredo esquecido", async () => {
    const cache = await usarCacheReal();
    const fonte = useDadosBi();
    await fonte.entrar("chave-a");
    await fonte.carregar("turmas", { inicio: "", fim: "" });
    const anteriores = [...cache.dados.keys()];
    const pausa = cache.segurarAbertura();
    const expurgo = fonte.esquecer();
    await pausa.chegou;
    try {
      h.rede.mockRejectedValueOnce(new ErroApi("Entrada recusada", 400));
      await fonte.entrar("chave-b");
      expect(h.estados[0]).toBeNull();
      expect(h.estados[4]).toBe("Entrada recusada");
      expect(cache.dados.size).toBe(2);
      pausa.liberar();
      await expurgo;
      expect(cache.dados.size).toBe(0);
      expect(cache.excluidos).toEqual(anteriores);
      expect(cache.local.has("frequencibi:chave")).toBe(false);
      expect(h.estados[0]).toBeNull();
      expect(h.estados[1]).toEqual({});
      expect(h.estados[2]).toBe(false);
      expect(h.estados[4]).toBe("Entrada recusada");
    } finally {
      pausa.liberar();
      await expurgo;
    }
  });

  for (const sucesso of [true, false]) {
    it(`reentrada da mesma chave com sucesso=${sucesso} espera o expurgo sem perder dados novos`, async () => {
      const cache = await usarCacheReal();
      const fonte = useDadosBi();
      await fonte.entrar("chave-a");
      await fonte.carregar("turmas", { inicio: "", fim: "" });
      const anteriores = [...cache.dados.keys()];
      const pausa = cache.segurarAbertura();
      const expurgo = fonte.esquecer();
      await pausa.chegou;
      const identificou = promessa<void>();
      h.identificar.mockImplementationOnce(async (chave: string) => {
        const id = await cache.identificar(chave);
        identificou.liberar();
        return id;
      });
      h.rede.mockClear();
      const nova = { ...pagina, linhas: [{ id: "nova" }], consultadoEm: "2026-02-01T00:00:00Z" };
      if (sucesso) h.rede.mockResolvedValue(nova);
      else h.rede.mockRejectedValueOnce(new ErroApi("Reentrada recusada", 400));
      const entrada = fonte.entrar("chave-a");
      try {
        await identificou.valor;
        await Promise.resolve();
        expect(h.rede).not.toHaveBeenCalled();
        expect(cache.dados.size).toBe(2);
        expect(cache.local.has("frequencibi:chave")).toBe(false);
        pausa.liberar();
        await expurgo;
        await entrada;
        expect(cache.excluidos).toEqual(anteriores);
        if (sucesso) {
          const retrato = await fonte.carregar("turmas", { inicio: "", fim: "" });
          expect(retrato.linhas).toEqual(nova.linhas);
          expect(cache.dados.size).toBe(2);
          expect([...cache.dados.values()]).toEqual([nova, retrato]);
          expect(cache.local.get("frequencibi:chave")).toBe("chave-a");
          expect(h.estados[0]).toMatchObject({ chave: "chave-a", pagina: nova });
          expect(h.estados[1]).toEqual({ turmas: retrato });
        } else {
          expect(cache.dados.size).toBe(0);
          expect(cache.local.has("frequencibi:chave")).toBe(false);
          expect(h.estados[0]).toBeNull();
          expect(h.estados[1]).toEqual({});
          expect(h.estados[4]).toBe("Reentrada recusada");
        }
      } finally {
        pausa.liberar();
        await expurgo;
        await entrada;
      }
    });
  }

  it("dois expurgos pendentes mantêm a espera por identidade sem bloquear a outra chave", async () => {
    const cache = await usarCacheReal();
    const fonte = useDadosBi();
    await fonte.entrar("chave-a");
    const pausaA = cache.segurarAbertura();
    const expurgoA = fonte.esquecer();
    await pausaA.chegou;
    await fonte.entrar("chave-b");
    const pausaB = cache.segurarAbertura();
    const expurgoB = fonte.esquecer();
    await pausaB.chegou;
    const entradaA = fonte.entrar("chave-a");
    try {
      pausaA.liberar();
      await expurgoA;
      await entradaA;
      const retratoA = await fonte.carregar("turmas", { inicio: "", fim: "" });
      expect(h.estados[0]).toMatchObject({ chave: "chave-a" });
      expect(cache.dados.size).toBe(3);
      pausaB.liberar();
      await expurgoB;
      expect(cache.dados.size).toBe(2);
      expect(cache.local.get("frequencibi:chave")).toBe("chave-a");
      expect(h.estados[1]).toEqual({ turmas: retratoA });
      expect([...cache.dados.values()]).toEqual([pagina, retratoA]);
    } finally {
      pausaA.liberar();
      pausaB.liberar();
      await Promise.all([expurgoA, expurgoB, entradaA]);
    }
  });
});
