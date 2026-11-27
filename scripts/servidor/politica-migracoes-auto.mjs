// Inventaria o lote Git e classifica um subconjunto fechado de DDL PostgreSQL.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pasta = "prisma/migrations";
const caminhoSql = /^prisma\/migrations\/[0-9]{14}_[a-z0-9_]{1,120}\/migration\.sql$/;
const limiteSql = 128 * 1024;
const texto = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const tipos = new Set([
  "BIGINT",
  "BOOLEAN",
  "BYTEA",
  "DATE",
  "DOUBLE",
  "INTEGER",
  "JSONB",
  "REAL",
  "SMALLINT",
  "TEXT",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "UUID",
  "VARCHAR",
]);

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

export function validarSqlAutomatico(bytes) {
  const recusa = "SQL fora da política automática de migrações.";
  exigir(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= limiteSql, recusa);
  const sql = bytes.toString("latin1");
  exigir(!/[^\x20-\x7e\t\r\n]/.test(sql), recusa);
  // Identificadores entre aspas duplas (sem escapes), comentários de linha,
  // palavras, inteiros e pontuação do subconjunto. O cursor nunca pula um byte.
  const lexico =
    /[ \t\r\n]+|--[^\r\n]*|"[a-z_][a-z0-9_]{0,62}"|[a-zA-Z_][a-zA-Z_0-9]*|[0-9]+|[(),;.]/y;
  let token;
  function avancar() {
    while (lexico.lastIndex < sql.length) {
      const trecho = lexico.exec(sql)?.[0];
      exigir(trecho !== undefined, recusa);
      if (!/^[ \t\r\n]|^--/.test(trecho)) {
        token = trecho.toUpperCase();
        return;
      }
    }
    token = undefined;
  }
  function consumir(esperado) {
    if (token !== esperado) return false;
    avancar();
    return true;
  }
  function tomar(esperado) {
    exigir(consumir(esperado), recusa);
  }
  function identificador() {
    exigir(token?.startsWith('"'), recusa);
    const nome = token;
    avancar();
    return nome;
  }
  function tipo() {
    const nome = token;
    exigir(tipos.has(nome), recusa);
    avancar();
    if (nome === "DOUBLE") tomar("PRECISION");
    if (["TIMESTAMP", "TIMESTAMPTZ", "VARCHAR"].includes(nome) && consumir("(")) {
      exigir(
        /^([0-9]{1,3})$/.test(token) && Number(token) <= (nome === "VARCHAR" ? 999 : 6),
        recusa,
      );
      exigir(nome !== "VARCHAR" || Number(token) > 0, recusa);
      avancar();
      tomar(")");
    }
    if (nome === "TIMESTAMP" && (consumir("WITH") || consumir("WITHOUT"))) {
      tomar("TIME");
      tomar("ZONE");
    }
  }
  avancar();
  exigir(token !== undefined, recusa);
  do {
    if (consumir("CREATE")) {
      tomar("TABLE");
      identificador();
      tomar("(");
      const colunas = new Set();
      do {
        const nome = identificador();
        exigir(!colunas.has(nome), recusa);
        colunas.add(nome);
        tipo();
        if (consumir("NOT")) tomar("NULL");
        else consumir("NULL");
      } while (consumir(","));
      tomar(")");
    } else {
      tomar("ALTER");
      tomar("TABLE");
      consumir("ONLY");
      identificador();
      tomar("ADD");
      tomar("COLUMN");
      identificador();
      tipo();
    }
    // Não permitir concatenação entre instruções sem terminador explícito.
    tomar(";");
  } while (token !== undefined);
}

function git(repo, limite, ...args) {
  const r = spawnSync(
    "/usr/bin/git",
    ["--no-replace-objects", "--literal-pathspecs", "-C", repo, ...args],
    {
      timeout: 10000,
      maxBuffer: limite,
      env: {
        PATH: "/usr/bin:/bin",
        LC_ALL: "C",
        GIT_ALLOW_PROTOCOL: "",
        GIT_TERMINAL_PROMPT: "0",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
      },
    },
  );
  exigir(r.status === 0 && !r.error, "Não foi possível conferir os objetos Git das migrações.");
  return r.stdout;
}

