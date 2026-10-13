// Exercita a cópia dos arquivos do Swagger e a recusa de publicação incompleta.
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("../../scripts/copiar-swagger-ui.mjs", import.meta.url));
const diretorios: string[] = [];

function preparar() {
  const raiz = mkdtempSync(join(tmpdir(), "frequenciapp-swagger-"));
  diretorios.push(raiz);
  const origem = join(raiz, "node_modules/swagger-ui-dist");
  const destino = join(raiz, "public/vendor/swagger-ui");
  mkdirSync(origem, { recursive: true });
  return { raiz, origem, destino };
}

function copiar(raiz: string) {
  return execFileSync(process.execPath, [script], { cwd: raiz, stdio: "pipe" });
}

afterEach(() => {
  for (const diretorio of diretorios.splice(0)) rmSync(diretorio, { recursive: true, force: true });
});

describe("arquivos do Swagger UI", () => {
  it("recria os arquivos de uma publicação sem depender do postinstall", () => {
    const { raiz, origem, destino } = preparar();
    writeFileSync(join(origem, "swagger-ui.css"), "estilos atuais");
    writeFileSync(join(origem, "swagger-ui-bundle.js"), "script atual");
    writeFileSync(join(origem, "index.html"), "não publicar");

    copiar(raiz);
    expect(readFileSync(join(destino, "swagger-ui.css"), "utf8")).toBe("estilos atuais");
    expect(readFileSync(join(destino, "swagger-ui-bundle.js"), "utf8")).toBe("script atual");
    expect(existsSync(join(destino, "index.html"))).toBe(false);

    writeFileSync(join(destino, "swagger-ui.css"), "estilos antigos do cache");
    copiar(raiz);
    expect(readFileSync(join(destino, "swagger-ui.css"), "utf8")).toBe("estilos atuais");
  });

  it.each(["swagger-ui.css", "swagger-ui-bundle.js"])(
    "falha se faltar %s e preserva a cópia existente",
    (ausente) => {
      const { raiz, origem, destino } = preparar();
      for (const arquivo of ["swagger-ui.css", "swagger-ui-bundle.js"]) {
        if (arquivo !== ausente) writeFileSync(join(origem, arquivo), "arquivo disponível");
      }
      mkdirSync(destino, { recursive: true });
      writeFileSync(join(destino, "swagger-ui.css"), "cópia existente");

      expect(() => copiar(raiz)).toThrow(`Arquivo do Swagger UI ausente: ${ausente}`);
      expect(readFileSync(join(destino, "swagger-ui.css"), "utf8")).toBe("cópia existente");
    },
  );
});
