// Exercita o checksum da restauração real com arquivos e clientes sintéticos.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const fontes = "/repo";
const arquivosFonte = [
  "scripts/servidor/restaurar.sh",
  "scripts/servidor/restauracao-url.mjs",
  "tests/servidor/restauracao-url-harness.mjs",
  "tests/servidor/restauracao-url-real.mjs",
  "scripts/servidor/comum.sh",
  "scripts/servidor/validar-banco.mjs",
  "src/infra/schema-postgres.mjs",
  "tests/servidor/restauracao-seguranca.test.mjs",
  "tests/servidor/restauracao-url.sh",
  "tests/servidor/executar.sh",
];

// Não basta uma flag de aceite: recusa o ensaio antes de criar fixtures ou executar Bash
// se o contêiner não apresentar os limites de rede, montagem e privilégios esperados.
function exigirIsolamento() {
  assert.ok(fs.existsSync("/.dockerenv"), "execute exclusivamente em contêiner Docker isolado");
  assert.notEqual(process.getuid?.(), 0, "o processo não pode ser root");
  const status = fs.readFileSync("/proc/self/status", "utf8");
  assert.match(status, /^CapEff:\s*0+\s*$/m, "capacidades devem estar vazias");
  assert.match(status, /^NoNewPrivs:\s*1\s*$/m, "exige no-new-privileges");
  assert.deepEqual(fs.readdirSync("/sys/class/net").sort(), ["lo"], "exige rede none");
  assert.equal(process.env.TMPDIR, "/tmp", "TMPDIR deve ser o tmpfs privado /tmp");

  const montagens = fs
    .readFileSync("/proc/self/mountinfo", "utf8")
    .trim()
    .split("\n")
    .map((linha) => {
      const [antes, depois] = linha.split(" - ");
      const campos = antes.split(" ");
      return {
        origem: campos[3],
        destino: campos[4].replace(/\\([0-7]{3})/g, (_, octal) =>
          String.fromCharCode(parseInt(octal, 8)),
        ),
        opcoes: campos[5].split(","),
        tipo: depois.split(" ")[0],
      };
    });
  const montagem = (destino) => {
    const entradas = montagens.filter((item) => item.destino === destino);
    assert.equal(entradas.length, 1, `montagem ausente ou ambígua: ${destino}`);
    return entradas[0];
  };
  assert.ok(montagem("/").opcoes.includes("ro"), "raiz deve ser somente leitura");
  assert.equal(montagem("/tmp").tipo, "tmpfs", "/tmp deve ser tmpfs");
  assert.ok(montagem("/tmp").opcoes.includes("rw"), "/tmp deve ser gravável");
  assert.ok(montagem(fontes).opcoes.includes("ro"), "/repo deve ser somente leitura");
  for (const nome of arquivosFonte) {
    const arquivo = path.join(fontes, nome);
    assert.ok(fs.lstatSync(arquivo).isFile(), `fonte deve ser arquivo regular: ${nome}`);
  }
  const permitidas = new Set([
    "/",
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
    fontes,
  ]);
  const init = montagens.filter((item) => item.destino === "/usr/sbin/docker-init");
  if (init.length > 0) {
    assert.equal(init.length, 1, "montagem do init deve ser única");
    const item = init[0];
    assert.match(item.origem, /^\/(?:[^/]+\/)*docker-init$/);
    assert.ok(["ext4", "xfs", "overlay"].includes(item.tipo), "tipo do init não autorizado");
    assert.ok(item.opcoes.includes("ro") && !item.opcoes.includes("rw"), "init deve ser readonly");
    const stat = fs.statSync(item.destino);
    assert.ok(
      stat.isFile() && stat.uid === 0 && (stat.mode & 0o022) === 0 && (stat.mode & 0o111) !== 0,
    );
    const bytes = fs.readFileSync(item.destino);
    assert.ok(bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])));
    assert.ok(bytes.equals(fs.readFileSync("/proc/1/exe")), "init diverge do executável do PID 1");
    permitidas.add(item.destino);
  }
  for (const item of montagens) {
    assert.ok(permitidas.has(item.destino), `montagem não autorizada: ${item.destino}`);
  }
  assert.ok(!fs.existsSync("/var/run/docker.sock"), "socket Docker não pode estar acessível");
}

exigirIsolamento();