function arvore(repo, revisao) {
  const resp = git(repo, 1024 * 1024, "ls-tree", "-rtz", "--full-tree", revisao, "--", pasta);
  const linhas = texto.decode(resp).split("\0");
  const entradas = new Map();
  const sqls = [];
  exigir(linhas.pop() === "", "Inventário Git das migrações inválido.");
  for (const linha of linhas) {
    const m = /^(040000 tree|100644 blob) ([0-9a-f]{40})\t([a-zA-Z0-9_.\-/]+)$/.exec(linha);
    exigir(m && m[0] === linha, "Modo ou caminho Git das migrações inválido.");
    const [, modo, oid, nome] = m;
    if (nome === "prisma" && modo === "040000 tree") continue;
    exigir(!entradas.has(nome), "Caminho Git duplicado no inventário de migrações.");
    entradas.set(nome, { modo, oid });
    if (nome === pasta || nome === `${pasta}/migration_lock.toml`) {
      exigir(
        modo === (nome === pasta ? "040000 tree" : "100644 blob"),
        "Raiz ou lockfile de migrações inválido.",
      );
    } else if (modo === "040000 tree") {
      exigir(caminhoSql.test(`${nome}/migration.sql`), "Diretório de migração fora do padrão.");
    } else {
      exigir(caminhoSql.test(nome), "Arquivo de migração fora do padrão.");
      sqls.push(nome);
    }
  }
  for (const [nome, { modo }] of entradas) {
    if (modo === "040000 tree" && nome !== pasta) {
      exigir(
        entradas.get(`${nome}/migration.sql`)?.modo === "100644 blob",
        "Diretório sem migration.sql regular.",
      );
    }
  }
  exigir(
    entradas.get(pasta)?.modo === "040000 tree" && sqls.length > 0,
    "Histórico Git de migrações vazio.",
  );
  return { entradas, sqls: sqls.sort() };
}

export function inventariarLoteAutomatico(repo, base, alvo) {
  const sha = /^[0-9a-f]{40}$/;
  exigir(typeof repo === "string" && repo.length > 0, "Informe o repositório Git das migrações.");
  exigir(
    [base, alvo].every((s) => typeof s === "string" && s.length === 40 && sha.test(s)) &&
      base !== alvo,
    "Informe dois SHAs completos e distintos.",
  );
  const local = isAbsolute(repo) ? repo : resolve(repo);
  for (const revisao of [base, alvo]) {
    exigir(
      git(local, 64, "cat-file", "-t", revisao).toString() === "commit\n",
      "A revisão precisa ser um commit Git.",
    );
  }
  // Ler o cabeçalho real, não o histórico reinterpretado por grafts/replaces.
  const commit = git(local, 1024 * 1024, "cat-file", "commit", alvo).toString("latin1");
  exigir(commit.split("\n", 2)[1] === `parent ${base}`, "A base não é o primeiro pai do alvo.");

  const anterior = arvore(local, base);
  const candidata = arvore(local, alvo);
  for (const [nome, entrada] of anterior.entradas) {
    if (nome === pasta) continue;
    const atual = candidata.entradas.get(nome);
    exigir(
      atual?.modo === entrada.modo && atual.oid === entrada.oid,
      "Histórico Git de migrações alterado.",
    );
  }
  const lock = `${pasta}/migration_lock.toml`;
  exigir(
    candidata.entradas.has(lock) === anterior.entradas.has(lock),
    "Lockfile de migrações alterado.",
  );
  const novas = candidata.sqls.filter((nome) => !anterior.entradas.has(nome));
  exigir(
    novas.length > 0 && novas.length <= 64,
    "O lote de migrações novas está vazio ou excede o limite.",
  );
  const ultima = anterior.sqls.at(-1).slice(pasta.length + 1, pasta.length + 15);
  for (const nome of novas) {
    const prefixo = nome.slice(pasta.length + 1, pasta.length + 15);
    exigir(prefixo > ultima, "Migração nova não sucede o último prefixo instalado.");
  }
  const migracoes = novas.map((caminho) => {
    const bytes = git(
      local,
      limiteSql + 1,
      "cat-file",
      "blob",
      candidata.entradas.get(caminho).oid,
    );
    validarSqlAutomatico(bytes);
    return { caminho, sha256: createHash("sha256").update(bytes).digest("hex") };
  });
  return { base, alvo, migracoes };
}

const entrada = process.argv[1];
const modulo = fileURLToPath(import.meta.url);
if (
  entrada &&
  entrada !== "-" &&
  (resolve(entrada) === modulo || realpathSync(entrada, { throwIfNoEntry: false }) === modulo)
) {
  try {
    const args = process.argv.slice(2);
    exigir(args.length === 3, "Informe o repositório, a base e o alvo.");
    process.stdout.write(`${JSON.stringify(inventariarLoteAutomatico(...args))}\n`);
  } catch (erro) {
    console.error(`[política de migrações] ${erro.message}`);
    process.exitCode = 1;
  }
}
