// Supervisiona arquivos em série; nenhuma falha autoriza lançar o arquivo seguinte.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { conferirConfinamento, conferirInputs } from "./atualizacao-integracao-driver.mjs";
import { hash } from "./atualizacao-integracao-receitas.mjs";

const arquivos = [
  "atualizacao-integracao-vertical.test.mjs",
  "atualizacao-integracao-matriz.test.mjs",
  "atualizacao-integracao.test.mjs",
  "atualizacao-integracao-lifecycle.test.mjs",
];
const recibos = [];
let causa = null;
let inputs;
const frame = (nome, valor) =>
  process.stdout.write(nome + "=" + Buffer.from(JSON.stringify(valor)).toString("base64") + "\n");
function tap(bytes) {
  const texto = bytes.toString("utf8");
  const casos = [...texto.matchAll(/^(not )?ok (\d+) - (.+)$/gm)].map((m) => ({
    numero: Number(m[2]),
    nome: m[3].replace(/ # (?:SKIP|TODO).*$/, ""),
    estado: / # SKIP/.test(m[3]) ? "skip" : / # TODO/.test(m[3]) ? "todo" : m[1] ? "fail" : "pass",
  }));
  const resumo = Object.fromEntries(
    [...texto.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)$/gm)].map((m) => [
      m[1],
      Number(m[2]),
    ]),
  );
  return { casos, resumo };
}
async function executar(arquivo) {
  const argv = [
    process.execPath,
    "--test",
    "--test-concurrency=1",
    "--test-reporter=tap",
    `/repo/tests/servidor/${arquivo}`,
  ];
  frame("ATUALIZACAO_ARQUIVO_INICIO", {
    arquivo,
    argv,
    rodada: inputs.rodada,
    inputsSha256: inputs.sha256,
  });
  const filho = spawn(argv[0], argv.slice(1), {
    cwd: "/repo",
    env: {
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      HOME: "/scratch",
      TMPDIR: "/scratch",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_ALLOW_PROTOCOL: "file",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let erro = null,
    tamanho = 0,
    parcial = "",
    probe = false;
  const out = [],
    err = [];
  const coletar = (partes, destino, b) => {
    tamanho += b.length;
    if (tamanho > 24 * 1024 * 1024) {
      erro ??= "LIMITE_SAIDA";
      return;
    }
    partes.push(Buffer.from(b));
    destino.write(b);
  };
  filho.stdout.on("data", (b) => {
    coletar(out, process.stdout, b);
    parcial += b.toString("utf8");
    const linhas = parcial.split("\n");
    parcial = linhas.pop();
    for (const linha of linhas)
      if (linha === "# ADAPTADOR_PROBE_PRONTO") {
        assert.equal(arquivo, arquivos[0]);
        assert.equal(probe, false);
        probe = true;
        process.stdout.write("ADAPTADOR_PROBE_PRONTO\n");
      }
  });
  filho.stderr.on("data", (b) => coletar(err, process.stderr, b));
  filho.on("error", (e) => {
    erro ??= e.code ?? "SPAWN";
  });
  const fim = await new Promise((resolve) =>
    filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, close: true })),
  );
  const stdout = Buffer.concat(out),
    stderr = Buffer.concat(err);
  const r = {
    arquivo,
    argv,
    ...fim,
    erro,
    stdout: stdout.toString("base64"),
    stderr: stderr.toString("base64"),
    stdoutSha256: hash(stdout),
    stderrSha256: hash(stderr),
    ...tap(stdout),
  };
  recibos.push(r);
  frame("ATUALIZACAO_ARQUIVO_FIM", r);
  assert.equal(erro, null);
  assert.equal(fim.sinal, null);
  assert.equal(fim.codigo, 0);
  const esperados = inputs.casos[arquivo];
  assert.ok(esperados?.length > 0);
  assert.deepEqual(r.casos.map((c) => c.nome).sort(), [...esperados].sort());
  assert.deepEqual(r.resumo, {
    tests: esperados.length,
    pass: esperados.length,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  });
  assert.ok(r.casos.every((c) => c.estado === "pass"));
  if (arquivo === arquivos[0]) assert.equal(probe, true);
}
try {
  conferirConfinamento();
  assert.equal(process.argv.length, 2);
  inputs = conferirInputs();
  assert.deepEqual(Object.keys(inputs.casos).sort(), [...arquivos].sort());
  for (const arquivo of arquivos) await executar(arquivo);
} catch (e) {
  causa = { code: e.code ?? "ASSERT", mensagem: e.message };
  process.exitCode = 1;
} finally {
  frame("ATUALIZACAO_RUNNER", {
    versao: 1,
    rodada: inputs?.rodada ?? null,
    inputsSha256: inputs?.sha256 ?? null,
    codigo: causa ? 1 : 0,
    causa,
    arquivos: recibos.map(({ stdout, stderr, ...r }) => r),
    naoIniciados: arquivos
      .filter((a) => !recibos.some((r) => r.arquivo === a))
      .map((arquivo) => ({ arquivo, casos: inputs?.casos[arquivo] ?? [] })),
    backendRealExecutado: false,
  });
}
