// Exercita a primeira prova nativa com Engine falso, sem daemon ou PostgreSQL reais.
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual as igual } from "node:util";
import { expect, it, vi } from "vitest";
import fixtureImagem from "./fixtures/postgres-imagem-pinada.json";
import fixtureContainer from "./fixtures/postgres-container-created.json";
import { criarBarreiraEngine } from "../../isolamento/administrativo/engine-gate.mjs";
import {
  aprovarImagemPostgres,
  receitaPostgres,
  normalizarPostgres,
  validarReceitaPostgres,
} from "../../isolamento/administrativo/postgres-nativo.mjs";
import { iniciarDockerReal } from "../../isolamento/administrativo/host.mjs";
import {
  criarClienteEngine,
  comandoIdentidade,
} from "../../isolamento/administrativo/postgres-nativo.mjs";
import type { ReceitaContainer } from "../../isolamento/administrativo/engine-gate.mjs";

const fasesHost = [
  "intencao",
  "partida",
  "resultado-escrita",
  "resultado-fecho",
  "execs-fecho",
  "nucleo-fecho",
] as const;
type FaseHost = (typeof fasesHost)[number];
const observadorFS = vi.hoisted(() => ({
  aoAbrir: undefined as
    undefined | ((nome: string, arquivo: import("node:fs/promises").FileHandle) => void),
}));
vi.mock("node:fs/promises", async (original) => {
  const fs = await original<typeof import("node:fs/promises")>();
  return {
    ...fs,
    open: async (...args: Parameters<typeof fs.open>) => {
      const arquivo = await fs.open(...args);
      observadorFS.aoAbrir?.(String(args[0]), arquivo);
      return arquivo;
    },
  };
});

const pin =
  "postgres:17-alpine@sha256:3540c0362c809df084ffac0ae69fe794515f9de92692f02178bcdce0ef0302ac";
// HostConfig documental mais a única adição sintética de logging, sem mutar a captura.
const hostConfigDocumental = structuredClone(fixtureContainer.captura.resposta.HostConfig);
Object.assign(hostConfigDocumental.LogConfig.Config, { compress: "false" });
// Modelo sintético limitado à herança de Config, Env por chave e diretório vazio.
function herdarConfigSintetica(
  config: typeof fixtureImagem.captura.resposta.Config,
  pedido: Record<string, unknown>,
): Record<string, unknown> {
  const env = pedido.Env;
  const diretorio = pedido.WorkingDir;
  if (typeof diretorio !== "string") throw new Error("Diretório sintético inválido.");
  if (!Array.isArray(env) || !env.every((e) => typeof e === "string"))
    throw new Error("Ambiente sintético inválido.");
  const pares = new Map(config.Env.map((e) => [e.slice(0, e.indexOf("=")), e]));
  for (const e of env) pares.set(e.slice(0, e.indexOf("=")), e);
  return {
    ...structuredClone(config),
    ...pedido,
    Env: [...pares.values()].reverse(),
    WorkingDir: diretorio || config.WorkingDir,
  };
}
// Confere a receita contra dados documentais estáticos antes de guardar o pedido.
function conferirPedidoDocumental(
  pedido: Record<string, unknown>,
  documental: typeof fixtureContainer.captura.resposta,
  comparar: typeof igual,
) {
  const nome = pedido.Hostname;
  const env = pedido.Env;
  if (
    typeof nome !== "string" ||
    !/^fadm-[a-f0-9]{32}$/.test(nome) ||
    !Array.isArray(env) ||
    !env.every((e) => typeof e === "string")
  )
    throw new Error("Identidade do pedido sintético inválida.");
  const rodada = nome.slice(5);
  const senha = env.find((e) => e.startsWith("POSTGRES_PASSWORD="));
  if (!senha || !/^POSTGRES_PASSWORD=[a-f0-9]{64}$/.test(senha))
    throw new Error("Credencial sintética inválida.");
  const c = documental.Config;
  const h = documental.HostConfig;
  const esperado = {
    Image: c.Image,
    Hostname: nome,
    User: c.User,
    Entrypoint: c.Entrypoint,
    WorkingDir: c.WorkingDir,
    Cmd: c.Cmd,
    Env: c.Env.map((e) =>
      e.startsWith("POSTGRES_PASSWORD=")
        ? senha
        : /^(POSTGRES_DB|POSTGRES_USER)=/.test(e)
          ? `${e.slice(0, e.indexOf("="))}=ft_${rodada}`
          : e,
    ).sort(),
    Labels: { "br.frequenciapp.isolamento": rodada, "br.frequenciapp.isolamento.tipo": "banco" },
    HostConfig: {
      NetworkMode: h.NetworkMode,
      CapDrop: h.CapDrop,
      SecurityOpt: h.SecurityOpt,
      Memory: h.Memory,
      NanoCpus: h.NanoCpus,
      PidsLimit: h.PidsLimit,
      ReadonlyRootfs: h.ReadonlyRootfs,
      Tmpfs: h.Tmpfs,
      LogConfig: {
        ...structuredClone(h.LogConfig),
        Config: { ...h.LogConfig.Config, compress: "false" },
      },
    },
  };
  if (!comparar(pedido, esperado))
    throw new Error("Pedido diverge da expectativa documental independente.");
}
// Identidade, herança de Config, State e somente compress=false são sintéticos.
function inspecaoDocumental(
  documental: typeof fixtureContainer.captura.resposta,
  imageConfig: typeof fixtureImagem.captura.resposta.Config,
  spec: Record<string, unknown>,
  id: string,
  running: boolean,
) {
  const { HostConfig: _hostConfig, ...campos } = spec;
  const raw: Omit<typeof documental, "Config"> & { Config: Record<string, unknown> } =
    structuredClone(documental);
  raw.Id = id;
  raw.Name = `/${String(spec.Hostname)}`;
  raw.Config = { ...raw.Config, ...herdarConfigSintetica(imageConfig, campos) };
  Object.assign(raw.HostConfig.LogConfig.Config, { compress: "false" });
  raw.State = {
    ...raw.State,
    Running: running,
    Pid: running ? 123 : 0,
    Status: running ? "running" : "created",
  };
  return raw;
}
function engineFalso(verificarJournal = true) {
  const id = randomBytes(32).toString("hex");
  const vizinho = randomBytes(32).toString("hex");
  let execId = randomBytes(32).toString("hex");
  const chamadas: { metodo: string; caminho: string }[] = [];
  const imagemRaw = structuredClone(fixtureImagem.captura.resposta);
  const imageConfig = imagemRaw.Config;
  let spec: Record<string, unknown> = {};
  let running = false;
  let existe = false;
  let diretorio = "";
  return {
    id,
    vizinho,
    chamadas,
    async requisitar(metodo: string, caminho: string, corpo?: unknown): Promise<unknown> {
      chamadas.push({ metodo, caminho });
      expect(caminho).not.toContain(vizinho);
      if (caminho === `/images/${encodeURIComponent(pin)}/json`) return structuredClone(imagemRaw);
      if (caminho === "/containers/create") {
        const pedido = corpo as Record<string, unknown>;
        conferirPedidoDocumental(pedido, fixtureContainer.captura.resposta, igual);
        spec = structuredClone(pedido);
        existe = true;
        return { Id: id, Warnings: [] };
      }
      if (caminho === `/containers/${id}/json`) {
        if (!existe) return null;
        const raw = inspecaoDocumental(
          fixtureContainer.captura.resposta,
          imageConfig,
          spec,
          id,
          running,
        );
        expect(raw.HostConfig, "FIDELIDADE-DIRETO antes do Gate").toEqual(hostConfigDocumental);
        return raw;
      }
      if (caminho === `/containers/${id}/start`) {
        if (verificarJournal) {
          const linhas = (await readFile(join(diretorio, "journal.jsonl"), "utf8"))
            .trim()
            .split("\n");
          expect(
            linhas.some((l) => l.includes('"estado":"criacao-confirmada"') && l.includes(id)),
          ).toBe(true);
        }
        running = true;
        return null;
      }
      if (caminho === `/containers/${id}/exec`) {
        expect(corpo).toEqual(comandoIdentidade(spec as unknown as ReceitaContainer));
        execId = randomBytes(32).toString("hex");
        return { Id: execId };
      }
      if (caminho === `/exec/${execId}/start`) {
        const env = spec.Env as string[];
        const banco = env.find((x) => x.startsWith("POSTGRES_DB="))?.split("=")[1];
        const bytes = Buffer.from(`${banco}|${banco}|0|on\n`);
        const header = Buffer.alloc(8);
        header[0] = 1;
        header.writeUInt32BE(bytes.length, 4);
        return Buffer.concat([header, bytes]);
      }
      if (caminho === `/exec/${execId}/json`) {
        const comando = comandoIdentidade(spec as unknown as ReceitaContainer);
        const cmd = comando.Cmd as string[];
        return {
          ID: execId,
          ContainerID: id,
          Running: false,
          ExitCode: 0,
          Pid: 0,
          ProcessConfig: {
            privileged: false,
            user: "postgres",
            tty: false,
            entrypoint: cmd[0],
            arguments: cmd.slice(1),
          },
        };
      }
      if (caminho === `/containers/${id}/stop`) {
        running = false;
        return null;
      }
      if (metodo === "DELETE" && caminho === `/containers/${id}`) {
        existe = false;
        return null;
      }
      throw new Error("Endpoint inesperado no Engine falso.");
    },
    definirDiretorio(valor: string) {
      diretorio = valor;
    },
  };
}

