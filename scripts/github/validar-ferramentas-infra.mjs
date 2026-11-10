// Valida o chart e os workflows com ferramentas instaladas no harness administrativo.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function validarInfra(executar) {
  const inventario = JSON.parse(
    readFileSync(new URL("./ferramentas.json", import.meta.url), "utf8"),
  );
  const segredo = inventario.kubernetes?.segredoExistente ?? "frequenciapp-segredos";
  await executar("helm", [
    "lint",
    "infra/kubernetes/frequenciapp",
    "--set",
    `existingSecret=${segredo}`,
  ]);
  const manifests = await executar("helm", [
    "template",
    "frequenciapp",
    "infra/kubernetes/frequenciapp",
    "--namespace",
    "frequenciapp",
    "--set",
    `existingSecret=${segredo}`,
  ]);
  if (!manifests.trim()) throw new Error("Helm não produziu manifests.");
  await executar("kubeconform", ["-strict", "-summary"], manifests);
  const workflows = readdirSync(".github/workflows")
    .filter((nome) => /\.ya?ml$/.test(nome))
    .map((nome) => `.github/workflows/${nome}`);
  await executar("actionlint", workflows);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validarInfra(async (comando, args, entrada) => {
    const resultado = spawnSync(comando, args, {
      input: entrada,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (resultado.error || resultado.signal || resultado.status !== 0) {
      throw new Error(`${comando} falhou: ${resultado.stderr ?? ""}`);
    }
    return resultado.stdout;
  }).catch((erro) => {
    console.error(erro.message);
    process.exitCode = 1;
  });
}
