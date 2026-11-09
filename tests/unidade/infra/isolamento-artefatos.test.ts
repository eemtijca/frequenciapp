// Exercita a saída do executor com Docker falso e arquivos sintéticos, sem daemon.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const falso = vi.hoisted(() => ({
  chamadas: [] as string[][],
  canarioAlterado: false,
  imagensConstruidas: [] as { referencia: string; id: string }[],
}));
vi.mock("node:child_process", async (original) => {
  const real = await original<typeof import("node:child_process")>();
  const containers = new Map<
    string,
    { State: { Running: boolean; ExitCode: number }; [chave: string]: unknown }
  >();
  const imagens = new Map<string, { id: string; rodada: string }>();
  let rodada = "";
  let redeCriada = false;
  return {
    ...real,
    spawn: (_programa: string, argumentos: string[]) => {
      const args = argumentos.slice(argumentos.indexOf("--config") + 2);
      falso.chamadas.push(args);
      const filho = new EventEmitter();
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      Object.assign(filho, { stdout, stderr, kill: vi.fn() });
      queueMicrotask(() => {
        let codigo = 0;
        if (args[0] === "build") {
          rodada = args[args.indexOf("--label") + 1]?.split("=")[1] ?? "";
          const referencia = args[args.indexOf("-t") + 1] ?? "";
          const id = `imagem-${rodada}-${imagens.size + 1}`;
          imagens.set(referencia, { id, rodada });
          falso.imagensConstruidas.push({ referencia, id });
        } else if (args[0] === "logs" && args.includes("--follow")) {
          const info = containers.get(args.at(-1) ?? "");
          if (!info) codigo = 1;
          else info.State.Running = false;
        } else if (args[0] === "wait") {
          const info = containers.get(args[1] ?? "");
          if (!info || info.State.Running) codigo = 1;
          else stdout.write(`${info.State.ExitCode}\n`);
        } else codigo = 1;
        stdout.end();
        stderr.end();
        filho.emit("exit", codigo, null);
        filho.emit("close", codigo, null);
      });
      return filho;
    },
    spawnSync: (programa: string, argumentos: string[]) => {
      if (programa === "git")
        return {
          status: 0,
          stdout: argumentos.includes("-z")
            ? [
                "package.json",
                "pnpm-lock.yaml",
                "prisma.config.ts",
                "prisma/schema.prisma",
                "scripts/assets/copiar-swagger-ui.mjs",
              ].join("\0")
            : "",
        };
      const args = argumentos.slice(argumentos.indexOf("--config") + 2);
      falso.chamadas.push(args);
      let stdout: string | Buffer = "";
      if (args[0] === "image" && args[1] === "ls") {
        const referencia = args.find((a) => a.startsWith("reference="))?.slice("reference=".length);
        stdout = referencia ? (imagens.get(referencia)?.id ?? "") : "";
      } else if (args[0] === "image" && args[1] === "inspect") {
        const imagem =
          imagens.get(args[2] ?? "") ?? [...imagens.values()].find((item) => item.id === args[2]);
        if (!imagem) return { status: 1, stdout: "", stderr: "Error: No such image" };
        stdout = JSON.stringify([
          { Id: imagem.id, Config: { Labels: { "br.frequenciapp.isolamento": imagem.rodada } } },
        ]);
      } else if (args[0] === "image" && args[1] === "rm") {
        const entrada = [...imagens].find(([, item]) => item.id === args[2]);
        if (entrada) imagens.delete(entrada[0]);
      } else if (args[0] === "network" && args[1] === "create") {
        redeCriada = true;
        stdout = "rede-canario";
      } else if (args[0] === "network" && args[1] === "ls") {
        stdout = redeCriada ? "rede-canario" : "";
      } else if (args[0] === "network" && args[1] === "rm") redeCriada = false;
      else if (args[0] === "network" && args[1] === "inspect") {
        stdout = JSON.stringify([
          { Internal: true, Labels: { "br.frequenciapp.isolamento": rodada }, Containers: {} },
        ]);
      } else if (args[0] === "create") {
        const tipo = args[args.indexOf("--name") + 1]?.split("-").at(-1) ?? "";
        const rede = args[args.indexOf("--network") + 1];
        const nomeRede = `frequenciapp-teste-${rodada}-canario`;
        containers.set(tipo, {
          Config: {
            Labels: {
              "br.frequenciapp.isolamento": rodada,
              "br.frequenciapp.isolamento.tipo": tipo,
            },
            Env: ["POSTGRES_PASSWORD=sintetica"],
          },
          HostConfig: {
            NetworkMode: rede,
            CapDrop: ["ALL"],
            SecurityOpt: ["no-new-privileges:true"],
            Tmpfs: tipo === "banco" ? { "/var/lib/postgresql/data": "rw" } : {},
          },
          Mounts: [],
          NetworkSettings: { Networks: { [nomeRede]: { IPAddress: "192.0.2.20" } } },
          State: { Running: false, ExitCode: 0 },
        });
        stdout = tipo;
      } else if (args[0] === "inspect") stdout = JSON.stringify([containers.get(args[1] ?? "")]);
      else if (args[0] === "start" || args[0] === "stop" || args[0] === "kill") {
        const info = containers.get(args.at(-1) ?? "");
        if (info) info.State.Running = args[0] === "start";
      } else if (args[0] === "rm") containers.delete(args[1] ?? "");
      else if (args[0] === "container" && args[1] === "ls") {
        const id = args.find((a) => a.startsWith("id="))?.slice(3);
        stdout = id && containers.has(id) ? id : "";
      } else if (args[0] === "exec")
        stdout = args.includes("readlink")
          ? "net:[sintetica]"
          : `${rodada}:${falso.canarioAlterado ? 1 : 0}`;
      else if (args[0] === "cp" && args[2] === "-") {
        const origem = args[1]?.split(":").slice(1).join(":") ?? "";
        const nome = path.posix.basename(origem);
        stdout = tarSintetico(nome, nome.endsWith(".png") ? "PNG-NOVO" : "relatório sintético");
      }
      return { status: 0, stdout, stderr: "" };
    },
  };
});
import { executar } from "../../isolamento/executar.mjs";
import {
  capturasReadme,
  criarDestinoArtefatos,
  extrairArtefato,
} from "../../isolamento/artefatos.mjs";