it("MASCARAS-01 aceita ordem capturada no Gate sem alterar o raw", async () => {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  if (!imagem.id) throw new Error("Imagem sintética ausente.");
  const rodada = randomBytes(16).toString("hex");
  const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
  const f = engineFalso(false);
  const raws: { raw: unknown; antes: string }[] = [];
  const gate = criarBarreiraEngine({
    rodada,
    receitas: { banco: spec },
    imagens: { [imagem.id]: imagem },
    persistir: async () => {},
    requisitar: async (m, p, b) => {
      const raw = await f.requisitar(m, p, b);
      if (p === `/containers/${f.id}/json` && raw) raws.push({ raw, antes: JSON.stringify(raw) });
      return raw;
    },
  });
  const handle = await gate.criar("banco");
  expect(await gate.atender("GET", `/containers/${f.id}/json`)).toMatchObject({ Config: spec });
  expect(raws.length).toBeGreaterThan(0);
  for (const r of raws) expect(JSON.stringify(r.raw)).toBe(r.antes);
  expect(await gate.encerrar(async () => {})).toEqual({
    removidos: [handle],
    preservados: [],
    falhas: [],
  });
});

const ordemLiteralAnterior = [
  "/proc/asound",
  "/proc/acpi",
  "/proc/interrupts",
  "/proc/kcore",
  "/proc/keys",
  "/proc/latency_stats",
  "/proc/timer_list",
  "/proc/timer_stats",
  "/proc/sched_debug",
  "/proc/scsi",
  "/sys/firmware",
  "/sys/devices/virtual/powercap",
];
it.each(["MaskedPaths", "ReadonlyPaths", "MemorySwap"] as const)(
  "MASCARAS-02 exige default ausente: %s",
  async (campo) => {
    const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
    const spec = receitaPostgres(
      randomBytes(16).toString("hex"),
      imagem,
      randomBytes(32).toString("hex"),
    );
    const f = engineFalso(false);
    await f.requisitar("POST", "/containers/create", spec);
    const raw = (await f.requisitar(
      "GET",
      `/containers/${f.id}/json`,
    )) as typeof fixtureContainer.captura.resposta;
    raw.HostConfig.MaskedPaths = [...ordemLiteralAnterior];
    Reflect.deleteProperty(raw.HostConfig, campo);
    const antes = JSON.stringify(raw);
    expect(() => normalizarPostgres(raw, spec, imagem, f.id)).toThrow(
      campo === "MaskedPaths"
        ? /Máscaras nativas/
        : campo === "ReadonlyPaths"
          ? /Paths nativos/
          : /Swap nativo/,
    );
    expect(JSON.stringify(raw)).toBe(antes);
  },
);

it("LOGGING-01 fixa logging local sem compressão e sem ampliar retenção", () => {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  const spec = receitaPostgres(
    randomBytes(16).toString("hex"),
    imagem,
    randomBytes(32).toString("hex"),
  );
  expect(spec.HostConfig.LogConfig).toEqual({
    Type: "local",
    Config: { "max-size": "1m", "max-file": "1", compress: "false" },
  });
});

it("LOGGING-02 pedido atende a expectativa documental independente", () => {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  const spec = receitaPostgres(
    randomBytes(16).toString("hex"),
    imagem,
    randomBytes(32).toString("hex"),
  );
  expect(() =>
    conferirPedidoDocumental({ ...spec }, fixtureContainer.captura.resposta, igual),
  ).not.toThrow();
  const historica = structuredClone(spec);
  Reflect.deleteProperty(historica.HostConfig.LogConfig.Config, "compress");
  expect(() =>
    conferirPedidoDocumental({ ...historica }, fixtureContainer.captura.resposta, igual),
  ).toThrow(/Pedido diverge/);
});

it.each([
  "ausente",
  "true",
  "booleano",
  "grafia",
  "invalido",
  "extra",
  "arquivo",
  "tamanho",
  "tipo",
  "mapa",
] as const)("LOGGING-03 recusa receita divergente: %s", (modo) => {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  const rodada = randomBytes(16).toString("hex");
  const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
  const log = spec.HostConfig.LogConfig;
  if (modo === "ausente") Reflect.deleteProperty(log.Config, "compress");
  else if (modo === "true") Reflect.set(log.Config, "compress", "true");
  else if (modo === "booleano") Reflect.set(log.Config, "compress", false);
  else if (modo === "grafia") Reflect.set(log.Config, "compress", "False");
  else if (modo === "invalido") Reflect.set(log.Config, "compress", "nunca");
  else if (modo === "extra") Reflect.set(log.Config, "externo", "valor");
  else if (modo === "arquivo") Reflect.set(log.Config, "max-file", "2");
  else if (modo === "tamanho") Reflect.set(log.Config, "max-size", "2m");
  else if (modo === "tipo") log.Type = "json-file";
  else Reflect.set(log, "Config", null);
  const antes = JSON.stringify(spec);
  expect(() => validarReceitaPostgres(spec, rodada, imagem)).toThrow(/nativa/);
  expect(JSON.stringify(spec)).toBe(antes);
});

