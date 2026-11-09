// Protege a cobertura da distribuição, sem executar Docker ou acessar um banco.
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as executor from "../../isolamento/executar.mjs";

type Ensaio = typeof executor.ensaiarDistribuicao;

it("executa migrador, administração e seed da distribuição e confere o resultado real", async () => {
  const rodada = "a".repeat(32);
  const comando = vi.fn(async () => {});
  const saude = vi.fn(async () => {});
  const ownership = vi.fn(async () => {});
  const encerrar = vi.fn(async () => {});
  const servidor = vi.fn(async () => ({ saude, ownership, encerrar }));
  const consultar = vi
    .fn()
    .mockResolvedValueOnce({ banco: `ft_${rodada}`, papel: `ft_${rodada}`, objetos: 0 })
    .mockResolvedValueOnce({ admin: 1, coordenacao: 1, turmas: 9, alunos: 200 })
    .mockResolvedValueOnce({
      banco: `ft_${rodada}`,
      papel: `ft_${rodada}`,
      schema: "public",
      conexoes: 1,
    });
  const ensaiar = (executor as unknown as { ensaiarDistribuicao: Ensaio }).ensaiarDistribuicao;
  expect(
    ensaiar,
    "A distribuição precisa de um ensaio executável, não apenas build da testimage",
  ).toBeTypeOf("function");
  await ensaiar(
    { rodada, rede: "net:[sintetica]", ipCanario: "192.0.2.20" },
    { consultar, comando, servidor, perimetro: async () => {} },
  );
  expect(comando.mock.calls.map((a: unknown[]) => a[1])).toEqual([
    ["docker/app/migrar.mjs"],
    ["scripts/administracao/criar-admin.mjs", "--somente-criar"],
    ["scripts/administracao/criar-coordenacao.mjs"],
    ["scripts/seed/seed.mjs"],
  ]);
  expect(consultar).toHaveBeenCalledTimes(3);
  expect(consultar.mock.calls[2]?.[0]).toContain("pg_stat_activity");
  expect(servidor).toHaveBeenCalledOnce();
  expect(saude).toHaveBeenCalledOnce();
  expect(ownership).toHaveBeenCalledOnce();
  expect(encerrar).toHaveBeenCalledOnce();
});

it.each([
  { banco: "vizinho", papel: "ft_rodada", objetos: 0 },
  { banco: "ft_rodada", papel: "vizinho", objetos: 0 },
  { banco: "ft_rodada", papel: "ft_rodada", objetos: 1 },
])("recusa identidade ou banco ocupado antes de migrar: %j", async (inicial) => {
  const comando = vi.fn(async () => {});
  const ensaiar = (executor as unknown as { ensaiarDistribuicao: Ensaio }).ensaiarDistribuicao;
  await expect(
    ensaiar(
      { rodada: "rodada", rede: "net:[sintetica]", ipCanario: "192.0.2.20" },
      {
        consultar: vi.fn(async () => inicial),
        comando,
        servidor: async () => {
          throw new Error("Identidade inválida não deve iniciar o servidor.");
        },
        perimetro: async () => {},
      },
    ),
  ).rejects.toThrow(/exclusivo vazio/);
  expect(comando).not.toHaveBeenCalled();
});

it("não confunde retorno zero do seed com dados persistidos", async () => {
  const ensaiar = (executor as unknown as { ensaiarDistribuicao: Ensaio }).ensaiarDistribuicao;
  await expect(
    ensaiar(
      { rodada: "rodada", rede: "net:[sintetica]", ipCanario: "192.0.2.20" },
      {
        consultar: vi
          .fn()
          .mockResolvedValueOnce({ banco: "ft_rodada", papel: "ft_rodada", objetos: 0 })
          .mockResolvedValueOnce({ admin: 1, coordenacao: 1, turmas: 0, alunos: 0 }),
        comando: async () => {},
        servidor: async () => {
          throw new Error("Seed incompleto não deve iniciar o servidor.");
        },
        perimetro: async () => {},
      },
    ),
  ).rejects.toThrow(/persistido/);
});

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});

