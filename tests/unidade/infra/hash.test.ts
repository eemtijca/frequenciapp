// Hash de senha: ida e volta, senha errada e hash corrompido.
import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { conferirSenha, hashearSenha } from "@/infra/auth/hash";

describe("hash de senha", () => {
  it("gera o formato E2E com parâmetros e chave compatíveis com o scrypt nativo", async () => {
    const senha = "SenhaDeTeste123";
    const hash = await hashearSenha(senha);
    const [algoritmo, custo, bloco, paralelismo, sal, chave] = hash.split("$");
    expect([algoritmo, custo, bloco, paralelismo]).toEqual(["scrypt", "16384", "8", "1"]);
    expect(sal).toMatch(/^[0-9a-f]{32}$/);
    expect(chave).toMatch(/^[0-9a-f]{128}$/);
    if (sal === undefined) throw new Error("Sal ausente.");
    expect(
      scryptSync(senha, Buffer.from(sal, "hex"), 64, { N: 16384, r: 8, p: 1 }).toString("hex"),
    ).toBe(chave);
    expect(await conferirSenha(senha, hash)).toBe(true);
  });
  it("confere a senha original e recusa outra", async () => {
    const hash = await hashearSenha("SenhaCorreta123");
    expect(await conferirSenha("SenhaCorreta123", hash)).toBe(true);
    expect(await conferirSenha("SenhaErrada123", hash)).toBe(false);
  });
  it("recusa hashes malformados", async () => {
    expect(await conferirSenha("qualquer", "")).toBe(false);
    expect(await conferirSenha("qualquer", "md5$abc$def")).toBe(false);
    expect(await conferirSenha("qualquer", "scrypt$x$y$z$aa$bb")).toBe(false);
  });
  it("gera hashes distintos para senhas iguais com sais distintos", async () => {
    const primeiro = await hashearSenha("igual");
    const segundo = await hashearSenha("igual");
    expect(primeiro).not.toBe(segundo);
  });
});
