// Executa o provisionador com clientes falsos e estados reais do protocolo Docker.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  chamadas: [] as string[][],
  logsCodigo: 0,
  sinal: "",
  sinalBuild: false,
  ativo: false,
  rodada: "",
  pasta: "",
  erroRemocao: false,
  criacaoIncerta: false,
  saida: [] as string[],
  ledgerNaRemocao: [] as unknown[],
}));
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  const containers = new Map<string, { tipo: string; rede: string; running: boolean }>();
  const imagens = new Map<string, string>();
  const info = (id: string) => {
    const c = containers.get(id);
    if (!c) return undefined;
    return {
      Id: id,
      Config: {
        Labels: {
          "br.frequenciapp.isolamento": f.rodada,
          "br.frequenciapp.isolamento.tipo": c.tipo,
        },
        Env: ["POSTGRES_PASSWORD=sintetica"],
      },
      HostConfig: {
        NetworkMode: c.rede,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        Tmpfs: c.tipo === "banco" ? { "/var/lib/postgresql/data": "rw" } : {},
      },
      Mounts: [],
      NetworkSettings: {
        Networks: { [`frequenciapp-teste-${f.rodada}-canario`]: { IPAddress: "192.0.2.30" } },
      },
      State: { Running: c.running, ExitCode: 0 },
    };
  };
  return {
    ...real,
    spawn: (_p: string, argumentos: string[]) => {
      const args = argumentos.slice(argumentos.indexOf("--config") + 2);
      f.chamadas.push(args);
      if (args[0] === "build") {
        f.rodada = args[args.indexOf("--label") + 1]?.split("=")[1] ?? "";
        imagens.set(args[args.indexOf("-t") + 1] ?? "", f.rodada);
      }
      const filho = new EventEmitter();
      const stdout = new PassThrough();
      Object.assign(filho, { stdout, stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => {
        if (f.sinal && args[0] === (f.sinalBuild ? "build" : "logs"))
          process.emit(f.sinal as NodeJS.Signals);
        if (args[0] === "wait") {
          const c = containers.get(args[1] ?? "");
          if (c && !f.ativo) c.running = false;
          stdout.emit("data", Buffer.from("0\n"));
        }
        const interrompido = f.sinalBuild && args[0] === "build";
        const codigo = interrompido ? null : args[0] === "logs" ? f.logsCodigo : 0;
        filho.emit("exit", codigo, interrompido ? f.sinal : null);
        filho.emit("close", codigo, interrompido ? f.sinal : null);
      });
      return filho;
    },
    spawnSync: (programa: string, argumentos: string[]) => {
      if (programa === "git")
        return {
          status: 0,
          stdout: [
            "package.json",
            "pnpm-lock.yaml",
            "prisma.config.ts",
            "prisma/schema.prisma",
            "scripts/assets/copiar-swagger-ui.mjs",
          ].join("\0"),
        };
      const args = argumentos.slice(argumentos.indexOf("--config") + 2);
      f.chamadas.push(args);
      let stdout: string | Buffer = "";
      if (args[0] === "build") {
        f.rodada = args[args.indexOf("--label") + 1]?.split("=")[1] ?? "";
        imagens.set(args[args.indexOf("-t") + 1] ?? "", f.rodada);
      } else if (args[0] === "image" && args[1] === "rm") imagens.delete(args[2] ?? "");
      else if (args[0] === "image" && args[1] === "inspect" && !imagens.has(args[2] ?? ""))
        return { status: 1, stderr: "No such image" };
      else if (args[0] === "image" && args[1] === "inspect")
        stdout = JSON.stringify([
          {
            Id: args[2],
            Config: { Labels: { "br.frequenciapp.isolamento": imagens.get(args[2] ?? "") } },
          },
        ]);
      else if (args[0] === "network" && args[1] === "create") stdout = "rede-id";
      else if (args[0] === "network" && args[1] === "inspect")
        stdout = JSON.stringify([
          {
            Id: "rede-id",
            Internal: true,
            Labels: { "br.frequenciapp.isolamento": f.rodada },
            Containers: {},
          },
        ]);
      else if (args[0] === "create" && f.criacaoIncerta)
        return { status: 7, stderr: "resultado de criação desconhecido" };
      else if (args[0] === "create") {
        const tipo = args[args.indexOf("--name") + 1]?.split("-").at(-1) ?? "";
        const id = `id-${tipo}`;
        containers.set(id, {
          tipo,
          rede: args[args.indexOf("--network") + 1] ?? "",
          running: false,
        });
        stdout = id;
      } else if (args[0] === "inspect") stdout = JSON.stringify([info(args[1] ?? "")]);
      else if (args[0] === "start") {
        const c = containers.get(args.at(-1) ?? "");
        if (c) c.running = true;
      } else if (args[0] === "kill" || args[0] === "stop") {
        const c = containers.get(args.at(-1) ?? "");
        if (c) c.running = false;
      } else if (args[0] === "wait") {
        const c = containers.get(args[1] ?? "");
        if (c && !f.ativo) c.running = false;
        stdout = "0";
      } else if (args[0] === "rm") {
        const pasta = readdirSync(f.pasta).find((n) => n.startsWith("frequenciapp-isolamento-"));
        if (pasta) {
          try {
            f.ledgerNaRemocao.push(
              JSON.parse(readFileSync(path.join(f.pasta, pasta, "recursos.json"), "utf8")),
            );
          } catch {
            /* A asserção identifica o ledger ausente. */
          }
        }
        if (f.erroRemocao) return { status: 9, stderr: "falha sintética de remoção" };
        containers.delete(args.at(-1) ?? "");
      } else if (args[0] === "exec")
        stdout = args.includes("readlink") ? "net:[teste]" : `${f.rodada}:0`;
      else if (args[0] === "cp" && args[2] === "-") {
        const nome = path.posix.basename(args[1]?.split(":").slice(1).join(":") ?? "");
        stdout = tar(nome);
      }
      return { status: 0, stdout, stderr: "" };
    },
  };
});
import { executar } from "../../isolamento/executar.mjs";
function tar(nome: string) {
  const h = Buffer.alloc(512);
  const dados = Buffer.from("log sintético");
  h.write(nome, 0, 100);
  h.write("0000600\0", 100);
  h.write(`${dados.length.toString(8).padStart(11, "0")}\0`, 124);
  h.fill(32, 148, 156);
  h.write("0", 156);
  h.write("ustar\0", 257);
  h.write(
    `${h
      .reduce((a, b) => a + b, 0)
      .toString(8)
      .padStart(6, "0")}\0 `,
    148,
  );
  return Buffer.concat([h, dados, Buffer.alloc(512 - dados.length), Buffer.alloc(1024)]);
}
beforeEach(() => {
  f.pasta = mkdtempSync(path.join(tmpdir(), "executor-lifecycle-"));
  f.chamadas = [];
  f.logsCodigo = 0;
  f.sinal = "";
  f.sinalBuild = false;
  f.ativo = false;
  f.erroRemocao = false;
  f.criacaoIncerta = false;
  f.saida = [];
  f.ledgerNaRemocao = [];
  vi.stubEnv("TMPDIR", f.pasta);
  vi.spyOn(process.stdout, "write").mockImplementation((s) => {
    f.saida.push(String(s));
    return true;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(f.pasta, { recursive: true, force: true });
});
it("não retorna verde quando docker logs falha com a suíte ainda ativa", async () => {
  f.logsCodigo = 17;
  f.ativo = true;
  await expect(executar(["--", "node", "-e", "process.exit(0)"])).rejects.toThrow(
    /acompanhamento/i,
  );
  expect(
    f.chamadas.some((a) => ["kill", "stop"].includes(a[0] ?? "") && a.at(-1) === "id-execucao"),
  ).toBe(true);
});
it.each([
  ["SIGHUP", 129],
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const)(
  "%s alcança a tarefa real antes da coleta e conserva status %i",
  async (sinal, codigo) => {
    f.sinal = sinal;
    expect(await executar(["--", "node", "-e", "process.exit(0)"])).toBe(codigo);
    const kill = f.chamadas.findIndex(
      (a) => a[0] === "kill" && a.includes(sinal) && a.at(-1) === "id-execucao",
    );
    const coleta = f.chamadas.findIndex((a) => a[0] === "cp" && a[2] === "-");
    const remocao = f.chamadas.findIndex((a) => a[0] === "rm");
    expect(kill).toBeGreaterThan(-1);
    expect(coleta).toBeGreaterThan(kill);
    expect(remocao).toBeGreaterThan(coleta);
  },
);
it("persiste todos os IDs e remoções em ledger privado antes do cleanup", async () => {
  expect(await executar(["--", "node", "-e", "process.exit(0)"])).toBe(0);
  expect(f.ledgerNaRemocao.length).toBe(3);
  const pasta = f.saida.join("").match(/evidências privadas: (.+)/)?.[1] ?? "";
  const arquivo = path.join(pasta, "recursos.json");
  const ledger = JSON.parse(readFileSync(arquivo, "utf8"));
  expect(statSync(arquivo).mode & 0o777).toBe(0o600);
  expect(statSync(pasta).mode & 0o777).toBe(0o700);
  expect(ledger.containers.map((r: { id: string }) => r.id)).toEqual([
    "id-canario",
    "id-banco",
    "id-execucao",
  ]);
  expect(ledger.redes.map((r: { id: string }) => r.id)).toEqual(["rede-id"]);
  expect(ledger.imagens).toHaveLength(2);
  expect(
    [...ledger.containers, ...ledger.redes, ...ledger.imagens].every(
      (r: { estado: string }) => r.estado === "removido",
    ),
  ).toBe(true);
  expect(JSON.stringify(ledger)).not.toMatch(/POSTGRES_PASSWORD|DATABASE_URL|sintetica/);
});
it("relata resíduos sem apagar a falha original de acompanhamento", async () => {
  f.logsCodigo = 17;
  f.ativo = true;
  f.erroRemocao = true;
  await expect(executar(["--", "node", "-e", "process.exit(0)"])).rejects.toThrow(
    /acompanhamento/i,
  );
  const pasta = f.saida.join("").match(/evidências privadas: (.+)/)?.[1] ?? "";
  const ledger = JSON.parse(readFileSync(path.join(pasta, "recursos.json"), "utf8"));
  expect(ledger.containers.every((r: { estado: string }) => r.estado !== "removido")).toBe(true);
  expect(ledger.problemas.length).toBeGreaterThan(0);
  expect(f.saida.join("")).toMatch(/resíduos/);
});
it("interrupção no build registra outcome incerto e não provisiona tarefas", async () => {
  f.sinal = "SIGTERM";
  f.sinalBuild = true;
  await expect(executar(["--", "node", "-e", "process.exit(0)"])).rejects.toMatchObject({
    exitCode: 143,
  });
  expect(f.chamadas.some((a) => a[0] === "create")).toBe(false);
  const pasta = f.saida.join("").match(/evidências privadas: (.+)/)?.[1] ?? "";
  const ledger = JSON.parse(readFileSync(path.join(pasta, "recursos.json"), "utf8"));
  expect(ledger.incertos).toEqual([{ tipo: "imagem", recuperacaoAutomatica: false }]);
  expect(ledger.status).toBe(143);
});
it("não transfere ao runner um manifesto com o proprietário do arquivo do host", async () => {
  expect(await executar(["--", "node", "-e", "process.exit(0)"])).toBe(0);
  expect(f.chamadas.some((a) => a[0] === "cp" && a[1]?.endsWith("manifesto.json"))).toBe(false);
  const criacao = f.chamadas.find(
    (a) => a[0] === "create" && a.includes("br.frequenciapp.isolamento.tipo=execucao"),
  );
  expect(criacao?.join(" ")).toContain("prepararManifesto");
});
it("registra criação incerta sem procurar nem adotar o possível recurso por nome ou label", async () => {
  f.criacaoIncerta = true;
  await expect(executar(["--", "node", "-e", "process.exit(0)"])).rejects.toThrow(/Docker/);
  const pasta = f.saida.join("").match(/evidências privadas: (.+)/)?.[1] ?? "";
  const ledger = JSON.parse(readFileSync(path.join(pasta, "recursos.json"), "utf8"));
  expect(ledger.incertos).toEqual([{ tipo: "container", recuperacaoAutomatica: false }]);
  const criacao = f.chamadas.findIndex((a) => a[0] === "create");
  expect(f.chamadas.slice(criacao + 1).some((a) => a.some((s) => /^(name|label)=/.test(s)))).toBe(
    false,
  );
});
