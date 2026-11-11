// Confere o contrato do ensaio Compose sem acessar daemon ou banco na importação.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { test } from "node:test";
import vm from "node:vm";
import {
  comandoSeguro,
  conferirContainer,
  executarBashProduto,
} from "./backup-restauracao-harness.mjs";

import * as harness from "./backup-restauracao-harness.mjs";

const pasta = import.meta.dirname;

test("testemunha SQL entre renomeações exige código 3 e saúde exige 1, sem confundir causas", async () => {
  const fonte = fs.readFileSync(path.join(pasta, "backup-restauracao-harness.mjs"), "utf8");
  const produto = fonte.slice(fonte.indexOf("function produto("), fonte.indexOf("function sql("));
  const inicio = fonte.indexOf("  for (const [nome, extra, causa");
  const casos = fonte.slice(inicio, fonte.indexOf("  const corrompido =", inicio));
  assert.ok(
    produto.startsWith("function produto(") && inicio > 0 && casos.includes("await saude(s)"),
  );
  // Projeção dos recibos preservados: Bash 3/null, causa literal do produto.log
  // SHA256 878c85f6044885d30b2301a4eeec64bcf828fb81cd21dc211e49839c1b9a6734.
  const sqlReal = { status: 3, signal: null, stdout: "", stderr: "ERROR:  division by zero\n" };
  const saudeReal = {
    status: 1,
    signal: null,
    stdout: "",
    stderr: "ERRO: A saúde pública não respondeu após a restauração.\n",
  };
  async function conferir(sqlRecebido = sqlReal, saudeRecebida = saudeReal) {
    const observados = [];
    const s = {
      base: "/fixture",
      evidencia: "/fixture/evidencia",
      env: { ESTADO_DIR: "/fixture/estado" },
      invocacoes: [],
      aceites: [],
    };
    const contexto = vm.createContext({
      assert,
      path,
      s,
      args: ["--arquivo", "/fixture/backup.dump.gpg", "--confirmar", "--sem-copia"],
      fs: { appendFileSync() {} },
      conferirAtuais() {},
      persistir() {},
      conferirResultadoCliente: (estado, r) =>
        harness.conferirResultadoCliente(estado, r, () => {}),
      executarBashProduto: (_s, nome, _args, extra) => {
        assert.equal(nome, "restaurar.sh");
        return extra.RESTAURAR_FALHA_ENTRE_RENOMEACOES ? sqlRecebido : saudeRecebida;
      },
      sql: () => "1|Aluno Sintetico",
      ler: () => ({ status: "falha" }),
      saude: async () => observados.push("HTTP"),
    });
    await vm.runInContext(`${produto}\n(async () => {${casos}})()`, contexto);
    assert.deepEqual(Array.from(s.aceites), [
      "falha-saude-recuperada",
      "falha-entre-renomeacoes-recuperada",
    ]);
    assert.deepEqual(observados, ["HTTP", "HTTP"]);
    assert.deepEqual(
      Array.from(s.invocacoes, (r) => r.codigo),
      [1, 3],
    );
  }
  await conferir();
  for (const [sqlRecebido, saudeRecebida] of [
    [{ ...sqlReal, status: 1 }, saudeReal],
    [sqlReal, { ...saudeReal, status: 3 }],
    [{ ...sqlReal, stderr: saudeReal.stderr }, saudeReal],
    [sqlReal, { ...saudeReal, stderr: sqlReal.stderr }],
    [{ ...sqlReal, signal: "SIGTERM" }, saudeReal],
    [sqlReal, { ...saudeReal, signal: "SIGTERM" }],
    [{ ...sqlReal, error: { code: "ETIMEDOUT" } }, saudeReal],
    [sqlReal, { ...saudeReal, error: { code: "ENOENT" } }],
    [{ ...sqlReal, stdout: null, stderr: null }, saudeReal],
  ]) {
    await assert.rejects(conferir(sqlRecebido, saudeRecebida));
  }
});