function tarSintetico(nome: string, texto: string, tipo = "0") {
  const dados = Buffer.from(texto);
  const cabecalho = Buffer.alloc(512);
  cabecalho.write(nome, 0, 100);
  cabecalho.write("0000600\0", 100);
  cabecalho.write(`${dados.length.toString(8).padStart(11, "0")}\0`, 124);
  cabecalho.fill(32, 148, 156);
  cabecalho.write(tipo, 156);
  cabecalho.write("ustar\0", 257);
  const soma = cabecalho.reduce((a, b) => a + b, 0);
  cabecalho.write(`${soma.toString(8).padStart(6, "0")}\0 `, 148);
  return Buffer.concat([
    cabecalho,
    dados,
    Buffer.alloc((512 - (dados.length % 512)) % 512),
    Buffer.alloc(1024),
  ]);
}
const pastas: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  falso.canarioAlterado = false;
  falso.imagensConstruidas = [];
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});

it("recupera o PNG produzido pelo spec antes de remover o container, sem alterar o checkout", async () => {
  const saida: string[] = [];
  const raizPrivada = mkdtempSync(path.join(tmpdir(), "isolamento-artefatos-"));
  pastas.push(raizPrivada);
  vi.stubEnv("TMPDIR", raizPrivada);
  vi.spyOn(process.stdout, "write").mockImplementation((texto) => {
    saida.push(String(texto));
    return true;
  });
  falso.chamadas = [];
  const original = readFileSync("docs/imagens/painel-desktop-claro.png");
  expect(
    await executar([
      "--",
      "pnpm",
      "exec",
      "playwright",
      "test",
      "tests/ponta-a-ponta/interface/imagens.spec.ts",
    ]),
  ).toBe(0);
  const evidencia = saida.join("").match(/evidências privadas: (.+)/)?.[1];
  expect(evidencia).toBeTruthy();
  expect(
    existsSync(path.join(evidencia ?? "", "artefatos/docs/imagens/painel-desktop-claro.png")),
  ).toBe(true);
  expect(
    readFileSync(
      path.join(evidencia ?? "", "artefatos/docs/imagens/painel-desktop-claro.png"),
      "utf8",
    ),
  ).toBe("PNG-NOVO");
  for (const nome of capturasReadme) {
    expect(readFileSync(path.join(evidencia ?? "", "artefatos/docs/imagens", nome), "utf8")).toBe(
      "PNG-NOVO",
    );
  }
  const arquivosDoSpec = [
    ...readFileSync("tests/ponta-a-ponta/interface/imagens.spec.ts", "utf8").matchAll(
      /path\.join\(pastaImagens, "([^"]+\.png)"\)/g,
    ),
  ].map((m) => m[1]);
  expect([...capturasReadme].sort()).toEqual(arquivosDoSpec.sort());
  const inventario = readFileSync(path.join(evidencia ?? "", "artefatos/inventario.json"), "utf8");
  expect(inventario).not.toMatch(/manifesto|\.auth|storageState/);
  expect(readFileSync("docs/imagens/painel-desktop-claro.png")).toEqual(original);
  const captura = falso.chamadas.findIndex(
    (a) => a[0] === "cp" && a[1]?.includes("painel-desktop-claro.png"),
  );
  const remocao = falso.chamadas.findIndex((a) => a[0] === "rm");
  expect(captura).toBeGreaterThan(-1);
  expect(remocao).toBeGreaterThan(captura);
  expect(falso.chamadas).toContainEqual(["wait", "execucao"]);
  vi.unstubAllEnvs();
});

