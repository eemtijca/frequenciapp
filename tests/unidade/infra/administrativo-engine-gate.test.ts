// Exercita criação parada, persistência e identidade sem acessar um Engine real.
import { describe, expect, it } from "vitest";
import {
  criarBarreiraEngine,
  type Supervisionar,
} from "../../isolamento/administrativo/engine-gate.mjs";

const rodada = "a".repeat(32);
const id = "d".repeat(64);
const imagem = `sha256:${"b".repeat(64)}`;
function receita() {
  return {
    Image: imagem,
    Cmd: ["postgres"],
    Env: ["POSTGRES_DB=sintetico"],
    Labels: {
      "br.frequenciapp.isolamento": rodada,
      "br.frequenciapp.isolamento.tipo": "banco",
    },
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 268435456,
      NanoCpus: 1000000000,
      PidsLimit: 64,
      LogConfig: { Type: "local", Config: { "max-size": "1m", "max-file": "1" } },
    },
  };
}
function fixture(
  opcoes: {
    falhaLedger?: string;
    incerta?: boolean;
    inspecao?: () => Promise<void>;
    supervisionar?: Supervisionar;
    prazoMs?: number;
    antesMutacao?: () => Promise<void>;
    aposMutacao?: () => Promise<void>;
    antesPersistir?: (registro: unknown) => Promise<void>;
    antesCriacao?: () => Promise<void>;
  } = {},
) {
  const eventos: string[] = [];
  const registros: unknown[] = [];
  const spec = receita();
  let running = false;
  let existe = true;
  const gate = criarBarreiraEngine({
    rodada,
    receitas: { banco: spec },
    imagens: { [imagem]: { volumes: [] } },
    supervisionar: opcoes.supervisionar,
    prazoMs: opcoes.prazoMs,
    persistir: async (registro: unknown) => {
      registros.push(structuredClone(registro));
      eventos.push("ledger");
      await opcoes.antesPersistir?.(registro);
      if (
        typeof registro === "object" &&
        registro !== null &&
        "estado" in registro &&
        registro.estado === opcoes.falhaLedger
      )
        throw new Error("Disco sintético indisponível.");
    },
    requisitar: async (metodo: string, caminho: string, corpo?: unknown) => {
      eventos.push(`${metodo} ${caminho}`);
      if (caminho === "/containers/create") {
        expect(corpo).toEqual(spec);
        await opcoes.antesCriacao?.();
        if (opcoes.incerta) throw new Error("Resposta de criação perdida.");
        return { Id: id, Warnings: [] };
      }
      if (caminho === `/containers/${id}/json`) {
        if (!existe) return null;
        const info = {
          Id: id,
          Config: spec,
          HostConfig: spec.HostConfig,
          Mounts: [],
          State: { Running: running, ExitCode: 0 },
        };
        await opcoes.inspecao?.();
        return info;
      }
      if (caminho.endsWith("/start") || caminho.endsWith("/stop")) {
        await opcoes.antesMutacao?.();
        running = caminho.endsWith("/start");
        await opcoes.aposMutacao?.();
      } else if (metodo === "DELETE") existe = false;
      else throw new Error("Endpoint não previsto no cliente sintético.");
      return null;
    },
  });
  return {
    gate,
    eventos,
    registros,
    adulterar: () => {
      spec.Labels["br.frequenciapp.isolamento"] = "vizinho";
    },
  };
}