test(
  "fronteira cliente e lifecycle: argv integral, incerteza preservada e sinal fail-stop real",
  { timeout: 10000 },
  async () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "backup-cliente-"));
    const s = {
      base,
      repo: base + "/repo",
      projeto: "backup-ensaio-proprio",
      receita: base + "/repo/compose.yml",
      env: { APP_ENV_FILE: base + "/app.env", OPS_ENV_FILE: base + "/ops.env" },
      ids: { ["a".repeat(64)]: "db", ["b".repeat(64)]: "app" },
      residuos: [],
    };
    const p = [
      "compose",
      "--project-name",
      s.projeto,
      "--project-directory",
      s.repo,
      "--env-file",
      s.env.APP_ENV_FILE,
      "--env-file",
      s.env.OPS_ENV_FILE,
      "-f",
      s.receita,
    ];
    const pg = [...p, "exec", "-T", "db"];
    // O contrato anterior aceitava qualquer argv após o nome de um cliente PG.
    assert.throws(() =>
      comandoSeguro([...pg, "psql", "postgresql://externo/db", "-f", "/externo"], s),
    );
    const temp = "frequencia_restauracao_20261111T010203Z_123",
      anterior = "frequencia_anterior_20261111T010203Z_123",
      falha = "frequencia_falha_20261111T010203Z_123";
    for (const a of [
      [
        "psql",
        "-X",
        "-U",
        "frequencia",
        "-d",
        "frequencia",
        "-v",
        "ON_ERROR_STOP=1",
        "-tAc",
        "SELECT current_database();",
      ],
      ["psql", "-U", "frequencia", "-d", temp, "-v", "schema=public", "-tA"],
      [
        "psql",
        "-U",
        "frequencia",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "banco=frequencia",
        "-v",
        "temp=" + temp,
        "-v",
        "anterior=" + anterior,
        "-v",
        "falha_entre=",
      ],
      [
        "psql",
        "-U",
        "frequencia",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "banco=frequencia",
        "-v",
        "anterior=" + anterior,
        "-v",
        "falha=" + falha,
      ],
      [
        "pg_dump",
        "-U",
        "frequencia",
        "-d",
        "frequencia",
        "-Fc",
        "--no-publications",
        "--no-subscriptions",
        "--strict-names",
        "--schema=public",
        "--lock-wait-timeout=30s",
      ],
      ["pg_restore", "-l"],
      [
        "pg_restore",
        "-U",
        "frequencia",
        "-d",
        temp,
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--exit-on-error",
      ],
      ["createdb", "-U", "frequencia", "-O", "frequencia", temp],
      ["dropdb", "-U", "frequencia", "--force", temp],
    ])
      assert.deepEqual(comandoSeguro([...pg, ...a], s), [...pg, ...a]);
    for (const a of [
      ["psql", "-U", "frequencia", "-d", "externo", "-v", "schema=public", "-tA"],
      ["psql", "-U", "frequencia", "-d", temp, "-v", "schema=public", "-tA", "-h", "externo"],
      ["pg_dump", "-U", "frequencia", "-d", "frequencia", "-f", "/externo"],
      ["pg_restore", "-l", "/externo"],
      ["createdb", "-U", "frequencia", "-O", "frequencia", "externo"],
      ["dropdb", "-U", "frequencia", "--force", "frequencia"],
    ])
      assert.throws(() => comandoSeguro([...pg, ...a], s));
    for (const a of [
      ["up", "-d", "--wait", "--wait-timeout", "45", "app"],
      ["up", "-d", "--wait", "--no-build", "--wait-timeout", "45", "app"],
    ])
      assert.deepEqual(comandoSeguro([...p, ...a], s), [
        ...p,
        "up",
        "-d",
        "--wait",
        "--wait-timeout",
        "45",
        "--no-recreate",
        "--no-build",
        "--pull",
        "never",
        "app",
      ]);
    for (const a of [
      ["up", "-d", "-d", "--wait", "--wait-timeout", "45", "app"],
      ["up", "-d", "--wait", "--wait-timeout", "900", "app"],
      ["up", "-d", "--wait", "app"],
      ["exec", "-T", "app", "psql"],
      ["stop", "app", "db"],
    ])
      assert.throws(() => comandoSeguro([...p, ...a], s));
    const curl = [
      "-fsS",
      "--retry",
      "0",
      "--retry-delay",
      "5",
      "--retry-all-errors",
      "--max-time",
      "15",
      "http://127.0.0.1:1/api/saude",
    ];
    assert.deepEqual(comandoSeguro(curl, s, true), curl);
    for (const a of [
      [...curl.slice(0, -1), "https://externo", curl.at(-1)],
      ["--output", "/externo", ...curl],
      [...curl, "--retry", "0"],
      ["http://127.0.0.1:1/api/saude"],
    ])
      assert.throws(() => comandoSeguro(a, s, true));
    const id = "a".repeat(64),
      ausente = {
        status: 1,
        signal: null,
        stdout: "[]\n",
        stderr: `error: no such object: ${id}\n`,
      };
    assert.equal(harness.conferirAusencia(ausente, id, "container"), true);
    const volume = "backup-ensaio-volume-proprio";
    const v = {
      status: 1,
      signal: null,
      stdout: "[]\n",
      stderr: `Error response from daemon: get ${volume}: no such volume\n`,
    };
    assert.equal(harness.conferirAusencia(v, volume, "volume"), true);
    for (const r of [
      { ...ausente, status: 2 },
      { ...ausente, signal: "SIGTERM" },
      { ...ausente, error: { code: "ETIMEDOUT" } },
      { ...ausente, stdout: "{}" },
      { ...ausente, stderr: "permission denied" },
      { ...ausente, stderr: `error: no such object: ${"c".repeat(64)}\n` },
    ])
      assert.throws(() => harness.conferirAusencia(r, id, "container"));
    try {
      for (const r of [
        { status: null, signal: "SIGTERM", stdout: "parcial", stderr: "sinal" },
        {
          status: null,
          signal: null,
          error: { code: "ETIMEDOUT" },
          stdout: "parcial",
          stderr: "timeout",
        },
        { status: undefined, signal: null, stdout: "", stderr: "" },
      ]) {
        delete s.incerteza;
        assert.throws(() => harness.conferirResultadoCliente(s, r, () => {}), /incerto/i);
        assert.equal(s.incerteza.stdout, r.stdout);
        assert.equal(s.incerteza.sinal, r.signal);
        assert.throws(() => comandoSeguro([...p, "stop", "app"], s), /incert/i);
        harness.limpar(s);
        assert.equal(Object.keys(s.ids).length, 2, "incerteza não permite adoção/remoção");
        assert.ok(s.residuos.some((r) => r.id === id));
      }
      delete s.incerteza;
      const timeout = harness.executar(
        process.execPath,
        ["-e", "setTimeout(()=>{},1000)"],
        { PATH: "/usr/bin:/bin" },
        { timeout: 50, killSignal: "SIGKILL" },
      );
      assert.equal(timeout.error?.code, "ETIMEDOUT");
      assert.equal(timeout.signal, "SIGKILL");
      assert.throws(() => harness.conferirResultadoCliente(s, timeout), /incerto/i);
      assert.equal(
        JSON.parse(fs.readFileSync(path.join(base, "incerteza-cliente.json"), "utf8")).erro,
        "ETIMEDOUT",
      );
      delete s.incerteza;
      assert.throws(
        () => comandoSeguro([...p, "stop", "app"], s),
        /incert/i,
        "outro processo precisa observar a recusa persistida",
      );
      fs.unlinkSync(path.join(base, "incerteza-cliente.json"));
      assert.equal(
        harness.conferirResultadoCliente(s, {
          status: 1,
          signal: null,
          stdout: "",
          stderr: "erro conhecido",
        }).status,
        1,
      );
      const marker = path.join(base, "sinal.txt");
      const programa = `import fs from 'node:fs'; import {executar} from ${JSON.stringify(new URL("./backup-restauracao-harness.mjs", import.meta.url).href)}; executar(process.execPath,['-e',${JSON.stringify("process.stdout.write('PENDENTE\\n');setTimeout(()=>process.exit(0),200)")}],{PATH:'/usr/bin:/bin'},{stdio:'inherit'});fs.writeFileSync(${JSON.stringify(marker)},'EFEITO_POSTERIOR');`;
      const filho = spawn(process.execPath, ["--input-type=module", "-e", programa], {
        env: { PATH: "/usr/bin:/bin", TMPDIR: base },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "",
        enviado = false;
      filho.stdout.on("data", (b) => {
        stdout += b;
        if (!enviado && stdout.includes("PENDENTE\n")) {
          enviado = true;
          filho.kill("SIGTERM");
        }
      });
      filho.stderr.on("data", (b) => {
        stderr += b;
      });
      const [codigo, sinal] = await once(filho, "close");
      assert.equal(enviado, true, stderr);
      assert.equal(codigo, null, stderr);
      assert.equal(sinal, "SIGTERM", stderr);
      assert.equal(
        fs.existsSync(marker),
        false,
        "sinal não pode executar efeito posterior a spawnSync",
      );
    } finally {
      fs.rmSync(base, { recursive: true });
    }
  },
);

