// Exercita o Bash real com catálogo mutável falso, sem PostgreSQL ou Compose reais.
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { randomInt } from "node:crypto";
import path from "node:path";
import { spawnSync } from "node:child_process";

const pastas: string[] = [];
afterEach(() => {
  for (const p of pastas.splice(0)) {
    const evidencia = Object.fromEntries(
      ["eventos.jsonl", "catalogo.json", "estado/ultima-restauracao.json", "tempos.json"].map((nome) => [
        nome,
        existsSync(`${p}/${nome}`) ? readFileSync(`${p}/${nome}`, "utf8") : null,
      ]),
    );
    process.stdout.write(`EVIDENCIA_RESTAURACAO=${JSON.stringify(evidencia)}\n`);
    rmSync(p, { recursive: true, force: true });
  }
});
function ensaiar(
  cenario: string,
  extras: Record<string, string> = {},
  inventario: unknown = {
    versao: 1,
    schemas: ["public"],
    objetos: [{ schema: "public", tipo: "table" }],
    extensoes: ["plpgsql"],
    largeObjects: 0,
    dependenciasExternas: 0,
    globais: 0,
  },
  declararEscopo = true,
) {
  const inicio = performance.now();
  const tempos: Record<string, number> = {};
  const medir = process.env.OPERACAO_MEDIR_TEMPO === "true";
  const p = mkdtempSync(path.join(tmpdir(), "restauracao-falsa-"));
  pastas.push(p);
  mkdirSync(`${p}/bin`);
  mkdirSync(`${p}/estado`);
  const config = {
    name: "sintetico",
    services: { app: {}, db: { volumes: [{ type: "volume", source: "dados", target: "/dados" }] } },
    volumes: { dados: { name: "volume-sintetico" } },
  };
  const daemon = { ID: "daemon-falso" };
  const containers = ["app", "db"].map((servico) => ({
    Id: `${servico}-id`,
    Config: {
      Labels: { "com.docker.compose.project": "sintetico", "com.docker.compose.service": servico },
    },
    Mounts:
      servico === "db"
        ? [
            {
              Type: "volume",
              Name: "volume-sintetico",
              Source: "/dados-falsos",
              Destination: "/dados",
            },
          ]
        : [],
  }));
  const original = randomInt(20000, 900000),
    substituto = randomInt(1000000, 2000000);
  const gravar = (n: string, v: unknown) => writeFileSync(`${p}/${n}.json`, JSON.stringify(v));
  gravar("config", config);
  gravar("daemon", daemon);
  gravar("containers", containers);
  gravar("catalogo", {
    cenario,
    inventario,
    oidSubstituto: substituto,
    bancos: [{ oid: original, nome: "frequencia", conteudo: "original" }],
    app: true,
  });
  writeFileSync(`${p}/dump`, "conteudo ficticio, nao arquivo PostgreSQL\n");
  writeFileSync(
    `${p}/bin/docker`,
    `#!/bin/sh\nexec "${process.execPath}" -- "${path.resolve("tests/servidor/restauracao-falsa.mjs")}" "$@"\n`,
    { mode: 0o700 },
  );
  for (const cliente of ["psql", "pg_restore"])
    writeFileSync(
      `${p}/bin/${cliente}`,
      `#!/bin/sh\nexec "${process.execPath}" -- "${path.resolve("tests/servidor/restauracao-falsa.mjs")}" compose exec -T db ${cliente} "$@"\n`,
      { mode: 0o700 },
    );
  const inicioAdotar = performance.now();
  const adotar = spawnSync(
    process.execPath,
    ["scripts/servidor/identidade.mjs", "adotar", `${p}/identidade.json`],
    {
      input: JSON.stringify({
        config,
        daemon,
        containers,
        parametros: { projeto: "sintetico", app: "app", db: "db" },
      }),
      encoding: "utf8",
    },
  );
  tempos.adotar = performance.now() - inicioAdotar;
  expect(adotar.status, adotar.stderr).toBe(0);
  const env = {
    NODE_ENV: "test",
    PATH: `${p}/bin:${process.env.PATH}`,
    ...(medir ? { PS4: "+TEMPO:${EPOCHREALTIME}:${BASHPID}:${LINENO}: " } : {}),
    HOME: p,
    TMPDIR: p,
    APP_DIR: process.cwd(),
    SERVIDOR_AMBIENTE_INJETADO: "true",
    BACKUP_MODO: "compose",
    ESTADO_DIR: `${p}/estado`,
    SERVIDOR_LOCK_DIR: `${p}/locks`,
    SERVIDOR_IDENTIDADE_ARQUIVO: `${p}/identidade.json`,
    COMPOSE_PROJECT_NAME: "sintetico",
    COMPOSE_ARQUIVOS: "compose.yml",
    BACKUP_PLANILHAS_HABILITADO: "false",
    POSTGRES_DB: "frequencia",
    RESTAURACAO_FIXTURE: p,
    RESTAURAR_VERIFICAR_SAUDE_PUBLICA: "false",
    ...extras,
  };
  const inicioInfo = performance.now();
  const prova = spawnSync(`${p}/bin/docker`, ["info"], { env, encoding: "utf8", input: "" });
  tempos.info = performance.now() - inicioInfo;
  expect(prova.status, prova.stderr + readFileSync(`${p}/bin/docker`, "utf8")).toBe(0);
  const executar = (args: string[]) =>
    spawnSync("bash", [...(medir ? ["-x"] : []), "scripts/servidor/restaurar.sh", ...args], {
      env,
      encoding: "utf8",
      timeout: 20000,
    });
  tempos.setup = performance.now() - inicio;
  const inicioBash = performance.now();
  const resultado = executar([
    "--arquivo",
    `${p}/dump`,
    "--confirmar",
    "--sem-copia",
    ...(declararEscopo ? ["--escopo-legado", extras.DATABASE_SCHEMA ?? "public"] : []),
    ...(extras.BACKUP_MODO === "url" ? ["--sem-validacao"] : []),
  ]);
  tempos.bash = performance.now() - inicioBash;
  tempos.total = performance.now() - inicio;
  writeFileSync(`${p}/tempos.json`, JSON.stringify(tempos));
  expect(readFileSync(`${p}/catalogo.json`, "utf8")).toContain("original");
  if (resultado.stderr) process.stderr.write(resultado.stderr);
  return {
    p,
    original,
    substituto,
    resultado,
    executar,
    ler: () => JSON.parse(readFileSync(`${p}/catalogo.json`, "utf8")),
    eventos: () =>
      readFileSync(`${p}/eventos.jsonl`, "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l)),
  };
}
it.each(["reconciliacao-final", "reconciliacao-final-stop-falha"])(
  "confirma parada antes de recuperar após %s",
  (cenario) => {
    const t = ensaiar(cenario);
    expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).not.toBe(0);
    const eventos = t.eventos();
    const partida = eventos.findIndex((e) => e.args.includes("up"));
    expect(partida).toBeGreaterThan(0);
    const posteriores = eventos.slice(partida + 1);
    expect(posteriores.some((e) => e.args.includes("stop"))).toBe(true);
    const renomeacoes = posteriores.filter((e) => e.sql.includes("restauracao:renomear"));
    if (cenario.endsWith("stop-falha")) {
      expect(renomeacoes).toEqual([]);
      expect(t.ler().app).toBe(true);
      expect(JSON.parse(readFileSync(`${t.p}/estado/ultima-restauracao.json`, "utf8")).status).toBe("recuperacao-pendente");
    } else {
      expect(renomeacoes).toHaveLength(2);
      expect(renomeacoes.every((e) => e.app === false)).toBe(true);
      expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(t.original);
    }
  },
);
it("recupera original após falha entre renomeações e preserva substituto", () => {
  const t = ensaiar("entre");
  expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).not.toBe(0);
  expect(
    t.eventos().some((e) => e.sql.toLowerCase().includes("rename")),
    t.resultado.stdout + t.resultado.stderr + JSON.stringify(t.eventos()),
  ).toBe(true);
  expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(
    t.original,
  );
  expect(t.ler().bancos.some((b: { oid: number }) => b.oid === t.substituto)).toBe(true);
  expect(t.ler().partidas).toEqual([t.original]);
});
it.each(["antes", "resposta-primeira", "resposta-segunda", "resposta-recuperacao", "subida"])(
  "reconcilia falha %s por OIDs sem descartar nenhum banco",
  (cenario) => {
    const t = ensaiar(cenario);
    expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).not.toBe(0);
    expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(
      t.original,
    );
    expect(
      t
        .ler()
        .bancos.map((b: { oid: number }) => b.oid)
        .sort(),
    ).toEqual([t.original, t.substituto].sort());
    expect(t.eventos().filter((e) => e.args.includes("dropdb"))).toEqual([]);
    const diario = JSON.parse(readFileSync(`${t.p}/estado/ultima-restauracao.json`, "utf8"));
    expect(diario.status).toBe("recuperado");
    for (const e of t.eventos().filter((e) => e.sql.includes("restauracao:renomear"))) {
      expect(e.estado.intencao).toBeTruthy();
      expect([t.original, t.substituto]).toContain(Number(e.vars.oid));
      expect(e.sql).toContain("oid=:'oid'::oid and datname=:'origem'");
    }
  },
);
it("reentrada explícita recupera falha de rollback sem sobrescrever o diário", () => {
  const t = ensaiar("rollback");
  expect(t.resultado.status).not.toBe(0);
  const d = JSON.parse(readFileSync(`${t.p}/estado/ultima-restauracao.json`, "utf8"));
  expect(d.status).toBe("recuperacao-pendente");
  expect(t.ler().partidas ?? []).toEqual([]);
  const r = t.executar(["--recuperar", d.diario, "--confirmar"]);
  expect(r.status, r.stdout + r.stderr).toBe(0);
  expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(
    t.original,
  );
  expect(t.ler().bancos.some((b: { oid: number }) => b.oid === t.substituto)).toBe(true);
});
it("escopo: recusa schema adicional com marcador antes de parar aplicação", () => {
  const t = ensaiar(
    "normal",
    {},
    {
      versao: 1,
      schemas: ["public", "legado"],
      objetos: [
        { schema: "public", tipo: "table" },
        { schema: "legado", tipo: "table" },
      ],
      extensoes: ["plpgsql"],
      largeObjects: 0,
      dependenciasExternas: 0,
      globais: 0,
    },
  );
  expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).not.toBe(0);
  expect(
    t
      .eventos()
      .filter(
        (e) =>
          e.args.includes("stop") ||
          e.args.includes("dropdb") ||
          e.sql.toLowerCase().includes("rename"),
      ),
  ).toEqual([]);
  expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(
    t.original,
  );
});
it.each<[string, Record<string, unknown> | null]>([
  ["large-object", { largeObjects: 1 }],
  ["dependencia", { dependenciasExternas: 1 }],
  ["global", { globais: 1 }],
  ["extensao", { extensoes: ["plpgsql", "extensao_desconhecida"] }],
  ["inventario-nulo", null],
  ["inventario-sem-campo", { largeObjects: undefined }],
  ["schema-vazio", { schemas: ["public", "legado"] }],
])("escopo: recusa %s sem descarte mesmo com manter anterior falso", (_nome, alteracao) => {
  const base = {
    versao: 1,
    schemas: ["public"],
    objetos: [{ schema: "public", tipo: "table" }],
    extensoes: ["plpgsql"],
    largeObjects: 0,
    dependenciasExternas: 0,
    globais: 0,
  };
  const t = ensaiar(
    "normal",
    { RESTAURAR_MANTER_ANTERIOR: "false" },
    alteracao === null ? null : { ...base, ...alteracao },
  );
  expect(t.resultado.status).not.toBe(0);
  expect(
    t
      .eventos()
      .filter(
        (e) =>
          e.args.includes("stop") ||
          e.args.includes("dropdb") ||
          e.sql.toLowerCase().includes("rename"),
      ),
  ).toEqual([]);
});
it("escopo: erro de consulta não equivale a inventário vazio", () => {
  const t = ensaiar("inventario-erro");
  expect(t.resultado.status).not.toBe(0);
  expect(t.eventos().some((e) => e.sql.includes("restauracao:inventario"))).toBe(true);
  expect(
    t
      .eventos()
      .filter(
        (e) =>
          e.args.includes("stop") ||
          e.args.includes("dropdb") ||
          e.sql.toLowerCase().includes("rename"),
      ),
  ).toEqual([]);
});
it("escopo: aceita schema não público dedicado e preserva original", () => {
  const t = ensaiar(
    "normal",
    { DATABASE_SCHEMA: "escola" },
    {
      versao: 1,
      schemas: ["public", "escola"],
      objetos: [{ schema: "escola", tipo: "table" }],
      extensoes: ["plpgsql"],
      largeObjects: 0,
      dependenciasExternas: 0,
      globais: 0,
    },
  );
  expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).toBe(0);
  expect(t.ler().bancos.find((b: { nome: string }) => b.nome === "frequencia")?.oid).toBe(
    t.substituto,
  );
  expect(t.ler().bancos.some((b: { oid: number }) => b.oid === t.original)).toBe(true);
});
it("metadados: recusa dump legado sem declaração explícita de escopo", () => {
  const t = ensaiar("normal", {}, undefined, false);
  expect(t.resultado.status).not.toBe(0);
  expect(
    t
      .eventos()
      .filter(
        (e) =>
          e.args.includes("stop") || e.args.includes("createdb") || e.args.includes("pg_restore"),
      ),
  ).toEqual([]);
});
it("escopo: exige preservação do anterior em vez de ignorar manter falso", () => {
  const t = ensaiar("normal", { RESTAURAR_MANTER_ANTERIOR: "false" });
  expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).not.toBe(0);
  expect(
    t
      .eventos()
      .filter(
        (e) => e.args.includes("stop") || e.args.includes("createdb") || e.args.includes("dropdb"),
      ),
  ).toEqual([]);
});
it("url: filtra restauração pelo schema e inventaria dependências antes de clean", () => {
  const t = ensaiar(
    "normal",
    { BACKUP_MODO: "url", BACKUP_DATABASE_URL: "postgresql://sintetico/sem-rede" },
    {
      versao: 1,
      schemas: ["public", "legado"],
      objetos: [
        { schema: "public", tipo: "table" },
        { schema: "legado", tipo: "table" },
      ],
      extensoes: ["plpgsql"],
      largeObjects: 0,
      dependenciasExternas: 0,
      globais: 0,
    },
  );
  expect(t.resultado.status, t.resultado.stdout + t.resultado.stderr).toBe(0);
  const e = t.eventos();
  const restore = e.findIndex((e) => e.args.includes("pg_restore") && e.args.includes("--clean"));
  const inventario = e.findIndex((e) => e.sql.includes("restauracao:inventario"));
  expect(inventario).toBeGreaterThanOrEqual(0);
  expect(inventario).toBeLessThan(restore);
  expect(e[restore].args).toContain("--schema=public");
  expect(e[restore].args).toContain("--strict-names");
  expect(e.filter((e) => e.args.includes("stop") || e.args.includes("dropdb"))).toEqual([]);
});
