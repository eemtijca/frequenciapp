// Executa o inventário sintético após comprovar os limites reais do contêiner.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { run } from "node:test";
import { contagensVazias, inventario, validarResultadoInterno } from "./sinteticos.mjs";

const [perfil, rodada] = process.argv.slice(2);
assert.ok(["sinteticos", "autoteste", "portabilidade", "controlador-root"].includes(perfil));
assert.match(rodada ?? "", /^[a-f0-9]{48}$/);
assert.ok(fs.existsSync("/.dockerenv"));
assert.equal(process.getuid(), perfil === "controlador-root" ? 0 : 1000);
assert.equal(process.getgid(), perfil === "controlador-root" ? 0 : 1000);
assert.equal(process.env.TMPDIR, "/tmp");
const status = fs.readFileSync("/proc/self/status", "utf8");
assert.match(status, /^CapEff:\s*0+\s*$/m);
assert.match(status, /^NoNewPrivs:\s*1\s*$/m);
assert.deepEqual(fs.readdirSync("/sys/class/net"), ["lo"]);
assert.ok(!fs.existsSync("/var/run/docker.sock"));
assert.ok(!fs.existsSync("/run/docker.sock"));
assert.equal(process.env.DOCKER_HOST, undefined);
const mounts = fs
  .readFileSync("/proc/self/mountinfo", "utf8")
  .trim()
  .split("\n")
  .map((linha) => {
    const [antes, depois] = linha.split(" - ");
    const campos = antes.split(" ");
    return {
      origem: campos[3],
      destino: campos[4].replace(/\\([0-7]{3})/g, (_, n) => String.fromCharCode(parseInt(n, 8))),
      opcoes: campos[5].split(","),
      tipo: depois.split(" ")[0],
    };
  });
const montagem = (destino) => {
  const m = mounts.filter((item) => item.destino === destino);
  assert.equal(m.length, 1);
  return m[0];
};
assert.ok(montagem("/").opcoes.includes("ro"));
assert.ok(montagem("/repo").opcoes.includes("ro"));
assert.equal(montagem("/tmp").tipo, "tmpfs");
assert.ok(montagem("/tmp").opcoes.includes("rw"));
assert.ok(!montagem("/tmp").opcoes.includes("noexec"));
// O destino é único da imagem Debian. A origem depende do daemon, não do host histórico.
// Aceitar somente um arquivo ELF root readonly, idêntico ao executável real do PID 1.
const init = montagem("/usr/sbin/docker-init");
assert.match(init.origem, /^\/(?:[^/]+\/)*docker-init$/);
assert.ok(["ext4", "xfs", "overlay"].includes(init.tipo));
assert.ok(init.opcoes.includes("ro") && !init.opcoes.includes("rw"));
const initStat = fs.statSync("/usr/sbin/docker-init");
assert.ok(
  initStat.isFile() &&
    initStat.uid === 0 &&
    (initStat.mode & 0o022) === 0 &&
    (initStat.mode & 0o111) !== 0,
);
const initBytes = fs.readFileSync("/usr/sbin/docker-init");
assert.ok(initBytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])));
assert.ok(initBytes.equals(fs.readFileSync("/proc/1/exe")));
const permitidas = new Set([
  "/",
  "/repo",
  "/tmp",
  "/proc",
  "/dev",
  "/dev/pts",
  "/dev/shm",
  "/dev/mqueue",
  "/sys",
  "/sys/fs/cgroup",
  "/etc/hosts",
  "/etc/hostname",
  "/etc/resolv.conf",
  "/proc/bus",
  "/proc/fs",
  "/proc/irq",
  "/proc/sys",
  "/proc/sysrq-trigger",
  "/proc/acpi",
  "/proc/asound",
  "/proc/interrupts",
  "/proc/kcore",
  "/proc/keys",
  "/proc/latency_stats",
  "/proc/scsi",
  "/proc/timer_list",
  "/sys/firmware",
  "/sys/devices/virtual/powercap",
]);
permitidas.add("/usr/sbin/docker-init");
if (perfil === "controlador-root") {
  const sandbox = montagem("/sandbox");
  assert.equal(sandbox.tipo, "tmpfs");
  assert.ok(sandbox.opcoes.includes("rw") && !sandbox.opcoes.includes("noexec"));
  permitidas.add("/sandbox");
}
for (const m of mounts) assert.ok(permitidas.has(m.destino), "Montagem não autorizada no ensaio");
process.chdir("/repo");
assert.equal(process.env.HELM_BIN, "/usr/local/bin/helm");
const helm = spawnSync(process.env.HELM_BIN, ["version", "--short"], {
  encoding: "utf8",
  timeout: 10000,
});
assert.equal(helm.error, undefined);
assert.equal(helm.signal, null);
assert.equal(helm.status, 0);
assert.match(helm.stdout, /^v\d+\.\d+\.\d+/);
const openssl = spawnSync("openssl", ["version"], { encoding: "utf8", timeout: 10000 });
assert.equal(openssl.error, undefined);
assert.equal(openssl.signal, null);
assert.equal(openssl.status, 0);
assert.match(openssl.stdout, /^OpenSSL /);
assert.equal(typeof (await import("pg")).default.Client, "function");
assert.equal(typeof (await import("dotenv")).parse, "function");