test("fronteira administrativa: cada Bash recusa perfil e ambiente externo antes de executar", () => {
  const s = {
    base: "/fixture/propria",
    repo: "/fixture/propria/repo",
    projeto: "backup-ensaio-sintetico",
    env: { SERVIDOR_AMBIENTE_INJETADO: "true", BACKUP_MODO: "compose" },
  };
  const chamadas = [];
  let perfil,
    consultas = 0;
  const deps = {
    stat(p) {
      assert.equal(p, "/opt/frequenciapp-controlador/perfil.json");
      consultas++;
      if (perfil instanceof Error) throw perfil;
      if (perfil) return perfil;
      throw Object.assign(new Error("ausente"), { code: "ENOENT" });
    },
    exec(bin, args, env) {
      chamadas.push({ bin, args, env });
      return { status: 0, signal: null, stdout: "", stderr: "" };
    },
  };
  assert.equal(executarBashProduto(s, "backup-banco.sh", [], {}, deps).status, 0);
  assert.equal(chamadas.length, 1);
  for (perfil of [
    { isFile: () => true },
    { isSymbolicLink: () => true },
    { isDirectory: () => true },
    Object.assign(new Error("negado"), { code: "EACCES" }),
  ]) {
    assert.throws(() => executarBashProduto(s, "backup-banco.sh", [], {}, deps), /perfil|EACCES/i);
    assert.equal(
      chamadas.length,
      1,
      "perfil surgido após a primeira chamada não pode executar Bash",
    );
  }
  perfil = undefined;
  for (const extra of [
    { SERVIDOR_CONTROLADOR_PERFIL: "/outro" },
    { SERVIDOR_CONTROLADOR_OPERACAO: "externa" },
    { DATABASE_URL: "postgresql://externo/db" },
    { BACKUP_DATABASE_URL: "postgresql://externo/db" },
    { BASH_ENV: "/externo" },
    { NODE_OPTIONS: "--import=/externo" },
    { PATH: "/externo" },
    { APP_ENV_FILE: "/externo" },
    { BACKUP_REMOTO: "externo:/dados" },
    { RESTAURAR_SAUDE_URL: "https://externo" },
  ]) {
    assert.throws(
      () => executarBashProduto(s, "backup-banco.sh", [], extra, deps),
      /ambiente|override|variável/i,
    );
    assert.equal(chamadas.length, 1);
  }
  s.env.DIRECT_URL = "postgresql://externo/db";
  assert.throws(
    () => executarBashProduto(s, "backup-banco.sh", [], {}, deps),
    /ambiente|variável/i,
  );
  delete s.env.DIRECT_URL;
  assert.equal(executarBashProduto(s, "backup-banco.sh", ["--verificar"], {}, deps).status, 0);
  assert.equal(chamadas.length, 2);
  assert.ok(
    consultas >= 6,
    "lstat deve ocorrer em cada chamada permitida, inclusive após uma recusa",
  );
});

