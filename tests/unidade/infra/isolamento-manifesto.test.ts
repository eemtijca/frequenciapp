// Confere a propriedade e a recusa de substituição da prova dentro do runner.
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { prepararManifesto } from "../../isolamento/manifesto.mjs";
const pastas: string[] = [];
function pasta() {
  const p = mkdtempSync(path.join(tmpdir(), "manifesto-uid-"));
  pastas.push(p);
  return p;
}
afterEach(() => {
  for (const p of pastas.splice(0)) rmSync(p, { recursive: true, force: true });
});
it("cria arquivo 0600 do UID efetivo em diretório privado", async () => {
  const p = pasta();
  await prepararManifesto({ marcador: "sintetico" }, p);
  const s = lstatSync(path.join(p, "manifesto.json"));
  expect(s.uid).toBe(process.getuid?.());
  expect(s.mode & 0o777).toBe(0o600);
  expect(JSON.parse(readFileSync(path.join(p, "manifesto.json"), "utf8"))).toEqual({
    marcador: "sintetico",
  });
  await expect(prepararManifesto({ marcador: "outro" }, p)).rejects.toThrow();
  expect(JSON.parse(readFileSync(path.join(p, "manifesto.json"), "utf8")).marcador).toBe(
    "sintetico",
  );
});
it("não segue link nem corrige permissões de um destino alheio", async () => {
  const p = pasta();
  const vizinho = path.join(p, "vizinho");
  writeFileSync(vizinho, "preservado");
  symlinkSync(vizinho, path.join(p, "manifesto.json"));
  await expect(prepararManifesto({}, p)).rejects.toThrow();
  expect(readFileSync(vizinho, "utf8")).toBe("preservado");
  const publico = pasta();
  chmodSync(publico, 0o755);
  await expect(prepararManifesto({}, publico)).rejects.toThrow(/ownership/);
  expect(lstatSync(publico).mode & 0o777).toBe(0o755);
});
