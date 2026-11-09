#!/usr/bin/env node
// Cliente completamente falso de Compose/PostgreSQL; não abre sockets nem usa daemon.
import fs from "node:fs";
const raiz = process.env.RESTAURACAO_FIXTURE;
const ler = (nome) => JSON.parse(fs.readFileSync(`${raiz}/${nome}.json`, "utf8"));
const gravar = (nome, valor) => fs.writeFileSync(`${raiz}/${nome}.json`, JSON.stringify(valor));
const a = process.argv.slice(2);
const s = ler("catalogo");
const sql = fs.readFileSync(0, "utf8");
const vars = Object.fromEntries(
  a.flatMap((v, i) => (v === "-v" ? [a[i + 1].split(/=(.*)/s).slice(0, 2)] : [])),
);
const evento = { args: a, sql, vars, app: s.app };
try {
  evento.estado = ler("estado/ultima-restauracao");
} catch {}
fs.appendFileSync(`${raiz}/eventos.jsonl`, JSON.stringify(evento) + "\n");
const sair = (v, codigo = 0) => {
  if (v !== undefined) process.stdout.write(typeof v === "string" ? v : JSON.stringify(v));
  process.exit(codigo);
};
if (a[0] === "info") sair(ler("daemon"));
if (a[0] === "inspect") sair(ler("containers"));
if (a[0] !== "compose") sair(undefined, 91);
if (a.includes("config")) {
  if (a.includes("--quiet")) sair();
  if (a.includes("--services")) sair("app\ndb\ncaddy\n");
  if (a.includes("--format")) sair(ler("config"));
  sair(undefined, 92);
}
if (a.includes("ps")) sair("app-id\ndb-id\n");
if (a.includes("stop")) {
  if (s.cenario === "reconciliacao-final-stop-falha" && s.falhaFinal) sair(undefined, 58);
  s.app = false;
  gravar("catalogo", s);
  sair();
}
if (a.includes("up")) {
  s.partidas ??= [];
  s.partidas.push(s.bancos.find((b) => b.nome === "frequencia")?.oid ?? null);
  s.app = true;
  gravar("catalogo", s);
  if (s.cenario === "subida" && s.partidas.length === 1) sair(undefined, 54);
  sair();
}
const executar = a.indexOf("exec");
if (executar < 0) sair(undefined, 93);
const cliente = a[executar + 3];
if (cliente === "createdb") {
  s.bancos.push({ oid: s.oidSubstituto, nome: a.at(-1), conteudo: "substituto" });
  gravar("catalogo", s);
  sair();
}
if (cliente === "dropdb") {
  s.bancos = s.bancos.filter((b) => b.nome !== a.at(-1));
  gravar("catalogo", s);
  sair();
}
if (cliente === "pg_restore") sair();
if (cliente !== "psql") sair(undefined, 94);
if (sql.includes("restauracao:catalogo")) {
  if (s.cenario.startsWith("reconciliacao-final") && s.app && s.renomeacoes === 2 && !s.falhaFinal) {
    s.falhaFinal = true;
    gravar("catalogo", s);
    sair(undefined, 59);
  }
  if (s.cenario === "catalogo-indisponivel" && s.renomeacoes > 0) sair(undefined, 56);
  sair(s.bancos.map((b) => ({ oid: b.oid, nome: b.nome })));
}
if (sql.includes("restauracao:inventario"))
  sair(s.inventario ?? {}, s.cenario === "inventario-erro" ? 57 : 0);
if (sql.includes("restauracao:renomear")) {
  s.renomeacoes = (s.renomeacoes ?? 0) + 1;
  const b = s.bancos.find((b) => String(b.oid) === vars.oid && b.nome === vars.origem);
  if (!b || s.bancos.some((b) => b.nome === vars.destino)) sair(undefined, 55);
  const numero = s.renomeacoes;
  if (
    (s.cenario === "antes" && numero === 1) ||
    (["entre", "rollback", "catalogo-indisponivel"].includes(s.cenario) && numero === 2) ||
    (s.cenario === "rollback" && numero === 3)
  ) {
    gravar("catalogo", s);
    sair(undefined, 53);
  }
  if (s.cenario === "resposta-recuperacao" && numero === 2) {
    gravar("catalogo", s);
    sair(undefined, 53);
  }
  b.nome = vars.destino;
  gravar("catalogo", s);
  if (
    (s.cenario === "resposta-primeira" && numero === 1) ||
    (s.cenario === "resposta-segunda" && numero === 2) ||
    (s.cenario === "resposta-recuperacao" && numero === 3)
  )
    sair(undefined, 52);
  sair();
}
// Reproduz a semântica antiga: a primeira renomeação conclui, a segunda falha.
if (sql.includes('alter database :"banco" rename to :"anterior"')) {
  const original = s.bancos.find((b) => b.nome === vars.banco);
  if (!original) sair(undefined, 55);
  original.nome = vars.anterior;
  s.renomeacoes = 1;
  gravar("catalogo", s);
  if (s.cenario === "entre") sair(undefined, 53);
  s.bancos.find((b) => b.nome === vars.temp).nome = vars.banco;
  s.renomeacoes = 2;
  gravar("catalogo", s);
  sair();
}
if (sql.includes('count(*) from :"schema"._prisma_migrations')) sair("1\n");
if (sql.includes("information_schema.tables")) sair("1\n");
if (sql.includes("migration_name from")) sair("fixture\n");
sair(undefined, 95);