describe("barreira administrativa em memória", () => {
  it.each([
    "intencao-fechada",
    "intencao-aberta",
    "enviada-confirmada",
    "enviada-incerta",
  ] as const)("ADM-CORRETIVO-01 fecha a autorização da criação: %s", async (variante) => {
    const entrou = Promise.withResolvers<void>();
    const liberar = Promise.withResolvers<void>();
    const enviada = variante.startsWith("enviada");
    const segurar = async () => {
      entrou.resolve();
      await liberar.promise;
    };
    const f = fixture({
      incerta: variante === "enviada-incerta",
      antesCriacao: enviada ? segurar : undefined,
      antesPersistir: async (registro) => {
        if (
          !enviada &&
          typeof registro === "object" &&
          registro !== null &&
          "estado" in registro &&
          registro.estado === "intencao"
        )
          await segurar();
      },
    });
    const criacao = f.gate.criar("banco").then(
      (handle) => ({ handle, erro: null }),
      (erro: unknown) => ({ handle: undefined, erro }),
    );
    await entrou.promise;
    const handle = f.gate.inventario()[0]?.handle;
    if (!handle) throw new Error("Intenção não inventariada.");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      expect(f.eventos.filter((e) => e.startsWith("POST"))).toHaveLength(enviada ? 1 : 0);
      if (variante !== "intencao-aberta") {
        const limpeza = await Promise.race([
          f.gate.encerrar(async () => {
            f.eventos.push("coleta");
          }),
          new Promise<never>((_, rejeitar) => {
            timer = setTimeout(() => rejeitar(new Error("Cleanup aguardou commit externo.")), 500);
          }),
        ]);
        expect(limpeza).toEqual({ removidos: [], preservados: [handle], falhas: ["recurso"] });
        expect(f.eventos).toContain("coleta");
        expect(f.eventos.some((e) => e.startsWith("DELETE"))).toBe(false);
      }
      liberar.resolve();
      const concluida = await criacao;
      if (variante === "intencao-aberta") {
        expect(concluida).toEqual({ handle, erro: null });
        await f.gate.iniciar(handle);
        expect(await f.gate.consultar(handle)).toEqual({ estado: "iniciado", codigo: 0 });
        expect(await f.gate.encerrar(async () => {})).toEqual({
          removidos: [handle],
          preservados: [],
          falhas: [],
        });
      } else {
        expect(concluida.erro).toBeInstanceOf(Error);
        expect(concluida.handle).toBeUndefined();
        expect(f.gate.inventario()).toEqual([
          { handle, slot: "banco", estado: enviada ? "incerto" : "intencao" },
        ]);
        await expect(f.gate.iniciar(handle)).rejects.toThrow(/Partida/);
        await expect(
          f.gate.executar(handle, "dump", (async function* () {})(), new AbortController().signal),
        ).rejects.toThrow(/Execução/);
        await expect(f.gate.criar("banco")).rejects.toThrow(/Slot/);
        expect(f.eventos.filter((e) => e.startsWith("POST"))).toEqual(
          enviada ? ["POST /containers/create"] : [],
        );
        expect(f.registros).toContainEqual(
          expect.objectContaining({
            handle,
            slot: "banco",
            estado: "intencao",
            id: null,
          }),
        );
        if (enviada)
          expect(f.registros).toContainEqual(
            expect.objectContaining({
              handle,
              estado: "incerto",
              id: variante === "enviada-confirmada" ? id : null,
            }),
          );
      }
    } finally {
      clearTimeout(timer);
      liberar.resolve();
      await criacao;
    }
  });
  it.each(["parada-primeiro", "exec-primeiro", "fechar-start", "fechar-exec"] as const)(
    "ADM-LOCAL-01 reserva lifecycle durante inspeção: %s",
    async (variante) => {
      let execs = 0;
      const fim = Promise.withResolvers<{ codigo: number; sinal: null; grupoEncerrado: boolean }>();
      const opcoes: Parameters<typeof fixture>[0] = {
        supervisionar: async () => {
          execs++;
          return {
            stdout: (async function* () {})(),
            stderr: (async function* () {})(),
            resultado: fim.promise,
            cancelar: async () => {
              const r = { codigo: 0, sinal: null, grupoEncerrado: true } as const;
              fim.resolve(r);
              return r;
            },
          };
        },
      };
      const f = fixture(opcoes);
      const handle = await f.gate.criar("banco");
      if (variante !== "fechar-start") await f.gate.iniciar(handle);
      const entrou = Promise.withResolvers<void>();
      const liberar = Promise.withResolvers<void>();
      opcoes.inspecao = async () => {
        opcoes.inspecao = undefined;
        entrou.resolve();
        await liberar.promise;
      };
      const executar = () =>
        f.gate.executar(handle, "dump", (async function* () {})(), new AbortController().signal);
      const pendente = (
        variante === "parada-primeiro"
          ? f.gate.parar(handle)
          : variante === "fechar-start"
            ? f.gate.iniciar(handle)
            : executar()
      ).then(
        (valor) => ({ valor, erro: null }),
        (erro: unknown) => ({ valor: undefined, erro }),
      );
      await entrou.promise;
      let concorrente: unknown;
      if (variante === "parada-primeiro")
        concorrente = await executar().then(
          () => null,
          (e: unknown) => e,
        );
      else if (variante === "exec-primeiro")
        concorrente = await f.gate.parar(handle).then(
          () => null,
          (e: unknown) => e,
        );
      else concorrente = await f.gate.encerrar(async () => {});
      liberar.resolve();
      const concluido = await pendente;
      fim.resolve({ codigo: 0, sinal: null, grupoEncerrado: true });
      if (variante.startsWith("fechar")) {
        expect(concluido.erro).toBeInstanceOf(Error);
        expect(execs).toBe(0);
        expect(f.eventos.filter((e) => e.endsWith("/start"))).toHaveLength(
          variante === "fechar-start" ? 0 : 1,
        );
        expect(concorrente).toMatchObject({ removidos: [], preservados: [handle] });
      } else {
        expect(concorrente).toBeInstanceOf(Error);
        expect(concluido.erro).toBeNull();
        expect(execs).toBe(variante === "exec-primeiro" ? 1 : 0);
        expect(f.eventos.filter((e) => e.endsWith("/stop"))).toHaveLength(
          variante === "parada-primeiro" ? 1 : 0,
        );
      }
    },
  );
  it.each(
    ["start", "stop"].flatMap((transicao) =>
      ["timeout-tardio", "erro-remoto", "inspecao-posterior", "ledger-posterior"].map((falha) => ({
        transicao,
        falha,
      })),
    ),
  )("ADM-LOCAL-02 bloqueia desfecho incerto: $transicao/$falha", async ({ transicao, falha }) => {
    const opcoes: Parameters<typeof fixture>[0] = { prazoMs: 20 };
    const f = fixture(opcoes);
    const handle = await f.gate.criar("banco");
    if (transicao === "stop") await f.gate.iniciar(handle);
    const tardio = Promise.withResolvers<void>();
    const aplicado = Promise.withResolvers<void>();
    if (falha === "timeout-tardio") {
      opcoes.antesMutacao = async () => {
        opcoes.antesMutacao = undefined;
        await tardio.promise;
      };
      opcoes.aposMutacao = async () => {
        aplicado.resolve();
      };
    } else if (falha === "erro-remoto")
      opcoes.aposMutacao = async () => {
        throw new Error("Resposta mutante perdida.");
      };
    else if (falha === "inspecao-posterior")
      opcoes.aposMutacao = async () => {
        opcoes.inspecao = async () => {
          throw new Error("Inspeção perdida.");
        };
      };
    else opcoes.falhaLedger = transicao === "start" ? "iniciado" : "parado";
    try {
      await expect(
        transicao === "start" ? f.gate.iniciar(handle) : f.gate.parar(handle),
      ).rejects.toThrow();
      expect(f.gate.inventario()).toEqual([{ handle, slot: "banco", estado: "incerto" }]);
      const marco = f.eventos.length;
      await expect(f.gate.iniciar(handle)).rejects.toThrow(/Partida/);
      await expect(f.gate.parar(handle)).rejects.toThrow(/Parada/);
      await expect(
        f.gate.executar(handle, "dump", (async function* () {})(), new AbortController().signal),
      ).rejects.toThrow(/Execução/);
      expect(await f.gate.encerrar(async () => {})).toMatchObject({
        removidos: [],
        preservados: [handle],
      });
      expect(
        f.eventos.slice(marco).some((e) => e.startsWith("POST") || e.startsWith("DELETE")),
      ).toBe(false);
      expect(f.registros).toContainEqual(
        expect.objectContaining({ handle, id, estado: "incerto" }),
      );
    } finally {
      if (falha === "timeout-tardio") {
        tardio.resolve();
        await aplicado.promise;
      }
    }
    expect(f.gate.inventario()[0]?.estado).toBe("incerto");
  });
  it("registra criação parada e inspeção antes de autorizar partida pelo handle", async () => {
    const { gate, eventos, registros } = fixture();
    const handle = await gate.criar("banco");
    expect(handle).not.toBe(id);
    expect(eventos).toEqual([
      "ledger",
      "POST /containers/create",
      "ledger",
      `GET /containers/${id}/json`,
      "ledger",
    ]);
    expect(registros).toEqual(
      expect.arrayContaining([expect.objectContaining({ estado: "criacao-confirmada", id })]),
    );
    await gate.iniciar(handle);
    expect(eventos.slice(-4)).toEqual([
      `GET /containers/${id}/json`,
      `POST /containers/${id}/start`,
      `GET /containers/${id}/json`,
      "ledger",
    ]);
    expect(await gate.consultar(handle)).toEqual({ estado: "iniciado", codigo: 0 });
    await expect(gate.iniciar(id)).rejects.toThrow(/Handle/);
  });
  it("preserva criação incerta e falha de persistência sem retry ou descoberta", async () => {
    for (const opcoes of [{ incerta: true }, { falhaLedger: "criacao-confirmada" }]) {
      const { gate, eventos } = fixture(opcoes);
      await expect(gate.criar("banco")).rejects.toThrow();
      expect(gate.inventario()[0]).toMatchObject({ estado: "incerto" });
      await expect(gate.criar("banco")).rejects.toThrow(/Slot/);
      const handle = gate.inventario()[0]?.handle;
      if (!handle) throw new Error("Resíduo não inventariado.");
      await expect(gate.iniciar(handle)).rejects.toThrow(/Partida/);
      expect(eventos.filter((e) => e.startsWith("POST"))).toEqual(["POST /containers/create"]);
      expect(eventos.some((e) => e.includes("/json"))).toBe(false);
    }
  });
  it("coleta antes de remover por identidade exata e preserva divergências", async () => {
    const a = fixture();
    const handle = await a.gate.criar("banco");
    await a.gate.iniciar(handle);
    const resultado = await a.gate.encerrar(async () => {
      a.eventos.push("coleta");
    });
    expect(resultado).toEqual({ removidos: [handle], preservados: [], falhas: [] });
    expect(a.eventos.indexOf("coleta")).toBeLessThan(a.eventos.indexOf(`DELETE /containers/${id}`));
    expect(a.eventos.slice(-2)).toEqual([`GET /containers/${id}/json`, "ledger"]);
    await expect(a.gate.criar("banco")).rejects.toThrow(/Slot/);
    const b = fixture();
    const outro = await b.gate.criar("banco");
    b.adulterar();
    expect(await b.gate.encerrar(async () => {})).toMatchObject({
      removidos: [],
      preservados: [outro],
    });
    expect(b.eventos.some((e) => e.startsWith("DELETE"))).toBe(false);
    const c = fixture();
    const retido = await c.gate.criar("banco");
    expect(
      await c.gate.encerrar(async () => {
        throw new Error("coleta");
      }),
    ).toMatchObject({ removidos: [], preservados: [retido], falhas: ["coleta"] });
    expect(c.eventos.some((e) => e.startsWith("DELETE"))).toBe(false);
  });
  it("limita cliente sem progresso e preserva criação incerta sem repetição", async () => {
    let criacoes = 0;
    const gate = criarBarreiraEngine({
      rodada,
      receitas: { banco: receita() },
      imagens: { [imagem]: { volumes: [] } },
      prazoMs: 10,
      persistir: async () => {},
      requisitar: async () => {
        criacoes++;
        return new Promise(() => {});
      },
    });
    await expect(
      Promise.race([
        gate.criar("banco"),
        new Promise((_, rejeitar) => {
          const t = setTimeout(() => rejeitar(new Error("Cliente ficou pendente.")), 500);
          t.unref();
        }),
      ]),
    ).rejects.toThrow(/Prazo/);
    expect(gate.inventario()[0]).toMatchObject({ estado: "incerto" });
    await expect(gate.criar("banco")).rejects.toThrow(/Slot/);
    expect(criacoes).toBe(1);
  });
  it("filtra endpoints e corpo efetivo sem passthrough ou enumeração de vizinhos", async () => {
    const { gate, eventos } = fixture();
    for (const [metodo, caminho, corpo] of [
      ["GET", "/containers/json", undefined],
      ["POST", "/build", {}],
      ["POST", "/containers/create?name=vizinho", receita()],
      ["POST", "/containers/create", { ...receita(), Extra: true }],
      ["POST", `/containers/${"9".repeat(64)}/start`, undefined],
    ] as const)
      await expect(gate.atender(metodo, caminho, corpo)).rejects.toThrow(/Requisição/);
    expect(eventos).toEqual([]);
    expect(await gate.atender("POST", "/containers/create", receita())).toEqual({ Id: id });
    expect(eventos.some((e) => e.includes("/start"))).toBe(false);
    await gate.atender("POST", `/containers/${id}/start`);
    expect(await gate.atender("GET", `/containers/${id}/json`)).toMatchObject({
      Id: id,
      State: { Running: true },
    });
    await expect(gate.atender("DELETE", `/containers/${id}`)).rejects.toThrow(/Requisição/);
  });
  it("recusa receitas com autoridade extra antes de persistência ou cliente", () => {
    for (const alterar of [
      (s: ReturnType<typeof receita>) => Object.assign(s.HostConfig, { Binds: ["/home:/host"] }),
      (s: ReturnType<typeof receita>) => {
        s.HostConfig.NetworkMode = "bridge";
      },
      (s: ReturnType<typeof receita>) => Object.assign(s, { Volumes: { "/dados": {} } }),
      (s: ReturnType<typeof receita>) => {
        s.Image = "postgres:latest";
      },
      (s: ReturnType<typeof receita>) => {
        s.Env = ["DATABASE_URL=externo"];
      },
    ]) {
      const spec = receita();
      alterar(spec);
      let chamadas = 0;
      expect(() =>
        criarBarreiraEngine({
          rodada,
          receitas: { banco: spec },
          imagens: { [imagem]: { volumes: [] } },
          persistir: async () => {
            chamadas++;
          },
          requisitar: async () => {
            chamadas++;
          },
        }),
      ).toThrow(/Receita/);
      expect(chamadas).toBe(0);
    }
    expect(() =>
      criarBarreiraEngine({
        rodada,
        receitas: { banco: receita() },
        imagens: { [imagem]: { volumes: ["/dados"] } },
        persistir: async () => {},
        requisitar: async () => {},
      }),
    ).toThrow(/Receita/);
  });
});
