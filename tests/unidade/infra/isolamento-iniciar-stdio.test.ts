// Exercita o bootstrap real com arquivo e stdio nativos, sem banco ou servidor Next.
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import type { WriteStream } from "node:fs";
import { existsSync, fstatSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  log: "",
  eventos: [] as string[],
  filhos: [] as ChildProcess[],
  streams: [] as WriteStream[],
  fechamentos: [] as Promise<void>[],
  descritores: [] as number[],
  fechados: [] as number[],
  pronto: Promise.resolve(),
  avisarPronto: () => {},
  erroSpawn: undefined as NodeJS.ErrnoException | undefined,
  erroAbertura: undefined as NodeJS.ErrnoException | undefined,
  spawnSincronoInvalido: false,
  spawnAssincronoAusente: false,
  esperasLogicas: [] as number[],
  erroProva: undefined as Error | undefined,
  canarioConecta: false,
  canariosDestruidos: 0,
  objetosBanco: 0,
  codigoMigrador: 0,
  erroConferencia: undefined as Error | undefined,
  clientes: [] as { encerrado: boolean }[],
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  const destino = (p: unknown) => (p === "/run/frequenciapp-isolamento/runtime.log" ? f.log : p);
  return {
    ...fs,
    createWriteStream: (p: string, opcoes: Parameters<typeof fs.createWriteStream>[1]) => {
      f.eventos.push("abrir-log");
      const stream = fs.createWriteStream(String(destino(p)), opcoes);
      f.streams.push(stream);
      return stream;
    },
    openSync: (p: string, flags: string, modo: number) => {
      f.eventos.push("abrir-log");
      try {
        const fd = fs.openSync(String(destino(p)), flags, modo);
        f.descritores.push(fd);
        return fd;
      } catch (erro) {
        if (erro instanceof Error) f.erroAbertura = erro;
        throw erro;
      }
    },
    closeSync: (fd: number) => {
      fs.closeSync(fd);
      f.fechados.push(fd);
    },
  };
});
vi.mock("../../helpers/isolamento.mjs", () => ({
  exigirIsolamento: () => {
    f.eventos.push("prova");
    if (f.erroProva) throw f.erroProva;
    return {
      rodada: "sintetica",
      marcador: "privado",
      databaseUrl: "sintetica",
      ipCanario: "192.0.2.1",
    };
  },
  conferirBanco: async () => {
    f.eventos.push("conferir-banco");
    if (f.erroConferencia) throw f.erroConferencia;
  },
  verificarIsolamento: async () => {
    await f.pronto;
    if (f.spawnAssincronoAusente) {
      f.eventos.push("verificar-runtime-falhou");
      throw f.erroSpawn;
    }
    f.eventos.push("verificar-runtime");
  },
}));
vi.mock("pg", () => ({
  default: {
    Client: class {
      encerrado = false;
      constructor() {
        f.clientes.push(this);
      }
      async connect() {
        f.eventos.push("banco-conectar");
      }
      async query(sql: string) {
        f.eventos.push("sql");
        return {
          rows: sql.includes("current_database")
            ? [{ banco: "ft_sintetica", papel: "ft_sintetica", objetos: f.objetosBanco }]
            : [],
        };
      }
      async end() {
        this.encerrado = true;
        f.eventos.push("banco-fechar");
      }
    },
  },
}));
vi.mock("node:net", () => ({
  default: {
    connect: () => {
      f.eventos.push("canario");
      const socket = Object.assign(new EventEmitter(), {
        setTimeout: () => {},
        destroy: () => {
          f.canariosDestruidos++;
        },
      });
      queueMicrotask(() => {
        if (f.canarioConecta) socket.emit("connect");
        else
          socket.emit("error", Object.assign(new Error("rota sintética"), { code: "ENETUNREACH" }));
      });
      return socket;
    },
  },
}));
vi.mock("node:child_process", async (original) => {
  const nativo = await original<typeof import("node:child_process")>();
  return {
    ...nativo,
    spawn: (programa: string, argumentos: string[], opcoes: SpawnOptions) => {
      if (!argumentos.includes("tests/isolamento/runtime.mjs")) {
        f.eventos.push(argumentos[0] ?? programa);
        const filho = new nativo.ChildProcess();
        const codigo = argumentos[0] === "docker/app/migrar.mjs" ? f.codigoMigrador : 0;
        f.fechamentos.push(new Promise((resolve) => filho.once("close", () => resolve())));
        queueMicrotask(() => {
          filho.emit("exit", codigo, null);
          filho.emit("close", codigo, null);
        });
        return filho;
      }
      f.eventos.push("spawn-runtime");
      const stdio = opcoes.stdio;
      if (!Array.isArray(stdio)) throw new Error("Stdio do runtime ausente.");
      if (typeof stdio[1] === "number") {
        expect(fstatSync(stdio[1]).isFile()).toBe(true);
        expect(stdio[2]).toBe(stdio[1]);
        f.eventos.push("fd-utilizavel");
      }
      let filho: ChildProcess;
      try {
        if (f.spawnSincronoInvalido) return nativo.spawn("\0", [], opcoes);
        filho = f.spawnAssincronoAusente
          ? nativo.spawn(`${f.log}.executavel-ausente`, [], opcoes)
          : nativo.spawn(
              process.execPath,
              [
                "-e",
                `
          process.on('SIGTERM', () => process.exit(0));
          process.on('message', () => {});
          process.stdout.write('stdout real\\n', () =>
            process.stderr.write('stderr real\\n', () => process.send('pronto')));
        `,
              ],
              { ...opcoes, stdio: [...stdio, "ipc"] },
            );
      } catch (erro) {
        if (erro instanceof Error) f.erroSpawn = erro;
        throw erro;
      }
      f.filhos.push(filho);
      f.fechamentos.push(
        new Promise((resolve) =>
          filho.once("close", () => {
            if (f.spawnAssincronoAusente) f.eventos.push("close-nativo");
            resolve();
          }),
        ),
      );
      if (f.spawnAssincronoAusente)
        filho.once("error", (erro) => {
          f.erroSpawn = erro;
          f.eventos.push("erro-nativo");
          f.avisarPronto();
        });
      filho.once("message", () => {
        f.eventos.push("filho-pronto");
        f.avisarPronto();
      });
      return filho;
    },
  };
});