it.each([
  "ausente",
  "true",
  "booleano",
  "grafia",
  "invalido",
  "extra",
  "arquivo",
  "tamanho",
  "tipo",
  "mapa",
] as const)("LOGGING-04 recusa inspect divergente: %s", async (modo) => {
  const { imagem, spec, f, raw } = await cenarioDocumental();
  const log = raw.HostConfig.LogConfig;
  if (modo === "ausente") Reflect.deleteProperty(log.Config, "compress");
  else if (modo === "true") Reflect.set(log.Config, "compress", "true");
  else if (modo === "booleano") Reflect.set(log.Config, "compress", false);
  else if (modo === "grafia") Reflect.set(log.Config, "compress", "False");
  else if (modo === "invalido") Reflect.set(log.Config, "compress", "nunca");
  else if (modo === "extra") Reflect.set(log.Config, "externo", "valor");
  else if (modo === "arquivo") Reflect.set(log.Config, "max-file", "2");
  else if (modo === "tamanho") Reflect.set(log.Config, "max-size", "2m");
  else if (modo === "tipo") log.Type = "json-file";
  else Reflect.set(log, "Config", null);
  const antes = JSON.stringify(raw);
  expect(() => normalizarPostgres(raw, spec, imagem, f.id)).toThrow(/nativa/);
  expect(JSON.stringify(raw)).toBe(antes);
  expect(f.chamadas.some((c) => /\/(start|exec)$/.test(c.caminho) || c.metodo === "DELETE")).toBe(
    false,
  );
});

it("LOGGING-05 somente compress distingue HostConfig sintético da captura intacta", async () => {
  const antes = JSON.stringify(fixtureContainer);
  const { raw } = await cenarioDocumental();
  const host = structuredClone(raw.HostConfig);
  expect(host).toEqual(hostConfigDocumental);
  expect(Reflect.deleteProperty(host.LogConfig.Config, "compress")).toBe(true);
  expect(host).toEqual(fixtureContainer.captura.resposta.HostConfig);
  expect(JSON.stringify(fixtureContainer)).toBe(antes);
});

// Só estes cenários de teste mudam o raw documental, sempre em cópia profunda.
async function cenarioDocumental() {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  const spec = receitaPostgres(
    randomBytes(16).toString("hex"),
    imagem,
    randomBytes(32).toString("hex"),
  );
  const f = engineFalso(false);
  await f.requisitar("POST", "/containers/create", spec);
  const raw = (await f.requisitar(
    "GET",
    `/containers/${f.id}/json`,
  )) as typeof fixtureContainer.captura.resposta;
  return { imagem, spec, f, raw };
}

it.each(["literal-anterior", "reversa"] as const)(
  "MASCARAS-03 aceita permutação fechada: %s",
  async (ordem) => {
    const { imagem, spec, f, raw } = await cenarioDocumental();
    raw.HostConfig.MaskedPaths =
      ordem === "literal-anterior"
        ? [...ordemLiteralAnterior]
        : [...raw.HostConfig.MaskedPaths].reverse();
    const antes = JSON.stringify(raw);
    expect(normalizarPostgres(raw, spec, imagem, f.id)).toMatchObject({
      Config: spec,
      HostConfig: spec.HostConfig,
      Mounts: [],
    });
    expect(JSON.stringify(raw)).toBe(antes);
  },
);

it.each([
  "nulo",
  "objeto",
  "string",
  "numero",
  "vazia",
  "falta",
  "extra",
  "substituida",
  "duplicada",
  "duplicada-com-falta",
  "item-numero",
  "item-objeto",
  "esparsa",
  "barra-final",
  "ponto",
  "espaco",
  "caixa",
] as const)("MASCARAS-04 recusa conjunto inválido: %s", async (modo) => {
  const { imagem, spec, f, raw } = await cenarioDocumental();
  const h = raw.HostConfig;
  const lista = h.MaskedPaths;
  const primeiro = lista[0];
  if (typeof primeiro !== "string") throw new Error("Fixture sem primeira máscara.");
  if (modo === "nulo") Reflect.set(h, "MaskedPaths", null);
  else if (modo === "objeto") Reflect.set(h, "MaskedPaths", {});
  else if (modo === "string") Reflect.set(h, "MaskedPaths", lista[0]);
  else if (modo === "numero") Reflect.set(h, "MaskedPaths", 12);
  else if (modo === "vazia") h.MaskedPaths = [];
  else if (modo === "falta") lista.pop();
  else if (modo === "extra") lista.push("/etc/shadow");
  else if (modo === "substituida") lista[0] = "/etc/shadow";
  else if (modo === "duplicada") lista.push(primeiro);
  else if (modo === "duplicada-com-falta") lista[1] = primeiro;
  else if (modo === "item-numero") Reflect.set(lista, "0", 1);
  else if (modo === "item-objeto") Reflect.set(lista, "0", {});
  else if (modo === "esparsa") Reflect.deleteProperty(lista, "0");
  else if (modo === "barra-final") lista[0] += "/";
  else if (modo === "ponto") lista[0] = "/proc/./acpi";
  else if (modo === "espaco") lista[0] += " ";
  else lista[0] = primeiro.toUpperCase();
  const antes = JSON.stringify(raw);
  expect(() => normalizarPostgres(raw, spec, imagem, f.id)).toThrow(/Máscaras nativas/);
  expect(JSON.stringify(raw)).toBe(antes);
  expect(f.chamadas.some((c) => /\/(start|exec)$/.test(c.caminho) || c.metodo === "DELETE")).toBe(
    false,
  );
});

it.each([
  "nulo",
  "string",
  "vazio",
  "falta",
  "extra",
  "ordem",
  "duplicado",
  "item-numero",
] as const)("MASCARAS-05 recusa readonly divergente: %s", async (modo) => {
  const { imagem, spec, f, raw } = await cenarioDocumental();
  const h = raw.HostConfig;
  const primeiro = h.ReadonlyPaths[0];
  if (typeof primeiro !== "string") throw new Error("Fixture sem primeiro caminho readonly.");
  if (modo === "nulo") Reflect.set(h, "ReadonlyPaths", null);
  else if (modo === "string") Reflect.set(h, "ReadonlyPaths", "/proc/bus");
  else if (modo === "vazio") h.ReadonlyPaths = [];
  else if (modo === "falta") h.ReadonlyPaths.pop();
  else if (modo === "extra") h.ReadonlyPaths.push("/externo");
  else if (modo === "ordem") h.ReadonlyPaths.reverse();
  else if (modo === "duplicado") h.ReadonlyPaths[1] = primeiro;
  else Reflect.set(h.ReadonlyPaths, "0", 1);
  const antes = JSON.stringify(raw);
  expect(() => normalizarPostgres(raw, spec, imagem, f.id)).toThrow(/Paths nativos/);
  expect(JSON.stringify(raw)).toBe(antes);
});

