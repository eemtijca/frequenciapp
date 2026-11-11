// Confere o ciclo de criação própria do ensaio URL sem clientes ou rede reais.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { createHash } from "node:crypto";

const modulo = await import("../../scripts/servidor/restauracao-url.mjs").catch((erro) => {
  if (erro.code !== "ERR_MODULE_NOT_FOUND") throw erro;
  return {};
});

function preparar(cenario = "positivo") {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "url-unitario-"));
  const dump = path.join(base, "dump");
  fs.writeFileSync(dump, "dump sintético íntegro", { mode: 0o600 });
  const ambiente = {
    PATH: process.env.PATH,
    ESTADO_DIR: path.join(base, "estado"),
    APP_DIR: base,
    BACKUP_RESTAURACAO_PERFIL: "postgres-direto",
    BACKUP_DATABASE_URL: "postgresql://operador:segredo@localhost:5432/destino",
    DATABASE_SCHEMA: "public",
  };
  const chamadas = [];
  let nome;
  let marcador;
  let criado = false;
  const identidade = (banco, oid) => ({
    banco,
    oid,
    usuario: "operador",
    dono: "operador",
    versao: 170011,
    marcador: banco === "destino" ? null : marcador,
    criadoPermitido: cenario !== "sem-permissao",
    endereco: "127.0.0.1",
    porta: 5432,
    inicio: "rodada-do-servidor",
  });
  const executar = async (chamada) => {
    chamadas.push(chamada);
    const sql = chamada.input || "";
    if (sql.includes("url:destino"))
      return { codigo: 0, sinal: null, stdout: JSON.stringify(identidade("destino", 11)) };
    if (sql.includes("url:criar")) {
      nome = sql.match(/CREATE DATABASE "([a-z0-9_]+)"/)[1];
      criado = true;
    }
    if (sql.includes("url:marcar")) marcador = sql.match(/IS '([a-f0-9]+)'/)[1];
    if (sql.includes("url:catalogo"))
      return { codigo: 0, sinal: null, stdout: JSON.stringify(identidade(nome, 22)) };
    if (sql.includes("url:conexao"))
      return {
        codigo: 0,
        sinal: null,
        stdout: JSON.stringify(
          identidade(cenario === "pooler" ? "destino" : nome, cenario === "pooler" ? 11 : 22),
        ),
      };
    if (sql.includes("url:validar"))
      return {
        codigo: 0,
        sinal: null,
        stdout: JSON.stringify({ migracoes: ["0001_teste"], tabelas: 2 }),
      };
    if (sql.includes("url:ausente")) return { codigo: 0, sinal: null, stdout: criado ? "1" : "0" };
    if (sql.includes("url:descartar")) criado = false;
    return { codigo: 0, sinal: null, stdout: "" };
  };
  return { base, dump, ambiente, executar, chamadas };
}

