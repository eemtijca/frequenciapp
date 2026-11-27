// Exercita a política automática com commits sintéticos e sem banco ou rede.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  inventariarLoteAutomatico,
  validarSqlAutomatico,
} from "../../scripts/servidor/politica-migracoes-auto.mjs";

const raiz = "prisma/migrations/";
const antiga = `${raiz}20260101000000_inicial/migration.sql`;
const primeira = `${raiz}20260201000000_primeira/migration.sql`;
const segunda = `${raiz}20260301000000_segunda/migration.sql`;
const criar = '-- CreateTable\nCREATE TABLE "notas" ("nome" TEXT NOT NULL, "valor" INTEGER);\n';
const acrescentar = 'ALTER TABLE "notas" ADD COLUMN "dia" DATE;\r\n';
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
  const repo = mkdtempSync(join(tmpdir(), "politica-migracoes-"));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync("git", ["-C", repo, ...args], {
      encoding: "utf8",
      env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const escrever = (caminho, bytes, opcoes) => {
    const destino = join(repo, caminho);
    mkdirSync(dirname(destino), { recursive: true });
    writeFileSync(destino, bytes, opcoes);
  };
  const commit = () => {
    git("add", "-A");
    git("commit", "-m", "revisão sintética");
    return git("rev-parse", "HEAD");
  };
  git("init", "--initial-branch=main");
  git("config", "user.name", "Teste");
  git("config", "user.email", "teste@example.invalid");
  escrever(antiga, 'CREATE TABLE "anterior" ("nome" TEXT);\n');
  escrever(`${raiz}migration_lock.toml`, 'provider = "postgresql"\n');
  return { repo, git, escrever, commit, base: commit() };
}

test("inventaria em ordem e calcula SHA-256 dos blobs, não do checkout", (t) => {
  const { repo, base, escrever, commit } = fixture(t);
  escrever(segunda, acrescentar);
  escrever(primeira, criar);
  const alvo = commit();
  escrever(primeira, "mudança não comitada");
  const esperado = {
    base,
    alvo,
    migracoes: [
      { caminho: primeira, sha256: digest(criar) },
      { caminho: segunda, sha256: digest(acrescentar) },
    ],
  };
  assert.deepEqual(inventariarLoteAutomatico(repo, base, alvo), esperado);
  const cli = fileURLToPath(
    new URL("../../scripts/servidor/politica-migracoes-auto.mjs", import.meta.url),
  );
  assert.deepEqual(JSON.parse(execFileSync(process.execPath, [cli, repo, base, alvo])), esperado);
});

test("a política pode ser importada pelo atualizador executado pelo stdin", () => {
  const url = new URL("../../scripts/servidor/politica-migracoes-auto.mjs", import.meta.url);
  const saida = execFileSync(process.execPath, ["--input-type=module", "-"], {
    input: `const m = await import(${JSON.stringify(url.href)}); process.stdout.write(typeof m.inventariarLoteAutomatico);`,
    encoding: "utf8",
  });
  assert.equal(saida, "function");
});

test("CLI via link com preservação do caminho não termina sem inventário", (t) => {
  const { repo, base, escrever, commit } = fixture(t);
  escrever(primeira, criar);
  const alvo = commit();
  const cli = fileURLToPath(
    new URL("../../scripts/servidor/politica-migracoes-auto.mjs", import.meta.url),
  );
  const link = join(repo, "politica.mjs");
  symlinkSync(cli, link);
  const saida = execFileSync(process.execPath, [
    "--preserve-symlinks-main",
    link,
    repo,
    base,
    alvo,
  ]);
  assert.deepEqual(JSON.parse(saida), {
    base,
    alvo,
    migracoes: [{ caminho: primeira, sha256: digest(criar) }],
  });
});

test("recusa base que não seja o primeiro pai real e não usa referências abreviadas", (t) => {
  const { repo, base, escrever, commit } = fixture(t);
  escrever(primeira, criar);
  commit();
  escrever(segunda, acrescentar);
  const alvo = commit();
  assert.throws(() => inventariarLoteAutomatico(repo, base, alvo), /primeiro pai/);
  assert.throws(() => inventariarLoteAutomatico(repo, base, "HEAD"), /SHAs completos/);
});

const alteracoes = {
  "edita histórico": ({ escrever }) => escrever(antiga, criar),
  "remove histórico": ({ repo }) => rmSync(join(repo, antiga)),
  "altera lockfile": ({ escrever }) => escrever(`${raiz}migration_lock.toml`, "mudou\n"),
  "inclui prefixo instalado": ({ escrever }) =>
    escrever(`${raiz}20260101000000_z/migration.sql`, criar),
  "inclui arquivo inesperado": ({ escrever }) =>
    escrever(`${dirname(primeira)}/README.md`, "extra\n"),
  "inclui arquivo executável": ({ escrever }) => escrever(segunda, acrescentar, { mode: 0o755 }),
  "inclui link simbólico": ({ repo }) => {
    mkdirSync(join(repo, dirname(segunda)), { recursive: true });
    symlinkSync("/nao-ler", join(repo, segunda));
  },
};

for (const [caso, alterar] of Object.entries(alteracoes)) {
  test(`recusa candidato que ${caso}`, (t) => {
    const contexto = fixture(t);
    contexto.escrever(primeira, criar);
    alterar(contexto);
    const alvo = contexto.commit();
    assert.throws(() => inventariarLoteAutomatico(contexto.repo, contexto.base, alvo));
  });
}

test("aplica a política ao último blob do lote e não aprova lote vazio", (t) => {
  const { repo, base, escrever, commit } = fixture(t);
  escrever("README.md", "Mudança sem migração\n");
  const pai = commit();
  assert.throws(
    () => inventariarLoteAutomatico(repo, base, pai),
    /lote de migrações novas está vazio/,
  );
  escrever(primeira, criar);
  escrever(segunda, `${acrescentar}UPDATE "t" SET "a" = 1;`);
  const alvo = commit();
  assert.throws(() => inventariarLoteAutomatico(repo, pai, alvo), /SQL fora da política/);
});

test("analisa toda instrução e aceita comentários e tipos incorporados", () => {
  assert.doesNotThrow(() =>
    validarSqlAutomatico(
      Buffer.from(
        '-- DROP nao executado\r\ncreate TABLE "registro" ("total" bigint NOT NULL, "hora" TIMESTAMP(3) WITH TIME ZONE, "sigla" VARCHAR(5) NULL);\n' +
          'alter TABLE ONLY "registro" add COLUMN "dia" date; -- UPDATE nao executado\n',
      ),
    ),
  );
});

const sqlNaoElegivel = {
  "sql vazio": "-- so comentario\n",
  "arquivo inválido": Buffer.from([255]),
  "final sem terminador": 'ALTER TABLE "t" ADD COLUMN "a" INTEGER',
  "comando após DDL": `${criar}UPDATE "t" SET "a" = 1;`,
  "configuração SQL": `${criar}SET ROLE postgres;`,
  "schema qualificado": 'ALTER TABLE "externo"."t" ADD COLUMN "a" TEXT;',
  "tipo não previsto": 'ALTER TABLE "t" ADD COLUMN "a" "dominio";',
  "default executável": 'ALTER TABLE "t" ADD COLUMN "a" UUID DEFAULT gen_random_uuid();',
  identidade: 'ALTER TABLE "t" ADD COLUMN "a" INTEGER GENERATED ALWAYS AS IDENTITY;',
  "restrição adicional": 'ALTER TABLE "t" ADD COLUMN "a" TEXT NOT NULL;',
  "operação adicional": 'ALTER TABLE "t" ADD COLUMN "a" TEXT, DROP COLUMN "b";',
  "operação condicional": 'CREATE TABLE IF NOT EXISTS "t" ("a" TEXT);',
  "instrução com expressão": 'CREATE TABLE "t" AS SELECT 1;',
  herança: 'CREATE TABLE "t" ("a" TEXT) INHERITS ("pai");',
  "restrição referencial": 'CREATE TABLE "t" ("a" TEXT REFERENCES "pai"("id"));',
  índice: 'CREATE INDEX "idx" ON "t" ("a");',
};

for (const [caso, sql] of Object.entries(sqlNaoElegivel)) {
  test(`recusa SQL com ${caso}`, () => {
    assert.throws(() => validarSqlAutomatico(Buffer.from(sql)), /SQL fora da política/);
  });
}