it.each([null, "1073741824", 0, 536870912, 2147483648, {}])(
  "MASCARAS-06 recusa swap divergente: %j",
  async (valor) => {
    const { imagem, spec, f, raw } = await cenarioDocumental();
    Reflect.set(raw.HostConfig, "MemorySwap", valor);
    const antes = JSON.stringify(raw);
    expect(() => normalizarPostgres(raw, spec, imagem, f.id)).toThrow(/Swap nativo/);
    expect(JSON.stringify(raw)).toBe(antes);
  },
);

it("IMAGEM-PINADA-01 aprova a captura fiel e confere receita e herança no Gate", async () => {
  const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
  if (!imagem.id) throw new Error("Imagem aprovada sem identidade.");
  const rodada = randomBytes(16).toString("hex");
  const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
  expect(spec.WorkingDir, "IMAGEM-PINADA-01 diretório explícito").toBe("/");
  expect(spec.Env, "IMAGEM-PINADA-01 compilação neutralizada").toContain("DOCKER_PG_LLVM_DEPS=");
  expect(spec.Env).not.toContain("DOCKER_PG_LLVM_DEPS=llvm21-dev \t\tclang21");
  const falso = engineFalso(false);
  const gate = criarBarreiraEngine({
    rodada,
    receitas: { banco: spec },
    imagens: { [imagem.id]: imagem },
    requisitar: falso.requisitar,
    persistir: async () => {},
  });
  const handle = await gate.criar("banco");
  expect(await gate.atender("GET", `/containers/${falso.id}/json`)).toMatchObject({ Config: spec });
  await gate.iniciar(handle);
  expect(falso.chamadas.filter((c) => c.caminho === "/containers/create")).toHaveLength(1);
  expect(falso.chamadas.filter((c) => c.caminho === `/containers/${falso.id}/start`)).toHaveLength(
    1,
  );
  expect(await gate.encerrar(async () => {})).toEqual({
    removidos: [handle],
    preservados: [],
    falhas: [],
  });
});

it("cria parado, persiste o ID antes da partida e consulta antes da remoção exclusiva", async () => {
  const base = await mkdtemp(join(tmpdir(), "fadm-nativo-"));
  const falso = engineFalso();
  try {
    const resultado = await iniciarDockerReal({
      diretorioBase: base,
      requisitar: falso.requisitar,
      aoPreparar: falso.definirDiretorio,
    });
    expect(resultado.codigo).toBe(0);
    expect(resultado.identidade).toEqual({
      banco: `ft_${resultado.rodada}`,
      papel: `ft_${resultado.rodada}`,
      objetos: 0,
      somenteLeitura: true,
    });
    expect(resultado.limpeza).toMatchObject({ preservados: [], falhas: [] });
    expect((await stat(resultado.diretorio)).mode & 0o777).toBe(0o700);
    expect((await stat(join(resultado.diretorio, "docker"))).mode & 0o777).toBe(0o700);
    expect((await stat(join(resultado.diretorio, "journal.jsonl"))).mode & 0o777).toBe(0o600);
    const deletes = falso.chamadas.filter((c) => c.metodo === "DELETE");
    expect(deletes).toEqual([{ metodo: "DELETE", caminho: `/containers/${falso.id}` }]);
    const consulta = falso.chamadas.findIndex(
      (c) => c.caminho.startsWith("/exec/") && c.caminho.endsWith("/json"),
    );
    expect(consulta).toBeGreaterThan(0);
    expect(falso.chamadas.findIndex((c) => c.metodo === "DELETE")).toBeGreaterThan(consulta);
    expect(falso.chamadas.at(-1)).toEqual({
      metodo: "GET",
      caminho: `/containers/${falso.id}/json`,
    });
  } finally {
    await rm(base, { recursive: true });
  }
});

async function falhaFechada(
  adulterar: (metodo: string, caminho: string, resposta: unknown) => unknown,
) {
  const base = await mkdtemp(join(tmpdir(), "fadm-negativo-"));
  const f = engineFalso();
  try {
    const r = await iniciarDockerReal({
      diretorioBase: base,
      aoPreparar: f.definirDiretorio,
      requisitar: async (m, p, b) => adulterar(m, p, await f.requisitar(m, p, b)),
    });
    expect(r.codigo).toBe(1);
    expect(f.chamadas.filter((c) => c.metodo === "DELETE")).toEqual([]);
    return {
      r,
      chamadas: f.chamadas,
      journal: await readFile(join(r.diretorio, "journal.jsonl"), "utf8").catch(() => ""),
    };
  } finally {
    await rm(base, { recursive: true });
  }
}

// Caracteriza recusas existentes e as fronteiras do contrato coeso, sem novo RED.
it.each([
  "pin",
  "diretorio-vazio",
  "diretorio-arbitrario",
  "env-extra",
  "env-duplicado",
  "env-tipo",
  "env-sintaxe",
  "compilacao-divergente",
  "compilacao-vazia",
  "compilacao-ausente",
  "pgdata",
  "healthcheck",
] as const)("IMAGEM-PINADA-02 recusa imagem antes de create: %s", async (modo) => {
  const imagem = structuredClone(fixtureImagem.captura.resposta);
  const c = imagem.Config;
  if (modo === "pin") imagem.RepoDigests = [];
  else if (modo === "diretorio-vazio") c.WorkingDir = "";
  else if (modo === "diretorio-arbitrario") c.WorkingDir = "/externo";
  else if (modo === "env-extra") c.Env.push("EXTRA=indevido");
  else if (modo === "env-duplicado") c.Env.push("PG_MAJOR=17");
  else if (modo === "env-tipo") Reflect.set(c, "Env", [17]);
  else if (modo === "env-sintaxe") c.Env.push("SEM_IGUAL");
  else if (modo === "healthcheck") Reflect.set(c, "Healthcheck", { Test: ["CMD", "true"] });
  else if (modo === "pgdata")
    c.Env = c.Env.map((e) => (e.startsWith("PGDATA=") ? "PGDATA=/externo" : e));
  else
    c.Env = c.Env.flatMap((e) =>
      !e.startsWith("DOCKER_PG_LLVM_DEPS=")
        ? [e]
        : modo === "compilacao-ausente"
          ? []
          : [modo === "compilacao-vazia" ? "DOCKER_PG_LLVM_DEPS=" : "DOCKER_PG_LLVM_DEPS=outro"],
    );
  const { chamadas } = await falhaFechada((_m, p, raw) =>
    p.startsWith("/images/") ? imagem : raw,
  );
  expect(chamadas).toEqual([{ metodo: "GET", caminho: `/images/${encodeURIComponent(pin)}/json` }]);
});