// Fixture derivada do formato Compose 5.5.1, com caminhos e identidades substituídos por valores sintéticos.
const captura = {
  s: {
    rodada: "11111111-1111-4111-8111-111111111111",
    senha: "[senha-sintetica-omitida]",
    projeto: "backup-ensaio-11111111-1111-4111-8111-111111111111",
    volume: "backup-ensaio-11111111-1111-4111-8111-111111111111-pgdata",
    config: {
      name: "backup-ensaio-11111111-1111-4111-8111-111111111111",
      services: {
        app: {
          cap_drop: ["ALL"],
          cpus: 1,
          command: [
            "-e",
            "require('http').createServer((q,s)=>{s.writeHead(q.url==='/api/saude'?200:404);s.end('saude-sintetica')}).listen(3000,'127.0.0.1')",
          ],
          entrypoint: ["node"],
          healthcheck: {
            test: [
              "CMD",
              "node",
              "-e",
              "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))",
            ],
            timeout: "5s",
            interval: "1s",
            retries: 30,
          },
          image: "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614",
          labels: {
            "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
          },
          logging: {
            driver: "json-file",
            options: {
              "max-file": "1",
              "max-size": "1m",
            },
          },
          mem_limit: "536870912",
          network_mode: "none",
          pids_limit: 128,
          pull_policy: "never",
          read_only: true,
          restart: "no",
          security_opt: ["no-new-privileges:true"],
          tmpfs: ["/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777"],
          user: "1000:1000",
        },
        caddy: {
          profiles: ["backup"],
          cap_drop: ["ALL"],
          cpus: 1,
          command: ["-e", "process.exit(0)"],
          entrypoint: ["node"],
          image: "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614",
          labels: {
            "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
          },
          logging: {
            driver: "json-file",
            options: {
              "max-file": "1",
              "max-size": "1m",
            },
          },
          mem_limit: "536870912",
          network_mode: "none",
          pids_limit: 128,
          pull_policy: "never",
          read_only: true,
          restart: "no",
          security_opt: ["no-new-privileges:true"],
          tmpfs: ["/tmp:rw,nosuid,nodev,noexec,size=16m,mode=1777"],
          user: "1000:1000",
        },
        db: {
          cap_drop: ["ALL"],
          cpus: 1,
          command: [
            "test \"$$(stat -c '%u:%g' /var/lib/postgresql/data)\" = 999:999\ntest -r /var/lib/postgresql/data -a -w /var/lib/postgresql/data -a -x /var/lib/postgresql/data\ntest -z \"$$(find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -print -quit)\"\nprintf 'STORAGE_PROPRIO_VAZIO_UID999\\n'\nexec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1\n",
          ],
          entrypoint: ["bash", "-euc"],
          environment: {
            PGCONNECT_TIMEOUT: "3",
            PGHOST: "127.0.0.1",
            PGPASSWORD: "[senha-sintetica-omitida]",
            POSTGRES_DB: "frequencia",
            POSTGRES_INITDB_ARGS: "--auth-local=scram-sha-256 --auth-host=scram-sha-256",
            POSTGRES_PASSWORD: "[senha-sintetica-omitida]",
            POSTGRES_USER: "frequencia",
          },
          healthcheck: {
            test: ["CMD", "psql", "-X", "-U", "frequencia", "-d", "frequencia", "-tAc", "select 1"],
            timeout: "5s",
            interval: "1s",
            retries: 30,
          },
          image:
            "postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994",
          labels: {
            "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
          },
          logging: {
            driver: "json-file",
            options: {
              "max-file": "1",
              "max-size": "1m",
            },
          },
          mem_limit: "536870912",
          network_mode: "none",
          pids_limit: 128,
          pull_policy: "never",
          read_only: true,
          restart: "no",
          security_opt: ["no-new-privileges:true"],
          tmpfs: [
            "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777",
            "/var/run/postgresql:rw,nosuid,nodev,noexec,size=16m,uid=999,gid=999,mode=0700",
          ],
          user: "999:999",
          volumes: [
            {
              type: "volume",
              source: "pgdata",
              target: "/var/lib/postgresql/data",
              volume: {},
            },
          ],
        },
      },
      volumes: {
        pgdata: {
          name: "backup-ensaio-11111111-1111-4111-8111-111111111111-pgdata",
          external: true,
        },
      },
      "x-confinamento": {
        cap_drop: ["ALL"],
        cpus: 1,
        labels: {
          "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
        },
        logging: {
          driver: "json-file",
          options: {
            "max-file": "1",
            "max-size": "1m",
          },
        },
        mem_limit: "512m",
        network_mode: "none",
        pids_limit: 128,
        read_only: true,
        restart: "no",
        security_opt: ["no-new-privileges:true"],
      },
    },
    imagens: {
      postgres: {
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
        GOSU_VERSION: "1.19",
        LANG: "en_US.utf8",
        PG_MAJOR: "17",
        PG_VERSION: "17.11-1.pgdg12+2",
        PGDATA: "/var/lib/postgresql/data",
      },
      origem: {
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
        GOSU_VERSION: "1.19",
        LANG: "en_US.utf8",
        PG_MAJOR: "17",
        PG_VERSION: "17.11-1.pgdg12+2",
        PGDATA: "/var/lib/postgresql/data",
        NODE_VERSION: "24.22.2",
        HOME: "/tmp",
        TMPDIR: "/tmp",
      },
      ferramentas: {
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
        NODE_VERSION: "24.22.2",
        YARN_VERSION: "1.22.22",
        HOME: "/tmp",
        TMPDIR: "/tmp",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_ALLOW_PROTOCOL: "file",
        HELM_BIN: "/usr/local/bin/helm",
      },
    },
  },
  containers: {
    db: {
      Image: "sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994",
      Config: {
        Hostname: "aaaaaaaaaaaa",
        Domainname: "",
        User: "999:999",
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        ExposedPorts: {
          "5432/tcp": {},
        },
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        Env: [
          "POSTGRES_USER=frequencia",
          "POSTGRES_PASSWORD=[senha-sintetica-omitida]",
          "POSTGRES_DB=frequencia",
          "POSTGRES_INITDB_ARGS=--auth-local=scram-sha-256 --auth-host=scram-sha-256",
          "PGHOST=127.0.0.1",
          "PGPASSWORD=[senha-sintetica-omitida]",
          "PGCONNECT_TIMEOUT=3",
          "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/lib/postgresql/17/bin",
          "GOSU_VERSION=1.19",
          "LANG=en_US.utf8",
          "PG_MAJOR=17",
          "PG_VERSION=17.11-1.pgdg12+2",
          "PGDATA=/var/lib/postgresql/data",
        ],
        Cmd: [
          "test \"$(stat -c '%u:%g' /var/lib/postgresql/data)\" = 999:999\ntest -r /var/lib/postgresql/data -a -w /var/lib/postgresql/data -a -x /var/lib/postgresql/data\ntest -z \"$(find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -print -quit)\"\nprintf 'STORAGE_PROPRIO_VAZIO_UID999\\n'\nexec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1\n",
        ],
        Healthcheck: {
          Test: ["CMD", "psql", "-X", "-U", "frequencia", "-d", "frequencia", "-tAc", "select 1"],
          Interval: 1000000000,
          Timeout: 5000000000,
          Retries: 30,
        },
        Image:
          "postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994",
        Volumes: {
          "/var/lib/postgresql/data": {},
        },
        WorkingDir: "",
        Entrypoint: ["bash", "-euc"],
        Labels: {
          "com.docker.compose.config-hash":
            "10bcff83b7eb30b5a2dc67604c4d6727e1a13b3958e8af7c9db9c97d6c3d1726",
          "com.docker.compose.container-number": "1",
          "com.docker.compose.depends_on": "",
          "com.docker.compose.image":
            "sha256:73bedc9eaa0121b92b9b26bb52e5141b3f6f37479c7ef913c0160455763ca80a",
          "com.docker.compose.oneoff": "False",
          "com.docker.compose.project": "backup-ensaio-11111111-1111-4111-8111-111111111111",
          "com.docker.compose.project.config_files":
            "/ensaio/fixture-compose/repo/tests/servidor/compose.yml",
          "com.docker.compose.project.environment_file":
            "/ensaio/fixture-compose/app.env,/ensaio/fixture-compose/ops.env",
          "com.docker.compose.project.working_dir":
            "/ensaio/fixture-compose/repo",
          "com.docker.compose.service": "db",
          "com.docker.compose.version": "5.5.1",
          "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
        },
        StopSignal: "SIGINT",
      },
      HostConfig: {
        Binds: [
          "backup-ensaio-11111111-1111-4111-8111-111111111111-pgdata:/var/lib/postgresql/data:rw",
        ],
        ContainerIDFile: "",
        LogConfig: {
          Type: "json-file",
          Config: {
            "max-file": "1",
            "max-size": "1m",
          },
        },
        NetworkMode: "none",
        PortBindings: {},
        RestartPolicy: {
          Name: "no",
          MaximumRetryCount: 0,
        },
        AutoRemove: false,
        VolumeDriver: "",
        VolumesFrom: null,
        ConsoleSize: [0, 0],
        CapAdd: null,
        CapDrop: ["ALL"],
        CgroupnsMode: "private",
        Dns: null,
        DnsOptions: null,
        DnsSearch: null,
        ExtraHosts: [],
        GroupAdd: null,
        IpcMode: "private",
        Cgroup: "",
        Links: null,
        OomScoreAdj: 0,
        PidMode: "",
        Privileged: false,
        PublishAllPorts: false,
        ReadonlyRootfs: true,
        SecurityOpt: ["no-new-privileges:true"],
        Tmpfs: {
          "/tmp": "rw,nosuid,nodev,noexec,size=64m,mode=1777",
          "/var/run/postgresql": "rw,nosuid,nodev,noexec,size=16m,uid=999,gid=999,mode=0700",
        },
        UTSMode: "",
        UsernsMode: "",
        ShmSize: 67108864,
        Runtime: "runc",
        Isolation: "",
        CpuShares: 0,
        Memory: 536870912,
        NanoCpus: 1000000000,
        CgroupParent: "",
        BlkioWeight: 0,
        BlkioWeightDevice: null,
        BlkioDeviceReadBps: null,
        BlkioDeviceWriteBps: null,
        BlkioDeviceReadIOps: null,
        BlkioDeviceWriteIOps: null,
        CpuPeriod: 0,
        CpuQuota: 0,
        CpuRealtimePeriod: 0,
        CpuRealtimeRuntime: 0,
        CpusetCpus: "",
        CpusetMems: "",
        Devices: null,
        DeviceCgroupRules: null,
        DeviceRequests: null,
        MemoryReservation: 0,
        MemorySwap: 1073741824,
        MemorySwappiness: null,
        OomKillDisable: false,
        PidsLimit: 128,
        Ulimits: null,
        CpuCount: 0,
        CpuPercent: 0,
        IOMaximumIOps: 0,
        IOMaximumBandwidth: 0,
        MaskedPaths: [
          "/proc/acpi",
          "/proc/asound",
          "/proc/interrupts",
          "/proc/kcore",
          "/proc/keys",
          "/proc/latency_stats",
          "/proc/sched_debug",
          "/proc/scsi",
          "/proc/timer_list",
          "/proc/timer_stats",
          "/sys/devices/virtual/powercap",
          "/sys/firmware",
        ],
        ReadonlyPaths: ["/proc/bus", "/proc/fs", "/proc/irq", "/proc/sys", "/proc/sysrq-trigger"],
      },
      Mounts: [
        {
          Type: "volume",
          Name: "backup-ensaio-11111111-1111-4111-8111-111111111111-pgdata",
          Source:
            "/var/lib/docker/volumes/backup-ensaio-11111111-1111-4111-8111-111111111111-pgdata/_data",
          Destination: "/var/lib/postgresql/data",
          Driver: "local",
          Mode: "rw",
          RW: true,
          Propagation: "",
        },
      ],
      NetworkSettings: {
        SandboxID: "",
        SandboxKey: "",
        Ports: {},
        Networks: {
          none: {
            IPAMConfig: null,
            Links: null,
            Aliases: null,
            DriverOpts: null,
            GwPriority: 0,
            NetworkID: "",
            EndpointID: "",
            Gateway: "",
            IPAddress: "",
            MacAddress: "",
            IPPrefixLen: 0,
            IPv6Gateway: "",
            GlobalIPv6Address: "",
            GlobalIPv6PrefixLen: 0,
            DNSNames: null,
          },
        },
      },
    },
    app: {
      Image: "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614",
      Config: {
        Hostname: "bbbbbbbbbbbb",
        Domainname: "",
        User: "1000:1000",
        AttachStdin: false,
        AttachStdout: true,
        AttachStderr: true,
        Tty: false,
        OpenStdin: false,
        StdinOnce: false,
        Env: [
          "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
          "NODE_VERSION=24.22.2",
          "YARN_VERSION=1.22.22",
          "HOME=/tmp",
          "TMPDIR=/tmp",
          "GIT_CONFIG_NOSYSTEM=1",
          "GIT_CONFIG_GLOBAL=/dev/null",
          "GIT_ALLOW_PROTOCOL=file",
          "HELM_BIN=/usr/local/bin/helm",
        ],
        Cmd: [
          "-e",
          "require('http').createServer((q,s)=>{s.writeHead(q.url==='/api/saude'?200:404);s.end('saude-sintetica')}).listen(3000,'127.0.0.1')",
        ],
        Healthcheck: {
          Test: [
            "CMD",
            "node",
            "-e",
            "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))",
          ],
          Interval: 1000000000,
          Timeout: 5000000000,
          Retries: 30,
        },
        Image: "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614",
        Volumes: null,
        WorkingDir: "/repo",
        Entrypoint: ["node"],
        Labels: {
          "com.docker.compose.config-hash":
            "fbecab87f55637c3f89a5915a8b61e58501be5da7883364c04cc03e8d2b4044a",
          "com.docker.compose.container-number": "1",
          "com.docker.compose.depends_on": "",
          "com.docker.compose.image":
            "sha256:749302264c92ffa5184215bfa69bba82122ba6525044d994cf2d7504790ac670",
          "com.docker.compose.oneoff": "False",
          "com.docker.compose.project": "backup-ensaio-11111111-1111-4111-8111-111111111111",
          "com.docker.compose.project.config_files":
            "/ensaio/fixture-compose/repo/tests/servidor/compose.yml",
          "com.docker.compose.project.environment_file":
            "/ensaio/fixture-compose/app.env,/ensaio/fixture-compose/ops.env",
          "com.docker.compose.project.working_dir":
            "/ensaio/fixture-compose/repo",
          "com.docker.compose.service": "app",
          "com.docker.compose.version": "5.5.1",
          "frequenciapp.backup.rodada": "11111111-1111-4111-8111-111111111111",
          "frequenciapp.ensaio.toolchain": "sinteticos-v2",
        },
      },
      HostConfig: {
        Binds: null,
        ContainerIDFile: "",
        LogConfig: {
          Type: "json-file",
          Config: {
            "max-file": "1",
            "max-size": "1m",
          },
        },
        NetworkMode: "none",
        PortBindings: {},
        RestartPolicy: {
          Name: "no",
          MaximumRetryCount: 0,
        },
        AutoRemove: false,
        VolumeDriver: "",
        VolumesFrom: null,
        ConsoleSize: [0, 0],
        CapAdd: null,
        CapDrop: ["ALL"],
        CgroupnsMode: "private",
        Dns: null,
        DnsOptions: null,
        DnsSearch: null,
        ExtraHosts: [],
        GroupAdd: null,
        IpcMode: "private",
        Cgroup: "",
        Links: null,
        OomScoreAdj: 0,
        PidMode: "",
        Privileged: false,
        PublishAllPorts: false,
        ReadonlyRootfs: true,
        SecurityOpt: ["no-new-privileges:true"],
        Tmpfs: {
          "/tmp": "rw,nosuid,nodev,noexec,size=64m,mode=1777",
        },
        UTSMode: "",
        UsernsMode: "",
        ShmSize: 67108864,
        Runtime: "runc",
        Isolation: "",
        CpuShares: 0,
        Memory: 536870912,
        NanoCpus: 1000000000,
        CgroupParent: "",
        BlkioWeight: 0,
        BlkioWeightDevice: null,
        BlkioDeviceReadBps: null,
        BlkioDeviceWriteBps: null,
        BlkioDeviceReadIOps: null,
        BlkioDeviceWriteIOps: null,
        CpuPeriod: 0,
        CpuQuota: 0,
        CpuRealtimePeriod: 0,
        CpuRealtimeRuntime: 0,
        CpusetCpus: "",
        CpusetMems: "",
        Devices: null,
        DeviceCgroupRules: null,
        DeviceRequests: null,
        MemoryReservation: 0,
        MemorySwap: 1073741824,
        MemorySwappiness: null,
        OomKillDisable: false,
        PidsLimit: 128,
        Ulimits: null,
        CpuCount: 0,
        CpuPercent: 0,
        IOMaximumIOps: 0,
        IOMaximumBandwidth: 0,
        MaskedPaths: [
          "/proc/acpi",
          "/proc/asound",
          "/proc/interrupts",
          "/proc/kcore",
          "/proc/keys",
          "/proc/latency_stats",
          "/proc/sched_debug",
          "/proc/scsi",
          "/proc/timer_list",
          "/proc/timer_stats",
          "/sys/devices/virtual/powercap",
          "/sys/firmware",
        ],
        ReadonlyPaths: ["/proc/bus", "/proc/fs", "/proc/irq", "/proc/sys", "/proc/sysrq-trigger"],
      },
      Mounts: [],
      NetworkSettings: {
        SandboxID: "",
        SandboxKey: "",
        Ports: {},
        Networks: {
          none: {
            IPAMConfig: null,
            Links: null,
            Aliases: null,
            DriverOpts: null,
            GwPriority: 0,
            NetworkID: "",
            EndpointID: "",
            Gateway: "",
            IPAddress: "",
            MacAddress: "",
            IPPrefixLen: 0,
            IPv6Gateway: "",
            GlobalIPv6Address: "",
            GlobalIPv6PrefixLen: 0,
            DNSNames: null,
          },
        },
      },
    },
  },
};

