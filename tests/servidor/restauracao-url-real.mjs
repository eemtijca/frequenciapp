// Prova o restaurador URL com PostgreSQL 17 sintético dentro do namespace sem rede externa.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

assert.ok(fs.existsSync("/.dockerenv"), "exige contêiner");
assert.equal(process.getuid(), 1000);
assert.equal(process.getgid(), 1000);
process.umask(0o077);
assert.deepEqual(fs.readdirSync("/sys/class/net"), ["lo"]);
assert.equal(fs.readFileSync("/proc/net/route", "utf8").trim().split("\n").length, 1);
assert.ok(!fs.existsSync("/var/run/docker.sock"));
assert.equal(process.env.URL_ENSAIO_SINTETICO, "namespace-verificado-pelo-launcher");
assert.equal(process.env.PGPASSWORD, "senha_sintetica");
assert.match(fs.readFileSync("/proc/self/status", "utf8"), /^CapEff:\s*0+$/m);
assert.match(fs.readFileSync("/proc/self/status", "utf8"), /^NoNewPrivs:\s*1$/m);
const fontes = JSON.parse(fs.readFileSync("/repo/manifesto.json"));
const hash = (dados) => createHash("sha256").update(dados).digest("hex");
const conferirFontes = () => {
  for (const [nome, esperado] of Object.entries(fontes))
    assert.equal(hash(fs.readFileSync(`/repo/${nome}`)), esperado, `fonte alterada: ${nome}`);
};
conferirFontes();
const raiz = fs.mkdtempSync("/tmp/url-real-");
const env = {
  PATH: process.env.PATH,
  HOME: raiz,
  TMPDIR: "/tmp",
  LC_ALL: "C",
  PGPASSWORD: "senha_sintetica",
  PGCONNECT_TIMEOUT: "3",
};
const url = (banco, usuario = "sintetico") => `postgresql://${usuario}@127.0.0.1:5432/${banco}`;
function executar(programa, args, extra = {}) {
  const resultado = spawnSync(programa, args, { env, encoding: "utf8", timeout: 120000, ...extra });
  assert.equal(resultado.error, undefined, `spawn de ${programa} falhou`);
  assert.equal(resultado.signal, null, `${programa} terminou por sinal`);
  assert.ok(Number.isInteger(resultado.status));
  return resultado;
}
function sql(banco, texto) {
  const resultado = executar("psql", [url(banco), "-XqAt", "-v", "ON_ERROR_STOP=1", "-c", texto]);
  assert.equal(resultado.status, 0, "SQL sintético falhou");
  return resultado.stdout.trim();
}
// A identidade independente do DB próprio precede o bootstrap das fixtures.
const prova = fs.lstatSync("/tmp/identidade-url.json");
assert.ok(prova.isFile() && !prova.isSymbolicLink());
assert.equal(prova.uid, process.getuid());
assert.equal(prova.mode & 0o777, 0o600);
const esperada = JSON.parse(fs.readFileSync("/tmp/identidade-url.json"));
const consulta =
  "SELECT json_build_object('banco',current_database(),'usuario',current_user,'versao',current_setting('server_version_num')::integer,'endereco',inet_server_addr()::text,'porta',inet_server_port(),'sistema',c.system_identifier::text,'inicio',pg_postmaster_start_time()::text,'oid',d.oid::bigint,'bases',(SELECT string_agg(datname,',' ORDER BY datname) FROM pg_database WHERE NOT datistemplate),'tabelas',(SELECT count(*) FROM pg_tables WHERE schemaname='public'),'roles',(SELECT count(*) FROM pg_roles WHERE rolname !~ '^pg_')) FROM pg_control_system() c, pg_database d WHERE d.datname=current_database()";
const deadline = Date.now() + 30000;
let identidade;
while (Date.now() < deadline) {
  const p = executar(
    "psql",
    ["--dbname", url("postgres"), "-wXqAt", "-v", "ON_ERROR_STOP=1", "-c", consulta],
    {
      env: { ...env, PGOPTIONS: "-c default_transaction_read_only=on" },
      timeout: 5000,
    },
  );
  if (p.status === 0) {
    identidade = JSON.parse(p.stdout.trim());
    break;
  }
  assert.ok(
    p.status === 2 &&
      /connection refused|server closed the connection unexpectedly|database system is starting up/i.test(
        p.stderr,
      ),
    "consulta autenticada recusada, sem retry de erro SQL ou autenticação",
  );
  await new Promise((resolve) => setTimeout(resolve, 250));
}
assert.ok(identidade, "PostgreSQL não respondeu à consulta de identidade no prazo");
assert.deepEqual(
  identidade,
  esperada,
  "runner deve atingir o servidor e o DB próprios, ainda vazios",
);
assert.equal(identidade.banco, "postgres");
assert.equal(identidade.usuario, "sintetico");
assert.ok(identidade.versao >= 170000 && identidade.versao < 180000);
assert.equal(identidade.bases, "postgres");
assert.equal(identidade.tabelas, 0);
assert.equal(identidade.roles, 1);
fs.mkdirSync("/tmp/resultado-url", { mode: 0o700 });
fs.writeFileSync("/tmp/resultado-url/identidade.json", JSON.stringify(identidade) + "\n", {
  mode: 0o600,
});
for (const nome of ["origem", "destino", "erro_destino"])
  sql("postgres", `CREATE DATABASE ${nome}`);