it.each([
  "diretorio",
  "env-extra",
  "env-duplicado",
  "env-tipo",
  "env-array",
  "env-sintaxe",
  "compilacao-herdada",
  "compilacao-ausente",
  "pgdata",
] as const)("IMAGEM-PINADA-03 recusa raw antes de start e preserva recurso: %s", async (modo) => {
  let adulteracoes = 0;
  const { chamadas, r, journal } = await falhaFechada((_m, p, raw) => {
    if (
      p.startsWith("/containers/") &&
      p.endsWith("/json") &&
      raw &&
      typeof raw === "object" &&
      "Config" in raw
    ) {
      const c = raw.Config;
      if (
        !c ||
        typeof c !== "object" ||
        !("Env" in c) ||
        !Array.isArray(c.Env) ||
        !c.Env.every((e) => typeof e === "string")
      )
        throw new Error("Raw sintético sem ambiente esperado.");
      const env = c.Env;
      if (modo === "diretorio") Reflect.set(c, "WorkingDir", "");
      else if (modo === "env-extra") env.push("EXTRA=indevido");
      else if (modo === "env-duplicado") env.push("DOCKER_PG_LLVM_DEPS=");
      else if (modo === "env-tipo") Reflect.set(c, "Env", [17]);
      else if (modo === "env-array") Reflect.set(c, "Env", "DOCKER_PG_LLVM_DEPS=");
      else if (modo === "env-sintaxe") env.push("SEM_IGUAL");
      else if (modo === "pgdata")
        Reflect.set(
          c,
          "Env",
          env.map((e) => (e.startsWith("PGDATA=") ? "PGDATA=/externo" : e)),
        );
      else
        Reflect.set(
          c,
          "Env",
          env.flatMap((e) =>
            !e.startsWith("DOCKER_PG_LLVM_DEPS=")
              ? [e]
              : modo === "compilacao-ausente"
                ? []
                : ["DOCKER_PG_LLVM_DEPS=llvm21-dev \t\tclang21"],
          ),
        );
      adulteracoes++;
    }
    return raw;
  });
  expect(adulteracoes).toBeGreaterThan(0);
  expect(chamadas.filter((c) => c.caminho === "/containers/create")).toHaveLength(1);
  expect(chamadas.some((c) => c.caminho.endsWith("/start") || c.caminho.endsWith("/exec"))).toBe(
    false,
  );
  expect(r.limpeza.preservados).toHaveLength(1);
  expect(journal).toContain('"estado":"incerto"');
});

it.each(["diretorio", "compilacao", "env-extra", "env-ordem"] as const)(
  "IMAGEM-PINADA-04 receita canônica é conferida antes de efeitos: %s",
  async (modo) => {
    const imagem = aprovarImagemPostgres(fixtureImagem.captura.resposta);
    if (!imagem.id) throw new Error("Imagem aprovada sem identidade.");
    const rodada = randomBytes(16).toString("hex");
    const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
    const adulterada = structuredClone(spec);
    if (modo === "diretorio") adulterada.WorkingDir = "";
    else if (modo === "env-extra") adulterada.Env.push("EXTRA=indevido");
    else if (modo === "env-ordem") adulterada.Env.reverse();
    else
      adulterada.Env = adulterada.Env.map((e) =>
        e.startsWith("DOCKER_PG_LLVM_DEPS=") ? "DOCKER_PG_LLVM_DEPS=llvm21-dev \t\tclang21" : e,
      );
    const requisitar = vi.fn(async () => null);
    const persistir = vi.fn(async () => {});
    const comum = { rodada, imagens: { [imagem.id]: imagem }, requisitar, persistir };
    expect(() => criarBarreiraEngine({ ...comum, receitas: { banco: adulterada } })).toThrow(
      /Receita nativa/,
    );
    const gate = criarBarreiraEngine({ ...comum, receitas: { banco: spec } });
    await expect(gate.atender("POST", "/containers/create", adulterada)).rejects.toThrow(
      /fora da receita/,
    );
    expect(requisitar).toHaveBeenCalledTimes(0);
    expect(persistir).toHaveBeenCalledTimes(0);
  },
);

it("recusa o padrão sem configuração antes de qualquer cliente", async () => {
  await expect(
    Reflect.apply(iniciarDockerReal, undefined, [
      {
        requisitar: async () => {
          throw new Error("Cliente falso não deve ser chamado.");
        },
      },
    ]),
  ).rejects.toThrow(/bloqueado/);
});

it.each([
  ["Privileged", true],
  ["Binds", ["/vizinho:/dados"]],
  ["NetworkMode", "bridge"],
  ["PortBindings", { "5432/tcp": [{ HostPort: "5432" }] }],
  ["ExtraHosts", ["host:host-gateway"]],
  ["CapAdd", ["CHOWN"]],
  ["ReadonlyRootfs", false],
  ["Memory", 0],
  ["opcaoNova", false],
] as const)("preserva o recurso e não projeta HostConfig perigoso: %s", async (chave, valor) => {
  const { r, chamadas, journal } = await falhaFechada((_m, p, raw) => {
    if (p.endsWith("/json") && p.startsWith("/containers/") && raw) {
      const info = raw as { HostConfig: Record<string, unknown> };
      info.HostConfig[chave] = valor;
    }
    return raw;
  });
  expect(r.limpeza.preservados).toHaveLength(1);
  expect(chamadas.some((c) => c.caminho.endsWith("/start"))).toBe(false);
  expect(journal).toContain('"estado":"incerto"');
});

it.each(["Id", "Image", "Labels", "Env", "Mounts", "Networks"] as const)(
  "recusa identidade ou perímetro raw adulterado: %s",
  async (campo) => {
    await falhaFechada((_m, p, raw) => {
      if (p.endsWith("/json") && p.startsWith("/containers/") && raw) {
        const info = raw as Record<string, unknown>;
        if (campo === "Id" || campo === "Image") info[campo] = "vizinho";
        else if (campo === "Mounts")
          info.Mounts = [
            { Type: "volume", Name: "anonimo", Destination: "/var/lib/postgresql/data", RW: true },
          ];
        else if (campo === "Networks")
          info.NetworkSettings = { Ports: {}, Networks: { bridge: {} } };
        else
          (info.Config as Record<string, unknown>)[campo] =
            campo === "Env" ? ["PGDATA=/vizinho"] : {};
      }
      return raw;
    });
  },
);

it("não repete nem adota criação sem ID", async () => {
  const { chamadas, journal } = await falhaFechada((_m, p, raw) =>
    p === "/containers/create" ? {} : raw,
  );
  expect(chamadas.filter((c) => c.caminho === "/containers/create")).toHaveLength(1);
  expect(chamadas.some((c) => c.caminho.endsWith("/start"))).toBe(false);
  expect(journal).toContain('"id":null');
  expect(journal).toContain('"estado":"incerto"');
});