test("fronteira escapes: captura real exige raw e efetivo exatos sem equivalência genérica", () => {
  for (const papel of ["db", "app"]) {
    assert.doesNotThrow(() =>
      conferirContainer(
        structuredClone(captura.containers[papel]),
        structuredClone(captura.s),
        papel,
      ),
    );
  }
  for (const [campo, valor] of [
    ["raw", captura.s.config.services.db.command[0].replace("$$(stat", () => "$(stat")],
    ["raw", captura.s.config.services.db.command[0].replace("$$(find", () => "$$$(find")],
    ["efetivo", captura.containers.db.Config.Cmd[0].replace("$(stat", () => "$$(stat")],
    ["efetivo", captura.containers.db.Config.Cmd[0].replace("$(find", () => "(find")],
    ["raw", "exit 0\n"],
    ["efetivo", "exit 0\n"],
  ]) {
    const s = structuredClone(captura.s),
      info = structuredClone(captura.containers.db);
    const original = campo === "raw" ? s.config.services.db.command[0] : info.Config.Cmd[0];
    assert.notEqual(valor, original, "Controle deliberado precisa realmente alterar o comando.");
    if (campo === "raw") s.config.services.db.command = [valor];
    else info.Config.Cmd = [valor];
    assert.throws(() => conferirContainer(info, s, "db"), /command|comando/i);
  }
  for (const alterar of [
    (i) => i.Config.Env.push("EXTRA=$$"),
    (i) => i.Config.Env.push(i.Config.Env[0]),
    (i) => i.Config.Healthcheck.Test.push("extra"),
    (i) => (i.HostConfig.NetworkMode = "host"),
    (i) => (i.HostConfig.Tmpfs["/tmp"] = "rw,nosuid,nodev,exec,size=64m,mode=1777"),
    (i) => i.Mounts.push({ Type: "bind", Source: "/alheio", Destination: "/extra" }),
  ]) {
    const i = structuredClone(captura.containers.db);
    alterar(i);
    assert.throws(() => conferirContainer(i, structuredClone(captura.s), "db"));
  }
  const s = structuredClone(captura.s),
    app = structuredClone(captura.containers.app);
  s.config.services.app.command = app.Config.Cmd = ["-e", "process.exit(0)"];
  assert.throws(() => conferirContainer(app, s, "app"), /command|comando/i);
});

