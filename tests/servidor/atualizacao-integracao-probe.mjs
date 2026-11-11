// Mede a identidade da autoridade nos descritores próprios; a CLI mantém o operador sem poderes.
import fs from "node:fs";
import net from "node:net";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

export function medirAutoridade(referencia) {
  const inicioNs = process.hrtime.bigint().toString();
  const decimal = (s) => typeof s === "string" && /^(0|[1-9][0-9]*)$/.test(s);
  const referenciaValida =
    !!referencia &&
    JSON.stringify(Object.keys(referencia).sort()) ===
      JSON.stringify(["dev", "ino", "inputsSha256", "rodada", "versao"]) &&
    referencia.versao === 1 &&
    typeof referencia.rodada === "string" &&
    /^[a-z0-9][a-z0-9_-]{1,95}$/.test(referencia.rodada) &&
    typeof referencia.inputsSha256 === "string" &&
    /^[a-f0-9]{64}$/.test(referencia.inputsSha256) &&
    decimal(referencia.dev) &&
    decimal(referencia.ino) &&
    referencia.ino !== "0";
  const enumerados = [],
    tabela = [];
  let diretorio,
    enumeracaoErro = null,
    fechamentoErro = null;
  try {
    // Mantém o diretório aberto durante os fstats, inclusive seu próprio FD observável.
    diretorio = fs.opendirSync("/proc/self/fd");
    for (let entrada; (entrada = diretorio.readSync()) !== null;) {
      assert.match(entrada.name, /^(0|[1-9][0-9]*)$/);
      const fd = Number(entrada.name);
      assert.ok(Number.isSafeInteger(fd) && fd >= 0 && enumerados.length < 4096);
      assert.ok(!enumerados.includes(fd));
      enumerados.push(fd);
    }
    enumerados.sort((a, b) => a - b);
  } catch (e) {
    enumeracaoErro = e.code ?? "ENUMERACAO_INVALIDA";
  }
  for (const fd of [...new Set([...enumerados, 9])].sort((a, b) => a - b)) {
    try {
      const s = fs.fstatSync(fd, { bigint: true });
      tabela.push({
        fd,
        estado: "aberto",
        dev: s.dev.toString(),
        ino: s.ino.toString(),
        tipo: (s.mode & 0o170000n).toString(8),
        erro: null,
      });
    } catch (e) {
      tabela.push({
        fd,
        estado: e.code === "EBADF" ? "ebadf" : "erro",
        dev: null,
        ino: null,
        tipo: null,
        erro: e.code ?? "STAT_INESPERADO",
      });
    }
  }
  try {
    diretorio?.closeSync();
  } catch (e) {
    fechamentoErro = e.code ?? "FECHAMENTO_INESPERADO";
  }
  const fd9 = tabela.find((o) => o.fd === 9);
  const ebadfTransitorios = tabela
    .filter((o) => o.estado === "ebadf" && enumerados.includes(o.fd))
    .map((o) => o.fd);
  // EBADF de um FD enumerado é uma janela incompleta, não ausência comprovada.
  const completa =
    enumeracaoErro === null &&
    fechamentoErro === null &&
    enumerados.length > 0 &&
    tabela.every(
      (o) =>
        o.estado === "aberto" || (o.fd === 9 && !enumerados.includes(9) && o.estado === "ebadf"),
    );
  const encontrados = referenciaValida
    ? tabela
        .filter(
          (o) => o.estado === "aberto" && o.dev === referencia.dev && o.ino === referencia.ino,
        )
        .map((o) => o.fd)
    : [];
  const autoridadeAusente = referenciaValida && completa && encontrados.length === 0;
  return {
    versao: 1,
    referencia: referencia ?? null,
    referenciaValida,
    janela: {
      inicioNs,
      fimNs: process.hrtime.bigint().toString(),
      escopo: "snapshot-/proc/self/fd-com-diretorio-aberto",
      garantiaFutura: false,
    },
    enumerados,
    enumeracaoErro,
    fechamentoErro,
    tabela,
    ebadfTransitorios,
    fd9,
    fd9Ausente: fd9.estado === "ebadf",
    completa,
    encontrados,
    autoridadeAusente,
    motivo: !referenciaValida
      ? "REFERENCIA_INVALIDA"
      : !completa
        ? "OBSERVACAO_INCOMPLETA"
        : encontrados.length
          ? "AUTORIDADE_PRESENTE"
          : "AUTORIDADE_AUSENTE",
  };
}

async function executarProbe() {
  assert.equal(process.getuid(), 65534);
  assert.equal(process.argv.length, 2);
  const base = "/tmp/atualizacao-integracao-probe",
    st = fs.lstatSync(`${base}/alvo.json`),
    dir = fs.lstatSync(base);
  assert.ok(
    dir.isDirectory() && !dir.isSymbolicLink() && dir.uid === 0 && (dir.mode & 0o7777) === 0o1777,
  );
  assert.ok(
    st.isFile() &&
      !st.isSymbolicLink() &&
      st.uid === 0 &&
      st.nlink === 1 &&
      (st.mode & 0o7777) === 0o644,
  );
  const alvo = JSON.parse(fs.readFileSync(`${base}/alvo.json`));
  assert.deepEqual(Object.keys(alvo).sort(), ["privado", "referencia", "socket"]);
  const bytes = fs.readFileSync("/repo/atualizacao-integracao-inputs.json"),
    inputs = JSON.parse(bytes);
  assert.equal(alvo.referencia?.rodada, inputs.rodada);
  assert.equal(alvo.referencia?.inputsSha256, createHash("sha256").update(bytes).digest("hex"));
  let leituraNegada = false,
    escritaNegada = false;
  try {
    fs.readFileSync(alvo.privado);
  } catch (e) {
    leituraNegada = e.code === "EACCES";
  }
  try {
    fs.openSync(alvo.privado, fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW);
  } catch (e) {
    escritaNegada = e.code === "EACCES";
  }
  const socketNegado = await new Promise((resolve) => {
    const s = net.createConnection(alvo.socket);
    s.once("error", (e) => {
      s.destroy();
      resolve(e.code === "EACCES");
    });
    s.once("connect", () => {
      s.destroy();
      resolve(false);
    });
  });
  const medicao = medirAutoridade(alvo.referencia);
  const r = {
    versao: 2,
    uid: process.getuid(),
    leituraNegada,
    escritaNegada,
    socketNegado,
    fd9Ausente: medicao.fd9Ausente,
    medicao,
  };
  fs.writeFileSync(`${base}/resultado.json`, JSON.stringify(r) + "\n", { flag: "wx", mode: 0o644 });
  process.stdout.write(JSON.stringify(r) + "\n");
  for (const k of ["leituraNegada", "escritaNegada", "socketNegado"]) assert.equal(r[k], true);
  assert.equal(medicao.autoridadeAusente, true, medicao.motivo);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await executarProbe();
