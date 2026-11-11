// Prova o produtor Bash, pg_dump/TLS/snapshot, cifra e hook em PostgreSQL descartável.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const h = (b) => createHash("sha256").update(b).digest("hex");
const raiz = path.resolve(import.meta.dirname, "../..");
// Precondições antes de initdb, clientes ou fixtures; ausência nunca é skip.
assert.equal(process.env.ORIGEM_BACKUP_ENSAIO, "/ensaio");
assert.ok(fs.existsSync("/.dockerenv"));
assert.equal(process.getuid(), 999);
assert.equal(process.getgid(), 999);
assert.deepEqual(fs.readdirSync("/sys/class/net"), ["lo"]);
assert.equal(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length, 1);
assert.ok(!fs.existsSync("/var/run/docker.sock") && !fs.existsSync("/run/docker.sock"));
assert.match(fs.readFileSync("/proc/self/status", "utf8"), /^CapEff:\s*0+$/m);
assert.match(fs.readFileSync("/proc/self/status", "utf8"), /^NoNewPrivs:\s*1$/m);
function executar(bin, args, env, esperado = 0) {
  const r = spawnSync(bin, args, {
    cwd: raiz,
    env,
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  assert.equal(r.status, esperado, `${bin}: ${r.stdout}\n${r.stderr}`);
  return r;
}
test(
  "CLI URL real produz origem que o hook aceita e o dump recupera",
  { timeout: 180000 },
  async () => {
    const temp = fs.mkdtempSync("/ensaio/cli-");
    const baseEnv = { PATH: process.env.PATH, HOME: temp, LANG: "C", TMPDIR: temp };
    const data = path.join(temp, "pgdata");
    const pvc = path.join(temp, "pvc");
    const banco = path.join(pvc, "banco"),
      estado = path.join(pvc, "estado");
    fs.mkdirSync(banco, { recursive: true });
    fs.mkdirSync(estado, { recursive: true });
    const cert = path.join(temp, "ca.crt"),
      key = path.join(temp, "tls.key");
    executar(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=origem-sintetica",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
      ],
      baseEnv,
    );
    fs.chmodSync(key, 0o600);
    executar("initdb", ["-D", data, "-U", "sintetico", "-A", "trust", "--no-locale"], baseEnv);
    fs.appendFileSync(
      path.join(data, "postgresql.conf"),
      `\nlisten_addresses='127.0.0.1'\nport=55432\nunix_socket_directories='${temp}'\nssl=on\nssl_cert_file='${cert}'\nssl_key_file='${key}'\n`,
    );
    executar("pg_ctl", ["-D", data, "-l", path.join(temp, "postgres.log"), "-w", "start"], baseEnv);
    try {
      const conn = `postgresql://sintetico:senha-sintetica@127.0.0.1:55432/postgres?sslmode=verify-full&sslrootcert=${encodeURIComponent(cert)}`;
      executar(
        "psql",
        [
          conn,
          "-v",
          "ON_ERROR_STOP=1",
          "-c",
          "CREATE TABLE public.prova_origem (id integer PRIMARY KEY, valor text NOT NULL); INSERT INTO public.prova_origem VALUES (7, 'massa sintética exclusiva');",
        ],
        baseEnv,
      );
      const q = executar(
        "psql",
        [
          conn,
          "-At",
          "-c",
          "SELECT json_build_object('systemIdentifier',c.system_identifier::text,'databaseOid',d.oid::text,'schemaOid',n.oid::text) FROM pg_control_system() c,pg_database d,pg_namespace n WHERE d.datname=current_database() AND n.nspname='public'",
        ],
        baseEnv,
      );
      const identidade = JSON.parse(q.stdout.trim());
      const age = path.join(temp, "age.key");
      executar("age-keygen", ["-o", age], baseEnv);
      const pub = executar("age-keygen", ["-y", age], baseEnv).stdout.trim();
      const destinatarios = path.join(temp, "age-recipients.txt");
      fs.writeFileSync(destinatarios, pub + "\n");
      const politica = path.join(temp, "policy.json"),
        chave = path.join(temp, "hmac");
      const p = {
        versao: 1,
        adocao: "operador-confiavel-v1",
        perfil: "postgres-direto-tls-snapshot-v1",
        produtor: "cli-isolada",
        chaveId: "sintetica-v1",
        endpoint: { host: "127.0.0.1", port: 55432, database: "postgres", user: "sintetico" },
        tls: { caSha256: h(fs.readFileSync(cert)), rootCert: cert },
        identidade: structuredClone(identidade),
        schema: "public",
        remoto: "",
        criptografia: "age",
        destinatario: h(fs.readFileSync(destinatarios)),
        idadeMaximaHoras: 36,
        duracaoMaximaSegundos: 3600,
      };
      fs.writeFileSync(politica, JSON.stringify(p));
      fs.writeFileSync(chave, randomBytes(32), { mode: 0o600 });
      const url = conn + "&schema=public";
      const env = {
        ...baseEnv,
        DATABASE_URL: url,
        DIRECT_URL: url,
        BACKUP_DATABASE_URL: url,
        DATABASE_SCHEMA: "public",
        APP_DIR: raiz,
        SERVIDOR_AMBIENTE_INJETADO: "true",
        SERVIDOR_LOCK_DIR: path.join(temp, "locks"),
        BACKUP_DIR: pvc,
        BACKUP_BANCO_DIR: banco,
        ESTADO_DIR: estado,
        BACKUP_MODO: "url",
        BACKUP_ORIGEM_POLICY: politica,
        BACKUP_ORIGEM_CHAVE: chave,
        BACKUP_CRIPTOGRAFIA: "age",
        BACKUP_AGE_DESTINATARIOS: destinatarios,
        BACKUP_AGE_DESTINATARIOS_SHA256: p.destinatario,
        BACKUP_INCLUIR_AMBIENTE: "false",
        BACKUP_ESPACO_MINIMO_MB: "1",
      };
      executar("bash", ["scripts/servidor/backup-banco.sh"], env);
      const ponteiro = JSON.parse(fs.readFileSync(path.join(estado, "ultimo-backup.json"), "utf8"));
      const reciboPath = path.join(banco, ponteiro.recibo);
      const r = JSON.parse(fs.readFileSync(reciboPath, "utf8"));
      assert.equal(
        r.origem?.algoritmo,
        "hmac-sha256",
        "CLI deve atestar os bytes do pg_dump, não apenas campos autodeclarados",
      );
      assert.deepEqual(r.origem.identidade, identidade);
      const gate = ["infra/kubernetes/frequenciapp/files/verificar-backup.sh"];
      assert.match(executar("bash", gate, env).stdout, /Origem autenticada/);
      executar("bash", ["scripts/servidor/backup-banco.sh", "--verificar"], env);
      const dump = path.join(temp, "recuperacao.dump");
      executar(
        "age",
        ["--decrypt", "-i", age, "-o", dump, path.join(banco, ponteiro.arquivo)],
        baseEnv,
      );
      assert.equal(
        h(fs.readFileSync(dump)),
        r.origem.dumpSha256,
        "hash do dump bruto é o do dump efetivamente recuperado",
      );
      executar(
        "psql",
        [conn, "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE recuperacao"],
        baseEnv,
      );
      const destino = conn.replace("/postgres?", "/recuperacao?");
      executar(
        "pg_restore",
        ["--exit-on-error", "--clean", "--if-exists", "--no-owner", "--dbname", destino, dump],
        baseEnv,
      );
      assert.equal(
        executar(
          "psql",
          [destino, "-At", "-c", "SELECT id || ':' || valor FROM public.prova_origem"],
          baseEnv,
        ).stdout.trim(),
        "7:massa sintética exclusiva",
      );
      // A identidade consultada usa o mesmo endpoint/snapshot; divergência real impede produzir.
      const intacto = fs.readFileSync(reciboPath);
      p.identidade.databaseOid = String(Number(identidade.databaseOid) + 1);
      fs.writeFileSync(politica, JSON.stringify(p));
      const divergiu = executar(
        "node",
        ["scripts/servidor/origem-backup.mjs", "dump", path.join(temp, "nao-produz.json")],
        env,
        1,
      );
      assert.match(divergiu.stderr, /Identidade operacional diverge/);
      assert.equal(fs.existsSync(path.join(temp, "nao-produz.json")), false);
      p.identidade = identidade;
      fs.writeFileSync(politica, JSON.stringify(p));
      for (const mutar of [
        () => {
          const ruim = structuredClone(r);
          ruim.escopo.schema = "outro";
          fs.writeFileSync(reciboPath, JSON.stringify(ruim));
        },
        () => {
          const ruim = structuredClone(r);
          delete ruim.origem;
          fs.writeFileSync(reciboPath, JSON.stringify(ruim));
        },
      ]) {
        fs.writeFileSync(reciboPath, intacto);
        executar("bash", gate, env);
        mutar();
        executar("bash", gate, env, 1);
      }
      fs.writeFileSync(reciboPath, intacto);
      const conteudo = fs.readFileSync(path.join(banco, ponteiro.arquivo));
      fs.appendFileSync(path.join(banco, ponteiro.arquivo), "adulterado");
      assert.match(executar("bash", gate, env, 1).stderr, /Artefato/);
      fs.writeFileSync(path.join(banco, ponteiro.arquivo), conteudo);
      const segredo = fs.readFileSync(chave);
      fs.writeFileSync(chave, randomBytes(32));
      assert.match(executar("bash", gate, env, 1).stderr, /HMAC/);
      fs.writeFileSync(chave, segredo);
      executar(
        "node",
        [
          "scripts/servidor/origem-backup.mjs",
          "executar",
          "node",
          "-e",
          "process.stdout.write('runtime-validado')",
        ],
        env,
      );
      const errado = { ...env, DIRECT_URL: url.replace("127.0.0.1", "127.0.0.2") };
      assert.match(
        executar(
          "node",
          [
            "scripts/servidor/origem-backup.mjs",
            "executar",
            "node",
            "-e",
            "throw new Error('não executar')",
          ],
          errado,
          1,
        ).stderr,
        /mesma URL direta/,
      );
      for (const n of fs.readdirSync(banco))
        assert.equal(
          fs.readFileSync(path.join(banco, n)).includes(segredo),
          false,
          "HMAC não pode ser persistido no PVC",
        );
      process.stdout.write(
        "Fluxo CLI, snapshot TLS, recuperação e hook autenticado comprovados em massa sintética.\n",
      );
    } finally {
      executar("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], baseEnv);
    }
  },
);
