// Integra a prova Node/Bash de catálogo à suíte de unidade sem serviços externos.
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("catálogo e retomada usam CLIs reais com transporte explicitamente falso", () => {
  const raiz = fileURLToPath(new URL("../../../", import.meta.url));
  const nonce = randomUUID();
  const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
  const inputs = Object.fromEntries(
    [
      "tests/unidade/infra/operacao-catalogo-cli.test.ts",
      "tests/servidor/catalogo-retomada.test.mjs",
      "scripts/servidor/backup-recibos.mjs",
      "scripts/servidor/backup-banco.sh",
      "scripts/servidor/recibos.mjs",
      "scripts/servidor/comum.sh",
      "scripts/servidor/identidade.mjs",
      "scripts/servidor/identidade.sh",
    ].map((nome) => [nome, sha(fs.readFileSync(path.join(raiz, nome)))]),
  );
  const argv = ["--test", "--test-reporter=tap", "tests/servidor/catalogo-retomada.test.mjs"];
  const p = spawnSync(process.execPath, argv, {
    cwd: raiz,
    env: { ...process.env, CATALOGO_PROVA_NONCE: nonce },
    encoding: "utf8",
    timeout: 120000,
  });
  // Projeta apenas campos allowlist, inclusive quando o filho falha; nunca o ambiente/erro bruto.
  process.stdout.write(
    JSON.stringify({
      reciboFilhoCatalogo: 1,
      nonce,
      inputs,
      argv: [process.execPath, ...argv],
      status: p.status,
      signal: p.signal,
      errorCode: (p.error as NodeJS.ErrnoException | undefined)?.code ?? null,
      stdoutSha256: sha(p.stdout ?? ""),
      stderrSha256: sha(p.stderr ?? ""),
    }) + "\n",
  );
  process.stdout.write(p.stdout ?? "");
  expect(p.error, "WRAPPER:child-error").toBeUndefined();
  expect(p.signal, "WRAPPER:child-signal").toBeNull();
  expect(typeof p.status, "WRAPPER:child-status-type").toBe("number");
  expect(p.status, "WRAPPER:child-status").toBe(0);

  const linhas = p.stdout.trimEnd().split("\n");
  expect(linhas[0], "WRAPPER:reporter").toBe("TAP version 13");
  const titulos = [
    "#391 CLI conta apenas íntegros do mesmo banco/schema/alvo/remoto",
    "#392 Bash retoma expurgo parcial exato e reconcilia histórico sem apagar catálogo",
  ];
  const escapar = (texto: string) => texto.replaceAll("#", "\\#");
  expect(
    linhas.filter((l) => l.startsWith("# Subtest: ")),
    "WRAPPER:titles",
  ).toEqual(titulos.map((titulo) => `# Subtest: ${escapar(titulo)}`));
  expect(
    linhas.filter((l) => /^(?:not )?ok \d/.test(l)),
    "WRAPPER:results",
  ).toEqual(titulos.map((titulo, i) => `ok ${i + 1} - ${escapar(titulo)}`));
  expect(
    linhas.filter((l) => /^1\.\./.test(l)),
    "WRAPPER:plan",
  ).toEqual(["1..2"]);
  expect(
    linhas.filter((l) => /^# (tests|suites|pass|fail|cancelled|skipped|todo) /.test(l)),
    "WRAPPER:summary",
  ).toEqual([
    "# tests 2",
    "# suites 0",
    "# pass 2",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
  ]);
  // TAP escapa barras e hashes dos comentários; JSON permanece uma linha por testemunha.
  const provas = linhas
    .filter((l) => l.startsWith("# {"))
    .map((l) => JSON.parse(l.slice(2).replace(/\\([\\#])/g, "$1")));
  expect(provas.length, "WRAPPER:witness-count").toBe(8);
  expect(provas.filter((p) => p.reciboEnsaioCatalogo === true).length, "WRAPPER:bash-count").toBe(
    6,
  );
  expect(provas.filter((p) => p.caracterizacoesLote === true).length, "WRAPPER:batch-count").toBe(
    1,
  );
  expect(provas.filter((p) => p.testemunhaCatalogo === 1).length, "WRAPPER:final-count").toBe(1);
  const prova = provas.at(-1);
  expect(prova.nonce, "WRAPPER:nonce").toBe(nonce);
  expect(prova.inputs, "WRAPPER:inputs").toEqual(inputs);
  expect(prova, "WRAPPER:final").toMatchObject({
    testemunhaCatalogo: 1,
    casos: ["#391", "#392"],
    prova: "Bash/Node/FS reais",
    clientes: "Docker/PG/age/rclone FALSOS",
    retomada: true,
    reciboPorUltimo: true,
    catalogoPreservado: true,
  });
}, 120000);