test("ensaio cria recurso aleatório, valida identidade e descarta só o recurso próprio", async () => {
  assert.equal(
    typeof modulo.ensaiarRestauracaoUrl,
    "function",
    "ensaio funcional URL ainda não implementado",
  );
  const ctx = preparar();
  try {
    const resultado = await modulo.ensaiarRestauracaoUrl(ctx);
    assert.equal(resultado.status, "sucesso");
    const journal = JSON.parse(fs.readFileSync(resultado.journal, "utf8"));
    assert.match(journal.bancoTemporario, /^freq_ensaio_[a-f0-9]{32}$/);
    assert.notEqual(journal.bancoTemporario, "destino");
    assert.equal(journal.destino.oid, 11);
    assert.equal(journal.temporario.oid, 22);
    assert.equal(journal.etapa, "descartado");
    assert.equal(journal.resultado, "sucesso");
    const restore = ctx.chamadas.filter((c) => c.programa === "pg_restore");
    assert.equal(restore.length, 1);
    assert.match(
      new URL(restore[0].env.PGDATABASE).pathname,
      new RegExp(`^/${journal.bancoTemporario}$`),
    );
    assert.ok(!JSON.stringify(journal).includes("segredo"));
    assert.equal(fs.statSync(resultado.journal).mode & 0o777, 0o600);
    assert.equal(fs.readFileSync(ctx.dump, "utf8"), "dump sintético íntegro");
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

test("role sem CREATEDB recusa antes da criação e mantém dump intacto", async () => {
  assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
  const ctx = preparar("sem-permissao");
  try {
    await assert.rejects(modulo.ensaiarRestauracaoUrl(ctx), /SEM_PERMISSAO_CREATEDB/);
    assert.equal(ctx.chamadas.length, 1);
    assert.ok(!ctx.chamadas.some((c) => /CREATE|DROP/.test(c.input || "")));
    assert.equal(fs.readFileSync(ctx.dump, "utf8"), "dump sintético íntegro");
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

for (const url of [
  "postgresql://operador@localhost:5432/destino",
  "postgresql://operador@127.0.0.2:5432/%64estino?application_name=alias",
]) {
  test(`URL externa não vira ensaio, inclusive mesma base e alias ${new URL(url).hostname}`, async () => {
    assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
    const ctx = preparar();
    ctx.ambiente.BACKUP_RESTAURACAO_URL_VALIDACAO = url;
    try {
      await assert.rejects(modulo.ensaiarRestauracaoUrl(ctx), /URL_EXTERNA_RECUSADA/);
      assert.equal(ctx.chamadas.length, 0);
      assert.equal(fs.existsSync(ctx.ambiente.ESTADO_DIR), false);
    } finally {
      fs.rmSync(ctx.base, { recursive: true, force: true });
    }
  });
}

test("pooler que ignora database não recebe restore nem descarte", async () => {
  assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
  const ctx = preparar("pooler");
  try {
    await assert.rejects(modulo.ensaiarRestauracaoUrl(ctx), /IDENTIDADE_DIVERGENTE/);
    assert.ok(ctx.chamadas.some((c) => c.input?.includes("url:criar")));
    assert.ok(
      !ctx.chamadas.some((c) => c.programa === "pg_restore" || c.input?.includes("url:descartar")),
    );
    const pasta = path.join(ctx.ambiente.ESTADO_DIR, "ensaios-url");
    const journal = JSON.parse(
      fs.readFileSync(path.join(pasta, fs.readdirSync(pasta)[0], "journal.json")),
    );
    assert.equal(journal.recursoPreservado, true);
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

for (const tipo of ["marcador", "oid", "dono"]) {
  test(`tamper de ${tipo} após restore preserva recurso e bloqueia descarte`, async () => {
    assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
    const ctx = preparar();
    let restaurado = false;
    const original = ctx.executar;
    ctx.executar = async (chamada) => {
      const resultado = await original(chamada);
      if (chamada.programa === "pg_restore") restaurado = true;
      if (restaurado && chamada.input?.includes("url:catalogo")) {
        const objeto = JSON.parse(resultado.stdout);
        objeto[tipo] = tipo === "oid" ? 99 : "adulterado";
        resultado.stdout = JSON.stringify(objeto);
      }
      return resultado;
    };
    try {
      await assert.rejects(
        modulo.ensaiarRestauracaoUrl(ctx),
        /IDENTIDADE_DIVERGENTE|PROPRIEDADE_DIVERGENTE/,
      );
      assert.equal(ctx.chamadas.filter((c) => c.programa === "pg_restore").length, 1);
      assert.ok(!ctx.chamadas.some((c) => c.input?.includes("url:descartar")));
      assert.equal(fs.readFileSync(ctx.dump, "utf8"), "dump sintético íntegro");
    } finally {
      fs.rmSync(ctx.base, { recursive: true, force: true });
    }
  });
}

test("falha de cliente guarda código e não tenta limpar ou recuperar", async () => {
  assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
  const ctx = preparar();
  const original = ctx.executar;
  ctx.executar = async (chamada) => {
    const resultado = await original(chamada);
    return chamada.programa === "pg_restore" ? { ...resultado, codigo: 71 } : resultado;
  };
  try {
    await assert.rejects(
      modulo.ensaiarRestauracaoUrl(ctx),
      (erro) => erro.codigo === 71 && /CLIENTE_FALHOU/.test(erro.message),
    );
    assert.equal(ctx.chamadas.filter((c) => c.programa === "pg_restore").length, 1);
    assert.ok(!ctx.chamadas.some((c) => c.input?.includes("url:descartar")));
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

test("sinal durante restore cancela o ciclo sem limpeza automática", async () => {
  assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
  const ctx = preparar();
  const controle = new AbortController();
  const original = ctx.executar;
  ctx.executar = async (chamada) => {
    const resultado = await original(chamada);
    if (chamada.programa === "pg_restore") controle.abort(143);
    return resultado;
  };
  try {
    await assert.rejects(
      modulo.ensaiarRestauracaoUrl({ ...ctx, signal: controle.signal }),
      (erro) => erro.codigo === 143,
    );
    assert.ok(!ctx.chamadas.some((c) => c.input?.includes("url:descartar")));
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

test("URI direta precisa chegar ao psql por --dbname, não somente pelo ambiente", async () => {
  assert.equal(typeof modulo.ensaiarRestauracaoUrl, "function");
  const ctx = preparar();
  try {
    await modulo.ensaiarRestauracaoUrl(ctx);
    const chamadas = ctx.chamadas.filter((chamada) => chamada.programa === "psql");
    assert.ok(chamadas.length > 0);
    for (const chamada of chamadas) {
      const posicao = chamada.args.indexOf("--dbname");
      assert.ok(posicao >= 0, "psql não expande URI em PGDATABASE sem parâmetro dbname explícito");
      assert.equal(chamada.args[posicao + 1], chamada.env.PGDATABASE);
    }
  } finally {
    fs.rmSync(ctx.base, { recursive: true, force: true });
  }
});

// Config integral capturada de image inspect dos dois IDs fixados, não recibo de contêiner.
// Somente Id/Config são projetados; nenhum State/HostConfig é fabricado.
const imagemDB = {
  Id: "sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994",
  Config: {
    ExposedPorts: { "5432/tcp": {} },
    Env: [
      "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
      "GOSU_VERSION=1.19",
      "LANG=en_US.utf8",
      "PG_MAJOR=17",
      "PG_VERSION=17.11-1.pgdg12+2",
      "PGDATA=/var/lib/postgresql/data",
    ],
    Entrypoint: ["docker-entrypoint.sh"],
    Cmd: ["postgres"],
    Volumes: { "/var/lib/postgresql/data": {} },
    StopSignal: "SIGINT",
  },
};
const imagemRunner = {
  Id: "sha256:9e18784ce1ab6414c110d0fe23efaa32d127a2d7cbdf4a231a57c7caf46ce4da",
  Config: {
    User: "999:999",
    ExposedPorts: { "5432/tcp": {} },
    Env: [...imagemDB.Config.Env, "NODE_VERSION=24.22.2", "HOME=/tmp", "TMPDIR=/tmp"],
    Cmd: ["node", "--test", "tests/servidor/origem-backup-cli.e2e.mjs"],
    Volumes: { "/var/lib/postgresql/data": {} },
    WorkingDir: "/app",
    Labels: {
      "frequenciapp.ensaio": "origem-backup-sintetico",
      "frequenciapp.ensaio.toolchain": "origem-v2",
    },
    StopSignal: "SIGINT",
    ArgsEscaped: true,
  },
};

test("provisionador URL pede DB UID999 cap0 NNP antes de qualquer criação real", (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "url-observador-"));
  fs.chmodSync(pasta, 0o700);
  t.diagnostic(`Observação privada preservada: ${pasta}`);
  const bin = path.join(pasta, "bin");
  fs.mkdirSync(bin, { mode: 0o700 });
  fs.writeFileSync(path.join(pasta, "imagens.json"), JSON.stringify([imagemDB, imagemRunner]), {
    mode: 0o600,
  });
  const falso = `#!${process.execPath}
import fs from 'node:fs';
const pasta=${JSON.stringify(pasta)};
const args=process.argv.slice(2);
fs.appendFileSync(pasta+'/chamadas.jsonl',JSON.stringify(args)+'\\n',{mode:0o600});
if(args[0]==='image' && args[1]==='inspect') {
 const imagens=JSON.parse(fs.readFileSync(pasta+'/imagens.json'));
 const imagem=imagens.find(i=>i.Id===args[2]);
 if(!imagem) throw Error('Imagem não capturada');
 console.log(JSON.stringify([imagem]));
} else if(args[0]==='create') {
 fs.writeFileSync(pasta+'/pedido.json',JSON.stringify(args),{mode:0o600});
 console.error('OBSERVADOR_SEM_DAEMON');
 process.exitCode=73;
} else {throw Error('Operação Docker não autorizada pelo observador');}
`;
  fs.writeFileSync(path.join(bin, "docker"), falso, { mode: 0o700 });
  const entrada = fileURLToPath(new URL("./restauracao-url-harness.mjs", import.meta.url));
  const r = spawnSync(process.execPath, [entrada, "--executar"], {
    env: {
      PATH: bin,
      HOME: pasta,
      TMPDIR: pasta,
      URL_OBSERVADOR: pasta,
      RESTAURACAO_URL_DB_IMAGE: imagemDB.Id,
      RESTAURACAO_URL_RUNNER_IMAGE: imagemRunner.Id,
    },
    encoding: "utf8",
    timeout: 15000,
  });
  fs.writeFileSync(path.join(pasta, "launcher.log"), r.stdout + r.stderr, { mode: 0o600 });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 1, "observador deve parar o launcher na primeira criação, sem daemon");
  const chamadas = fs
    .readFileSync(path.join(pasta, "chamadas.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map(JSON.parse);
  assert.equal(chamadas.filter((c) => c[0] === "create").length, 1);
  assert.ok(chamadas.every((c) => c[0] === "image" || c[0] === "create"));
  const a = JSON.parse(fs.readFileSync(path.join(pasta, "pedido.json")));
  const valor = (flag) => (a.includes(flag) ? a[a.indexOf(flag) + 1] : null);
  assert.deepEqual(
    {
      usuario: valor("--user"),
      capacidades: valor("--cap-drop"),
      seguranca: valor("--security-opt"),
      readonly: a.includes("--read-only"),
      rede: valor("--network"),
      entrypoint: valor("--entrypoint"),
      tmpfs: a.flatMap((v, i) => (v === "--tmpfs" ? [a[i + 1]] : [])).sort(),
    },
    {
      usuario: "999:999",
      capacidades: "ALL",
      seguranca: "no-new-privileges:true",
      readonly: true,
      rede: "none",
      entrypoint: "/bin/bash",
      tmpfs: [
        "/tmp:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=67108864",
        "/var/lib/postgresql/data:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=268435456",
        "/var/run/postgresql:rw,nosuid,nodev,uid=999,gid=999,mode=0700,size=16777216",
      ],
    },
    "URL_PROVISIONAMENTO_SPEC_CAP0",
  );
  assert.ok(
    !a.includes("postgres") && !a.some((s) => /initdb|pg_ctl/.test(s)),
    "criação não inicia bootstrap",
  );
});

test("guarda física URL aceita só o alias finito e o tmpfs canônico único", (t) => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "url-guarda-"));
  fs.chmodSync(pasta, 0o700);
  t.diagnostic(`Prova Shell privada preservada: ${pasta}`);
  const fonte = fs.readFileSync(new URL("./restauracao-url-harness.mjs", import.meta.url), "utf8");
  // Instrumentação exclusiva do teste: avalia a função interna sem executar a CLI.
  // O fragmento real usa readlink/awk/Bash reais; só mountinfo recebe dados controlados.
  const recorte = (inicio, fim) => {
    assert.equal(fonte.split(inicio).length, 2);
    assert.equal(fonte.split(fim).length, 2);
    return fonte.slice(fonte.indexOf(inicio), fonte.indexOf(fim));
  };
  const shell = runInNewContext(
    recorte("const tmpfsDB = {", "const envMapa =") +
      recorte("function probe(tipo, vazio) {", "\ntry {") +
      '\nprobe("db", true);',
  );
  const linhas = shell.split("\n");
  const recusar = linhas.filter((l) => l.startsWith("recusar()"));
  const guarda = linhas.filter(
    (l) =>
      l.includes("readlink -f /var/run/postgresql") ||
      (l.startsWith("awk ") && l.includes('$5=="/run/postgresql"')),
  );
  assert.equal(recusar.length, 1);
  assert.equal(guarda.length, 2);
  assert.equal(fs.realpathSync("/var/run/postgresql"), "/run/postgresql");
  const indevido = path.join(pasta, "indevido");
  const alias = path.join(pasta, "alias");
  fs.mkdirSync(indevido, { mode: 0o700 });
  fs.symlinkSync(indevido, alias);
  const montagem =
    "91 20 0:51 / /run/postgresql rw,nosuid,nodev,relatime - tmpfs tmpfs rw,uid=999,gid=999\n";
  for (const [nome, mountinfo, caminho, codigo, motivo] of [
    ["alias-valido", montagem, "/var/run/postgresql", 0, ""],
    ["canonico-indevido", montagem, alias, 78, "URL_GUARDA_TMPFS_CAMINHO\n"],
    ["mount-ausente", "", "/var/run/postgresql", 78, "URL_GUARDA_TMPFS_MONTAGEM\n"],
    [
      "mount-duplicado",
      montagem + montagem,
      "/var/run/postgresql",
      78,
      "URL_GUARDA_TMPFS_MONTAGEM\n",
    ],
    [
      "tipo-indevido",
      montagem.replace(" - tmpfs ", " - ext4 "),
      "/var/run/postgresql",
      78,
      "URL_GUARDA_TMPFS_MONTAGEM\n",
    ],
    [
      "sem-nodev",
      montagem.replace(",nodev", ""),
      "/var/run/postgresql",
      78,
      "URL_GUARDA_TMPFS_MONTAGEM\n",
    ],
    [
      "sem-nosuid",
      montagem.replace(",nosuid", ""),
      "/var/run/postgresql",
      78,
      "URL_GUARDA_TMPFS_MONTAGEM\n",
    ],
  ]) {
    const arquivo = path.join(pasta, `${nome}.mountinfo`);
    fs.writeFileSync(arquivo, mountinfo, { mode: 0o600 });
    const input =
      "set -eu\n" +
      recusar[0] +
      "\n" +
      guarda
        .join("\n")
        .replace("readlink -f /var/run/postgresql", `readlink -f '${caminho}'`)
        .replace("/proc/self/mountinfo", `'${arquivo}'`) +
      "\n";
    fs.writeFileSync(path.join(pasta, `${nome}.sh`), input, { mode: 0o600 });
    const r = spawnSync("bash", ["-s"], {
      input,
      env: { PATH: process.env.PATH, LC_ALL: "C" },
      encoding: "utf8",
      timeout: 5000,
    });
    const hash = (dados) =>
      createHash("sha256")
        .update(dados || "")
        .digest("hex");
    const recibo = {
      nome,
      codigo: r.status,
      sinal: r.signal,
      erro: r.error?.code || null,
      shellSha256: hash(input),
      stdoutSha256: hash(r.stdout),
      stderrSha256: hash(r.stderr),
    };
    fs.writeFileSync(path.join(pasta, `${nome}.json`), JSON.stringify(recibo) + "\n", {
      mode: 0o600,
    });
    fs.writeFileSync(path.join(pasta, `${nome}.stdout`), r.stdout || "", { mode: 0o600 });
    fs.writeFileSync(path.join(pasta, `${nome}.stderr`), r.stderr || "", { mode: 0o600 });
    t.diagnostic(JSON.stringify(recibo));
    assert.equal(r.error, undefined, nome);
    assert.equal(r.signal, null, nome);
    assert.equal(r.status, codigo, nome);
    assert.equal(r.stderr, motivo, nome);
    assert.equal(r.stdout, "", nome);
  }
});

test("readiness URL preserva o IPv4 /32 capturado e recusa endereço ou máscara divergentes", () => {
  const fonte = fs.readFileSync(new URL("./restauracao-url-harness.mjs", import.meta.url), "utf8");
  const inicio = '  assert.equal(identidade.banco, "postgres");';
  const fim = '  gravar("identidade.json",';
  assert.equal(fonte.split(inicio).length, 2);
  assert.equal(fonte.split(fim).length, 2);
  // Exercita somente o observador real, sem importar a CLI ou chamar Docker/SQL.
  const guarda = fonte.slice(fonte.indexOf(inicio), fonte.indexOf(fim));
  // Payload PostgreSQL 17.11; SHA-256 do bruto preservado no recibo privado:
  // c893333943c124a647726387c89bea31dd29e5fe21225e6853cbb1b93a783df6.
  const captura = {
    banco: "postgres",
    usuario: "sintetico",
    versao: 170011,
    endereco: "127.0.0.1/32",
    porta: 5432,
    sistema: "7706699786352754744",
    inicio: "2026-11-11 00:11:12.864335+00",
    oid: 5,
    bases: "postgres",
    tabelas: 0,
    roles: 1,
  };
  const conferir = (identidade) => runInNewContext(guarda, { assert, identidade });
  const intacta = structuredClone(captura);
  assert.doesNotThrow(() => conferir(captura));
  assert.deepEqual(captura, intacta, "observador não deve normalizar o payload");
  for (const endereco of [
    "127.0.0.1",
    "127.0.0.1/8",
    "127.0.0.1/24",
    "127.0.0.1/032",
    "127.0.0.2/32",
    "0.0.0.0/32",
    "192.0.2.1/32",
    "::1/128",
    "127.0.0.1/32 ",
  ]) {
    assert.throws(() => conferir({ ...captura, endereco }), { code: "ERR_ASSERTION" }, endereco);
  }
  for (const [campo, valor] of [
    ["banco", "outro"],
    ["usuario", "outro"],
    ["versao", 160011],
    ["versao", 180000],
    ["porta", 5433],
    ["bases", "outra,postgres"],
    ["tabelas", 1],
    ["roles", 2],
    ["sistema", "invalido"],
  ]) {
    assert.throws(() => conferir({ ...captura, [campo]: valor }), { code: "ERR_ASSERTION" }, campo);
  }
});

// INICIO_TESTE_COLETA_URL
function verificarColetaUrlFechada() {
  const fonte = fs.readFileSync(new URL("./restauracao-url-harness.mjs", import.meta.url), "utf8");
  const inicio = "// INICIO_COLETA_URL";
  const fim = "// FIM_COLETA_URL";
  const hash = (b) => createHash("sha256").update(b).digest("hex");
  const api = fonte.includes(inicio)
    ? runInNewContext(
        fonte.slice(fonte.indexOf(inicio) + inicio.length, fonte.indexOf(fim)) +
          "\n({ receitaColetaUrl, validarColetaUrl, coletarArtefatosUrl });",
        { assert, fs, path, Buffer, hash },
      )
    : {};
  assert.equal(typeof api.coletarArtefatosUrl, "function", "COLETA_TMPFS_FECHADA_AUSENTE");
  const registro = (nome, dados = Buffer.from([0, 255, 10, 195, 169]), tipo = "F", extra = {}) => ({
    nome,
    dados,
    tipo,
    uid: 999,
    gid: 999,
    modo: tipo === "F" ? "600" : "700",
    ...extra,
  });
  const codificar = (itens) =>
    Buffer.concat([
      Buffer.from("URLCOLETA1\n"),
      ...itens.flatMap((r) => [
        Buffer.from(
          `${r.tipo}\t${r.uid}\t${r.gid}\t${r.modo}\t${r.dados.length}\t${hash(r.dados)}\t${r.nome}\n`,
        ),
        r.dados,
      ]),
      Buffer.from("FIM\n"),
    ]);
  const arquivos = ["initdb.log", "pg-ctl.log", "postgres.log"].map((n) => registro(n));
  const bruto = codificar(arquivos);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "url-coleta-"));
  try {
    const chamadas = [];
    const id = "a".repeat(64);
    const executar = (args) => {
      chamadas.push(args);
      return { stdout: bruto, stderr: Buffer.alloc(0), status: 0, signal: null };
    };
    const destino = path.join(pasta, "valida");
    const recibo = api.coletarArtefatosUrl("db", id, destino, executar);
    assert.equal(chamadas.length, 1);
    assert.deepEqual(Array.from(chamadas[0].slice(0, 5)), [
      "exec",
      "--user",
      "999:999",
      id,
      "bash",
    ]);
    assert.equal(chamadas[0][6], api.receitaColetaUrl("db"));
    assert.equal(recibo.stdoutSha256, hash(bruto));
    assert.equal(recibo.arquivos.length, 3);
    assert.equal(fs.statSync(destino).mode & 0o777, 0o700);
    for (const r of arquivos) {
      assert.deepEqual(fs.readFileSync(path.join(destino, r.nome)), r.dados);
      assert.equal(fs.statSync(path.join(destino, r.nome)).mode & 0o777, 0o600);
    }
    assert.throws(() => api.coletarArtefatosUrl("db", id, destino, executar), /EEXIST/);
    const alterado = Buffer.from(bruto);
    alterado[alterado.indexOf(arquivos[0].dados)] ^= 1;
    const casos = [
      ["hash", alterado],
      ["truncado", bruto.subarray(0, bruto.length - 1)],
      ["extra", codificar([...arquivos, registro("dump")])],
      ["duplicado", codificar([...arquivos, arquivos[0]])],
      ["traversal", codificar([registro("../postgres.log"), ...arquivos.slice(1)])],
      ["absoluto", codificar([registro("/tmp/initdb.log"), ...arquivos.slice(1)])],
      [
        "uid",
        codificar([registro("initdb.log", undefined, "F", { uid: 0 }), ...arquivos.slice(1)]),
      ],
      [
        "gid",
        codificar([registro("initdb.log", undefined, "F", { gid: 0 }), ...arquivos.slice(1)]),
      ],
      [
        "modo",
        codificar([registro("initdb.log", undefined, "F", { modo: "666" }), ...arquivos.slice(1)]),
      ],
      ["link", codificar([registro("initdb.log", undefined, "L"), ...arquivos.slice(1)])],
      ["grande", codificar([registro("initdb.log", Buffer.alloc(1048577)), ...arquivos.slice(1)])],
      ["canal", Buffer.alloc(8 * 1048576 + 1)],
      ["ausente", codificar(arquivos.slice(1))],
      ["sobras", Buffer.concat([bruto, Buffer.from("x")])],
      ["contagem", codificar(Array.from({ length: 129 }, (_, i) => registro(`extra${i}`)))],
    ];
    for (const [nome, dados] of casos) {
      const alvo = path.join(pasta, nome);
      assert.throws(
        () =>
          api.coletarArtefatosUrl("db", id, alvo, () => ({
            stdout: dados,
            stderr: Buffer.alloc(0),
            status: 0,
            signal: null,
          })),
        /COLETA_URL_/,
      );
      assert.equal(fs.existsSync(alvo), false, `recusa ${nome} deve anteceder gravação`);
    }
    for (const mudanca of [
      { status: 1 },
      { signal: "SIGTERM" },
      { error: new Error("cliente") },
      { stderr: Buffer.from("erro") },
    ]) {
      const alvo = path.join(pasta, `cliente-${chamadas.length}`);
      assert.throws(
        () =>
          api.coletarArtefatosUrl("db", id, alvo, () => ({
            stdout: bruto,
            stderr: Buffer.alloc(0),
            status: 0,
            signal: null,
            ...mudanca,
          })),
        /COLETA_URL_/,
      );
      assert.equal(fs.existsSync(alvo), false);
    }
    const cenarios = [
      "positivo",
      "mesma-base",
      "alias",
      "checksum",
      "sem-permissao",
      "erro-destino",
    ];
    const d = (n) => registro(n, Buffer.alloc(0), "D", { uid: 1000, gid: 1000 });
    const f = (n) => registro(n, Buffer.from("{}\n"), "F", { uid: 1000, gid: 1000 });
    const runner = [
      d("resultado-url"),
      ...["identidade.json", "resumo.json", "execucoes.json"].map((n) => f(`resultado-url/${n}`)),
      d("resultado-url/auditoria"),
      ...cenarios.flatMap((n) => [
        d(`resultado-url/auditoria/${n}`),
        f(`resultado-url/auditoria/${n}/execucao.log`),
      ]),
    ];
    const runnerBruto = codificar(runner);
    assert.equal(api.validarColetaUrl("runner", runnerBruto).length, runner.length);
    const caminhos = runner.concat(
      d("resultado-url/auditoria/positivo/estado"),
      d("resultado-url/auditoria/positivo/estado/ensaios-url"),
    );
    const muitos = caminhos.concat(
      Array.from({ length: 129 - caminhos.length }, (_, i) =>
        d(
          `resultado-url/auditoria/positivo/estado/ensaios-url/rodada-${String(i).padStart(6, "0")}`,
        ),
      ),
    );
    assert.throws(() => api.validarColetaUrl("runner", codificar(muitos)), /COLETA_URL_CONTAGEM/);
    const totalGrande = runner.map((r) =>
      r.nome.endsWith("/execucao.log") ? { ...r, dados: Buffer.alloc(1048576) } : r,
    );
    assert.throws(() => api.validarColetaUrl("runner", codificar(totalGrande)), /COLETA_URL_TOTAL/);
    assert.throws(
      () => api.validarColetaUrl("runner", codificar([...runner, f("resultado-url/segredo")])),
      /COLETA_URL_CAMINHO/,
    );
    assert.throws(() => api.receitaColetaUrl("generico"), /COLETA_URL_PERFIL/);
    assert.throws(
      () => api.coletarArtefatosUrl("db", "nome", path.join(pasta, "id"), executar),
      /COLETA_URL_ID/,
    );
    assert.match(api.receitaColetaUrl("runner"), /resultado-url/);
    assert.ok(!fonte.includes('["cp",'));
    return { positivoBinario: 1, positivoRunner: 1, recusas: casos.length + 9 };
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
}
// FIM_TESTE_COLETA_URL

test(
  "coleta URL de tmpfs preserva bytes e recusa conteúdo fora dos perfis fechados",
  verificarColetaUrlFechada,
);

export { preparar, modulo };
