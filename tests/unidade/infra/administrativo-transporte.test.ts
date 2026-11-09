// Exercita interfaces Unix, stdio e arquivo reais com Engine explicitamente falso.
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { criarBarreiraEngine } from "../../isolamento/administrativo/engine-gate.mjs";
import {
  abrirEndpointPrivado,
  criarClienteStdio,
  iniciarDockerReal,
} from "../../isolamento/administrativo/host.mjs";

const rodada = "a".repeat(32);
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
async function http(socketPath: string, method: string, path: string, corpo?: string) {
  return new Promise<{ status: number; corpo: string }>((resolve, reject) => {
    const req = request(
      {
        socketPath,
        method,
        path,
        headers: {
          "X-FADM-Version": "1",
          Connection: "close",
          ...(corpo === undefined
            ? {}
            : { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(corpo) }),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (b: Buffer) => chunks.push(b));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(chunks).toString() }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(corpo);
  });
}

describe("transporte físico administrativo com Engine falso", () => {
  it("liga Unix e HTTP stdio reais sem confundir EOF com estado do Engine falso", async () => {
    expect(typeof criarClienteStdio).toBe("function");
    await expect(iniciarDockerReal()).rejects.toThrow(/bloqueado/);
    const diretorio = await mkdtemp(join(tmpdir(), "fadm-"));
    const arquivo = join(diretorio, "falso.json");
    await writeFile(arquivo, JSON.stringify({ chamadas: [] }), { mode: 0o600 });
    const iniciar = (modo = "normal") =>
      spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./fixtures/administrativo-engine-falso.mjs", import.meta.url)),
          arquivo,
          modo,
        ],
        { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
      );
    const cliente = criarClienteStdio({ iniciar: () => iniciar() });
    const registros: unknown[] = [];
    const gate = criarBarreiraEngine({
      rodada,
      receitas: { banco: receita() },
      imagens: { [imagem]: { volumes: [] } },
      persistir: async (r) => {
        registros.push(r);
      },
      requisitar: cliente,
    });
    const endpoint = await abrirEndpointPrivado({ diretorio, gate });
    try {
      const criacao = await http(
        endpoint.socketPath,
        "POST",
        "/v1.47/containers/create",
        JSON.stringify(receita()),
      );
      expect(criacao.status).toBe(200);
      const estado: { id: string; chamadas: { metodo: string; caminho: string }[] } = JSON.parse(
        await readFile(arquivo, "utf8"),
      );
      expect(JSON.parse(criacao.corpo)).toEqual({ Id: estado.id });
      expect(
        (await http(endpoint.socketPath, "POST", `/v1.47/containers/${estado.id}/start`)).status,
      ).toBe(200);
      expect(
        JSON.parse(
          (await http(endpoint.socketPath, "GET", `/v1.47/containers/${estado.id}/json`)).corpo,
        ).State.Running,
      ).toBe(true);
      const fim = await gate.encerrar(async () => {
        expect(registros.length).toBeGreaterThan(2);
      });
      expect(fim.falhas).toEqual([]);
      const final: { existe: boolean; chamadas: { metodo: string; caminho: string }[] } =
        JSON.parse(await readFile(arquivo, "utf8"));
      expect(final.existe).toBe(false);
      expect(final.chamadas.filter((c) => c.metodo === "DELETE")).toEqual([
        { metodo: "DELETE", caminho: `/v1.47/containers/${estado.id}` },
      ]);
      for (const modo of ["exceder", "truncar", "json-invalido"])
        await expect(
          criarClienteStdio({ iniciar: () => iniciar(modo) })(
            "GET",
            `/containers/${estado.id}/json`,
          ),
        ).rejects.toThrow(/HTTP|JSON/);
    } finally {
      await endpoint.fechar();
      await rm(diretorio, { recursive: true });
    }
  });
  it.each([
    "404-null",
    "404-ausente",
    "404-array",
    "404-extra",
    "404-alheio",
    "404-tipo",
    "404-content-type",
    "versao-invalida",
    "status-invalido",
  ])("não confirma ausência com %s no Engine falso", async (modo) => {
    const diretorio = await mkdtemp(join(tmpdir(), "fadm-"));
    const arquivo = join(diretorio, "falso.json");
    await writeFile(arquivo, JSON.stringify({ chamadas: [] }), { mode: 0o600 });
    const iniciar = (variante = "normal") =>
      spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./fixtures/administrativo-engine-falso.mjs", import.meta.url)),
          arquivo,
          variante,
        ],
        { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
      );
    const cliente = criarClienteStdio({ iniciar: () => iniciar() });
    try {
      await cliente("POST", "/containers/create", receita());
      const estado: { id: string } = JSON.parse(await readFile(arquivo, "utf8"));
      await cliente("DELETE", `/containers/${estado.id}`);
      await expect(cliente("GET", `/containers/${estado.id}/json`)).resolves.toBeNull();
      await expect(
        criarClienteStdio({ iniciar: () => iniciar(modo) })("GET", `/containers/${estado.id}/json`),
      ).rejects.toThrow(/HTTP|JSON|Ausência/);
    } finally {
      await rm(diretorio, { recursive: true });
    }
  });
  it.each([
    "inspecao-204-vazia",
    "inspecao-200-nula",
    "inspecao-201-nula",
    "inspecao-200-array",
    "inspecao-200-string",
    "inspecao-200-numero",
    "inspecao-200-booleano",
    "inspecao-201-objeto",
  ])("FISICO-01 recusa %s no cliente stdio real com Engine falso", async (modo) => {
    const diretorio = await mkdtemp(join(tmpdir(), "fadm-"));
    const arquivo = join(diretorio, "falso.json");
    await writeFile(arquivo, JSON.stringify({ chamadas: [] }), { mode: 0o600 });
    const cliente = criarClienteStdio({
      iniciar: () =>
        spawn(
          process.execPath,
          [
            fileURLToPath(new URL("./fixtures/administrativo-engine-falso.mjs", import.meta.url)),
            arquivo,
            modo,
          ],
          { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
        ),
    });
    try {
      await cliente("POST", "/containers/create", receita());
      const estado: { id: string } = JSON.parse(await readFile(arquivo, "utf8"));
      await expect(cliente("GET", `/containers/${estado.id}/json`)).resolves.toMatchObject({
        Id: estado.id,
      });
      await cliente("DELETE", `/containers/${estado.id}`);
      await expect(cliente("GET", `/containers/${estado.id}/json`)).rejects.toThrow(/HTTP/);
    } finally {
      await rm(diretorio, { recursive: true });
    }
  });
  it.each([
    { metodo: "POST", sufixo: "/start" },
    { metodo: "POST", sufixo: "/stop" },
    { metodo: "DELETE", sufixo: "" },
  ])("preserva HTTP 204 vazio na mutação $metodo $sufixo", async ({ metodo, sufixo }) => {
    const cliente = criarClienteStdio({
      iniciar: () =>
        spawn(
          process.execPath,
          [
            "-e",
            'process.stdin.resume(); process.stdin.once("end", () => process.stdout.end("HTTP/1.1 204 Sintetico\\r\\nAPI-Version: 1.47\\r\\nContent-Length: 0\\r\\nConnection: close\\r\\n\\r\\n"));',
          ],
          { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
        ),
    });
    await expect(cliente(metodo, `/containers/${"c".repeat(64)}${sufixo}`)).resolves.toBeNull();
  });
  it("HTTP 204 vazio não transforma criação sem ID em sucesso no gate real", async () => {
    const cliente = criarClienteStdio({
      iniciar: () =>
        spawn(
          process.execPath,
          [
            "-e",
            'process.stdin.resume(); process.stdin.once("end", () => process.stdout.end("HTTP/1.1 204 Sintetico\\r\\nAPI-Version: 1.47\\r\\nContent-Length: 0\\r\\nConnection: close\\r\\n\\r\\n"));',
          ],
          { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
        ),
    });
    const registros: unknown[] = [];
    const gate = criarBarreiraEngine({
      rodada,
      receitas: { banco: receita() },
      imagens: { [imagem]: { volumes: [] } },
      persistir: async (registro) => {
        registros.push(registro);
      },
      requisitar: cliente,
    });
    await expect(gate.criar("banco")).rejects.toThrow(/Criação sem identidade/);
    expect(registros).toMatchObject([
      { estado: "intencao", id: null },
      { estado: "incerto", id: null },
    ]);
    await expect(gate.criar("banco")).rejects.toThrow(/Slot/);
    const recurso = gate.inventario()[0];
    if (!recurso) throw new Error("Intenção de criação ausente.");
    expect(await gate.encerrar(async () => {})).toEqual({
      removidos: [],
      preservados: [recurso.handle],
      falhas: ["recurso"],
    });
  });
  it("não aceita erro404 como sucesso de outras operações ou rotas", async () => {
    const diretorio = await mkdtemp(join(tmpdir(), "fadm-"));
    const arquivo = join(diretorio, "falso.json");
    await writeFile(arquivo, JSON.stringify({ chamadas: [] }), { mode: 0o600 });
    const iniciar = (modo = "normal") =>
      spawn(
        process.execPath,
        [
          fileURLToPath(new URL("./fixtures/administrativo-engine-falso.mjs", import.meta.url)),
          arquivo,
          modo,
        ],
        { env: { NODE_ENV: "test" }, stdio: ["pipe", "pipe", "pipe"] },
      );
    try {
      await criarClienteStdio({ iniciar: () => iniciar() })(
        "POST",
        "/containers/create",
        receita(),
      );
      const estado: { id: string } = JSON.parse(await readFile(arquivo, "utf8"));
      const invalido = criarClienteStdio({ iniciar: () => iniciar("404-forcado") });
      await expect(invalido("POST", "/containers/create", receita())).rejects.toThrow(/Ausência/);
      // A criação forçada aloca outro ID físico, consultado no estado do produtor.
      const atual: { id: string } = JSON.parse(await readFile(arquivo, "utf8"));
      for (const [metodo, caminho] of [
        ["POST", `/containers/${atual.id}/start`],
        ["POST", `/containers/${atual.id}/stop`],
        ["DELETE", `/containers/${atual.id}`],
        ["GET", "/containers/json"],
        ["GET", `/containers/${estado.id}/json?x=1`],
      ]) {
        if (!metodo || !caminho) throw new Error("Caso HTTP incompleto.");
        await expect(invalido(metodo, caminho)).rejects.toThrow(/Ausência|Rota/);
      }
    } finally {
      await rm(diretorio, { recursive: true });
    }
  });
  it("recusa serviço, endpoint e payload hostis no Unix antes de qualquer upstream", async () => {
    const diretorio = await mkdtemp(join(tmpdir(), "fadm-"));
    const chamadas: string[] = [];
    const gate = criarBarreiraEngine({
      rodada,
      receitas: { banco: receita() },
      imagens: { [imagem]: { volumes: [] } },
      persistir: async () => {},
      requisitar: async (metodo, caminho) => {
        chamadas.push(`${metodo} ${caminho}`);
        return null;
      },
    });
    const endpoint = await abrirEndpointPrivado({ diretorio, gate });
    try {
      expect((await stat(endpoint.socketPath)).mode & 0o777).toBe(0o600);
      const casos = [
        ["GET", "/v1.47/containers/json", undefined],
        [
          "POST",
          "/v1.47/containers/create",
          JSON.stringify({
            ...receita(),
            HostConfig: { ...receita().HostConfig, Binds: ["/:/host"] },
          }),
        ],
        ["POST", "/v1.47/containers/create?name=vizinho", JSON.stringify(receita())],
        ["POST", `/v1.47/containers/${"f".repeat(64)}/start`, undefined],
        ["POST", "/v1.47/containers/create", '{"Image":"a","Image":"b"}'],
      ] as const;
      for (const [method, path, corpo] of casos)
        expect((await http(endpoint.socketPath, method, path, corpo)).status).toBe(403);
      expect(chamadas).toEqual([]);
    } finally {
      await endpoint.fechar();
      await rm(diretorio, { recursive: true });
    }
  });
});