vi.mock("node:timers/promises", async (original) => {
  const nativo = await original<typeof import("node:timers/promises")>();
  return {
    ...nativo,
    setTimeout: (ms: number) => {
      if (!f.spawnAssincronoAusente) return nativo.setTimeout(ms);
      // Ordem lógica do teste, não prazo real nem garantia de que o produto aguarda close.
      expect([500, 5000]).toContain(ms);
      f.esperasLogicas.push(ms);
      return Promise.all(f.fechamentos).then(() => {
        f.eventos.push(`espera-logica-${ms}`);
      });
    },
  };
});

let pasta: string;
let argv: string[];
let exitCode: typeof process.exitCode;
const capturarListeners = () =>
  new Map(
    (["SIGINT", "SIGTERM"] as const).map((sinal) => [sinal, new Set(process.listeners(sinal))]),
  );
let listeners: ReturnType<typeof capturarListeners>;
beforeEach(() => {
  vi.resetModules();
  pasta = mkdtempSync(join(tmpdir(), "iniciar-stdio-"));
  f.log = join(pasta, "runtime.log");
  f.eventos = [];
  f.filhos = [];
  f.streams = [];
  f.fechamentos = [];
  f.descritores = [];
  f.fechados = [];
  f.erroSpawn = undefined;
  f.erroAbertura = undefined;
  f.spawnSincronoInvalido = false;
  f.spawnAssincronoAusente = false;
  f.esperasLogicas = [];
  f.erroProva = undefined;
  f.canarioConecta = false;
  f.canariosDestruidos = 0;
  f.objetosBanco = 0;
  f.codigoMigrador = 0;
  f.erroConferencia = undefined;
  f.clientes = [];
  f.pronto = new Promise((resolve) => {
    f.avisarPronto = resolve;
  });
  argv = process.argv;
  exitCode = process.exitCode;
  process.argv = [process.execPath, "iniciar.mjs", "suite-sintetica"];
  process.exitCode = 0;
  listeners = capturarListeners();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  for (const filho of f.filhos)
    if (filho.exitCode === null && filho.signalCode === null) filho.kill("SIGTERM");
  await Promise.all(f.fechamentos);
  await Promise.all(
    f.streams.map(
      (stream) =>
        new Promise<void>((resolve) => {
          stream.once("close", resolve);
          stream.destroy();
        }),
    ),
  );
  for (const [sinal, anteriores] of listeners)
    for (const listener of process.listeners(sinal))
      if (!anteriores.has(listener)) process.removeListener(sinal, listener);
  process.argv = argv;
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  rmSync(pasta, { recursive: true, force: true });
});
const iniciar = async () => {
  const modulo = "../../isolamento/iniciar.mjs";
  await import(modulo);
};