const hash = (conteudo) => createHash("sha256").update(conteudo).digest("hex");
const gravar = (arquivo, conteudo) => fs.writeFileSync(arquivo, conteudo, { mode: 0o600 });
const comandos = [
  "bash",
  "basename",
  "cat",
  "chmod",
  "cp",
  "cut",
  "date",
  "dirname",
  "flock",
  "id",
  "mkdir",
  "mktemp",
  "mv",
  "rm",
  "sha256sum",
  "stat",
  "wc",
];
const clientes = [
  "age",
  "psql",
  "pg_restore",
  "docker",
  "curl",
  "gpg",
  "gpgconf",
  "createdb",
  "dropdb",
];

function preparar() {
  const tmp = fs.mkdtempSync("/tmp/restauracao-sintetica-");
  const bin = path.join(tmp, "bin");
  const app = path.join(tmp, "app");
  const scripts = path.join(app, "scripts/servidor");
  const infra = path.join(app, "src/infra");
  const dados = path.join(tmp, "dados");
  for (const dir of [bin, scripts, infra, dados])
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  for (const nome of ["restaurar.sh", "restauracao-url.mjs", "comum.sh", "validar-banco.mjs"]) {
    fs.copyFileSync(path.join(fontes, "scripts/servidor", nome), path.join(scripts, nome));
  }
  fs.copyFileSync(
    path.join(fontes, "src/infra/schema-postgres.mjs"),
    path.join(infra, "schema-postgres.mjs"),
  );
  for (const nome of comandos) {
    const alvo = `/usr/bin/${nome}`;
    assert.ok(fs.existsSync(alvo), `utilitário ausente: ${alvo}`);
    fs.symlinkSync(alvo, path.join(bin, nome));
  }
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  const testemunhas = path.join(tmp, "testemunhas");
  for (const nome of clientes) {
    const arquivo = path.join(bin, nome);
    const codigo = nome === "age" ? 73 : 74;
    gravar(
      arquivo,
      `#!/bin/sh\nprintf '%s\\n' '${nome}' >> "$TESTEMUNHAS"\nprintf '%s\\n' 'DUBLE_${nome}_STATUS_${codigo}' >&2\nexit ${codigo}\n`,
    );
    fs.chmodSync(arquivo, 0o700);
  }
  const chave = path.join(tmp, "chave-falsa");
  gravar(chave, "chave sintética sem conteúdo real\n");
  const env = {
    PATH: bin,
    HOME: tmp,
    TMPDIR: tmp,
    LC_ALL: "C",
    APP_DIR: app,
    APP_ENV_FILE: path.join(tmp, "app.env"),
    OPS_ENV_FILE: path.join(tmp, "ops.env"),
    ESTADO_DIR: path.join(tmp, "estado"),
    LOG_DIR: path.join(tmp, "log"),
    BACKUP_DIR: path.join(tmp, "backup"),
    SERVIDOR_CONFIG_DIR: path.join(tmp, "config"),
    SERVIDOR_LOCK_DIR: path.join(tmp, "locks"),
    SERVIDOR_AMBIENTE_INJETADO: "true",
    BACKUP_MODO: "url",
    BACKUP_DATABASE_URL: "postgresql://sintetico@127.0.0.1:1/sintetico",
    BACKUP_AGE_CHAVE_PRIVADA: chave,
    TESTEMUNHAS: testemunhas,
  };
  return { tmp, dados, scripts, testemunhas, env };
}