type Copiar = typeof executor.copiarFontes;
it("inclui fonte nova de outro lote somente por caminho e hash explícitos, registrando a cópia", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "fontes-novas-"));
  pastas.push(pasta);
  const origem = path.join(pasta, "origem");
  const destino = path.join(pasta, "destino");
  mkdirSync(path.join(origem, "src/domain"), { recursive: true });
  mkdirSync(destino);
  writeFileSync(
    path.join(origem, "src/domain/futuro.ts"),
    "// Fonte sintética autorizada.\nexport const valor = 1;\n",
  );
  writeFileSync(path.join(origem, "src/domain/privado.ts"), "não transportar");
  writeFileSync(path.join(origem, "Dockerfile"), "FROM scratch\n");
  const hash = createHash("sha256")
    .update(readFileSync(path.join(origem, "src/domain/futuro.ts")))
    .digest("hex");
  const copiar = (executor as unknown as { copiarFontes: Copiar }).copiarFontes;
  expect(copiar).toBeTypeOf("function");
  const inventario = copiar(destino, {
    raizFonte: origem,
    versionados: ["Dockerfile"],
    fontesNovas: [{ caminho: "src/domain/futuro.ts", sha256: hash }],
  });
  expect(inventario).toContainEqual({
    caminho: "src/domain/futuro.ts",
    origem: "lista-explicita",
    sha256: hash,
  });
  expect(readFileSync(path.join(destino, "src/domain/futuro.ts"), "utf8")).toContain("valor = 1");
  expect(() => readFileSync(path.join(destino, "src/domain/privado.ts"))).toThrow();
  expect(readFileSync(path.join(destino, "Dockerfile"), "utf8")).toBe("FROM scratch\n");
});

it.each([
  "../fora.ts",
  "/fora.ts",
  "src/.env.json",
  "src/credencial.json",
  "src/futuro.key",
  "src/futuro.ts",
])("recusa caminho privado, fora da política ou hash divergente: %s", (caminho) => {
  const pasta = mkdtempSync(path.join(tmpdir(), "fontes-negativas-"));
  pastas.push(pasta);
  mkdirSync(path.join(pasta, "src"));
  mkdirSync(path.join(pasta, "saida"));
  writeFileSync(path.join(pasta, "src/futuro.ts"), "conteúdo divergente");
  expect(() =>
    executor.copiarFontes(path.join(pasta, "saida"), {
      raizFonte: pasta,
      versionados: [],
      fontesNovas: [{ caminho, sha256: "a".repeat(64) }],
    }),
  ).toThrow();
});

it("permite fonte TypeScript de sessão revisada, sem tratar o nome de domínio como arquivo de credenciais", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "fonte-dominio-"));
  pastas.push(pasta);
  mkdirSync(path.join(pasta, "src"));
  mkdirSync(path.join(pasta, "saida"));
  const dados = "// Código sintético, sem estado ou segredo.\nexport const sessao = 1;\n";
  writeFileSync(path.join(pasta, "src/sessao.ts"), dados);
  const sha256 = createHash("sha256").update(dados).digest("hex");
  executor.copiarFontes(path.join(pasta, "saida"), {
    raizFonte: pasta,
    versionados: [],
    fontesNovas: [{ caminho: "src/sessao.ts", sha256 }],
  });
  expect(readFileSync(path.join(pasta, "saida/src/sessao.ts"), "utf8")).toBe(dados);
});

it("não permite incluir estado de sessão na lista explícita mesmo com hash válido", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "fonte-sessao-"));
  pastas.push(pasta);
  mkdirSync(path.join(pasta, "src"));
  mkdirSync(path.join(pasta, "saida"));
  const dados = '{"cookies":[]}';
  writeFileSync(path.join(pasta, "src/storageState.json"), dados);
  const sha256 = createHash("sha256").update(dados).digest("hex");
  expect(() =>
    executor.copiarFontes(path.join(pasta, "saida"), {
      raizFonte: pasta,
      versionados: [],
      fontesNovas: [{ caminho: "src/storageState.json", sha256 }],
    }),
  ).toThrow(/privada/);
});

it("recusa symlink de fonte mesmo em diretório ancestral autorizado", () => {
  const pasta = mkdtempSync(path.join(tmpdir(), "fontes-links-"));
  pastas.push(pasta);
  mkdirSync(path.join(pasta, "vizinho"));
  mkdirSync(path.join(pasta, "saida"));
  writeFileSync(path.join(pasta, "vizinho/futuro.ts"), "não transportar");
  symlinkSync(path.join(pasta, "vizinho"), path.join(pasta, "src"));
  expect(() =>
    executor.copiarFontes(path.join(pasta, "saida"), {
      raizFonte: pasta,
      versionados: ["src/futuro.ts"],
    }),
  ).toThrow(/links/);
});

it("mantém a fase executável de distribuição ligada ao workflow de testes", () => {
  const workflow = readFileSync(".github/workflows/testes.yml", "utf8");
  expect(workflow).toMatch(
    /run: node tests\/isolamento\/evidencias-ci\.mjs executar --raiz "[^"\n]+" --etapa distribuicao -- node tests\/isolamento\/executar\.mjs --validar-distribuicao(?:\r?\n|$)/,
  );
  expect(workflow).toContain("--config vitest.api.config.ts");
  expect(workflow).toContain("--config=playwright.pwa.config.ts");
});