it("imagem com volume herdado adicional é recusada antes de create", async () => {
  const { chamadas } = await falhaFechada((_m, p, raw) => {
    if (p.startsWith("/images/"))
      (raw as { Config: { Volumes: object } }).Config.Volumes = {
        "/var/lib/postgresql/data": {},
        "/externo": {},
      };
    return raw;
  });
  expect(chamadas).toHaveLength(1);
});

it.each(["Running", "Pid", "ContainerID", "ProcessConfig"] as const)(
  "exige confirmação do processo remoto fixo: %s",
  async (campo) => {
    await falhaFechada((_m, p, raw) => {
      if (p.startsWith("/exec/") && p.endsWith("/json"))
        (raw as Record<string, unknown>)[campo] =
          campo === "Running"
            ? true
            : campo === "Pid"
              ? 123
              : campo === "ContainerID"
                ? "vizinho"
                : { entrypoint: "sh", arguments: ["-c", "SELECT falso"] };
      return raw;
    });
  },
);

it.each(["nao-vazio", "sql", "identidade", "truncado"] as const)(
  "consulta divergente não vira readiness ou limpeza: %s",
  async (modo) => {
    const { chamadas } = await falhaFechada((_m, p, raw) => {
      if (modo === "sql" && p.startsWith("/exec/") && p.endsWith("/json"))
        (raw as Record<string, unknown>).ExitCode = 3;
      if (Buffer.isBuffer(raw)) {
        if (modo === "truncado") return raw.subarray(0, -1);
        const b = raw
          .subarray(8)
          .toString()
          .replace(
            modo === "nao-vazio" ? "|0|on" : modo === "identidade" ? "ft_" : "inexistente",
            modo === "nao-vazio" ? "|1|on" : "vizinho_",
          );
        const h = Buffer.alloc(8);
        h[0] = 1;
        h.writeUInt32BE(Buffer.byteLength(b), 4);
        return Buffer.concat([h, Buffer.from(b)]);
      }
      return raw;
    });
    expect(chamadas.filter((c) => c.caminho.endsWith("/exec"))).toHaveLength(1);
  },
);

