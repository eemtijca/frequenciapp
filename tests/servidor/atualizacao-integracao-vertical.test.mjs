// Confere a fatia administrativa A/B real com transporte e EngineFake confinado.
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { test } from "./atualizacao-integracao-casos.mjs";

const driver = new URL("./atualizacao-integracao-driver.mjs", import.meta.url);
async function controlesCausais(inputs) {
  const probe = new URL("./atualizacao-integracao-probe.mjs", import.meta.url);
  const importado = await import(probe.href);
  assert.equal(typeof importado.medirAutoridade, "function");
  assert.equal(fs.existsSync("/tmp/atualizacao-integracao-probe/resultado.json"), false);
  const pasta = fs.mkdtempSync("/scratch/witness-controle-");
  fs.chmodSync(pasta, 0o700);
  // Abre primeiro; o chamador obtém a referência independente por stat do caminho depois.
  const sintetico = fs.openSync(`${pasta}/autoridade-sintetica`, "wx+", 0o600);
  const benigno = fs.openSync(`${pasta}/benigno`, "wx+", 0o600);
  const s = fs.statSync(`${pasta}/autoridade-sintetica`, { bigint: true });
  const b = fs.statSync(`${pasta}/benigno`, { bigint: true });
  assert.ok(s.isFile() && s.uid === BigInt(process.getuid()) && (s.mode & 0o777n) === 0o600n);
  assert.ok(s.dev !== b.dev || s.ino !== b.ino);
  const referencia = {
    versao: 1,
    rodada: inputs.rodada,
    inputsSha256: inputs.sha256,
    dev: s.dev.toString(),
    ino: s.ino.toString(),
  };
  const original = fs.readFileSync(probe, "utf8");
  const alvoMutacao = /const autoridadeAusente =[^;]+;/g;
  assert.equal([...original.matchAll(alvoMutacao)].length, 1);
  const mutante = `${pasta}/probe-wrong-result.mjs`;
  fs.writeFileSync(mutante, original.replace(alvoMutacao, "const autoridadeAusente = true;"), {
    flag: "wx",
    mode: 0o600,
  });
  const programa = `
    import fs from 'node:fs';
    const c = JSON.parse(process.argv[1]);
    const { medirAutoridade } = await import(c.probe);
    const { conferirMedicaoAutoridade } = await import(c.driver);
    // Somente erros de observação são simulados; os controles de herança usam FDs físicos.
    if (c.simulacao === 'stat-eio' || c.simulacao === 'stat-ebadf') {
      const stat = fs.fstatSync;
      fs.fstatSync = (fd, ...args) => { if (fd === 9) throw Object.assign(new Error('observacao-simulada'), {code:c.simulacao === 'stat-eio' ? 'EIO' : 'EBADF'}); return stat(fd, ...args); };
    }
    if (c.simulacao === 'enum-eio') fs.opendirSync = () => { throw Object.assign(new Error('enumeracao-simulada'), {code:'EIO'}); };
    const medicao = medirAutoridade(c.referencia);
    if (c.simulacao === 'tabela-incompleta') medicao.tabela = [];
    let causa = null;
    try { conferirMedicaoAutoridade(medicao, c.esperada); } catch(e) { causa = e.code ?? 'SEM_CODIGO'; }
    process.stdout.write(JSON.stringify({uid:process.getuid(), medicao, causa}) + '\\n');
    process.exitCode = causa === null ? 0 : 23;
  `;
  // Negações declaradas antes dos spawns: status 23, close físico, sem sinal/erro de spawn.
  const variantes = [
    { nome: "fd9-benigno", causa: null, codigo: 0 },
    { nome: "autoridade-em-9", slot: 9, causa: "WITNESS_AUTORIDADE", codigo: 23 },
    { nome: "autoridade-em-17", slot: 17, causa: "WITNESS_AUTORIDADE", codigo: 23 },
    { nome: "referencia-ausente", referencia: null, causa: "WITNESS_REFERENCIA", codigo: 23 },
    {
      nome: "referencia-invalida",
      referencia: { ...referencia, dev: "invalido" },
      causa: "WITNESS_REFERENCIA",
      codigo: 23,
    },
    {
      nome: "binding-divergente",
      referencia: { ...referencia, inputsSha256: "0".repeat(64) },
      causa: "WITNESS_REFERENCIA",
      codigo: 23,
    },
    { nome: "stat-eio", simulacao: "stat-eio", causa: "WITNESS_OBSERVACAO", codigo: 23 },
    { nome: "enum-eio", simulacao: "enum-eio", causa: "WITNESS_OBSERVACAO", codigo: 23 },
    { nome: "ebadf-transitorio", simulacao: "stat-ebadf", causa: "WITNESS_OBSERVACAO", codigo: 23 },
    {
      nome: "tabela-incompleta",
      simulacao: "tabela-incompleta",
      causa: "WITNESS_SCHEMA",
      codigo: 23,
    },
    {
      nome: "mutante-wrong-result",
      slot: 9,
      mutante: true,
      causa: "WITNESS_CONCLUSAO",
      codigo: 23,
    },
  ];
  try {
    for (const v of variantes) {
      const stdio = Array(18).fill("ignore");
      stdio[1] = "pipe";
      stdio[2] = "pipe";
      stdio[9] = benigno;
      if (v.slot) stdio[v.slot] = sintetico;
      const config = {
        probe: v.mutante ? pathToFileURL(mutante).href : probe.href,
        driver: driver.href,
        referencia: Object.hasOwn(v, "referencia") ? v.referencia : referencia,
        esperada: referencia,
        simulacao: v.simulacao ?? null,
      };
      const argv = [
        process.execPath,
        "--input-type=module",
        "-e",
        programa,
        JSON.stringify(config),
      ];
      const filho = spawn(argv[0], argv.slice(1), {
        cwd: "/repo",
        env: { PATH: "/usr/local/bin:/usr/bin:/bin", HOME: "/scratch", TMPDIR: "/scratch" },
        stdio,
      });
      const out = [],
        err = [];
      let erro = null;
      filho.stdout.on("data", (b) => out.push(Buffer.from(b)));
      filho.stderr.on("data", (b) => err.push(Buffer.from(b)));
      filho.on("error", (e) => {
        erro ??= e.code;
      });
      const fim = await new Promise((resolve) =>
        filho.once("close", (codigo, sinal) => resolve({ codigo, sinal, close: true })),
      );
      const recibo = {
        nome: v.nome,
        esperado: { codigo: v.codigo, causa: v.causa },
        ...fim,
        erro,
        argv,
        stdout: Buffer.concat(out).toString("base64"),
        stderr: Buffer.concat(err).toString("base64"),
        simulacao: v.simulacao ?? null,
        uidChamador: process.getuid(),
      };
      // Raw e causa são publicados antes de qualquer assertiva do consumidor.
      process.stdout.write(
        "ATUALIZACAO_CONTROLE_LOCK=" +
          Buffer.from(JSON.stringify(recibo)).toString("base64") +
          "\n",
      );
      assert.equal(erro, null);
      assert.equal(fim.sinal, null);
      assert.equal(fim.close, true);
      assert.equal(fim.codigo, v.codigo);
      assert.equal(Buffer.concat(err).length, 0);
      const r = JSON.parse(Buffer.concat(out));
      assert.equal(r.uid, process.getuid());
      assert.equal(r.causa, v.causa);
      if (v.nome === "fd9-benigno") {
        assert.equal(r.medicao.fd9Ausente, false);
        assert.equal(r.medicao.autoridadeAusente, true);
        assert.deepEqual(
          { dev: r.medicao.fd9.dev, ino: r.medicao.fd9.ino },
          { dev: b.dev.toString(), ino: b.ino.toString() },
        );
      }
      if (v.slot) {
        assert.equal(r.medicao.encontrados.includes(v.slot), true);
        assert.deepEqual(
          {
            dev: r.medicao.tabela.find((o) => o.fd === v.slot).dev,
            ino: r.medicao.tabela.find((o) => o.fd === v.slot).ino,
          },
          { dev: referencia.dev, ino: referencia.ino },
        );
        assert.equal(r.medicao.autoridadeAusente, v.mutante === true);
      }
      if (v.nome === "ebadf-transitorio") {
        assert.equal(r.medicao.ebadfTransitorios.includes(9), true);
        assert.equal(r.medicao.completa, false);
      }
    }
  } finally {
    fs.closeSync(sintetico);
    fs.closeSync(benigno);
  }
}
test(
  "vertical A/B: snapshot, AGE, pin, build, OCI, subida e reabertura",
  { timeout: 120000 },
  async () => {
    assert.equal(fs.existsSync(driver), true, "candidato vertical coeso ainda ausente");
    const { comando, conferirInputs, conferirConfinamento, conferirMedicaoAutoridade } =
      await import(driver.href);
    conferirConfinamento();
    const inputs = conferirInputs();
    await controlesCausais(inputs);
    let probe = false,
      texto = "";
    const cli = await comando(
      "/bin/bash",
      ["/repo/tests/servidor/atualizacao-integracao.sh", "--engine-fake"],
      {
        cwd: "/repo",
        registrar: false,
        aoStdout(b) {
          texto += b.toString();
          if (!probe && texto.split("\n").includes("ADAPTADOR_PROBE_PRONTO")) {
            probe = true;
            process.stdout.write("ADAPTADOR_PROBE_PRONTO\n");
          }
        },
      },
    );
    const recibo = { ...cli };
    delete recibo.bytes;
    process.stdout.write(
      "ATUALIZACAO_ENTRYPOINT=" + Buffer.from(JSON.stringify(recibo)).toString("base64") + "\n",
    );
    assert.equal(cli.erro, null);
    assert.equal(cli.sinal, null);
    assert.equal(cli.codigo, 0, Buffer.from(cli.stderr, "base64").toString());
    assert.equal(probe, true);
    const provas = cli.bytes
      .toString()
      .split("\n")
      .filter((n) => n.startsWith("ATUALIZACAO_PROVA="));
    assert.equal(provas.length, 1);
    const r = JSON.parse(Buffer.from(provas[0].slice("ATUALIZACAO_PROVA=".length), "base64"));
    assert.equal(r.inputsSha256, inputs.sha256);
    assert.equal(r.rodada, inputs.rodada);
    assert.equal(r.fase, "EngineFake-confinado");
    assert.equal(r.uid, 0);
    assert.equal(r.capEff, "0000000000000000");
    assert.equal(r.nnp, "1");
    assert.equal(r.instalacao.codigo, 0);
    assert.equal(r.atualizacao.codigo, 0);
    assert.equal(r.atualizacao.sinal, null);
    assert.equal(r.atualizacao.erro, null);
    assert.notEqual(r.A, r.B);
    assert.equal(r.estado.commit, r.B);
    assert.equal(r.httpSimulado, r.B + "\n");
    assert.equal(r.sentinelaSimulada, "preservado\n");
    assert.equal(r.dbAntes, r.dbDepois);
    assert.equal(r.proxyAntes, r.proxyDepois);
    assert.equal(r.volumeAntes, r.volumeDepois);
    assert.equal(r.cifraAgeReal, true);
    assert.equal(r.dumpListagemConcorrentes, true);
    assert.equal(r.pinAntesBuild, true);
    assert.equal(r.migradorDaImagem, true);
    assert.equal(r.reabertura.codigo, 0);
    assert.equal(r.operador.uid, 65534);
    assert.equal(r.operador.leituraNegada, true);
    assert.equal(r.operador.escritaNegada, true);
    assert.equal(r.operador.socketNegado, true);
    assert.equal(r.operador.versao, 2);
    assert.deepEqual(Object.keys(r.operador).sort(), [
      "escritaNegada",
      "fd9Ausente",
      "leituraNegada",
      "medicao",
      "socketNegado",
      "uid",
      "versao",
    ]);
    assert.equal(r.referenciaLock.rodada, inputs.rodada);
    assert.equal(r.referenciaLock.inputsSha256, inputs.sha256);
    assert.equal(conferirMedicaoAutoridade(r.operador.medicao, r.referenciaLock), true);
    assert.equal(r.operador.fd9Ausente, r.operador.medicao.fd9Ausente);
    assert.equal(r.operador.medicao.autoridadeAusente, true);
    assert.equal(r.operador.medicao.completa, true);
    assert.deepEqual(r.operador.medicao.encontrados, []);
    assert.equal(r.revogado, true);
    assert.equal(r.filhosAtivos, 0);
    assert.equal(r.backendRealExecutado, false);
    process.stdout.write(
      "ATUALIZACAO_VERTICAL=" +
        Buffer.from(
          JSON.stringify({
            rodada: r.rodada,
            inputsSha256: r.inputsSha256,
            A: r.A,
            B: r.B,
            aprovada: true,
          }),
        ).toString("base64") +
        "\n",
    );
  },
);
