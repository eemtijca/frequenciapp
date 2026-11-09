// Validação offline de chart e workflows, pronta para executar no harness administrativo.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function validarInfra(executar) {
  const manifesto = JSON.parse(readFileSync("infra/kubernetes/schemas/manifesto.json", "utf8"));
  if (manifesto.arquivos.length !== 11) throw new Error("Bundle incompleto.");
  for (const item of manifesto.arquivos) {
    const hash = createHash("sha256").update(readFileSync(item.arquivo)).digest("hex");
    if (hash !== item.sha256) throw new Error("Schema local divergente do manifesto.");
  }
  await executar("helm", ["lint", "infra/kubernetes/frequenciapp"]);
  const manifests = await executar("helm", ["template", "ensaio", "infra/kubernetes/frequenciapp", "--kube-version", manifesto.kubernetes]);
  if (!manifests.trim()) throw new Error("Helm não produziu manifests.");
  await executar("kubeconform", ["-strict", "-summary", "-kubernetes-version", manifesto.kubernetes,
    "-schema-location", "infra/kubernetes/schemas/{{.NormalizedKubernetesVersion}}-standalone{{.StrictSuffix}}/{{.ResourceKind}}{{.KindSuffix}}.json"], manifests);
  await executar("actionlint", readdirSync(".github/workflows").filter((n) => /\.ya?ml$/.test(n)).map((n) => `.github/workflows/${n}`));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validarInfra(async (comando, args, entrada) => {
    const resultado = spawnSync(comando, args, { input: entrada, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (resultado.error || resultado.signal || resultado.status !== 0) throw new Error(`${comando} falhou: ${resultado.stderr ?? ""}`);
    return resultado.stdout;
  }).catch((erro) => { console.error(erro.message); process.exitCode = 1; });
}