it("preserva capturas e erro original mesmo quando a conferência final do canário falha", async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefatos-falha-"));
  pastas.push(pasta);
  vi.stubEnv("TMPDIR", pasta);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  falso.chamadas = [];
  falso.canarioAlterado = true;
  await expect(
    executar([
      "--",
      "pnpm",
      "exec",
      "playwright",
      "test",
      "tests/ponta-a-ponta/interface/imagens.spec.ts",
    ]),
  ).rejects.toThrow(/canário sintético recebeu/i);
  expect(
    falso.chamadas.some((a) => a[0] === "cp" && a[1]?.includes("painel-desktop-claro.png")),
  ).toBe(true);
});

it("gera o build sintético com assets e Next locais sem permitir autoinstalação", async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "isolamento-build-local-"));
  pastas.push(pasta);
  vi.stubEnv("TMPDIR", pasta);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  falso.chamadas = [];
  expect(await executar(["--", "node", "suite-sintetica.mjs"])).toBe(0);
  const builds = falso.chamadas.filter((a) => a[0] === "build");
  expect(builds).toHaveLength(2);
  const app = builds.find((a) => a[a.indexOf("-f") + 1]?.endsWith("/app.Dockerfile"));
  const arquivo = app?.[app.indexOf("-f") + 1];
  expect(arquivo).toBeDefined();
  const dockerfile = readFileSync(arquivo ?? "", "utf8");
  const pacote = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: { build: string };
  };
  expect(pacote.scripts.build).toBe("node scripts/assets/copiar-swagger-ui.mjs && next build");
  const build = dockerfile
    .split("\n")
    .find((linha) => linha.startsWith("RUN ") && linha.includes("build"));
  expect(build).toBe(
    "RUN node scripts/assets/copiar-swagger-ui.mjs && node node_modules/next/dist/bin/next build",
  );
  expect(/\b(?:pnpm|npm|npx|corepack|install)\b/.test(dockerfile)).toBe(false);
  expect(dockerfile.includes("WORKDIR /work\nCOPY . .\n")).toBe(true);
  expect(
    dockerfile.startsWith(
      `# Build sintético sem segredos ou acesso a banco.\nFROM ${falso.imagensConstruidas[0]?.referencia}\n`,
    ),
  ).toBe(true);
});

it("constrói o Dockerfile de distribuição e executa a imagem final em vez da testimage", async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "isolamento-distribuicao-"));
  pastas.push(pasta);
  vi.stubEnv("TMPDIR", pasta);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  falso.chamadas = [];
  expect(await executar(["--validar-distribuicao"])).toBe(0);
  const builds = falso.chamadas.filter((a) => a[0] === "build");
  expect(builds).toHaveLength(1);
  expect(builds[0]?.[builds[0].indexOf("-f") + 1]).toMatch(/\/fonte\/Dockerfile$/);
  const criacao = falso.chamadas.find(
    (a) => a[0] === "create" && a.includes("br.frequenciapp.isolamento.tipo=distribuicao"),
  );
  expect(criacao).toContain("--cap-drop");
  expect(criacao).toContain("container:banco");
  const referencia = builds[0]?.[builds[0].indexOf("-t") + 1];
  expect(referencia).toMatch(/^frequenciapp-teste-[a-f0-9]{32}:distribuicao$/);
  const construida = falso.imagensConstruidas.find((item) => item.referencia === referencia);
  expect(construida).toBeDefined();
  expect(falso.chamadas).toContainEqual(["image", "inspect", referencia]);
  expect(criacao?.slice(-4, -1)).toEqual([construida?.id, "node", "-e"]);
  expect(criacao?.join(" ")).toContain("scripts/seed/seed.mjs");
  const compose = falso.chamadas.filter((a) => a[0] === "compose");
  expect(compose).toHaveLength(2);
  expect(
    compose.every(
      (a) =>
        a.includes("--env-file") &&
        a.includes("/dev/null") &&
        a.includes("--quiet") &&
        !a.includes("up"),
    ),
  ).toBe(true);
});

it.each([
  "test-results/.env",
  "test-results/.auth/conta.json",
  "test-results/manifesto.json",
  "test-results/storageState.json",
  "test-results/../fora",
  "/test-results/fora",
  "test-results/atalho\\fora",
])("recusa conteúdo privado ou caminho inválido: %s", (nome) => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-negativo-"));
  pastas.push(pasta);
  expect(() =>
    extrairArtefato(tarSintetico(nome, "privado"), pasta, "/work/test-results", "test-results"),
  ).toThrow();
  expect(existsSync(path.join(pasta, "test-results"))).toBe(false);
});

