// Confere entrada, isolamento e lifecycle do ensaio preview sem daemon na importação.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";

const raiz = path.resolve(import.meta.dirname, "../..");
const driver = await import("./privilegios-preview-real.mjs").catch((erro) => {
  if (erro.code !== "ERR_MODULE_NOT_FOUND") throw erro;
  return {};
});
test("recusa da intrusa exige erro nativo causal e término exato do psql", () => {
  const stderr = "psql:<stdin>:143: ERROR:  42501: permission denied for table intrusa\n";
  const valido = { status: 3, signal: null, stderr };
  driver.conferirRecusaIntrusa(valido);
  for (const ruim of [
    ...[0, 1, 2, 4, null, "3"].map((status) => ({ ...valido, status })),
    { ...valido, signal: "SIGTERM" },
    { ...valido, error: { code: "ETIMEDOUT" } },
    { ...valido, error: null },
    ...[
      stderr.replace("42501", "P0001"),
      stderr.replace("42501", "42P01"),
      stderr.replace("intrusa", "outra"),
      stderr.replace("intrusa", "intrusa_extra"),
      stderr.replace("ERROR", "WARNING"),
      stderr.replace("ERROR", "FATAL"),
      stderr.replace("ERROR", "PANIC"),
      stderr.replace("permission denied", "erro arbitrario"),
      stderr.replace("psql:<stdin>:143: ", ""),
      `DETAIL: ${stderr}`,
      stderr.replace("intrusa\n", "intrusa adicional\n"),
      "psql:<stdin>:217: ERROR:  P0001: Contrato de privilégios do preview não confirmado: intrusa\n",
    ].map((stderr) => ({ ...valido, stderr })),
  ])
    assert.throws(() => driver.conferirRecusaIntrusa(ruim));
});
test("bootstrap recusa isolamento ausente antes de initdb", () => {
  assert.equal(typeof driver.conferirIsolamento, "function", "barreira antes de initdb ausente");
  const fatos = {
    uid: 999,
    gid: 999,
    dockerenv: true,
    sockets: false,
    interfaces: ["lo"],
    rotas: "Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT\n",
    ipv6: "",
    status:
      "CapEff:\t0000000000000000\nCapPrm:\t0000000000000000\nCapBnd:\t0000000000000000\nNoNewPrivs:\t1\n",
    mounts: [
      { destino: "/", opcoes: ["ro"], tipo: "overlay" },
      { destino: "/app", opcoes: ["ro"], tipo: "ext4" },
      { destino: "/ensaio", opcoes: ["rw", "nosuid", "nodev", "noexec"], tipo: "tmpfs" },
      {
        destino: "/var/lib/postgresql/data",
        opcoes: ["rw", "nosuid", "nodev", "noexec"],
        tipo: "tmpfs",
      },
    ],
    diretorios: [
      { caminho: "/ensaio", uid: 999, gid: 999, modo: 448, entradas: [] },
      { caminho: "/var/lib/postgresql/data", uid: 999, gid: 999, modo: 448, entradas: [] },
    ],
  };
  driver.conferirIsolamento(fatos);
  for (const mutar of [
    (f) => {
      f.uid = 0;
    },
    (f) => {
      f.sockets = true;
    },
    (f) => {
      f.interfaces.push("eth0");
    },
    (f) => {
      f.status = f.status.replace("CapEff:\t0000000000000000", "CapEff:\t0000000000000001");
    },
    (f) => {
      f.status = f.status.replace("NoNewPrivs:\t1", "NoNewPrivs:\t0");
    },
    (f) => {
      f.mounts[0].opcoes = ["rw"];
    },
    (f) => {
      f.mounts[2].tipo = "ext4";
    },
    (f) => {
      f.diretorios[0].entradas.push("existente");
    },
  ]) {
    const ruim = structuredClone(fatos);
    mutar(ruim);
    assert.throws(() => driver.conferirIsolamento(ruim));
  }
});
const modulo = await import("./privilegios-preview-harness.mjs").catch((erro) => {
  if (erro.code !== "ERR_MODULE_NOT_FOUND") throw erro;
  return {};
});
test("receita preview fecha uid, rede, limites e tmpfs cobrindo VOLUME da base", () => {
  assert.equal(typeof modulo.receitaPreview, "function", "perfil isolado ausente");
  const r = modulo.receitaPreview({
    imagem: `sha256:${"a".repeat(64)}`,
    captura: "/captura",
    rodada: "d1733e49-e118-4fef-b743-47a8c6738d60",
    fase: "vertical",
    defaults: [],
  });
  assert.equal(r.usuario, "999:999");
  assert.deepEqual(r.cmd, [
    "node",
    "tests/servidor/privilegios-preview-real.mjs",
    "--fase=vertical",
  ]);
  for (const argumento of [
    "--read-only",
    "--cap-drop",
    "ALL",
    "--cpus",
    "--memory",
    "--pids-limit",
  ])
    assert.ok(r.args.includes(argumento));
  assert.equal(r.args[r.args.indexOf("--network") + 1], "none");
  assert.deepEqual(Object.keys(r.tmpfs).sort(), ["/ensaio", "/var/lib/postgresql/data"]);
  assert.equal(r.args.includes("--publish"), false);
  assert.equal(r.args.includes("--privileged"), false);
  assert.throws(() =>
    modulo.receitaPreview({
      imagem: "mutavel:latest",
      captura: "/captura",
      rodada: "x",
      fase: "vertical",
      defaults: [],
    }),
  );
});
test("entrada Bash delega ao perfil fechado sem chamar Docker", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "preview-entrada-"));
  try {
    const log = path.join(pasta, "chamadas");
    for (const [bin, codigo] of [
      ["node", 0],
      ["docker", 91],
    ]) {
      fs.writeFileSync(
        path.join(pasta, bin),
        `#!/bin/sh\nprintf '%s\\n' '${bin}' "$@" >> '${log}'\nexit ${codigo}\n`,
      );
      fs.chmodSync(path.join(pasta, bin), 0o700);
    }
    const r = spawnSync("/bin/bash", [path.join(raiz, "tests/servidor/privilegios-preview.sh")], {
      env: { PATH: `${pasta}:/usr/bin:/bin`, HOME: pasta },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.deepEqual(fs.readFileSync(log, "utf8").trim().split("\n"), [
      "node",
      path.join(raiz, "tests/servidor/privilegios-preview-harness.mjs"),
      "--executar",
    ]);
    assert.equal(r.status, 0);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

// Dublê explícito da fronteira Docker. IDs são alocados pelo produtor, não pelo argv consumidor.
function fixture() {
  const rodada = "d1733e49-e118-4fef-b743-47a8c6738d60";
  const id = randomBytes(32).toString("hex");
  const receita = modulo.receitaPreview({
    imagem: `sha256:${"a".repeat(64)}`,
    captura: "/captura",
    rodada,
    fase: "vertical",
    defaults: [],
  });
  receita.destinoColeta = "/coleta";
  receita.fontes = {};
  const h = (b) => createHash("sha256").update(b).digest("hex");
  const relatorios = {
    "isolamento.json": { fontes: {} },
    "readiness.json": { major: 17 },
    "casos.json": { rodada, fase: "vertical", casos: ["testemunha"] },
    "resultado.json": {
      rodada,
      fase: "vertical",
      estado: "aprovado",
      fontes: {},
      casos: ["testemunha"],
    },
    "comandos.json": [{ nome: "pg-stop", status: 0, sinal: null, erro: null }],
  };
  const arquivos = Object.entries(relatorios).map(([nome, valor]) => {
    const b = Buffer.from(JSON.stringify(valor));
    return { nome, sha256: h(b), base64: b.toString("base64") };
  });
  const corpo = Buffer.from(JSON.stringify({ rodada, fase: "vertical", arquivos }));
  const quadro = `PREVIEW_EVIDENCIAS_V1 ${h(corpo)} ${corpo.toString("base64")}\n`;
  const c = {
    Id: id,
    Image: `sha256:${"a".repeat(64)}`,
    Config: {
      User: "999:999",
      Hostname: `preview-${rodada}`,
      Domainname: "",
      Labels: {
        "frequenciapp.ensaio.perfil": "preview-pg17-v1",
        "frequenciapp.ensaio.rodada": rodada,
      },
      Env: [
        `HOSTNAME=preview-${rodada}`,
        "HOME=/ensaio",
        "TMPDIR=/ensaio",
        `PREVIEW_ENSAIO_RODADA=${rodada}`,
      ],
      Entrypoint: [],
      Cmd: ["node", "tests/servidor/privilegios-preview-real.mjs", "--fase=vertical"],
      WorkingDir: "/app",
      StopSignal: "SIGTERM",
      StopTimeout: 15,
    },
    HostConfig: {
      NetworkMode: "none",
      PortBindings: {},
      PublishAllPorts: false,
      ReadonlyRootfs: true,
      Privileged: false,
      CapDrop: ["ALL"],
      CapAdd: [],
      SecurityOpt: ["no-new-privileges:true"],
      NanoCpus: 1000000000,
      Memory: 805306368,
      MemorySwap: 805306368,
      PidsLimit: 128,
      IpcMode: "private",
      PidMode: "",
      UTSMode: "",
      UsernsMode: "",
      Tmpfs: {
        "/ensaio": "rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=512m",
        "/var/lib/postgresql/data": "rw,nosuid,nodev,noexec,uid=999,gid=999,mode=0700,size=16m",
      },
      LogConfig: { Type: "json-file", Config: { "max-size": "2m", "max-file": "2" } },
      AutoRemove: false,
    },
    Mounts: [{ Type: "bind", Source: "/captura", Destination: "/app", RW: false }],
    NetworkSettings: { Networks: { none: {} }, Ports: {} },
    State: {
      Status: "created",
      Running: false,
      ExitCode: 0,
      OOMKilled: false,
      Error: "",
      FinishedAt: "0001-01-01T00:00:00Z",
    },
  };
  const chamadas = [],
    registros = [];
  let removido = false;
  const f = {
    id,
    receita,
    c,
    chamadas,
    registros,
    relatorios,
    quadro,
    anexar: { status: 0, signal: null, stdout: quadro, stderr: "" },
    espera: null,
    inspecao: null,
  };
  f.cliente = async (args) => {
    chamadas.push([...args]);
    const ok = (stdout = "") => ({ status: 0, signal: null, stdout, stderr: "" });
    if (args[0] === "create") return ok(id + "\n");
    if (args[0] === "inspect") {
      assert.equal(args[1], id, "inspeção precisa do ID retornado por create");
      if (removido)
        return (
          f.ausencia ?? {
            status: 1,
            signal: null,
            stdout: "[]\n",
            stderr: `Error: No such object: ${id}`,
          }
        );
      if (f.inspecao) await f.inspecao();
      return ok(JSON.stringify([c]));
    }
    if (args[0] === "start") {
      assert.deepEqual(args, ["start", "-a", id]);
      c.State = {
        Status: "exited",
        Running: false,
        ExitCode: 0,
        OOMKilled: false,
        Error: "",
        FinishedAt: "2026-11-10T22:00:00Z",
      };
      return f.anexar;
    }
    if (args[0] === "wait") {
      assert.deepEqual(args, ["wait", id]);
      return f.espera ?? ok("0\n");
    }
    if (args[0] === "cp") {
      assert.deepEqual(args, ["cp", `${id}:/ensaio/evidencias`, "/coleta"]);
      return ok();
    }
    if (args[0] === "rm") {
      assert.deepEqual(args, ["rm", id]);
      removido = true;
      return ok(id);
    }
    throw new Error("operação fora do perfil");
  };
  f.rodar = (cancelado) =>
    modulo.executarCiclo({
      receita,
      cliente: f.cliente,
      registrar: (tipo, dado) => registros.push({ tipo, dado: structuredClone(dado) }),
      cancelado,
    });
  return f;
}
test("ciclo confirma attach, wait, término, coleta, remoção e ausência do ID opaco", async () => {
  const f = fixture();
  const r = await f.rodar();
  assert.equal(r.id, f.id);
  assert.equal(r.estado, "aprovado");
  assert.equal(r.ausente, true);
  const operacoes = f.chamadas.map((a) => a[0]);
  for (const op of ["start", "wait", "rm"])
    assert.equal(operacoes.filter((x) => x === op).length, 1);
  assert.equal(operacoes.includes("cp"), false);
  assert.ok(operacoes.indexOf("wait") < operacoes.indexOf("rm"));
  assert.equal(operacoes.at(-1), "inspect");
});
test("ausência local aceita caixa do daemon e recusa retorno ambíguo ou outro ID", async () => {
  const f = fixture();
  f.ausencia = {
    status: 1,
    signal: null,
    stdout: "[]\n",
    stderr: `error: no such object: ${f.id}\n`,
  };
  assert.equal((await f.rodar()).ausente, true);
  for (const mutar of [
    (a) => {
      a.status = 0;
    },
    (a) => {
      a.signal = "SIGTERM";
    },
    (a) => {
      a.error = { code: "EACCES" };
    },
    (a) => {
      a.stdout = "{}";
    },
    (a) => {
      a.stdout = "[{}]";
    },
    (a) => {
      a.stderr = `Error: No such object: ${randomBytes(32).toString("hex")}`;
    },
    (a) => {
      a.stderr += "\npermission denied";
    },
    (a) => {
      a.stderr += "\nCannot connect to the Docker daemon";
    },
  ]) {
    const ruim = fixture();
    ruim.ausencia = {
      status: 1,
      signal: null,
      stdout: "[]",
      stderr: `Error: No such object: ${ruim.id}`,
    };
    mutar(ruim.ausencia);
    await assert.rejects(ruim.rodar(), (e) => e.recibo.ausente === false);
  }
});
test("exportação enquadrada substitui cp e precede somente a remoção terminal", async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "preview-exportacao-"));
  const f = fixture();
  let fluxo = "";
  try {
    for (const [nome, valor] of Object.entries(f.relatorios).filter(([n]) => n !== "comandos.json"))
      fs.writeFileSync(path.join(pasta, nome), JSON.stringify(valor));
    fs.writeFileSync(
      path.join(pasta, "comando-1.json"),
      JSON.stringify({
        nome: "pg-stop",
        status: 0,
        sinal: null,
        erro: null,
        stdoutSha256: "a".repeat(64),
        stderrSha256: "b".repeat(64),
        stdout: "SENHA-NAO-EXPORTAR",
        stderr: "SENHA-NAO-EXPORTAR",
      }),
    );
    for (const nome of [
      "rollback-antes.json",
      "rollback-depois.json",
      "senha-postgres",
      "postgres.log",
    ])
      fs.writeFileSync(path.join(pasta, nome), "SENHA-NAO-EXPORTAR");
    await driver.exportarRelatorios(pasta, f.receita, {
      write: (s, callback) => {
        fluxo += s;
        callback();
      },
    });
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
  assert.equal(fs.existsSync(pasta), false);
  const preservado = modulo.lerExportacao(fluxo, f.receita, 0);
  assert.equal(JSON.stringify(preservado).includes("SENHA-NAO-EXPORTAR"), false);
  assert.deepEqual(Object.keys(preservado.relatorios).sort(), Object.keys(f.relatorios).sort());
  for (const mutar of [
    (q) => {
      q.rodada = "outra";
    },
    (q) => {
      q.fase = "restante";
    },
    (q) => {
      q.arquivos.pop();
    },
    (q) => {
      q.arquivos[0].nome = "../pgdata";
    },
    (q) => {
      q.arquivos[0].sha256 = "0".repeat(64);
    },
    (q) => {
      q.arquivos[0].base64 = Buffer.from("{}").toString("base64");
    },
  ]) {
    const q = JSON.parse(Buffer.from(fluxo.trim().split(" ")[2], "base64"));
    mutar(q);
    const b = Buffer.from(JSON.stringify(q));
    assert.throws(() =>
      modulo.lerExportacao(
        `PREVIEW_EVIDENCIAS_V1 ${createHash("sha256").update(b).digest("hex")} ${b.toString("base64")}\n`,
        f.receita,
        0,
      ),
    );
  }
  await f.rodar();
  assert.equal(
    f.chamadas.some((a) => a[0] === "cp"),
    false,
    "tmpfs não existe após PID1",
  );
  const exportado = f.registros.find((r) => r.tipo === "exportado");
  assert.deepEqual(exportado?.dado.relatorios, f.relatorios);
  const tipos = f.registros.map((r) => r.tipo);
  assert.ok(tipos.indexOf("wait") < tipos.indexOf("exportado"));
  assert.ok(tipos.indexOf("exportado") < tipos.indexOf("ausencia"));
  for (const mutar of [
    (s) => "",
    (s) => s.slice(0, -20),
    (s) => s + s,
    (s) => s.replace(/[a-f0-9]{64}/, "0".repeat(64)),
  ]) {
    const ruim = fixture();
    ruim.anexar.stdout = mutar(ruim.quadro);
    await assert.rejects(ruim.rodar(), (e) => e.recibo.id === ruim.id && !e.recibo.removido);
    assert.equal(
      ruim.chamadas.some((a) => ["cp", "rm"].includes(a[0])),
      false,
    );
  }
});
test("receita ou identidade divergente impede start, coleta e remoção", async () => {
  for (const mutar of [
    (c) => {
      c.Id = randomBytes(32).toString("hex");
    },
    (c) => {
      c.Config.Labels["frequenciapp.ensaio.rodada"] = "outra";
    },
    (c) => {
      c.Config.Env.push("HOME=/ensaio");
    },
    (c) => {
      c.Config.Env.push("DATABASE_URL=nao-autorizada");
    },
    (c) => {
      c.HostConfig.CapAdd = ["NET_ADMIN"];
    },
    (c) => {
      c.HostConfig.Tmpfs["/var/lib/postgresql/data"] = "rw";
    },
    (c) => {
      c.Mounts.push({ Type: "volume", Destination: "/extra", RW: true });
    },
  ]) {
    const f = fixture();
    mutar(f.c);
    await assert.rejects(
      f.rodar(),
      (e) => e.recibo.id === f.id && e.recibo.estado === "preservado",
    );
    assert.equal(
      f.chamadas.some((a) => ["start", "cp", "rm"].includes(a[0])),
      false,
    );
  }
});
test("cliente incerto ou wait divergente preserva ID sem coleta nem rm", async () => {
  for (const mutar of [
    (f) => {
      f.anexar.status = null;
      f.anexar.signal = "SIGTERM";
    },
    (f) => {
      f.anexar.error = { code: "ETIMEDOUT" };
    },
    (f) => {
      f.espera = { status: 0, signal: null, stdout: "7\n", stderr: "" };
    },
    (f) => {
      f.inspecao = () => {
        if (f.c.State.Status === "exited") f.c.State.Running = true;
      };
    },
  ]) {
    const f = fixture();
    mutar(f);
    await assert.rejects(f.rodar(), (e) => e.recibo.id === f.id);
    assert.equal(
      f.chamadas.some((a) => ["cp", "rm"].includes(a[0])),
      false,
    );
  }
});
test("cancelamento durante inspeção anterior à partida não envia start", async () => {
  const f = fixture();
  let cancelar = false,
    liberar;
  const entrou = new Promise((resolve) => {
    f.inspecao = async () => {
      resolve();
      await new Promise((r) => {
        liberar = r;
      });
    };
  });
  const pendente = f.rodar(() => cancelar);
  await entrou;
  cancelar = true;
  liberar();
  await assert.rejects(pendente, /Lifecycle preview incerto/);
  assert.equal(
    f.chamadas.some((a) => ["start", "cp", "rm"].includes(a[0])),
    false,
  );
});
test("entrada inválida recusa fase e destino antes de Docker ou trap", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "preview-invalida-"));
  try {
    const log = path.join(pasta, "docker-chamado");
    fs.writeFileSync(path.join(pasta, "docker"), `#!/bin/sh\nprintf x >> '${log}'\nexit 91\n`, {
      mode: 0o700,
    });
    for (const opcao of ["--fase=indevida", "--evidencias=relativa"]) {
      const r = spawnSync(
        process.execPath,
        [path.join(raiz, "tests/servidor/privilegios-preview-harness.mjs"), "--executar", opcao],
        { env: { PATH: pasta, HOME: pasta }, encoding: "utf8", timeout: 10000 },
      );
      assert.equal(r.error, undefined);
      assert.equal(r.signal, null);
      assert.equal(r.status, 1);
      assert.match(r.stderr, /FALHOU:/);
      assert.equal(fs.existsSync(log), false, "entrada inválida chamou Docker");
    }
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
test("importar harness e driver não chama Docker nem PostgreSQL", () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "preview-importacao-"));
  try {
    const log = path.join(pasta, "proibido");
    for (const bin of ["docker", "initdb", "psql", "pg_ctl"]) {
      fs.writeFileSync(path.join(pasta, bin), `#!/bin/sh\nprintf x >> '${log}'\nexit 93\n`);
      fs.chmodSync(path.join(pasta, bin), 0o700);
    }
    const script = `await import(${JSON.stringify(new URL("./privilegios-preview-harness.mjs", import.meta.url).href)}); await import(${JSON.stringify(new URL("./privilegios-preview-real.mjs", import.meta.url).href)});`;
    const r = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      env: { PATH: pasta, HOME: pasta },
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(r.error, undefined);
    assert.equal(r.signal, null);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.existsSync(log), false);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});