test("transporte impede cleanup por projeto, alvo alheio e recriação na subida oficial", () => {
  const s = {
    projeto: "rodada-propria",
    repo: "/fixture/propria",
    receita: "/fixture/propria/compose.yml",
    env: { APP_ENV_FILE: "/fixture/app.env", OPS_ENV_FILE: "/fixture/ops.env" },
    ids: { ["a".repeat(64)]: "db" },
  };
  const p = [
    "compose",
    "--project-name",
    s.projeto,
    "--project-directory",
    s.repo,
    "--env-file",
    s.env.APP_ENV_FILE,
    "--env-file",
    s.env.OPS_ENV_FILE,
    "-f",
    s.receita,
  ];
  assert.throws(() => comandoSeguro([...p, "down", "-v", "--remove-orphans"], s));
  assert.throws(() => comandoSeguro(["inspect", "b".repeat(64)], s));
  assert.throws(() => comandoSeguro([...p, "exec", "-T", "app", "psql"], s));
  assert.throws(() => comandoSeguro([...p, "config", "--output", "/alheio"], s));
  const seguro = comandoSeguro([...p, "up", "-d", "--wait", "--wait-timeout", "45", "app"], s);
  assert.deepEqual(seguro.slice(-5), ["--no-recreate", "--no-build", "--pull", "never", "app"]);
});