it("repete somente recusa de conexão reconhecida e mantém IDs exec distintos", async () => {
  const base = await mkdtemp(join(tmpdir(), "fadm-readiness-"));
  const f = engineFalso();
  const ids: string[] = [];
  let inicial = true;
  try {
    const r = await iniciarDockerReal({
      diretorioBase: base,
      aoPreparar: f.definirDiretorio,
      requisitar: async (m, p, b) => {
        const raw = await f.requisitar(m, p, b);
        if (p.endsWith("/exec")) {
          ids.push((raw as { Id: string }).Id);
          const comando = b as { Cmd: string[]; AttachStdin: boolean; Privileged: boolean };
          expect(comando.AttachStdin).toBe(false);
          expect(comando.Privileged).toBe(false);
          expect(comando.Cmd[0]).toBe("psql");
          expect(comando.Cmd).toContain("--host=127.0.0.1");
          expect(comando.Cmd.at(-1)).toMatch(
            /^--command=SELECT current_database\(\), current_user,/,
          );
        }
        if (inicial && p.startsWith("/exec/") && p.endsWith("/start")) {
          const msg = Buffer.from(
            'psql: error: connection to server at "127.0.0.1", port 5432 failed: Connection refused\n',
          );
          const h = Buffer.alloc(8);
          h[0] = 2;
          h.writeUInt32BE(msg.length, 4);
          return Buffer.concat([h, msg]);
        }
        if (inicial && p.startsWith("/exec/") && p.endsWith("/json")) {
          inicial = false;
          (raw as { ExitCode: number }).ExitCode = 2;
        }
        return raw;
      },
    });
    expect(r.codigo).toBe(0);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
    const execs = (await readFile(join(r.diretorio, "execs.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((l) => (JSON.parse(l) as { id: string }).id);
    expect(execs).toEqual(ids);
  } finally {
    await rm(base, { recursive: true });
  }
});

it("liga o fluxo host completo ao cliente Engine com processos HTTP falsos", async () => {
  const base = await mkdtemp(join(tmpdir(), "fadm-http-fluxo-"));
  const arquivo = join(base, "engine.mjs");
  const estado = join(base, "estado.json");
  const id = randomBytes(32).toString("hex");
  const exec = randomBytes(32).toString("hex");
  const imagemRaw = structuredClone(fixtureImagem.captura.resposta);
  const script = `// Engine HTTP falso persistente, sem socket ou daemon.\nimport fs from 'node:fs';import {isDeepStrictEqual as igual} from 'node:util';const herdarConfigSintetica=${herdarConfigSintetica.toString()};const conferirPedidoDocumental=${conferirPedidoDocumental.toString()};const inspecaoDocumental=${inspecaoDocumental.toString()};const arquivo=process.argv[2];let dados=Buffer.alloc(0),enviado=false;process.stdin.on('data',b=>{dados=Buffer.concat([dados,b]);const fim=dados.indexOf('\\r\\n\\r\\n');if(enviado||fim<0)return;const h=dados.subarray(0,fim).toString();const n=Number(/content-length: (\\d+)/i.exec(h)?.[1]??0);if(dados.length<fim+4+n)return;enviado=true;const s=JSON.parse(fs.readFileSync(arquivo,'utf8'));const [m,uri]=h.split(' '),p=uri.replace('/v1.47','').split('?')[0];const body=n?JSON.parse(dados.subarray(fim+4).toString()):null;s.chamadas.push({m,p});let status='200 OK',tipo='application/json',v;\nif(p.startsWith('/images/'))v=s.imagemRaw;else if(p==='/containers/create'){if(!uri.endsWith('?name='+body.Hostname))throw Error('Nome divergente');conferirPedidoDocumental(body,s.documental,igual);s.spec=body;s.existe=true;status='201 Created';v={Id:s.id,Warnings:[]};}\nelse if(p==='/containers/'+s.id+'/json'){if(!s.existe){status='404 Not Found';v={message:'No such container: '+s.id};}else{v=inspecaoDocumental(s.documental,s.imagemRaw.Config,s.spec,s.id,!!s.running);}}\nelse if(p==='/containers/'+s.id+'/exec'){s.comando=body;status='201 Created';v={Id:s.exec};}\nelse if(p==='/exec/'+s.exec+'/start'){tipo='application/vnd.docker.raw-stream';const banco=s.spec.Env.find(x=>x.startsWith('POSTGRES_DB=')).slice(12);const b=Buffer.from(banco+'|'+banco+'|0|on\\n'),h=Buffer.alloc(8);h[0]=1;h.writeUInt32BE(b.length,4);v=Buffer.concat([h,b]);}\nelse if(p==='/exec/'+s.exec+'/json')v={ID:s.exec,ContainerID:s.id,Running:false,ExitCode:0,Pid:0,ProcessConfig:{privileged:false,user:'postgres',tty:false,entrypoint:s.comando.Cmd[0],arguments:s.comando.Cmd.slice(1)}};\nelse if(p==='/containers/'+s.id+'/start'){s.running=true;status='204 No Content';}else if(p==='/containers/'+s.id+'/stop'){s.running=false;status='204 No Content';}else if(m==='DELETE'&&p==='/containers/'+s.id){s.existe=false;status='204 No Content';}else throw Error('Rota imprevista');\nfs.writeFileSync(arquivo,JSON.stringify(s),{mode:384});const out=Buffer.isBuffer(v)?v:v===undefined?Buffer.alloc(0):Buffer.from(JSON.stringify(v,null,2)+'\\n');process.stdout.end(Buffer.concat([Buffer.from('HTTP/1.1 '+status+'\\r\\nContent-Type: '+tipo+'\\r\\nAPI-Version: 1.56\\r\\nConnection: close\\r\\nContent-Length: '+out.length+'\\r\\n\\r\\n'),out]),()=>process.stdin.destroy());});`;
  try {
    await writeFile(arquivo, script, { mode: 0o600 });
    await writeFile(
      estado,
      JSON.stringify({
        id,
        exec,
        imagemRaw,
        documental: fixtureContainer.captura.resposta,
        chamadas: [],
      }),
      {
        mode: 0o600,
      },
    );
    expect(
      spawnSync(process.execPath, ["--check", arquivo], { env: { NODE_ENV: "test" } }).status,
    ).toBe(0);
    let nome = `fadm-${"a".repeat(32)}`;
    const r = await iniciarDockerReal({
      diretorioBase: base,
      requisitar: async (m, p, b) => {
        if (p === "/containers/create") nome = (b as { Hostname: string }).Hostname;
        const raw = await criarClienteEngine({
          nome,
          iniciar: () =>
            spawn(process.execPath, [arquivo, estado], {
              env: { NODE_ENV: "test" },
              stdio: ["pipe", "pipe", "pipe"],
            }),
        })(m, p, b);
        if (m === "GET" && p === `/containers/${id}/json` && raw !== null) {
          expect(
            (raw as { HostConfig: unknown }).HostConfig,
            "FIDELIDADE-HTTP antes do Gate",
          ).toEqual(hostConfigDocumental);
        }
        return raw;
      },
    });
    expect(r.codigo).toBe(0);
    const final: { existe: boolean; chamadas: { m: string; p: string }[] } = JSON.parse(
      await readFile(estado, "utf8"),
    );
    expect(final.existe).toBe(false);
    expect(final.chamadas.filter((c) => c.m === "DELETE")).toEqual([
      { m: "DELETE", p: `/containers/${id}` },
    ]);
    expect(final.chamadas.at(-1)).toEqual({ m: "GET", p: `/containers/${id}/json` });
  } finally {
    await rm(base, { recursive: true });
  }
});

it.each([
  "pretty",
  "chunked",
  "404-exato",
  "404-vizinho",
  "204",
  "null",
  "array",
  "duplicado",
] as const)("cliente nativo usa HTTP real sobre processo falso: %s", async (modo) => {
  const base = await mkdtemp(join(tmpdir(), "fadm-http-"));
  const id = randomBytes(32).toString("hex");
  const arquivo = join(base, "http-falso.mjs");
  const codigo = `// Responde uma inspeção documental, sem Docker.\nconst modo=process.argv[2], id=process.argv[3]; let dados=Buffer.alloc(0),enviado=false;\nprocess.stdin.on('data',b=>{dados=Buffer.concat([dados,b]);if(enviado||!dados.includes('\\r\\n\\r\\n'))return;enviado=true;\nif(!dados.toString().startsWith('GET /v1.47/containers/'+id+'/json HTTP/1.1')){process.exitCode=7;process.stdin.destroy();return;}\nlet status='200 OK';let body=JSON.stringify({Id:id,Config:{},HostConfig:{},Mounts:[],State:{Running:false}},null,2)+'\\n';\nif(modo.startsWith('404')){status='404 Not Found';body=JSON.stringify({message:'No such container: '+(modo==='404-exato'?id:'f'.repeat(64))});}\nif(modo==='204'){status='204 No Content';body='';}if(modo==='null')body='null';if(modo==='array')body='[]';if(modo==='duplicado')body='{"Id":"vizinho","Id":"'+id+'"}';\nconst payload=Buffer.from(body);const headers='HTTP/1.1 '+status+'\\r\\nAPI-Version: 1.47\\r\\nContent-Type: application/json\\r\\nConnection: close\\r\\n';\nconst wire=modo==='chunked'?Buffer.concat([Buffer.from(headers+'Transfer-Encoding: chunked\\r\\n\\r\\n'+payload.length.toString(16)+'\\r\\n'),payload,Buffer.from('\\r\\n0\\r\\n\\r\\n')]):Buffer.concat([Buffer.from(headers+'Content-Length: '+payload.length+'\\r\\n\\r\\n'),payload]);\nprocess.stdout.end(wire,()=>process.stdin.destroy());});`;
  try {
    await writeFile(arquivo, codigo, { mode: 0o600 });
    expect(
      spawnSync(process.execPath, ["--check", arquivo], { env: { NODE_ENV: "test" } }).status,
    ).toBe(0);
    const cliente = criarClienteEngine({
      nome: `fadm-${"a".repeat(32)}`,
      iniciar: () =>
        spawn(process.execPath, [arquivo, modo, id], {
          env: { NODE_ENV: "test" },
          stdio: ["pipe", "pipe", "pipe"],
        }),
    });
    const resposta = cliente("GET", `/containers/${id}/json`);
    if (modo === "pretty" || modo === "chunked")
      await expect(resposta).resolves.toMatchObject({ Id: id });
    else if (modo === "404-exato") await expect(resposta).resolves.toBeNull();
    else await expect(resposta).rejects.toThrow();
  } finally {
    await rm(base, { recursive: true });
  }
});

// Promessas provam a entrada no await; sinal e deadline abaixo são ordem lógica, não sinais OS.
async function revogacaoHost(fase: FaseHost, revogar: "aberto" | "sinal" | "deadline") {
  const base = await mkdtemp(join(tmpdir(), "fadm-revogacao-"));
  const f = engineFalso();
  const entrou = Promise.withResolvers<void>();
  const liberar = Promise.withResolvers<void>();
  let atingidas = 0;
  const segurar = async () => {
    atingidas++;
    entrou.resolve();
    await liberar.promise;
  };
  const anteriores = new Set(process.listeners("SIGINT"));
  if (revogar === "deadline") vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  observadorFS.aoAbrir = (nome, arquivo) => {
    if (
      (fase === "intencao" && nome.endsWith("/journal.jsonl")) ||
      (fase === "resultado-escrita" && nome.endsWith("/resultado.json"))
    ) {
      const escrever = arquivo.writeFile.bind(arquivo);
      vi.spyOn(arquivo, "writeFile").mockImplementation(async (...args) => {
        await escrever(...args);
        if (fase !== "intencao" || String(args[0]).includes('"estado":"intencao"')) await segurar();
      });
    }
    if (
      (fase === "resultado-fecho" && nome.endsWith("/resultado.json")) ||
      (fase === "execs-fecho" && nome.endsWith("/execs.jsonl")) ||
      (fase === "nucleo-fecho" && nome.endsWith("/journal.jsonl"))
    ) {
      const fechar = arquivo.close.bind(arquivo);
      vi.spyOn(arquivo, "close").mockImplementation(async () => {
        await segurar();
        await fechar();
      });
    }
  };
  let inspecoes = 0;
  const pendente = iniciarDockerReal({
    diretorioBase: base,
    aoPreparar: f.definirDiretorio,
    requisitar: async (m, p, b) => {
      const resposta = await f.requisitar(m, p, b);
      if (p === `/containers/${f.id}/json` && ++inspecoes === 2 && fase === "partida")
        await segurar();
      return resposta;
    },
  });
  try {
    await entrou.promise;
    expect(atingidas).toBe(1);
    const proprios = process.listeners("SIGINT").filter((l) => !anteriores.has(l));
    expect(proprios).toHaveLength(1);
    const marco = f.chamadas.length;
    if (revogar === "sinal") proprios.forEach((l) => l.call(process, "SIGINT"));
    if (revogar === "deadline") await vi.advanceTimersByTimeAsync(30000);
    liberar.resolve();
    const r = await pendente;
    const novas = f.chamadas
      .slice(marco)
      .filter((c) => c.metodo === "POST" && !c.caminho.endsWith("/stop"));
    if (revogar !== "aberto") {
      expect(novas, "NPG-LIFECYCLE-01 enviou mutação nova após revogação").toEqual([]);
      expect(r.codigo, "NPG-LIFECYCLE-01 publicou sucesso após revogação").toBe(1);
    } else {
      expect(r.codigo).toBe(0);
      expect(r.limpeza.preservados).toEqual([]);
      expect(f.chamadas.some((c) => c.caminho.endsWith("/exec"))).toBe(true);
    }
    if (fase === "partida" && revogar !== "aberto") {
      expect(f.chamadas.filter((c) => c.metodo === "DELETE")).toEqual([
        { metodo: "DELETE", caminho: `/containers/${f.id}` },
      ]);
      expect(r.limpeza.preservados).toEqual([]);
    }
    expect(process.listeners("SIGINT")).toEqual([...anteriores]);
  } finally {
    liberar.resolve();
    await pendente;
    observadorFS.aoAbrir = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
    await rm(base, { recursive: true });
  }
}
it.each(
  fasesHost.flatMap((fase) => (["aberto", "sinal"] as const).map((revogar) => ({ fase, revogar }))),
)("NPG-LIFECYCLE-01 host $fase/$revogar", async ({ fase, revogar }) => {
  await revogacaoHost(fase, revogar);
});
it("NPG-LIFECYCLE-01 deadline durante fechamento continua pertencendo ao lifecycle", async () => {
  await revogacaoHost("nucleo-fecho", "deadline");
});

it.each(
  (["inspecao", "persistencia", "enviado"] as const).flatMap((fase) =>
    (["aberto", "fechado", "sinal"] as const).map((revogar) => ({ fase, revogar })),
  ),
)("NPG-LIFECYCLE-02 consulta $fase/$revogar", async ({ fase, revogar }) => {
  const f = engineFalso(false);
  const rodada = randomBytes(16).toString("hex");
  const imagem = aprovarImagemPostgres(
    await f.requisitar("GET", `/images/${encodeURIComponent(pin)}/json`),
  );
  if (!imagem.id) throw new Error("Imagem sintética ausente.");
  const spec = receitaPostgres(rodada, imagem, randomBytes(32).toString("hex"));
  const entrou = Promise.withResolvers<void>();
  const liberar = Promise.withResolvers<void>();
  const ids: string[] = [];
  const registros: unknown[] = [];
  let ativo = false;
  let atingidas = 0;
  const segurar = async () => {
    atingidas++;
    entrou.resolve();
    await liberar.promise;
  };
  const gate = criarBarreiraEngine({
    rodada,
    receitas: { banco: spec },
    imagens: { [imagem.id]: imagem },
    persistir: async (r) => {
      registros.push(structuredClone(r));
    },
    requisitar: async (m, p, b) => {
      const resposta = await f.requisitar(m, p, b);
      if (ativo && fase === "inspecao" && p === `/containers/${f.id}/json`) {
        ativo = false;
        await segurar();
      }
      if (ativo && fase === "enviado" && p.startsWith("/exec/") && p.endsWith("/start")) {
        ativo = false;
        await segurar();
      }
      return resposta;
    },
  });
  const handle = await gate.criar("banco");
  await gate.iniciar(handle);
  const abort = new AbortController();
  ativo = true;
  const consulta = gate
    .consultarPrimeiraIdentidade(
      handle,
      async (id) => {
        ids.push(id);
        if (fase === "persistencia") await segurar();
      },
      abort.signal,
    )
    .then(
      (valor) => ({ valor, erro: null }),
      (erro: unknown) => ({ valor: undefined, erro }),
    );
  try {
    await entrou.promise;
    expect(atingidas).toBe(1);
    const marco = f.chamadas.length;
    if (revogar === "fechado")
      expect(await gate.encerrar(async () => {})).toEqual({
        removidos: [],
        preservados: [handle],
        falhas: ["recurso"],
      });
    if (revogar === "sinal") abort.abort();
    liberar.resolve();
    const r = await consulta;
    const novas = f.chamadas.slice(marco).filter((c) => c.metodo === "POST");
    if (revogar === "aberto") {
      expect(r.erro).toBeNull();
      expect(r.valor).toEqual({
        banco: `ft_${rodada}`,
        papel: `ft_${rodada}`,
        objetos: 0,
        somenteLeitura: true,
      });
      expect(await gate.encerrar(async () => {})).toEqual({
        removidos: [handle],
        preservados: [],
        falhas: [],
      });
    } else {
      expect(novas, "NPG-LIFECYCLE-02 enviou exec novo após revogação").toEqual([]);
      expect(r.erro).toBeInstanceOf(Error);
      expect(gate.inventario()).toEqual([{ handle, slot: "banco", estado: "incerto" }]);
      expect(await gate.encerrar(async () => {})).toMatchObject({
        removidos: [],
        preservados: [handle],
      });
      expect(registros).toContainEqual(expect.objectContaining({ estado: "incerto", id: f.id }));
      expect(f.chamadas.some((c) => c.metodo === "DELETE")).toBe(false);
    }
    const criados = f.chamadas.filter((c) => c.caminho === `/containers/${f.id}/exec`);
    expect(criados).toHaveLength(revogar !== "aberto" && fase === "inspecao" ? 0 : 1);
    expect(ids).toHaveLength(criados.length);
    if (fase !== "inspecao") expect(ids[0]).toMatch(/^[a-f0-9]{64}$/);
    if (fase === "enviado")
      expect(f.chamadas.some((c) => c.caminho === `/exec/${ids[0]}/start`)).toBe(true);
  } finally {
    liberar.resolve();
    await consulta;
  }
});
