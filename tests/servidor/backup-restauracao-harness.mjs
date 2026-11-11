// Executa produtor e consumidor reais em Compose próprio, com transporte fechado por IDs.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { ambienteMapa, validarImagem, postgresReferencia } from "./imagens-ensaio.mjs";

const origemId = "sha256:9e18784ce1ab6414c110d0fe23efaa32d127a2d7cbdf4a231a57c7caf46ce4da";
const ferramentasId = "sha256:c31cdd8b6bd240accfebe354044e164ef23541af4799be077481a77903db9614";
const postgresId = "sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994";
const fontes = [
  "scripts/servidor/backup-banco.sh",
  "scripts/servidor/restaurar.sh",
  "scripts/servidor/comum.sh",
  "scripts/servidor/identidade.sh",
  "scripts/servidor/identidade.mjs",
  "scripts/servidor/recibos.mjs",
  "scripts/servidor/destinatario.mjs",
  "tests/servidor/compose.yml",
  "tests/servidor/backup-restauracao-harness.mjs",
  "tests/servidor/imagens-ensaio.mjs",
];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const ler = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const gravar = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { mode: 0o600 });
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const ambienteHost = (home) => ({
  PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
  HOME: home,
  TMPDIR: os.tmpdir(),
  LANG: "C.UTF-8",
  DOCKER_CONFIG: path.join(home, "docker"),
});
export function executar(bin, args, env, opcoes = {}) {
  return spawnSync(bin, args, {
    env,
    encoding: "utf8",
    timeout: 180000,
    maxBuffer: 16 * 1048576,
    ...opcoes,
  });
}
function sucesso(r) {
  assert.equal(r.error, undefined, "Falha de processo");
  assert.equal(r.signal, null, "Sinal inesperado");
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return r.stdout.trim();
}
function conferirSemIncerteza(s) {
  assert.ok(!s.incerteza && !s.preservar, "Resultado incerto: efeitos posteriores bloqueados");
  if (!s.base) return;
  try {
    fs.lstatSync(path.join(s.base, "incerteza-cliente.json"));
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw e;
  }
  throw new Error("Resultado incerto de cliente anterior: efeitos bloqueados");
}
export function conferirResultadoCliente(
  s,
  r,
  registrar = (v) => {
    try {
      fs.writeFileSync(path.join(s.base, "incerteza-cliente.json"), JSON.stringify(v) + "\n", {
        mode: 0o600,
        flag: "wx",
      });
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
  },
) {
  if (r.error || r.signal !== null || !Number.isInteger(r.status) || r.status < 0) {
    s.incerteza = {
      status: r.status ?? null,
      sinal: r.signal ?? null,
      erro: r.error?.code ?? null,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
    };
    registrar(s.incerteza);
    throw new Error("Resultado incerto do cliente; preservar recursos, sem retry/recovery/remoção");
  }
  return r;
}
function registrarCliente(s, args, r) {
  fs.appendFileSync(
    path.join(s.evidencia, "clientes.jsonl"),
    JSON.stringify({
      evento: "resultado",
      args,
      status: r.status,
      sinal: r.signal,
      erro: r.error?.code ?? null,
      stdout: r.stdout,
      stderr: r.stderr,
    }) + "\n",
    { mode: 0o600 },
  );
  return conferirResultadoCliente(s, r);
}
function iniciarCliente(s, args) {
  conferirSemIncerteza(s);
  fs.appendFileSync(
    path.join(s.evidencia, "clientes.jsonl"),
    JSON.stringify({ evento: "inicio", args }) + "\n",
    { mode: 0o600 },
  );
}
const docker = (s, args, opcoes) => {
  iniciarCliente(s, args);
  return registrarCliente(s, args, executar("/usr/bin/docker", args, ambienteHost(s.base), opcoes));
};
export function conferirAusencia(r, identificador, tipo) {
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, 1);
  assert.deepEqual(JSON.parse(r.stdout), []);
  const diagnostico =
    tipo === "container"
      ? `error: no such object: ${identificador}`
      : `Error response from daemon: get ${identificador}: no such volume`;
  assert.ok(["container", "volume"].includes(tipo));
  assert.equal(r.stderr.trim(), diagnostico, "Diagnóstico de ausência não aprovado");
  return true;
}
const inspecionar = (s, id) => {
  assert.match(id, /^[a-f0-9]{64}$/);
  const itens = JSON.parse(sucesso(docker(s, ["inspect", id])));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].Id, id);
  return itens[0];
};
const prefixo = (s) => [
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
const compose = (s, args, opcoes) => {
  const argv = [...prefixo(s), ...args];
  iniciarCliente(s, argv);
  return registrarCliente(s, argv, executar("/usr/bin/docker", argv, s.env, opcoes));
};
function persistir(s) {
  gravar(path.join(s.base, "estado-harness.json"), s);
}
function registrar(s, info, papel) {
  assert.match(info.Id, /^[a-f0-9]{64}$/);
  assert.equal(info.Config.Labels["frequenciapp.backup.rodada"], s.rodada);
  s.ids[info.Id] = papel;
  persistir(s);
}
function capturar(s, nome, valor) {
  const texto = JSON.stringify(valor, null, 2).split(s.senha).join("[senha-sintetica-omitida]");
  fs.writeFileSync(path.join(s.evidencia, nome + ".json"), texto + "\n", { mode: 0o600 });
}
const comandosAprovados = {
  db: {
    raw: [
      "test \"$$(stat -c '%u:%g' /var/lib/postgresql/data)\" = 999:999\ntest -r /var/lib/postgresql/data -a -w /var/lib/postgresql/data -a -x /var/lib/postgresql/data\ntest -z \"$$(find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -print -quit)\"\nprintf 'STORAGE_PROPRIO_VAZIO_UID999\\n'\nexec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1\n",
    ],
    efetivo: [
      "test \"$(stat -c '%u:%g' /var/lib/postgresql/data)\" = 999:999\ntest -r /var/lib/postgresql/data -a -w /var/lib/postgresql/data -a -x /var/lib/postgresql/data\ntest -z \"$(find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -print -quit)\"\nprintf 'STORAGE_PROPRIO_VAZIO_UID999\\n'\nexec docker-entrypoint.sh postgres -c listen_addresses=127.0.0.1\n",
    ],
    entrypoint: ["bash", "-euc"],
    teste: ["CMD", "psql", "-X", "-U", "frequencia", "-d", "frequencia", "-tAc", "select 1"],
  },
  app: {
    raw: [
      "-e",
      "require('http').createServer((q,s)=>{s.writeHead(q.url==='/api/saude'?200:404);s.end('saude-sintetica')}).listen(3000,'127.0.0.1')",
    ],
    efetivo: [
      "-e",
      "require('http').createServer((q,s)=>{s.writeHead(q.url==='/api/saude'?200:404);s.end('saude-sintetica')}).listen(3000,'127.0.0.1')",
    ],
    entrypoint: ["node"],
    teste: [
      "CMD",
      "node",
      "-e",
      "fetch('http://127.0.0.1:3000/api/saude').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))",
    ],
  },
};
export function conferirContainer(info, s, papel) {
  assert.equal(info.Config.Labels["frequenciapp.backup.rodada"], s.rodada);
  const db = papel === "db" || papel === "storage";
  assert.equal(info.Image, db ? postgresId : papel === "extracao" ? origemId : ferramentasId);
  assert.equal(info.Config.User, db || papel === "extracao" ? "999:999" : "1000:1000");
  const h = info.HostConfig;
  assert.equal(h.NetworkMode, "none");
  assert.equal(h.ReadonlyRootfs, true);
  assert.equal(h.Privileged, false);
  assert.deepEqual(h.CapDrop, ["ALL"]);
  assert.equal((h.CapAdd ?? []).length, 0);
  assert.deepEqual(h.SecurityOpt, ["no-new-privileges:true"]);
  assert.equal(h.NanoCpus, 1000000000);
  assert.equal(h.Memory, 512 * 1048576);
  assert.equal(h.PidsLimit, 128);
  assert.deepEqual(h.PortBindings ?? {}, {});
  assert.deepEqual(h.LogConfig, {
    Type: "json-file",
    Config: { "max-file": "1", "max-size": "1m" },
  });
  assert.ok((h.Binds ?? []).every((v) => db && v === `${s.volume}:/var/lib/postgresql/data:rw`));
  assert.ok((h.Binds ?? []).length <= (db ? 1 : 0));
  assert.equal((h.Devices ?? []).length, 0);
  assert.equal(h.PidMode, "");
  assert.equal(h.IpcMode, "private");
  assert.equal(h.RestartPolicy.Name, "no");
  assert.ok(Object.keys(info.NetworkSettings.Networks ?? {}).every((n) => n === "none"));
  const esperado = {
    ...s.imagens[db ? "postgres" : papel === "extracao" ? "origem" : "ferramentas"],
  };
  if (papel === "db")
    Object.assign(esperado, {
      POSTGRES_USER: "frequencia",
      POSTGRES_DB: "frequencia",
      POSTGRES_PASSWORD: s.senha,
      POSTGRES_INITDB_ARGS: "--auth-local=scram-sha-256 --auth-host=scram-sha-256",
      PGHOST: "127.0.0.1",
      PGPASSWORD: s.senha,
      PGCONNECT_TIMEOUT: "3",
    });
  assert.deepEqual(
    ambienteMapa(info.Config.Env),
    esperado,
    "Ambiente extra, duplicado ou divergente",
  );
  const volumes = info.Mounts.filter((m) => m.Type !== "tmpfs");
  assert.equal(volumes.length, db ? 1 : 0);
  if (db) {
    assert.equal(volumes[0].Type, "volume");
    assert.equal(volumes[0].Name, s.volume);
    assert.equal(volumes[0].Destination, "/var/lib/postgresql/data");
    assert.equal(volumes[0].RW, true);
  }
  const tmpfs = Object.keys(h.Tmpfs ?? {}).sort();
  assert.deepEqual(
    tmpfs,
    papel === "db"
      ? ["/tmp", "/var/run/postgresql"]
      : papel === "extracao"
        ? ["/tmp", "/var/lib/postgresql/data"]
        : ["/tmp"],
  );
  for (const valor of Object.values(h.Tmpfs ?? {})) {
    assert.match(valor, /nosuid/);
    assert.match(valor, /nodev/);
    assert.match(valor, /size=/);
  }
  if (papel === "db" || papel === "app") {
    const servico = s.config.services[papel],
      aprovado = comandosAprovados[papel];
    assert.deepEqual(servico.command, aprovado.raw, "command Compose bruto não aprovado");
    assert.deepEqual(info.Config.Cmd, aprovado.efetivo, "comando efetivo não aprovado");
    assert.deepEqual(servico.entrypoint, aprovado.entrypoint);
    assert.deepEqual(info.Config.Entrypoint, aprovado.entrypoint);
    assert.deepEqual(servico.healthcheck, {
      test: aprovado.teste,
      timeout: "5s",
      interval: "1s",
      retries: 30,
    });
    assert.deepEqual(info.Config.Healthcheck, {
      Test: aprovado.teste,
      Timeout: 5000000000,
      Interval: 1000000000,
      Retries: 30,
    });
    assert.deepEqual(
      h.Tmpfs,
      papel === "db"
        ? {
            "/tmp": "rw,nosuid,nodev,noexec,size=64m,mode=1777",
            "/var/run/postgresql": "rw,nosuid,nodev,noexec,size=16m,uid=999,gid=999,mode=0700",
          }
        : { "/tmp": "rw,nosuid,nodev,noexec,size=64m,mode=1777" },
    );
    assert.equal(info.Config.Labels["com.docker.compose.project"], s.projeto);
    assert.equal(info.Config.Labels["com.docker.compose.service"], papel);
  }
  return info;
}
function conferirAtuais(s) {
  for (const [id, papel] of Object.entries(s.ids)) {
    if (papel !== "app" && papel !== "db") continue;
    conferirContainer(inspecionar(s, id), s, papel);
  }
  for (const [nome, hash] of Object.entries(s.manifesto))
    assert.equal(sha(fs.readFileSync(path.join(s.repo, nome))), hash, `Fonte mudou: ${nome}`);
}
export function comandoSeguro(args, s, curl = false) {
  conferirSemIncerteza(s);
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (curl) {
    assert.deepEqual(
      args,
      [
        "-fsS",
        "--retry",
        "0",
        "--retry-delay",
        "5",
        "--retry-all-errors",
        "--max-time",
        "15",
        "http://127.0.0.1:1/api/saude",
      ],
      "Argv curl não aprovado",
    );
    return args;
  }
  if (igual(args, ["info", "--format", "{{json .}}"])) return args;
  if (args[0] === "inspect") {
    assert.ok(
      args.length > 1 &&
        new Set(args.slice(1)).size === args.length - 1 &&
        args.slice(1).every((id) => /^[a-f0-9]{64}$/.test(id) && Object.hasOwn(s.ids, id)),
    );
    return args;
  }
  const p = prefixo(s);
  assert.deepEqual(args.slice(0, p.length), p, "Alvo Compose não pertence à rodada");
  const a = args.slice(p.length);
  if (
    [
      ["config", "--quiet"],
      ["config", "--format", "json"],
      ["--profile", "backup", "config", "--services"],
      ["ps", "-aq"],
      ["ps", "--status", "running", "--services"],
      ["stop", "app"],
    ].some((v) => igual(v, a))
  )
    return args;
  if (a[0] === "exec") {
    assert.deepEqual(a.slice(0, 3), ["exec", "-T", "db"]);
    const c = a.slice(3);
    const temp = (n) => /^frequencia_restauracao_[0-9]{8}T[0-9]{6}Z_[1-9][0-9]*$/.test(n);
    const anterior = (n) => /^frequencia_anterior_[0-9]{8}T[0-9]{6}Z_[1-9][0-9]*$/.test(n);
    const falha = (n) => /^frequencia_falha_[0-9]{8}T[0-9]{6}Z_[1-9][0-9]*$/.test(n);
    const alvo = (n) => n === "frequencia" || temp(n) || anterior(n) || falha(n);
    let aprovado =
      igual(c, [
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
      ]) ||
      igual(c, [
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
      ]) ||
      igual(c, ["pg_restore", "-l"]);
    if (c[0] === "psql" && alvo(c[4]))
      aprovado ||= igual(c, ["psql", "-U", "frequencia", "-d", c[4], "-v", "schema=public", "-tA"]);
    if (c[0] === "pg_restore" && temp(c[4]))
      aprovado ||= igual(c, [
        "pg_restore",
        "-U",
        "frequencia",
        "-d",
        c[4],
        "--clean",
        "--if-exists",
        "--no-owner",
        "--no-acl",
        "--single-transaction",
        "--exit-on-error",
      ]);
    if (c[0] === "createdb" && temp(c[5]))
      aprovado ||= igual(c, ["createdb", "-U", "frequencia", "-O", "frequencia", c[5]]);
    if (c[0] === "dropdb" && (temp(c[4]) || anterior(c[4])))
      aprovado ||= igual(c, ["dropdb", "-U", "frequencia", "--force", c[4]]);
    if (
      igual(c.slice(0, 9), [
        "psql",
        "-U",
        "frequencia",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-v",
        "banco=frequencia",
      ])
    ) {
      const valor = (i, k) =>
        typeof c[i] === "string" && c[i].startsWith(k + "=") ? c[i].slice(k.length + 1) : "";
      if (temp(valor(10, "temp")) && anterior(valor(12, "anterior")))
        aprovado ||= ["", "select 1/0;"].some((v) =>
          igual(c.slice(9), ["-v", c[10], "-v", c[12], "-v", "falha_entre=" + v]),
        );
      if (anterior(valor(10, "anterior")) && falha(valor(12, "falha")))
        aprovado ||= igual(c.slice(9), ["-v", c[10], "-v", c[12]]);
    }
    assert.equal(
      aprovado,
      true,
      "Argv PG não aprovado; nenhum endpoint/arquivo/flag extra é permitido",
    );
    return args;
  }
  const normais = ["up", "-d", "--wait", "--wait-timeout", "45", "app"];
  const recuperar = ["up", "-d", "--wait", "--no-build", "--wait-timeout", "45", "app"];
  assert.ok(igual(a, normais) || igual(a, recuperar), "Argv up não aprovado");
  return [
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
  ];
}
function transporte(estado, args, curl = false) {
  const st = fs.lstatSync(estado);
  assert.ok(st.isFile() && !st.isSymbolicLink());
  assert.equal(st.uid, process.getuid());
  assert.equal(st.mode & 0o077, 0);
  const s = ler(estado);
  conferirAtuais(s);
  let r;
  if (curl) {
    comandoSeguro(args, s, true);
    const id = Object.keys(s.ids).find((id) => s.ids[id] === "app");
    r = docker(s, ["exec", id, "curl", ...args], { stdio: "inherit" });
  } else {
    const seguro = comandoSeguro(args, s);
    fs.appendFileSync(
      path.join(s.evidencia, "transporte.jsonl"),
      JSON.stringify({ comando: args[0] === "compose" ? args[prefixo(s).length] : args[0] }) + "\n",
    );
    iniciarCliente(s, seguro);
    r = registrarCliente(
      s,
      seguro,
      executar("/usr/bin/docker", seguro, s.env, { stdio: "inherit" }),
    );
  }
  conferirAtuais(s);
  process.exitCode = r.status;
}
function criarAuxiliar(s, papel, imagem, comando, volume = false) {
  const args = [
    "create",
    "--network",
    "none",
    "--read-only",
    "--cap-drop",
    "ALL",
    "--security-opt",
    "no-new-privileges:true",
    "--user",
    "999:999",
    "--cpus",
    "1",
    "--memory",
    "512m",
    "--pids-limit",
    "128",
    "--restart",
    "no",
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=1m",
    "--log-opt",
    "max-file=1",
    "--label",
    `frequenciapp.backup.rodada=${s.rodada}`,
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,noexec,size=64m,mode=1777",
  ];
  if (volume) args.push("--mount", `type=volume,src=${s.volume},dst=/var/lib/postgresql/data`);
  else
    args.push(
      "--tmpfs",
      "/var/lib/postgresql/data:rw,nosuid,nodev,noexec,size=16m,uid=999,gid=999",
    );
  args.push("--entrypoint", "bash", imagem, "-euc", comando);
  const id = sucesso(docker(s, args));
  const info = inspecionar(s, id);
  registrar(s, info, papel);
  conferirContainer(info, s, papel);
  assert.equal(info.State.Status, "created");
  capturar(s, `${papel}-antes`, info);
  return id;
}
function encerrarAuxiliar(s, id, iniciado) {
  let info = inspecionar(s, id);
  conferirContainer(info, s, s.ids[id]);
  if (iniciado) {
    assert.equal(sucesso(docker(s, ["wait", id])), "0");
    info = inspecionar(s, id);
    assert.equal(info.State.Running, false);
    assert.equal(info.State.ExitCode, 0);
  } else assert.equal(info.State.Status, "created");
  sucesso(docker(s, ["rm", id]));
  conferirAusencia(docker(s, ["inspect", id]), id, "container");
  s.removidos.push(id);
  delete s.ids[id];
  persistir(s);
}
async function preparar(s, raiz) {
  assert.equal(process.getuid(), 1000, "Coordenador deve ser UID1000, nunca root no host");
  conferirPerfilAusente();
  fs.mkdirSync(s.repo, { mode: 0o755 });
  for (const nome of fontes) {
    const entrada = path.join(raiz, nome),
      saida = path.join(s.repo, nome);
    assert.equal(fs.lstatSync(entrada).isFile(), true);
    fs.mkdirSync(path.dirname(saida), { recursive: true });
    fs.copyFileSync(entrada, saida);
    fs.chmodSync(saida, nome.endsWith(".sh") ? 0o555 : 0o444);
    s.manifesto[nome] = sha(fs.readFileSync(entrada));
    assert.equal(sha(fs.readFileSync(saida)), s.manifesto[nome]);
  }
  function publico(p) {
    fs.chmodSync(p, 0o755);
    for (const e of fs.readdirSync(p, { withFileTypes: true }))
      if (e.isDirectory()) publico(path.join(p, e.name));
  }
  publico(s.repo);
  fs.mkdirSync(path.join(s.repo, "prisma/migrations/0001_teste"), { recursive: true });
  for (const n of ["estado", "logs", "locks", "config", "backups", "remoto", "bin", "docker", "g"])
    fs.mkdirSync(path.join(s.base, n), { mode: 0o700 });
  s.receita = path.join(s.repo, "tests/servidor/compose.yml");
  s.env = {
    ...ambienteHost(s.base),
    PATH: `${s.base}/bin:${path.dirname(process.execPath)}:/usr/bin:/bin`,
    APP_DIR: s.repo,
    COMPOSE_PROJECT_NAME: s.projeto,
    COMPOSE_ARQUIVOS: s.receita,
    APP_ENV_FILE: path.join(s.base, "app.env"),
    OPS_ENV_FILE: path.join(s.base, "ops.env"),
    ESTADO_DIR: path.join(s.base, "estado"),
    LOG_DIR: path.join(s.base, "logs"),
    SERVIDOR_CONFIG_DIR: path.join(s.base, "config"),
    SERVIDOR_IDENTIDADE_ARQUIVO: path.join(s.base, "config/identidade.json"),
    SERVIDOR_LOCK_DIR: path.join(s.base, "locks"),
    BACKUP_DIR: path.join(s.base, "backups"),
    BACKUP_BANCO_DIR: path.join(s.base, "backups/banco"),
    SERVIDOR_AMBIENTE_INJETADO: "true",
    PROXY_TIPO: "caddy",
    BACKUP_PLANILHAS_HABILITADO: "false",
    BACKUP_MODO: "compose",
    BACKUP_CRIPTOGRAFIA: "age",
    BACKUP_INCLUIR_AMBIENTE: "true",
    BACKUP_RETER_DIAS: "1",
    BACKUP_RETER_REMOTO: "false",
    BACKUP_VERIFICAR_REMOTO: "true",
    BACKUP_REMOTO: "",
    BACKUP_RCLONE_CONFIG: "",
    BACKUP_ENSAIO_RODADA: s.rodada,
    BACKUP_ENSAIO_SENHA: s.senha,
    BACKUP_ENSAIO_VOLUME: s.volume,
    BACKUP_ENSAIO_FERRAMENTAS: ferramentasId,
    DATABASE_SCHEMA: "public",
    POSTGRES_USER: "frequencia",
    POSTGRES_DB: "frequencia",
    POSTGRES_PASSWORD: s.senha,
    TZ_APP: "America/Fortaleza",
    GPG_BASE_CURTA: os.tmpdir(),
    RESTAURAR_TIMEOUT_SAUDE: "45",
    RESTAURAR_VERIFICAR_SAUDE_PUBLICA: "false",
  };
  s.env.BACKUP_AMBIENTE_ARQUIVO = s.env.APP_ENV_FILE;
  fs.mkdirSync(s.env.BACKUP_BANCO_DIR, { mode: 0o700 });
  fs.writeFileSync(s.env.APP_ENV_FILE, "AUTH_SECRET=segredo-exclusivamente-sintetico-00000000\n", {
    mode: 0o600,
  });
  fs.writeFileSync(s.env.OPS_ENV_FILE, "", { mode: 0o600 });
  const estado = path.join(s.base, "estado-harness.json");
  for (const nome of ["docker", "curl"])
    fs.writeFileSync(
      path.join(s.base, "bin", nome),
      `#!/bin/bash\nexec '${process.execPath}' '${s.repo}/tests/servidor/backup-restauracao-harness.mjs' --${nome} '${estado}' "$@"\n`,
      { mode: 0o700 },
    );
  for (const [papel, id] of [
    ["postgres", postgresId],

    ["ferramentas", ferramentasId],
  ]) {
    const info = JSON.parse(sucesso(docker(s, ["image", "inspect", id])))[0];
    assert.equal(info.Id, id);
    s.imagens[papel] = validarImagem(info, papel);
    capturar(s, `imagem-${papel}`, info);
  }
  for (const [bin, args] of [
    ["/usr/bin/gpg", ["--version"]],
    ["/usr/bin/rclone", ["version"]],
  ])
    s.versoes[bin] = sucesso(executar(bin, args, ambienteHost(s.base))).split("\n")[0];
  // A projeção pública exige preparo explícito; não depende de artefatos locais anteriores.
  const origemAge = process.env.BACKUP_ENSAIO_AGE_DIR;
  assert.ok(origemAge && path.isAbsolute(origemAge), "BACKUP_ENSAIO_AGE_DIR absoluto é obrigatório");
  for (const bin of ["age", "age-keygen"]) {
    const conhecido = path.join(origemAge, bin);
    const hash =
      bin === "age"
        ? "0e52299ea44efef0f6b94d6cd153ed5011c686ba818aedd6949bcbd3c0b6eb0f"
        : "08692b7ba7dfdfc6ee76d0e64bb7e4b9ce084b6ba0b6354eb89cd2b7d3422c2f";
    const stat = fs.lstatSync(conhecido),
      bytes = fs.readFileSync(conhecido);
    assert.ok(
      stat.isFile() && !stat.isSymbolicLink() && stat.uid === 1000 && (stat.mode & 0o077) === 0,
    );
    assert.equal(sha(bytes), hash);
    assert.equal(bytes.subarray(0, 4).toString("hex"), "7f454c46");
    fs.writeFileSync(path.join(s.base, "bin", bin), bytes, { mode: 0o700, flag: "wx" });
    const arquivo = path.join(s.base, "bin", bin);
    fs.chmodSync(arquivo, 0o700);
    assert.equal(fs.lstatSync(arquivo).uid, 1000);
    assert.equal(fs.readFileSync(arquivo).subarray(0, 4).toString("hex"), "7f454c46");
    s.versoes[bin] = {
      origem: origemId,
      sha256: sha(fs.readFileSync(arquivo)),
      versao: sucesso(executar(arquivo, ["--version"], s.env)),
    };
  }

  const chaveAge = path.join(s.base, "age.txt"),
    destinatarios = path.join(s.base, "destinatarios.txt");
  sucesso(executar(path.join(s.base, "bin/age-keygen"), ["-o", chaveAge], s.env));
  fs.writeFileSync(
    destinatarios,
    sucesso(executar(path.join(s.base, "bin/age-keygen"), ["-y", chaveAge], s.env)) + "\n",
    { mode: 0o600 },
  );
  Object.assign(s.env, {
    BACKUP_AGE_CHAVE_PRIVADA: chaveAge,
    BACKUP_AGE_DESTINATARIOS: destinatarios,
    BACKUP_AGE_DESTINATARIOS_SHA256: sha(fs.readFileSync(destinatarios)),
  });
  s.config = JSON.parse(sucesso(compose(s, ["--profile", "backup", "config", "--format", "json"])));
  assert.equal(s.config.name, s.projeto);
  assert.deepEqual(Object.keys(s.config.services).sort(), ["app", "caddy", "db"]);
  const anteriores = docker(s, ["volume", "inspect", s.volume]);
  conferirAusencia(anteriores, s.volume, "volume");
  sucesso(
    docker(s, ["volume", "create", "--label", `frequenciapp.backup.rodada=${s.rodada}`, s.volume]),
  );
  s.volumeCriado = JSON.parse(sucesso(docker(s, ["volume", "inspect", s.volume])))[0];
  assert.equal(s.volumeCriado.Labels["frequenciapp.backup.rodada"], s.rodada);
  persistir(s);
  const storage = criarAuxiliar(
    s,
    "storage",
    postgresId,
    "test \"$(stat -c '%u:%g' /var/lib/postgresql/data)\" = 999:999; test -r /var/lib/postgresql/data -a -w /var/lib/postgresql/data -a -x /var/lib/postgresql/data; test -z \"$(find /var/lib/postgresql/data -mindepth 1 -maxdepth 1 -print -quit)\"; printf 'STORAGE_PROPRIO_VAZIO_UID999\\n'",
    true,
  );
  assert.equal(sucesso(docker(s, ["start", "--attach", storage])), "STORAGE_PROPRIO_VAZIO_UID999");
  encerrarAuxiliar(s, storage, true);
  s.aceites.push("storage-persistente-vazio-uid999");
  sucesso(compose(s, ["create", "--no-build", "--pull", "never", "db", "app"]));
  const ids = sucesso(compose(s, ["ps", "-aq"])).split("\n");
  assert.equal(ids.length, 2);
  for (const id of ids) {
    const info = inspecionar(s, id),
      papel = info.Config.Labels["com.docker.compose.service"];
    assert.ok(["app", "db"].includes(papel));
    registrar(s, info, papel);
    conferirContainer(info, s, papel);
    assert.equal(info.State.Status, "created");
    capturar(s, papel + "-antes", info);
  }
  persistir(s);
  produto(s, "identidade.sh", ["--adotar", "--confirmar"]);
  sucesso(compose(s, ["start", "db", "app"]));
  const prazo = Date.now() + 45000;
  while (true) {
    const r = compose(s, [
      "exec",
      "-T",
      "db",
      "psql",
      "-X",
      "-U",
      "frequencia",
      "-d",
      "frequencia",
      "-v",
      "ON_ERROR_STOP=1",
      "-tAc",
      "select current_database(), current_user, current_setting('server_version_num')::int/10000, (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public')",
    ]);
    if (r.status === 0) {
      assert.equal(r.stdout.trim(), "frequencia|frequencia|17|0");
      break;
    }
    assert.match(
      r.stderr,
      /not running|connection refused|starting up|could not connect|No such file/i,
    );
    assert.ok(Date.now() < prazo, "Readiness autenticado excedeu deadline");
    await dormir(250);
  }
  const dbid = Object.keys(s.ids).find((id) => s.ids[id] === "db");
  const logs = sucesso(docker(s, ["logs", dbid]));
  assert.match(logs, /STORAGE_PROPRIO_VAZIO_UID999/);
  s.aceites.push("readiness-autenticado-pg17-vazio");
  sql(
    s,
    "frequencia",
    "create table alunos (id integer primary key, nome text not null); insert into alunos values (1, 'Aluno Sintetico'); create table _prisma_migrations (id text primary key, checksum text not null, finished_at timestamptz, migration_name text not null, logs text, rolled_back_at timestamptz, started_at timestamptz, applied_steps_count integer not null default 0); insert into _prisma_migrations (id,checksum,migration_name,finished_at,started_at) values ('sintetica',repeat('a',64),'0001_teste',now(),now());",
  );
  await saude(s);
}
const nomesAmbienteProduto = new Set(
  `PATH HOME TMPDIR LANG DOCKER_CONFIG APP_DIR COMPOSE_PROJECT_NAME COMPOSE_ARQUIVOS APP_ENV_FILE OPS_ENV_FILE ESTADO_DIR LOG_DIR SERVIDOR_CONFIG_DIR SERVIDOR_IDENTIDADE_ARQUIVO SERVIDOR_LOCK_DIR BACKUP_DIR BACKUP_BANCO_DIR SERVIDOR_AMBIENTE_INJETADO PROXY_TIPO BACKUP_PLANILHAS_HABILITADO BACKUP_MODO BACKUP_CRIPTOGRAFIA BACKUP_INCLUIR_AMBIENTE BACKUP_RETER_DIAS BACKUP_RETER_REMOTO BACKUP_VERIFICAR_REMOTO BACKUP_REMOTO BACKUP_RCLONE_CONFIG BACKUP_ENSAIO_RODADA BACKUP_ENSAIO_SENHA BACKUP_ENSAIO_VOLUME BACKUP_ENSAIO_FERRAMENTAS DATABASE_SCHEMA POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD TZ_APP GPG_BASE_CURTA RESTAURAR_TIMEOUT_SAUDE RESTAURAR_VERIFICAR_SAUDE_PUBLICA BACKUP_AMBIENTE_ARQUIVO BACKUP_AGE_CHAVE_PRIVADA BACKUP_AGE_DESTINATARIOS BACKUP_AGE_DESTINATARIOS_SHA256 BACKUP_GPG_DESTINATARIO BACKUP_GPG_FINGERPRINT BACKUP_GPG_CHAVE_PUBLICA BACKUP_GPG_CHAVE_PRIVADA`.split(
    " ",
  ),
);
function conferirPerfilAusente(stat = fs.lstatSync) {
  try {
    stat("/opt/frequenciapp-controlador/perfil.json");
  } catch (e) {
    if (e.code === "ENOENT") return;
    throw new Error(`Perfil administrativo não pôde ser conferido: ${e.code}`, { cause: e });
  }
  throw new Error("Perfil administrativo default presente, inclusive link ou tipo inesperado");
}
export function executarBashProduto(s, nome, args = [], extra = {}, dependencias = {}) {
  conferirSemIncerteza(s);
  for (const [k, v] of Object.entries(s.env)) {
    assert.ok(
      nomesAmbienteProduto.has(k) && typeof v === "string",
      `Variável de ambiente não autorizada: ${k}`,
    );
  }
  const overrides = {
    BACKUP_RETER_MINIMO: "5",
    RESTAURAR_SAUDE_URL: "http://127.0.0.1:1/api/saude",
    RESTAURAR_SAUDE_TENTATIVAS: "0",
    RESTAURAR_FALHA_ENTRE_RENOMEACOES: "true",
  };
  for (const [k, v] of Object.entries(extra))
    assert.ok(
      Object.hasOwn(overrides, k) && overrides[k] === v,
      `Override de ambiente não autorizado: ${k}`,
    );
  assert.equal(s.env.SERVIDOR_AMBIENTE_INJETADO, "true");
  assert.equal(s.env.BACKUP_MODO, "compose");
  const env = { ...s.env, ...extra };
  conferirPerfilAusente(dependencias.stat);
  return (dependencias.exec ?? executar)(
    "/bin/bash",
    [path.join(s.repo, "scripts/servidor", nome), ...args],
    env,
  );
}
function produto(s, nome, args = [], extra = {}, codigo = 0, causa) {
  conferirAtuais(s);
  const r = conferirResultadoCliente(s, executarBashProduto(s, nome, args, extra));
  fs.appendFileSync(
    path.join(s.evidencia, "produto.log"),
    `\n${nome} ${args.map((a) => (a.startsWith(s.base) ? path.basename(a) : a)).join(" ")} => ${r.status}\n${r.stdout}${r.stderr}`,
  );
  s.invocacoes.push({
    nome,
    argumentos: args.map((a) => (a.startsWith(s.base) ? path.basename(a) : a)),
    codigo: r.status,
    sinal: r.signal,
  });
  persistir(s);
  assert.equal(r.status, codigo, r.stderr || r.stdout);
  if (causa) assert.match(r.stdout + r.stderr, causa);
  conferirAtuais(s);
  return r;
}
function sql(s, banco, texto) {
  return sucesso(
    compose(
      s,
      [
        "exec",
        "-T",
        "db",
        "psql",
        "-X",
        "-U",
        "frequencia",
        "-d",
        banco,
        "-v",
        "ON_ERROR_STOP=1",
        "-tA",
      ],
      { input: texto + "\n" },
    ),
  );
}
async function saude(s) {
  const id = Object.keys(s.ids).find((id) => s.ids[id] === "app");
  const prazo = Date.now() + 45000;
  while (true) {
    const c = conferirContainer(inspecionar(s, id), s, "app");
    if (c.State.Health?.Status === "healthy") break;
    assert.equal(c.State.Running, true);
    assert.ok(Date.now() < prazo, "Saúde HTTP sintética não respondeu");
    await dormir(250);
  }
  assert.equal(
    sucesso(
      docker(s, [
        "exec",
        id,
        "node",
        "-e",
        "fetch('http://127.0.0.1:3000/api/saude').then(async r=>{if(r.status!==200)process.exit(1);process.stdout.write(await r.text())}).catch(()=>process.exit(1))",
      ]),
    ),
    "saude-sintetica",
  );
}
function estadoBackup(s) {
  const p = ler(path.join(s.env.ESTADO_DIR, "ultimo-backup.json"));
  const recibo = ler(path.join(s.env.BACKUP_BANCO_DIR, p.recibo));
  assert.equal(recibo.escopo.banco, "frequencia");
  assert.equal(recibo.escopo.tipo, "schema");
  assert.equal(recibo.criptografia, s.env.BACKUP_CRIPTOGRAFIA);
  for (const a of recibo.artefatos)
    assert.equal(sha(fs.readFileSync(path.join(s.env.BACKUP_BANCO_DIR, a.nome))), a.sha256);
  assert.equal(recibo.artefatos.length, 4);
  assert.ok(p.ambiente);
  assert.ok(!fs.readdirSync(s.env.BACKUP_BANCO_DIR).some((n) => n.endsWith(".dump")));
  return { p, recibo, arquivo: path.join(s.env.BACKUP_BANCO_DIR, p.arquivo) };
}
async function restaurarPositivo(s, tipo) {
  s.env.BACKUP_CRIPTOGRAFIA = tipo;
  persistir(s);
  produto(s, "backup-banco.sh");
  produto(s, "backup-banco.sh", ["--verificar"]);
  const b = estadoBackup(s);
  sql(s, "frequencia", "delete from alunos where id=1;");
  assert.equal(sql(s, "frequencia", "select count(*) from alunos;"), "0");
  produto(s, "restaurar.sh", ["--arquivo", b.arquivo, "--confirmar", "--sem-copia"]);
  assert.equal(sql(s, "frequencia", "select id,nome from alunos;"), "1|Aluno Sintetico");
  assert.equal(
    sql(s, "frequencia", "select migration_name,checksum from _prisma_migrations;"),
    "0001_teste|" + "a".repeat(64),
  );
  const restauracao = ler(path.join(s.env.ESTADO_DIR, "ultima-restauracao.json"));
  assert.equal(restauracao.status, "sucesso");
  assert.match(restauracao.bancoAnterior, /^frequencia_anterior_[0-9TZ_]+$/);
  assert.equal(sql(s, restauracao.bancoAnterior, "select count(*) from alunos;"), "0");
  await saude(s);
  s.aceites.push(`backup-${tipo}-verificado-restaurado-aluno-migracao-anterior`);
  return b;
}
async function restantes(s) {
  const gpgEnv = { ...s.env, GNUPGHOME: path.join(s.base, "g") };
  sucesso(
    executar("/usr/bin/gpg", ["--batch", "--generate-key"], gpgEnv, {
      input:
        "%no-protection\nKey-Type: RSA\nKey-Length: 2048\nKey-Usage: encrypt\nName-Real: Backup Sintetico\nName-Email: backup@teste.invalid\nExpire-Date: 0\n%commit\n",
    }),
  );
  const fpr = sucesso(
    executar(
      "/usr/bin/gpg",
      ["--batch", "--with-colons", "--with-fingerprint", "--list-keys"],
      gpgEnv,
    ),
  )
    .split("\n")
    .find((n) => n.startsWith("fpr:"))
    .split(":")[9];
  assert.match(fpr, /^[A-F0-9]{40}$/);
  for (const [nome, opcao] of [
    ["publica.asc", "--export"],
    ["privada.asc", "--export-secret-keys"],
  ]) {
    const r = executar("/usr/bin/gpg", ["--batch", "--armor", opcao, fpr], gpgEnv);
    sucesso(r);
    fs.writeFileSync(path.join(s.base, nome), r.stdout, { mode: 0o600 });
  }
  sucesso(
    executar("/usr/bin/gpgconf", ["--homedir", gpgEnv.GNUPGHOME, "--kill", "gpg-agent"], s.env),
  );
  Object.assign(s.env, {
    BACKUP_GPG_DESTINATARIO: fpr,
    BACKUP_GPG_FINGERPRINT: fpr,
    BACKUP_GPG_CHAVE_PUBLICA: path.join(s.base, "publica.asc"),
    BACKUP_GPG_CHAVE_PRIVADA: path.join(s.base, "privada.asc"),
  });
  const b = await restaurarPositivo(s, "gpg");
  const ambiente = executar(
    "/usr/bin/gpg",
    ["--batch", "--decrypt", path.join(s.env.BACKUP_BANCO_DIR, b.p.ambiente)],
    gpgEnv,
  );
  sucesso(ambiente);
  assert.equal(ambiente.stdout, fs.readFileSync(s.env.APP_ENV_FILE, "utf8"));
  sucesso(
    executar("/usr/bin/gpgconf", ["--homedir", gpgEnv.GNUPGHOME, "--kill", "gpg-agent"], s.env),
  );
  s.aceites.push("ambiente-gpg-cifrado-recuperado");
  const args = ["--arquivo", b.arquivo, "--confirmar", "--sem-copia"];
  sql(s, "frequencia", "create schema extra_qa;");
  produto(s, "restaurar.sh", args, {}, 1, /schemas fora de public/);
  assert.equal(sql(s, "frequencia", "select count(*) from alunos;"), "1");
  await saude(s);
  sql(s, "frequencia", "drop schema extra_qa;");
  s.aceites.push("schema-extra-recusado-sem-alterar-aluno");
  for (const [nome, extra, causa] of [
    [
      "falha-saude",
      { RESTAURAR_SAUDE_URL: "http://127.0.0.1:1/api/saude", RESTAURAR_SAUDE_TENTATIVAS: "0" },
      /saúde pública não respondeu/,
    ],
    ["falha-entre-renomeacoes", { RESTAURAR_FALHA_ENTRE_RENOMEACOES: "true" }, /division by zero/],
  ]) {
    produto(s, "restaurar.sh", args, extra, nome === "falha-entre-renomeacoes" ? 3 : 1, causa);
    assert.equal(sql(s, "frequencia", "select id,nome from alunos;"), "1|Aluno Sintetico");
    assert.equal(ler(path.join(s.env.ESTADO_DIR, "ultima-restauracao.json")).status, "falha");
    await saude(s);
    s.aceites.push(nome + "-recuperada");
  }
  const corrompido = path.join(s.base, "corrompido.dump.gpg");
  fs.writeFileSync(corrompido, "nao-e-um-pacote-gpg\n", { mode: 0o600 });
  fs.writeFileSync(
    corrompido + ".sha256",
    `${sha(fs.readFileSync(corrompido))}  ${path.basename(corrompido)}\n`,
    { mode: 0o600 },
  );
  const transporteAntes = fs.readFileSync(path.join(s.evidencia, "transporte.jsonl"), "utf8");
  produto(
    s,
    "restaurar.sh",
    ["--arquivo", corrompido, "--confirmar", "--sem-copia"],
    {},
    1,
    /Decifra GPG não interativa falhou/,
  );
  const novo = fs
    .readFileSync(path.join(s.evidencia, "transporte.jsonl"), "utf8")
    .slice(transporteAntes.length);
  assert.ok(!novo.includes('"comando":"stop"'));
  assert.equal(sql(s, "frequencia", "select count(*) from alunos;"), "1");
  await saude(s);
  s.aceites.push("cifra-corrompida-checksum-valido-recusada-antes-stop");
  const config = path.join(s.base, "rclone.conf");
  fs.writeFileSync(config, "[destino]\ntype = local\n", { mode: 0o600 });
  Object.assign(s.env, { BACKUP_REMOTO: `destino:${s.base}/remoto`, BACKUP_RCLONE_CONFIG: config });
  persistir(s);
  produto(s, "backup-banco.sh");
  produto(s, "backup-banco.sh", ["--verificar"]);
  const remoto = estadoBackup(s);
  assert.equal(remoto.p.verificadoRemoto, true);
  const original = sha(fs.readFileSync(remoto.arquivo));
  const adulterado = path.join(s.base, "remoto", remoto.p.arquivo);
  fs.writeFileSync(adulterado, "adulterado\n");
  fs.writeFileSync(
    adulterado + ".sha256",
    `${sha(fs.readFileSync(adulterado))}  ${remoto.p.arquivo}\n`,
  );
  produto(s, "backup-banco.sh", ["--verificar"], {}, 1, /diverge do hash local/);
  assert.equal(sha(fs.readFileSync(remoto.arquivo)), original);
  s.aceites.push("rclone-local-real-positivo-e-adulteracao-dupla-recusada");
  Object.assign(s.env, {
    BACKUP_REMOTO: "",
    BACKUP_RCLONE_CONFIG: "",
    BACKUP_BANCO_DIR: path.join(s.base, "retencao"),
  });
  fs.mkdirSync(s.env.BACKUP_BANCO_DIR, { mode: 0o700 });
  persistir(s);
  const sentinelas = {};
  for (let i = 1; i <= 5; i++) {
    const nome = `frequenciapp-20200101T00000${i}Z-abc${i}.dump.gpg`;
    for (const sufixo of ["", ".sha256"]) {
      fs.writeFileSync(path.join(s.env.BACKUP_BANCO_DIR, nome + sufixo), "legado-sem-recibo\n");
      sentinelas[nome + sufixo] = sha(
        fs.readFileSync(path.join(s.env.BACKUP_BANCO_DIR, nome + sufixo)),
      );
    }
  }
  for (let i = 0; i < 31; i++) {
    produto(s, "backup-banco.sh");
    estadoBackup(s);
  }
  const recibos = () =>
    fs.readdirSync(s.env.BACKUP_BANCO_DIR).filter((n) => n.endsWith(".confirmado.json"));
  assert.equal(recibos().length, 31);
  // Avança a idade de recibos realmente emitidos pelo produtor; não cria recibos substitutos.
  for (const [i, nome] of recibos().sort().entries()) {
    const arquivo = path.join(s.env.BACKUP_BANCO_DIR, nome),
      r = ler(arquivo);
    r.em = new Date(Date.UTC(2020, 0, 1, 0, 0, i)).toISOString();
    gravar(arquivo, r);
    gravar(path.join(s.env.ESTADO_DIR, "recibos", nome), r);
  }
  produto(s, "backup-banco.sh");
  assert.equal(recibos().length, 30);
  produto(s, "backup-banco.sh", [], { BACKUP_RETER_MINIMO: "5" });
  assert.equal(recibos().length, 5);
  for (const [nome, hash] of Object.entries(sentinelas))
    assert.equal(sha(fs.readFileSync(path.join(s.env.BACKUP_BANCO_DIR, nome))), hash);
  s.aceites.push("retencao-31-confirmados-expirados-padrao30-override5-sentinelas-preservadas");
}
export function limpar(s) {
  try {
    conferirSemIncerteza(s);
  } catch (e) {
    s.residuos = Object.entries(s.ids).map(([id, papel]) => ({
      id,
      papel,
      motivo: "preservado-sem-efeitos-apos-falha-ou-incerteza",
    }));
    if (s.volumeCriado) s.residuos.push({ volume: s.volume, motivo: "preservado" });
    return;
  }
  let falha;
  for (const [id, papel] of Object.entries(s.ids)) {
    try {
      let c = conferirContainer(inspecionar(s, id), s, papel);
      capturar(s, papel + "-final-" + id.slice(0, 8), c);
      capturar(s, papel + "-logs-" + id.slice(0, 8), sucesso(docker(s, ["logs", id])));
      if (c.State.Running) sucesso(docker(s, ["stop", "--time", "10", id]));
      if (c.State.Status !== "created") {
        const codigo = sucesso(docker(s, ["wait", id]));
        assert.match(codigo, /^\d+$/);
        c = conferirContainer(inspecionar(s, id), s, papel);
        assert.equal(c.State.Running, false);
        assert.equal(String(c.State.ExitCode), codigo);
      }
      assert.equal(c.State.Running, false);
      assert.equal(c.State.Paused, false);
      assert.equal(c.State.Restarting, false);
      assert.equal(c.State.Dead, false);
      sucesso(docker(s, ["rm", id]));
      conferirAusencia(docker(s, ["inspect", id]), id, "container");
      s.removidos.push(id);
      delete s.ids[id];
      persistir(s);
    } catch (e) {
      s.preservar = true;
      s.residuos = Object.entries(s.ids).map(([id, papel]) => ({
        id,
        papel,
        motivo: "cleanup-interrompido",
      }));
      if (s.volumeCriado) s.residuos.push({ volume: s.volume });
      persistir(s);
      throw e;
    }
  }
  if (s.volumeCriado && Object.keys(s.ids).length === 0) {
    try {
      const v = JSON.parse(sucesso(docker(s, ["volume", "inspect", s.volume])))[0];
      assert.deepEqual(v, s.volumeCriado);
      assert.equal(sucesso(docker(s, ["ps", "-aq", "--filter", `volume=${s.volume}`])), "");
      sucesso(docker(s, ["volume", "rm", s.volume]));
      conferirAusencia(docker(s, ["volume", "inspect", s.volume]), s.volume, "volume");
      s.volumeAusente = true;
    } catch (e) {
      falha ??= e;
      s.residuos.push({ volume: s.volume });
    }
  }
  if (falha) throw falha;
}
export async function executarEnsaio(fase, evidencia) {
  assert.ok(["vertical", "restantes"].includes(fase));
  assert.ok(path.isAbsolute(evidencia));
  assert.equal(fs.lstatSync(evidencia).uid, process.getuid());
  const s = {
    rodada: randomUUID(),
    base: fs.mkdtempSync(path.join(os.tmpdir(), "bc-")),
    evidencia,
    senha: randomBytes(24).toString("hex"),
    ids: {},
    removidos: [],
    residuos: [],
    manifesto: {},
    imagens: {},
    aceites: [],
    invocacoes: [],
    versoes: {},
  };
  s.projeto = "backup-ensaio-" + s.rodada;
  s.volume = s.projeto + "-pgdata";
  s.repo = path.join(s.base, "repo");
  persistir(s);
  let erro;
  try {
    await preparar(s, path.resolve(import.meta.dirname, "../.."));
    if (fase === "vertical") {
      const b = await restaurarPositivo(s, "age");
      const r = executar(
        path.join(s.base, "bin/age"),
        [
          "--decrypt",
          "-i",
          s.env.BACKUP_AGE_CHAVE_PRIVADA,
          path.join(s.env.BACKUP_BANCO_DIR, b.p.ambiente),
        ],
        s.env,
      );
      sucesso(r);
      assert.equal(r.stdout, fs.readFileSync(s.env.APP_ENV_FILE, "utf8"));
      s.aceites.push("ambiente-age-cifrado-recuperado");
    } else await restantes(s);
  } catch (e) {
    erro = e;
    s.preservar = true;
    persistir(s);
    fs.writeFileSync(path.join(evidencia, "erro.log"), e.stack + "\n", { mode: 0o600 });
  }
  try {
    limpar(s);
  } catch (e) {
    erro ??= e;
    fs.writeFileSync(path.join(evidencia, "cleanup-erro.log"), e.stack + "\n", { mode: 0o600 });
  }
  if (s.env)
    for (const [nome, hash] of Object.entries(s.manifesto)) {
      try {
        assert.equal(sha(fs.readFileSync(path.resolve(import.meta.dirname, "../..", nome))), hash);
      } catch (e) {
        erro ??= e;
      }
    }
  const publico = {
    fase,
    status: erro ? "falha" : "aprovado",
    rodada: s.rodada,
    aceites: s.aceites,
    manifesto: s.manifesto,
    versoes: s.versoes,
    invocacoes: s.invocacoes,
    removidos: s.removidos,
    residuos: s.residuos,
    incerteza: s.incerteza ?? null,
    volumeAusente: s.volumeAusente === true,
    basePrivada: s.base,
    classe: "Compose real, PostgreSQL17, app HTTP sintético; rclone local, não Dropbox",
  };
  gravar(path.join(evidencia, "resultado.json"), publico);
  if (erro) throw erro;
  assert.equal(s.residuos.length, 0);
  assert.equal(s.volumeAusente, true);
  return publico;
}
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    if (process.argv[2] === "--docker" || process.argv[2] === "--curl")
      transporte(process.argv[3], process.argv.slice(4), process.argv[2] === "--curl");
    else
      process.stdout.write(
        JSON.stringify(await executarEnsaio(process.argv[2], process.argv[3])) + "\n",
      );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