test("importar lib não cria recursos nem instala cleanup mutante, inclusive em erro e sinal", () => {
  const temporario = fs.mkdtempSync(path.join(os.tmpdir(), "backup-contrato-"));
  try {
    fs.mkdirSync(path.join(temporario, "bin"));
    const chamadas = path.join(temporario, "chamadas");
    fs.writeFileSync(
      path.join(temporario, "bin/docker"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CHAMADAS"\n',
      { mode: 0o700 },
    );
    for (const fim of ["exit 0", "false", "kill -TERM $$"]) {
      const r = spawnSync(
        "/bin/bash",
        ["-c", 'source "$1"; ' + fim, "contrato", path.join(pasta, "lib.sh")],
        {
          env: {
            PATH: path.join(temporario, "bin") + ":/usr/bin:/bin",
            TMPDIR: temporario,
            CHAMADAS: chamadas,
          },
          encoding: "utf8",
          timeout: 10000,
        },
      );
      assert.equal(r.error, undefined);
      assert.equal(fs.existsSync(chamadas), false, "importação chamou Docker pelo trap");
      assert.deepEqual(fs.readdirSync(temporario), ["bin"], "importação criou área de execução");
    }
  } finally {
    fs.rmSync(temporario, { recursive: true });
  }
});

test("receita exige isolamento e armazenamento próprio sem tags mutáveis", () => {
  const receita = fs.readFileSync(path.join(pasta, "compose.yml"), "utf8");
  assert.match(receita, /network_mode: none/);
  assert.match(receita, /cap_drop: \[ALL\]/);
  assert.match(receita, /no-new-privileges:true/);
  assert.match(receita, /read_only: true/);
  assert.match(receita, /external: true/);
  assert.doesNotMatch(receita, /ports:|postgres:17-alpine|alpine:3\.20|while true/);
});