describe("log nativo do bootstrap isolado", () => {
  it("entrega descritor utilizável ao spawn real e recebe stdout e stderr no log privado", async () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
    await iniciar();
    expect(f.erroSpawn).toBeUndefined();
    expect(console.error).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    await Promise.all(f.fechamentos);
    expect(readFileSync(f.log, "utf8")).toBe("stdout real\nstderr real\n");
    expect(statSync(f.log).mode & 0o777).toBe(0o600);
    expect(f.eventos.indexOf("fd-utilizavel")).toBeLessThan(f.eventos.indexOf("filho-pronto"));
    expect(f.eventos.indexOf("filho-pronto")).toBeLessThan(f.eventos.indexOf("suite-sintetica"));
    expect(f.fechados).toEqual(f.descritores);
    expect(f.descritores).toHaveLength(1);
    for (const fd of f.descritores) expect(() => fstatSync(fd)).toThrow(/EBADF/);
  });
  it("preserva o erro nativo de abertura sem iniciar runtime, negativos, contas ou suíte", async () => {
    f.log = join(pasta, "ausente", "runtime.log");
    await iniciar();
    expect(f.erroAbertura?.code).toBe("ENOENT");
    expect(console.error).toHaveBeenCalledExactlyOnceWith(f.erroAbertura?.message);
    expect(process.exitCode).toBe(1);
    expect(f.descritores).toEqual([]);
    expect(f.fechados).toEqual([]);
    expect(f.filhos).toEqual([]);
    expect(f.eventos).toEqual([
      "prova",
      "canario",
      "banco-conectar",
      "sql",
      "banco-fechar",
      "docker/app/migrar.mjs",
      "banco-conectar",
      "sql",
      "sql",
      "conferir-banco",
      "banco-fechar",
      "abrir-log",
    ]);
  });
  it("preserva a causa síncrona do spawn nativo e fecha somente o descritor próprio", async () => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const sentinela = fs.openSync(join(pasta, "sentinela"), "w", 0o600);
    try {
      f.spawnSincronoInvalido = true;
      await iniciar();
      expect(f.erroSpawn?.code).toBe("ERR_INVALID_ARG_VALUE");
      expect(console.error).toHaveBeenCalledExactlyOnceWith(f.erroSpawn?.message);
      expect(process.exitCode).toBe(1);
      expect(f.descritores).toHaveLength(1);
      expect(f.fechados).toEqual(f.descritores);
      for (const fd of f.descritores) expect(() => fstatSync(fd)).toThrow(/EBADF/);
      expect(fstatSync(sentinela).isFile()).toBe(true);
      expect(readFileSync(f.log, "utf8")).toBe("");
      expect(statSync(f.log).mode & 0o777).toBe(0o600);
      expect(f.filhos).toEqual([]);
      expect(f.eventos.slice(f.eventos.indexOf("abrir-log"))).toEqual([
        "abrir-log",
        "spawn-runtime",
        "fd-utilizavel",
      ]);
    } finally {
      fs.closeSync(sentinela);
    }
  });
  it("preserva a causa assíncrona nativa sem passos posteriores com espera lógica após close real", async () => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const sentinela = fs.openSync(join(pasta, "sentinela"), "w", 0o600);
    try {
      f.spawnAssincronoAusente = true;
      await iniciar();
      await Promise.all(f.fechamentos);
      expect(f.erroSpawn?.code).toBe("ENOENT");
      expect(console.error).toHaveBeenCalledExactlyOnceWith(f.erroSpawn?.message);
      expect(process.exitCode).toBe(1);
      expect(f.filhos).toHaveLength(1);
      expect(f.filhos[0]?.pid).toBeUndefined();
      expect(f.descritores).toHaveLength(1);
      expect(f.fechados).toEqual(f.descritores);
      for (const fd of f.descritores) expect(() => fstatSync(fd)).toThrow(/EBADF/);
      expect(fstatSync(sentinela).isFile()).toBe(true);
      expect(readFileSync(f.log, "utf8")).toBe("");
      expect(statSync(f.log).mode & 0o777).toBe(0o600);
      for (const evento of [
        "tests/isolamento/negativos.mjs",
        "scripts/administracao/criar-admin.mjs",
        "scripts/administracao/criar-coordenacao.mjs",
        "suite-sintetica",
      ])
        expect(f.eventos).not.toContain(evento);
      expect(f.esperasLogicas).toContain(500);
      const eventos = f.eventos.slice(f.eventos.indexOf("abrir-log"));
      expect(eventos.filter((e) => e === "erro-nativo")).toHaveLength(1);
      expect(eventos.filter((e) => e === "close-nativo")).toHaveLength(1);
      expect(eventos.filter((e) => e === "espera-logica-500")).toHaveLength(1);
      // A grace de 5000 é condicional; sua presença ou ausência não define esta recusa.
      expect(
        eventos.filter((e) => e !== "close-nativo" && !e.startsWith("espera-logica-")),
      ).toEqual([
        "abrir-log",
        "spawn-runtime",
        "fd-utilizavel",
        "erro-nativo",
        "verificar-runtime-falhou",
      ]);
      expect(eventos.indexOf("close-nativo")).toBeGreaterThan(eventos.indexOf("erro-nativo"));
      expect(eventos.indexOf("close-nativo")).toBeLessThan(eventos.indexOf("espera-logica-500"));
    } finally {
      fs.closeSync(sentinela);
    }
  });
  it("recusa a prova de isolamento antes de socket, banco, log ou spawn", async () => {
    f.erroProva = new Error("Prova sintética recusada.");
    await expect(iniciar()).rejects.toBe(f.erroProva);
    expect(console.error).not.toHaveBeenCalled();
    expect(f.eventos).toEqual(["prova"]);
    expect(f.clientes).toHaveLength(0);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
  it("recusa argv sem comando antes de socket, banco, log ou spawn", async () => {
    process.argv = [process.execPath, "iniciar.mjs"];
    await expect(iniciar()).rejects.toThrow("Comando de teste ausente.");
    expect(console.error).not.toHaveBeenCalled();
    expect(f.eventos).toEqual(["prova"]);
    expect(f.clientes).toHaveLength(0);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
  it("recusa canário conectado antes de banco, migrador, log ou runtime", async () => {
    f.canarioConecta = true;
    await iniciar();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Canário vizinho alcançável.");
    expect(process.exitCode).toBe(1);
    expect(f.canariosDestruidos).toBe(1);
    expect(f.eventos).toEqual(["prova", "canario"]);
    expect(f.clientes).toHaveLength(0);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
  it("recusa banco inicial com objetos e fecha cliente antes de migrador, log ou runtime", async () => {
    f.objetosBanco = 1;
    await iniciar();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      "Banco descartável não está vazio ou tem identidade divergente.",
    );
    expect(process.exitCode).toBe(1);
    expect(f.eventos).toEqual(["prova", "canario", "banco-conectar", "sql", "banco-fechar"]);
    expect(f.clientes.map((cliente) => cliente.encerrado)).toEqual([true]);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
  it("preserva término não zero do migrador sem marcador, log ou runtime", async () => {
    f.codigoMigrador = 7;
    await iniciar();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("Comando de teste encerrou com 7.");
    expect(process.exitCode).toBe(1);
    expect(f.eventos).toEqual([
      "prova",
      "canario",
      "banco-conectar",
      "sql",
      "banco-fechar",
      "docker/app/migrar.mjs",
    ]);
    expect(f.clientes.map((cliente) => cliente.encerrado)).toEqual([true]);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
  it("fecha clientes quando conferirBanco recusa após marcador sem abrir log ou runtime", async () => {
    f.erroConferencia = new Error("Conferência sintética recusada.");
    await iniciar();
    expect(console.error).toHaveBeenCalledExactlyOnceWith(f.erroConferencia.message);
    expect(process.exitCode).toBe(1);
    expect(f.eventos).toEqual([
      "prova",
      "canario",
      "banco-conectar",
      "sql",
      "banco-fechar",
      "docker/app/migrar.mjs",
      "banco-conectar",
      "sql",
      "sql",
      "conferir-banco",
      "banco-fechar",
    ]);
    expect(f.clientes.map((cliente) => cliente.encerrado)).toEqual([true, true]);
    expect(f.filhos).toHaveLength(0);
    expect(f.descritores).toEqual([]);
    expect(existsSync(f.log)).toBe(false);
  });
});