it.each(["1", "2", "3", "4", "6"])("recusa tipo tar especial %s", (tipo) => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-tipo-"));
  pastas.push(pasta);
  expect(() =>
    extrairArtefato(
      tarSintetico("test-results/atalho", "", tipo),
      pasta,
      "/work/test-results",
      "test-results",
    ),
  ).toThrow(/links|especiais/i);
});

it("preserva captura de um cenário de sessão sem exportar estado JSON de autenticação", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-cenario-"));
  pastas.push(pasta);
  const nome = "test-results/pwa-sessao-offline/captura.png";
  expect(
    extrairArtefato(tarSintetico(nome, "captura"), pasta, "/work/test-results", "test-results"),
  ).toEqual([nome]);
});

it("aceita nomes longos de relatórios via PAX e recusa traversal no mesmo campo", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-pax-"));
  pastas.push(pasta);
  const arquivo = `test-results/${"a".repeat(140)}/captura.png`;
  const comPax = (nome: string) => {
    const corpo = `path=${nome}\n`;
    let tamanho = Buffer.byteLength(corpo) + 2;
    while (tamanho !== Buffer.byteLength(corpo) + String(tamanho).length + 1)
      tamanho = Buffer.byteLength(corpo) + String(tamanho).length + 1;
    return Buffer.concat([
      tarSintetico("PaxHeader", `${tamanho} ${corpo}`, "x").subarray(0, -1024),
      tarSintetico("test-results/curto", "imagem"),
    ]);
  };
  expect(extrairArtefato(comPax(arquivo), pasta, "/work/test-results", "test-results")).toEqual([
    arquivo,
  ]);
  expect(readFileSync(path.join(pasta, arquivo), "utf8")).toBe("imagem");
  expect(() =>
    extrairArtefato(comPax("test-results/../fora"), pasta, "/work/test-results", "test-results"),
  ).toThrow(/caminho/i);
});

it("recusa checksum corrompido sem criar resultados", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-corrompido-"));
  pastas.push(pasta);
  const arquivo = tarSintetico("runtime.log", "log");
  arquivo[0] = 0;
  expect(() =>
    extrairArtefato(arquivo, pasta, "/run/frequenciapp-isolamento/runtime.log", "runtime.log"),
  ).toThrow(/checksum/i);
  expect(existsSync(path.join(pasta, "runtime.log"))).toBe(false);
});

it("recusa destino explícito preexistente antes de chamar Docker", async () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-existente-"));
  pastas.push(pasta);
  vi.stubEnv("TMPDIR", pasta);
  vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  falso.chamadas = [];
  writeFileSync(path.join(pasta, "canario"), "preservado");
  await expect(
    executar(["--artefatos", pasta, "--", "node", "-e", "process.exit(0)"]),
  ).rejects.toThrow();
  expect(falso.chamadas).toEqual([]);
  expect(readFileSync(path.join(pasta, "canario"), "utf8")).toBe("preservado");
});

it("recusa destinos existentes, dentro do checkout ou sob symlink e preserva conteúdo vizinho", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "artefato-destino-"));
  pastas.push(pasta);
  const checkout = path.join(pasta, "checkout");
  mkdirSync(checkout);
  writeFileSync(path.join(checkout, "canario"), "preservado");
  expect(() => criarDestinoArtefatos(path.join(checkout, "novo"), checkout)).toThrow(/checkout/);
  expect(() => criarDestinoArtefatos(checkout, "/outro-checkout")).toThrow();
  symlinkSync(checkout, path.join(pasta, "link"));
  expect(() => criarDestinoArtefatos(path.join(pasta, "link/novo"), "/outro-checkout")).toThrow(
    /link/,
  );
  const destino = criarDestinoArtefatos(path.join(pasta, "novo"), checkout);
  extrairArtefato(
    tarSintetico("runtime.log", "resultado"),
    destino,
    "/run/frequenciapp-isolamento/runtime.log",
    "runtime.log",
  );
  expect(statSync(destino).mode & 0o777).toBe(0o700);
  expect(statSync(path.join(destino, "runtime.log")).mode & 0o777).toBe(0o600);
  expect(() =>
    extrairArtefato(
      tarSintetico("runtime.log", "alterado"),
      destino,
      "/run/frequenciapp-isolamento/runtime.log",
      "runtime.log",
    ),
  ).toThrow();
  expect(readFileSync(path.join(destino, "runtime.log"), "utf8")).toBe("resultado");
  expect(readFileSync(path.join(checkout, "canario"), "utf8")).toBe("preservado");
});
