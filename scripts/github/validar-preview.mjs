// Executa a validação não privilegiada com ambiente mínimo e conexão fictícia.
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function ambienteValidacao(ambiente) {
  return Object.fromEntries([
    ...["PATH", "HOME", "TMPDIR", "CI"]
      .filter((chave) => ambiente[chave] !== undefined)
      .map((chave) => [chave, ambiente[chave]]),
    ["DATABASE_URL", "postgresql://validacao:ficticia@127.0.0.1:1/validacao"],
    ["DIRECT_URL", "postgresql://validacao:ficticia@127.0.0.1:1/validacao"],
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const resultado = spawnSync(
    process.execPath,
    ["node_modules/prisma/build/index.js", "validate"],
    {
      env: ambienteValidacao(process.env),
      stdio: "inherit",
    },
  );
  process.exitCode = resultado.error || resultado.signal ? 1 : (resultado.status ?? 1);
}
