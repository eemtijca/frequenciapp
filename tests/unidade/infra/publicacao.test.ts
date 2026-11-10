// Publicação exercitada em repositório Git descartável, sem registry ou credencial.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { calcularLatest, validarPublicacao } from "../../../scripts/github/validar-publicacao.mjs";

let repositorio: string;
let sha: string;
const git = (...args: string[]) =>
  execFileSync("git", args, { cwd: repositorio, encoding: "utf8" }).trim();
beforeEach(() => {
  mkdirSync("test-results", { recursive: true });
  repositorio = mkdtempSync(path.resolve("test-results/publicacao-"));
  git("init", "--quiet");
  git("symbolic-ref", "HEAD", "refs/heads/main");
  git("config", "user.name", "Ensaio sintético");
  git("config", "user.email", "ensaio@escola.exemplo");
  writeFileSync(path.join(repositorio, "package.json"), JSON.stringify({ version: "0.1.0" }));
  git("add", "package.json");
  git("commit", "--quiet", "-m", "Base sintética");
  sha = git("rev-parse", "HEAD");
});
afterEach(() => rmSync(repositorio, { recursive: true, force: true }));

describe("identidade canônica da publicação", () => {
  it("condiciona login e as duas imagens à identidade validada", () => {
    const fluxo = readFileSync(".github/workflows/publicacao.yml", "utf8");
    expect(fluxo).toMatch(/imagem:\n    needs: validar/);
    expect(fluxo).not.toContain("continue-on-error");
    expect(fluxo).not.toContain("COMMIT_SHA=${{ github.sha }}");
    expect(
      fluxo.match(/org.opencontainers.image.revision=\$\{\{ needs.validar.outputs.sha \}\}/g),
    ).toHaveLength(2);
    expect(fluxo).toContain("ref: ${{ needs.validar.outputs.sha }}");
    expect(fluxo).toContain(
      "APP_IMAGEM=ghcr.io/${{ github.repository }}:${{ needs.validar.outputs.versao }}",
    );
    expect(
      fluxo.match(/needs\.validar\.outputs\.latest == 'true' && format\('ghcr\.io/g),
    ).toHaveLength(2);
    expect(fluxo).toContain("PUBLICACAO_RELEASES: ${{ runner.temp }}/releases.json");
  });
  it.each([false, true])("resolve tag anotada=%s até o commit", (anotada) => {
    git("tag", ...(anotada ? ["-a", "-m", "Versão sintética"] : []), "v0.1.0");
    expect(
      validarPublicacao({ repositorio, versao: "0.1.0", ref: "refs/tags/v0.1.0", sha }),
    ).toEqual({ versao: "0.1.0", tag: "v0.1.0", sha, latest: true });
  });
  it("recusa tag fora da ancestralidade da main", () => {
    git("checkout", "-b", "lateral");
    writeFileSync(path.join(repositorio, "lateral.txt"), "fora da main");
    git("add", "lateral.txt");
    git("commit", "--quiet", "-m", "Lateral sintética");
    const lateral = git("rev-parse", "HEAD");
    git("tag", "v0.1.0");
    expect(() =>
      validarPublicacao({
        repositorio,
        versao: "0.1.0",
        ref: "refs/tags/v0.1.0",
        sha: lateral,
      }),
    ).toThrow("ancestral da main");
  });
  it.each(["branch", "inexistente", "semver", "prerelease", "pacote", "sha"])(
    "recusa %s antes da publicação",
    (falha) => {
      git("tag", "v0.1.0");
      if (falha === "branch") git("branch", "v0.1.0");
      if (falha === "pacote") git("tag", "v0.2.0");
      const versao =
        falha === "semver"
          ? "01.1.0"
          : falha === "prerelease"
            ? "0.1.0-rc.1"
            : falha === "pacote"
              ? "0.2.0"
              : "0.1.0";
      expect(() =>
        validarPublicacao({
          repositorio,
          versao,
          ref:
            falha === "branch"
              ? "refs/heads/v0.1.0"
              : falha === "inexistente"
                ? "refs/tags/v9.0.0"
                : `refs/tags/v${versao}`,
          sha: falha === "sha" ? "a".repeat(40) : sha,
        }),
      ).toThrow();
    },
  );
  it("só avança latest quando a versão não é anterior a uma release estável", () => {
    const releases = [
      { tag_name: "v0.1.0", draft: false, prerelease: false },
      { tag_name: "v0.2.0", draft: true, prerelease: false },
      { tag_name: "v0.3.0", draft: false, prerelease: true },
    ];
    expect(calcularLatest({ versao: "0.1.0", releases })).toBe(true);
    expect(
      calcularLatest({
        versao: "0.1.0",
        releases: [{ tag_name: "v1.0.0", draft: false, prerelease: false }],
      }),
    ).toBe(false);
    expect(
      calcularLatest({
        versao: "1.0.0",
        releases: [{ tag_name: "v1.0.0", draft: false, prerelease: false }],
      }),
    ).toBe(true);
  });
});