sql(
  "postgres",
  "CREATE ROLE sem_criar LOGIN PASSWORD 'senha_sintetica' NOCREATEDB; CREATE ROLE limitado LOGIN PASSWORD 'senha_sintetica' CREATEDB;",
);
sql("postgres", "ALTER DATABASE erro_destino OWNER TO limitado;");
sql(
  "origem",
  `CREATE TABLE public._prisma_migrations (migration_name text not null, rolled_back_at timestamptz);
INSERT INTO public._prisma_migrations VALUES ('0001_teste', null);
CREATE TABLE public.ensaio_sintetico (id integer primary key, valor text not null);
INSERT INTO public.ensaio_sintetico VALUES (47, 'valor_sintetico');`,
);
for (const nome of ["destino", "erro_destino"])
  sql(
    nome,
    `CREATE TABLE public.sentinela (valor text not null); INSERT INTO public.sentinela VALUES ('inalterada');`,
  );
sql(
  "erro_destino",
  `CREATE TABLE public.ensaio_sintetico (id integer primary key, valor text not null); INSERT INTO public.ensaio_sintetico VALUES (19, 'anterior');`,
);
const dump = path.join(raiz, "original.dump");
assert.equal(
  executar("pg_dump", [url("origem"), "--format=custom", "--no-owner", "--no-acl", "--file", dump])
    .status,
  0,
);
const sha = hash(fs.readFileSync(dump));
const resultados = [];
function restaurar(nome, { ambiente = {}, checksum = sha } = {}) {
  const base = path.join(raiz, nome);
  fs.mkdirSync(base, { mode: 0o700 });
  const ops = {
    ...env,
    APP_DIR: "/repo",
    SERVIDOR_AMBIENTE_INJETADO: "true",
    BACKUP_MODO: "url",
    BACKUP_DATABASE_URL: url("destino"),
    BACKUP_RESTAURACAO_PERFIL: "postgres-direto",
    ESTADO_DIR: path.join(base, "estado"),
    SERVIDOR_LOCK_DIR: path.join(base, "locks"),
    LOG_DIR: path.join(base, "logs"),
    BACKUP_DIR: path.join(base, "backups"),
    DATABASE_SCHEMA: "public",
    ...ambiente,
  };
  const r = executar(
    "bash",
    [
      "/repo/scripts/servidor/restaurar.sh",
      "--arquivo",
      dump,
      "--checksum",
      checksum,
      "--confirmar",
      "--sem-copia",
    ],
    { env: ops },
  );
  fs.writeFileSync(path.join(base, "execucao.log"), r.stdout + r.stderr, { mode: 0o600 });
  assert.equal(hash(fs.readFileSync(dump)), sha, "dump original deve continuar intacto");
  assert.ok(!(r.stdout + r.stderr).includes("senha_sintetica"), "segredo não deve chegar aos logs");
  const estado = fs.existsSync(path.join(ops.ESTADO_DIR, "ultima-restauracao.json"))
    ? JSON.parse(fs.readFileSync(path.join(ops.ESTADO_DIR, "ultima-restauracao.json")))
    : null;
  const pasta = path.join(ops.ESTADO_DIR, "ensaios-url");
  const journals = fs.existsSync(pasta)
    ? fs
        .readdirSync(pasta)
        .map((n) => JSON.parse(fs.readFileSync(path.join(pasta, n, "journal.json"))))
    : [];
  const auditoria = path.join("/tmp/resultado-url/auditoria", nome);
  fs.mkdirSync(auditoria, { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(base, "execucao.log"), path.join(auditoria, "execucao.log"));
  for (const pasta of [ops.ESTADO_DIR, ops.LOG_DIR]) {
    if (fs.existsSync(pasta))
      fs.cpSync(pasta, path.join(auditoria, path.basename(pasta)), { recursive: true });
  }
  return { r, estado, journals };
}
function inalterado() {
  assert.equal(sql("destino", "select valor from public.sentinela"), "inalterada");
  assert.equal(sql("destino", "select count(*) from pg_tables where schemaname='public'"), "1");
}
// O positivo impede que recusas incondicionais tornem os negativos falsamente verdes.
const positivo = restaurar("positivo");
assert.equal(positivo.r.status, 0, positivo.r.stdout + positivo.r.stderr);
assert.equal(positivo.estado.status, "sucesso");
assert.equal(positivo.journals.length, 1);
assert.equal(positivo.journals[0].resultado, "sucesso");
assert.equal(positivo.journals[0].etapa, "descartado");
assert.notEqual(positivo.journals[0].destino.oid, positivo.journals[0].temporario.oid);
assert.equal(
  sql("destino", "select id || ':' || valor from public.ensaio_sintetico"),
  "47:valor_sintetico",
);
assert.equal(
  sql("postgres", "select count(*) from pg_database where datname like 'freq_ensaio_%'"),
  "0",
);
resultados.push({
  cenario: "positivo-real",
  codigo: positivo.r.status,
  sinal: positivo.r.signal,
  resultado: "sucesso",
});
// Remove somente a tabela sintética restaurada neste banco criado pelo harness.
sql("destino", "DROP TABLE public.ensaio_sintetico, public._prisma_migrations");
for (const [nome, validacao] of [
  ["mesma-base", url("destino")],
  ["alias", "postgresql://sintetico@127.0.0.2:5432/%64estino?application_name=alias"],
]) {
  const negativo = restaurar(nome, { ambiente: { BACKUP_RESTAURACAO_URL_VALIDACAO: validacao } });
  assert.equal(negativo.r.status, 1);
  assert.match(negativo.r.stderr, /URL_EXTERNA_RECUSADA/);
  assert.equal(negativo.journals.length, 0);
  inalterado();
  resultados.push({
    cenario: nome,
    codigo: negativo.r.status,
    sinal: negativo.r.signal,
    resultado: "recusado",
  });
}
const checksum = restaurar("checksum", { checksum: "0".repeat(64) });
assert.equal(checksum.r.status, 1);
assert.match(checksum.r.stderr, /checksum.*não confere/i);
assert.equal(checksum.journals.length, 0);
inalterado();
resultados.push({
  cenario: "checksum",
  codigo: checksum.r.status,
  sinal: checksum.r.signal,
  resultado: "recusado",
});
const permissao = restaurar("sem-permissao", {
  ambiente: { BACKUP_DATABASE_URL: url("destino", "sem_criar") },
});
assert.equal(permissao.r.status, 1);
assert.match(permissao.r.stderr, /SEM_PERMISSAO_CREATEDB/);
assert.equal(permissao.journals.length, 1);
assert.equal(permissao.journals[0].etapa, "preparado");
assert.equal(permissao.journals[0].recursoPreservado, false);
inalterado();
resultados.push({
  cenario: "sem-permissao",
  codigo: permissao.r.status,
  sinal: permissao.r.signal,
  resultado: "recusado",
});
const erro = restaurar("erro-destino", {
  ambiente: { BACKUP_DATABASE_URL: url("erro_destino", "limitado") },
});
assert.equal(erro.r.status, 1, "pg_restore deve falhar por ownership da tabela no destino");
assert.match(
  erro.r.stdout + erro.r.stderr,
  /Resultado da restauração URL incerto; intervenção manual necessária/,
);
assert.equal(erro.estado.status, "falha");
assert.equal(erro.journals.length, 1);
assert.equal(
  erro.journals[0].etapa,
  "descartado",
  "ensaio deve ter sido validado antes do erro no destino",
);
assert.equal(
  sql("erro_destino", "select id || ':' || valor from public.ensaio_sintetico"),
  "19:anterior",
);
assert.equal(sql("erro_destino", "select valor from public.sentinela"), "inalterada");
assert.equal(
  sql("postgres", "select count(*) from pg_database where datname like 'freq_ensaio_%'"),
  "0",
);
resultados.push({
  cenario: "erro-destino-transacao",
  codigo: erro.r.status,
  sinal: erro.r.signal,
  resultado: "incerto-manual-estado-observado-intacto",
});
conferirFontes();
fs.writeFileSync(
  "/tmp/resultado-url/resumo.json",
  JSON.stringify(
    { formato: 1, fontes, resultados, dumpIntacto: true, postgres: 17, externo: false },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
// Apenas metadados do ensaio; nunca exportar dump, senha, stdout de SQL ou marcador secreto.
fs.writeFileSync("/tmp/resultado-url/execucoes.json", JSON.stringify(resultados, null, 2) + "\n", {
  mode: 0o600,
});
console.log(
  JSON.stringify({
    resultado: "sucesso",
    cenarios: resultados.length,
    semSkip: true,
    dumpIntacto: true,
  }),
);