async function executarNode(arquivo) {
  let resumo;
  // A API do runner fornece contagens tipadas; não inferir sucesso de texto TAP.
  const fluxo = run({ files: [arquivo], concurrency: 1, timeout: 1200000 });
  for await (const evento of fluxo) {
    if (evento.type === "test:summary") resumo = evento.data.counts;
    if (evento.type === "test:fail")
      process.stderr.write(
        JSON.stringify({
          arquivo,
          teste: evento.data.name,
          erro: evento.data.details?.error?.message ?? "Falha sem mensagem",
        }) + "\n",
      );
  }
  assert.ok(resumo, "Resumo do runner ausente");
  return {
    testes: resumo.tests,
    passaram: resumo.passed,
    falharam: resumo.failed,
    cancelados: resumo.cancelled,
    ignorados: resumo.skipped,
    pendentes: resumo.todo,
  };
}
async function executarBash(arquivo) {
  return new Promise((resolve, reject) => {
    const filho = spawn("bash", [arquivo], {
      stdio: ["ignore", "ignore", "ignore"],
      timeout: 1200000,
    });
    filho.once("error", reject);
    filho.once("close", (code, signal) => resolve({ code, signal }));
  });
}
const esperados = inventario(perfil, "/repo");
const arquivos = [];
for (const item of esperados) {
  let contagens, codigo;
  try {
    if (item.tipo === "node") {
      contagens = await executarNode(item.arquivo);
      codigo = contagens.testes > 0 && contagens.passaram === contagens.testes ? 0 : 1;
    } else {
      const r = await executarBash(item.arquivo);
      codigo =
        Number.isInteger(r.code) && r.code >= 0 && r.code <= 255 && r.signal === null ? r.code : 1;
      contagens = {
        ...contagensVazias(),
        testes: 1,
        passaram: codigo === 0 ? 1 : 0,
        falharam: codigo === 0 ? 0 : 1,
      };
    }
  } catch {
    codigo = 1;
    contagens = { ...contagensVazias(), testes: 1, falharam: 1 };
  }
  arquivos.push({ ...item, codigo, estado: codigo === 0 ? "aprovado" : "falhou", contagens });
}
const resultado = { schema: 1, perfil, arquivos };
const totais = validarResultadoInterno(resultado, perfil, esperados);
process.stdout.write(
  `FREQUENCIAPP_SINTETICOS_RESULTADO=${rodada}:${Buffer.from(JSON.stringify(resultado)).toString("base64")}\n`,
);
process.exitCode = totais.falhos === 0 ? 0 : 1;
