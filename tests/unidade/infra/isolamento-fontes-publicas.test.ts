// Confere que a cópia inclui contratos públicos exatos sem aceitar ambientes privados.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { copiarFontes } from "../../isolamento/executar.mjs";

const pastas: string[] = [];
afterEach(() => {
  for (const pasta of pastas.splice(0)) rmSync(pasta, { recursive: true, force: true });
});
function fixture() {
  const pasta = mkdtempSync(path.join(tmpdir(), "fontes-publicas-"));
  pastas.push(pasta);
  const fonte = path.join(pasta, "fonte");
  const destino = path.join(pasta, "destino");
  mkdirSync(fonte);
  mkdirSync(destino);
  return { fonte, destino };
}
it("preserva .gitignore para o consumidor servidor e .env.example para a guarda editorial", () => {
  const { fonte, destino } = fixture();
  const publicos = [".gitignore", ".env.example", "infra/servidor/servidor.env.example"];
  for (const nome of publicos) {
    mkdirSync(path.dirname(path.join(fonte, nome)), { recursive: true });
    writeFileSync(path.join(fonte, nome), readFileSync(nome));
  }
  const manifesto = copiarFontes(destino, { raizFonte: fonte, versionados: publicos });
  expect(manifesto.map((f) => f.caminho)).toEqual(publicos);
  for (const nome of publicos)
    expect(readFileSync(path.join(destino, nome))).toEqual(readFileSync(nome));
  expect(readFileSync(path.join(destino, ".gitignore"), "utf8")).toContain("/Caddyfile");
  expect(readFileSync(path.join(destino, ".env.example"), "utf8").length).toBeGreaterThan(0);
  expect(readFileSync(path.join(destino, ".dockerignore"), "utf8").split("\n")).toContain(
    "!.env.example",
  );
});
it("não abre templates apenas parecidos nem ambientes privados, mesmo se listados como versionados", () => {
  const { fonte, destino } = fixture();
  const privados = [
    ".env",
    ".env.local",
    ".env.example.bak",
    "tests/.env.example",
    "infra/servidor/.env.example",
  ];
  // Não cria os arquivos: tentar lê-los já viola a allowlist e falha o teste.
  expect(copiarFontes(destino, { raizFonte: fonte, versionados: privados })).toEqual([]);
  for (const nome of privados) expect(existsSync(path.join(destino, nome))).toBe(false);
  const arquivo = ".env.example";
  writeFileSync(path.join(fonte, arquivo), "TEMPLATE=publico\n");
  expect(() =>
    copiarFontes(destino, {
      raizFonte: fonte,
      versionados: [],
      fontesNovas: [
        {
          caminho: arquivo,
          sha256: createHash("sha256").update("TEMPLATE=publico\n").digest("hex"),
        },
      ],
    }),
  ).toThrow(/fonte nova/i);
});