function executar(cenario) {
  const ctx = preparar();
  try {
    const original = "conteúdo A sintético e íntegro\n";
    const adulterado = "conteúdo A sintético adulterado\n";
    const outro = "conteúdo B sintético distinto\n";
    const arquivo = path.join(ctx.dados, "a.dump.age");
    gravar(arquivo, cenario.adulterar ? adulterado : original);
    gravar(path.join(ctx.dados, "b.dump.age"), outro);
    const alvoSidecar = cenario.sidecarB ? "b.dump.age" : "a.dump.age";
    const valorSidecar = cenario.sidecarB ? hash(outro) : hash(original);
    gravar(`${arquivo}.sha256`, `${valorSidecar}  ${alvoSidecar}\n`);
    const argumentos = [
      path.join(ctx.scripts, "restaurar.sh"),
      "--arquivo",
      arquivo,
      "--confirmar",
      "--sem-copia",
      "--sem-validacao",
    ];
    if (cenario.checksumErrado) argumentos.push("--checksum", hash("checksum incorreto sintético"));
    const resultado = spawnSync("/bin/bash", argumentos, {
      env: ctx.env,
      cwd: ctx.dados,
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chamadas = fs.existsSync(ctx.testemunhas)
      ? fs.readFileSync(ctx.testemunhas, "utf8").trim().split("\n")
      : [];
    assert.equal(resultado.error, undefined, `falha ao executar: ${resultado.error}`);
    assert.equal(resultado.signal, null, `processo encerrado por sinal: ${resultado.signal}`);
    assert.equal(resultado.status, 1, resultado.stdout + resultado.stderr);
    assert.deepEqual(
      chamadas.filter((nome) => nome !== "age"),
      [],
      "nenhum cliente externo deve ser invocado",
    );
    if (cenario.atingeAge) {
      assert.deepEqual(
        chamadas,
        ["age"],
        `arquivo íntegro deve chegar ao dublê age uma única vez: ${resultado.stdout}${resultado.stderr}`,
      );
      assert.match(resultado.stderr, /DUBLE_age_STATUS_73/);
      assert.match(resultado.stderr, /Não foi possível decifrar o dump com age/);
    } else {
      assert.deepEqual(chamadas, [], "checksum inválido deve impedir até a tentativa de decifrar");
      assert.doesNotMatch(resultado.stderr, /DUBLE_age_STATUS_73/);
      assert.match(resultado.stderr, /checksum/i, "falha deve identificar o checksum");
    }
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
}

test("arquivo A íntegro e sidecar A alcançam o age falso", () => executar({ atingeAge: true }));
test("arquivo A adulterado com sidecar A falha antes de age", () => executar({ adulterar: true }));
test("arquivo A adulterado não aceita sidecar que confere apenas B", () =>
  executar({ adulterar: true, sidecarB: true }));
test("checksum explícito errado não é ignorado quando sidecar A existe", () =>
  executar({ checksumErrado: true }));

test("alteração após hash não muda bytes entregues à decifra", () => {
  const ctx = preparar();
  try {
    const arquivo = path.join(ctx.dados, "entrada com espaço.dump.age");
    const original = "cifrado íntegro sintético\n";
    gravar(arquivo, original);
    gravar(`${arquivo}.sha256`, `${hash(original)}  ${path.basename(arquivo)}\n`);
    ctx.env.ARQUIVO_ORIGEM = arquivo;
    ctx.env.OBSERVADO = path.join(ctx.tmp, "observado");
    ctx.env.MARCADOR = path.join(ctx.tmp, "alterado");
    const sha = path.join(ctx.env.PATH, "sha256sum");
    fs.unlinkSync(sha);
    gravar(
      sha,
      `#!/bin/sh\n/usr/bin/sha256sum "$@"\ns=$?\nif [ ! -e "$MARCADOR" ]; then printf adulterado > "$ARQUIVO_ORIGEM"; : > "$MARCADOR"; fi\nexit "$s"\n`,
    );
    fs.chmodSync(sha, 0o700);
    const age = path.join(ctx.env.PATH, "age");
    gravar(age, `#!/bin/sh\ncat "$6" > "$OBSERVADO"\nprintf 'DECIFRA_TESTE\\n' >&2\nexit 73\n`);
    fs.chmodSync(age, 0o700);
    const resultado = spawnSync(
      "/bin/bash",
      [
        path.join(ctx.scripts, "restaurar.sh"),
        "--arquivo",
        arquivo,
        "--confirmar",
        "--sem-copia",
        "--sem-validacao",
      ],
      { env: ctx.env, cwd: ctx.dados, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 1, resultado.stdout + resultado.stderr);
    assert.match(resultado.stderr, /DECIFRA_TESTE/);
    assert.equal(fs.readFileSync(arquivo, "utf8"), "adulterado", "a troca deve ter ocorrido");
    assert.equal(
      fs.readFileSync(ctx.env.OBSERVADO, "utf8"),
      original,
      "decifra deve consumir os bytes verificados",
    );
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

for (const tipo of ["gpg", "claro"]) {
  test(`captura verificada também alimenta ${tipo} após alteração`, () => {
    const ctx = preparar();
    try {
      const arquivo = path.join(ctx.dados, tipo === "gpg" ? "entrada.gpg" : "entrada.dump");
      const original = "bytes originais sintéticos\n";
      gravar(arquivo, original);
      gravar(`${arquivo}.sha256`, `${hash(original)}  ${path.basename(arquivo)}\n`);
      Object.assign(ctx.env, {
        ARQUIVO_ORIGEM: arquivo,
        OBSERVADO: path.join(ctx.tmp, "observado"),
        MARCADOR: path.join(ctx.tmp, "alterado"),
        BACKUP_GPG_CHAVE_PRIVADA: path.join(ctx.tmp, "chave-falsa"),
        GPG_BASE_CURTA: "/tmp",
      });
      const sha = path.join(ctx.env.PATH, "sha256sum");
      fs.unlinkSync(sha);
      gravar(
        sha,
        `#!/bin/sh\n/usr/bin/sha256sum "$@"\ns=$?\nif [ ! -e "$MARCADOR" ]; then printf adulterado > "$ARQUIVO_ORIGEM"; : > "$MARCADOR"; fi\nexit "$s"\n`,
      );
      fs.chmodSync(sha, 0o700);
      const instalar = (nome, codigo) => {
        const alvo = path.join(ctx.env.PATH, nome);
        gravar(alvo, codigo);
        fs.chmodSync(alvo, 0o700);
      };
      instalar("gpgconf", `#!/bin/sh\nprintf '/tmp/socket-falso\\n'\n`);
      instalar(
        "gpg",
        `#!/bin/sh\ncase "$2" in --import) exit 0;; esac\nfor arg do ultimo="$arg"; done\ncat "$ultimo" > "$OBSERVADO"\nprintf 'CONSUMO_TESTE\\n' >&2\nexit 73\n`,
      );
      instalar(
        "pg_restore",
        `#!/bin/sh\ncat "$2" > "$OBSERVADO"\nprintf 'CONSUMO_TESTE\\n' >&2\nexit 73\n`,
      );
      const resultado = spawnSync(
        "/bin/bash",
        [
          path.join(ctx.scripts, "restaurar.sh"),
          "--arquivo",
          arquivo,
          "--confirmar",
          "--sem-copia",
          "--sem-validacao",
        ],
        { env: ctx.env, cwd: ctx.dados, encoding: "utf8", timeout: 10000 },
      );
      assert.equal(resultado.error, undefined);
      assert.equal(resultado.signal, null);
      assert.equal(resultado.status, 1, resultado.stdout + resultado.stderr);
      assert.match(resultado.stderr, /CONSUMO_TESTE/);
      assert.equal(fs.readFileSync(arquivo, "utf8"), "adulterado");
      assert.equal(fs.readFileSync(ctx.env.OBSERVADO, "utf8"), original);
    } finally {
      fs.rmSync(ctx.tmp, { recursive: true, force: true });
    }
  });
}

function exercitarRollback(cenario) {
  const ctx = preparar();
  try {
    const instalar = (nome, conteudo) => {
      const arquivo = path.join(ctx.scripts, nome);
      gravar(arquivo, conteudo);
      fs.chmodSync(arquivo, 0o700);
    };
    const dublar = (nome, conteudo) => {
      const arquivo = path.join(ctx.env.PATH, nome);
      gravar(arquivo, conteudo);
      fs.chmodSync(arquivo, 0o700);
    };
    const arquivo = path.join(ctx.dados, "entrada.dump.age");
    const copia = path.join(ctx.tmp, "backup/banco/seguranca.dump.age");
    fs.mkdirSync(path.dirname(copia), { recursive: true });
    for (const [alvo, conteudo] of [
      [arquivo, "dump original\n"],
      [copia, "dump segurança\n"],
    ]) {
      gravar(alvo, conteudo);
      gravar(`${alvo}.sha256`, `${hash(conteudo)}  ${path.basename(alvo)}\n`);
    }
    instalar(
      "backup-banco.sh",
      `#!/bin/sh\nprintf 'backup\\n' >> "$TESTEMUNHAS"\nmkdir -p "$ESTADO_DIR"\nprintf '{"arquivo":"seguranca.dump.age"}\\n' > "$ESTADO_DIR/ultimo-backup.json"\n`,
    );
    dublar("jq", `#!/bin/sh\nprintf 'seguranca.dump.age\\n'\n`);
    dublar(
      "age",
      `#!/bin/sh\nprintf 'age:%s\\n' "$6" >> "$TESTEMUNHAS"\ncase "$6" in *seguranca.dump.age) printf 'RECUPERACAO_TENTADA\\n' >&2; exit 73;; esac\nprintf 'dump sintético\\n' > "$5"\n`,
    );
    dublar(
      "psql",
      `#!/bin/sh\nprintf 'psql:%s\\n' "$1" >> "$TESTEMUNHAS"\ncase "$CENARIO" in mesma-identidade) printf 'identidade-igual\\n';; aliases) case "$1" in *127.0.0.1*) printf 'mesmobanco|10.0.0.1/32|5432|2026-01-01\\n';; *) printf 'mesmobanco|10.0.0.2/32|5432|2026-01-01\\n';; esac;; *) printf 'identidade-%s\\n' "$1";; esac\n`,
    );
    dublar(
      "pg_restore",
      `#!/bin/sh\ncase "$1" in -l) printf 'lista\\n' >> "$TESTEMUNHAS"; exit 0;; esac\nprintf 'restaurar:%s\\n' "$2" >> "$TESTEMUNHAS"\nif [ "$CENARIO" = aliases ]; then printf 'escrita-no-banco-compartilhado\\n' >> "$TESTEMUNHAS"; fi\nprintf 'FALHA_PG_RESTORE\\n' >&2\nexit 75\n`,
    );
    ctx.env.CENARIO = cenario;
    ctx.env.BACKUP_RESTAURACAO_URL_VALIDACAO =
      cenario === "aliases"
        ? "postgresql://sintetico@127.0.0.2:1/sintetico"
        : "postgresql://sintetico@127.0.0.1:1/validacao";
    const args = [path.join(ctx.scripts, "restaurar.sh"), "--arquivo", arquivo, "--confirmar"];
    if (cenario === "falha-destino") args.push("--sem-validacao");
    const resultado = spawnSync("/bin/bash", args, {
      env: ctx.env,
      cwd: ctx.dados,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(resultado.error, undefined, `falha ao executar: ${resultado.error}`);
    assert.equal(resultado.signal, null);
    assert.equal(
      resultado.status,
      ["mesma-identidade", "aliases", "falha-validacao"].includes(cenario) ? 1 : 75,
      resultado.stdout + resultado.stderr,
    );
    const chamadas = fs.existsSync(ctx.testemunhas)
      ? fs.readFileSync(ctx.testemunhas, "utf8").trim().split("\n")
      : [];
    assert.ok(
      chamadas.includes("backup"),
      `a cópia deve existir antes da falha: ${resultado.stdout}${resultado.stderr}`,
    );
    assert.equal(
      fs.readFileSync(copia, "utf8"),
      "dump segurança\n",
      "a cópia deve permanecer intacta",
    );
    assert.equal(
      fs.readFileSync(`${copia}.sha256`, "utf8"),
      `${hash("dump segurança\n")}  ${path.basename(copia)}\n`,
    );
    return {
      chamadas,
      saida: resultado.stdout + resultado.stderr,
      destino: ctx.env.BACKUP_DATABASE_URL,
      validacao: ctx.env.BACKUP_RESTAURACAO_URL_VALIDACAO,
    };
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
}

test("--sem-validacao mantém a checagem de identidade antes de efeitos", () => {
  const ctx = preparar();
  try {
    ctx.env.DATABASE_URL = "postgresql://sintetico@127.0.0.1:1/outro_banco";
    const arquivo = path.join(ctx.dados, "entrada.dump");
    gravar(arquivo, "dump sintético\n");
    const resultado = spawnSync(
      "/bin/bash",
      [
        path.join(ctx.scripts, "restaurar.sh"),
        "--arquivo",
        arquivo,
        "--confirmar",
        "--sem-validacao",
      ],
      {
        env: ctx.env,
        cwd: ctx.dados,
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.signal, null);
    assert.equal(resultado.status, 1);
    assert.match(resultado.stderr, /aponta para outro banco/);
    assert.match(resultado.stderr, /A identidade do banco não confere/);
    assert.equal(fs.existsSync(ctx.testemunhas), false);
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

test("falha de resultado incerto preserva cópia e exige recuperação manual", () => {
  const { chamadas, saida, destino } = exercitarRollback("falha-destino");
  assert.deepEqual(
    chamadas.filter((chamada) => chamada.startsWith("restaurar:")),
    [`restaurar:${destino}`],
  );
  assert.match(saida, /pg_restore falhou no destino \(código 75\)/);
  assert.doesNotMatch(saida, /FALHA_PG_RESTORE/);
  assert.doesNotMatch(saida, /tentando recuperar o banco|RECUPERACAO_TENTADA/);
  assert.match(saida, /intervenção manual necessária/i);
});

test("executores recusam antes de alcançar Docker ou testes posteriores", () => {
  const ctx = preparar();
  try {
    const legado = spawnSync(
      "/bin/bash",
      [path.join(fontes, "tests/servidor/restauracao-url.sh")],
      {
        env: ctx.env,
        cwd: ctx.dados,
        encoding: "utf8",
        timeout: 10000,
      },
    );
    assert.equal(legado.error, undefined);
    assert.equal(legado.signal, null);
    assert.equal(legado.status, 1);
    assert.match(legado.stderr, /uso: restauracao-url.sh --executar/);
    assert.equal(fs.existsSync(ctx.testemunhas), false);
    const node = path.join(ctx.env.PATH, "node");
    fs.unlinkSync(node);
    gravar(node, '#!/bin/sh\nprintf "PREFLIGHT_EXECUTADO\\n" >&2\nexit 79\n');
    fs.chmodSync(node, 0o700);
    const executor = spawnSync("/bin/bash", [path.join(fontes, "tests/servidor/executar.sh")], {
      env: ctx.env,
      cwd: ctx.dados,
      encoding: "utf8",
      timeout: 10000,
    });
    assert.equal(executor.error, undefined);
    assert.equal(executor.signal, null);
    assert.equal(executor.status, 79);
    assert.match(executor.stderr, /PREFLIGHT_EXECUTADO/);
    assert.equal(fs.existsSync(ctx.testemunhas), false);
  } finally {
    fs.rmSync(ctx.tmp, { recursive: true, force: true });
  }
});

for (const [validacao, url, semCopia] of [
  ["ausente", null, false],
  ["mesma", "postgresql://sintetico@127.0.0.1:1/sintetico", false],
  ["alias", "postgresql://sintetico@127.0.0.1:1/%73intetico?application_name=validacao", false],
  ["diferente", "postgresql://sintetico@127.0.0.2:1/outro", false],
  ["diferente sem cópia", "postgresql://sintetico@127.0.0.2:1/outro", true],
]) {
  test(`perfil URL ausente recusa ${validacao} antes de clientes, backup e efeitos operacionais`, () => {
    const ctx = preparar();
    try {
      const arquivo = path.join(ctx.dados, "entrada.dump");
      const conteudo = "dump sintético\n";
      gravar(arquivo, conteudo);
      gravar(`${arquivo}.sha256`, `${hash(conteudo)}  ${path.basename(arquivo)}\n`);
      const backup = path.join(ctx.scripts, "backup-banco.sh");
      gravar(
        backup,
        '#!/bin/sh\nprintf "backup\\n" >> "$TESTEMUNHAS"\nprintf "MARCADOR_BACKUP_76\\n" >&2\nexit 76\n',
      );
      fs.chmodSync(backup, 0o700);
      // Usa o validador real de identidade; só o cliente PostgreSQL é falso.
      const pgRestore = path.join(ctx.env.PATH, "pg_restore");
      gravar(
        pgRestore,
        '#!/bin/sh\nprintf "pg_restore:%s\\n" "$1" >> "$TESTEMUNHAS"\n[ "$1" = -l ] && exit 0\nexit 74\n',
      );
      fs.chmodSync(pgRestore, 0o700);
      if (url !== null) ctx.env.BACKUP_RESTAURACAO_URL_VALIDACAO = url;
      const antes = fs.readdirSync(ctx.tmp).sort();
      const args = [path.join(ctx.scripts, "restaurar.sh"), "--arquivo", arquivo, "--confirmar"];
      if (semCopia) args.push("--sem-copia");
      const resultado = spawnSync("/bin/bash", args, {
        env: ctx.env,
        cwd: ctx.dados,
        encoding: "utf8",
        timeout: 10000,
      });
      assert.equal(resultado.error, undefined);
      assert.equal(resultado.signal, null);
      assert.equal(resultado.status, 1, resultado.stdout + resultado.stderr);
      assert.match(resultado.stderr, /PERFIL_NAO_SUPORTADO/);
      assert.equal(
        fs.existsSync(ctx.testemunhas),
        false,
        "nenhum cliente ou backup deve ser chamado",
      );
      assert.deepEqual(
        fs.readdirSync(ctx.tmp).sort(),
        antes,
        "nenhum lock, estado ou temporário deve ser criado",
      );
      assert.equal(fs.readFileSync(arquivo, "utf8"), conteudo);
    } finally {
      fs.rmSync(ctx.tmp, { recursive: true, force: true });
    }
  });
}
