// Hash de senha: ida e volta, senha errada e hash corrompido.
import { describe, expect, it } from "vitest";
import { conferirSenha, hashearSenha } from "@/infra/auth/hash";

describe("hash de senha", () => {
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
