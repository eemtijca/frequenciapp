// Reconstrói exclusivamente receitas do ensaio a partir de um manifesto local imutável.
import { createHash } from "node:crypto";

export function falha(code) {
  return Object.assign(new Error(code), { code });
}
export function exigir(ok, code) {
  if (!ok) throw falha(code);
}
export const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function fixar(objeto) {
  for (const v of Object.values(objeto)) if (v && typeof v === "object") fixar(v);
  return Object.freeze(objeto);
}
export function iguais(a, b) {
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return a === b;
  const chaves = Object.keys(a).sort();
  return (
    JSON.stringify(chaves) === JSON.stringify(Object.keys(b).sort()) &&
    chaves.every((k) => iguais(a[k], b[k]))
  );
}
export const NOMES = Object.freeze([
  "dump",
  "listar-dump",
  "daemon",
  "config",
  "servicos",
  "ids",
  "inspecionar",
  "construir",
  "revisao-imagem",
  "validar-imagem",
  "subir",
  "sentinela",
  "http-commit",
  "config-quiet",
  "identidade-banco",
  "proxy-config",
]);
export function manifestoFechado(valor) {
  const m = structuredClone(valor);
  const campos = [
    "versao",
    "rodada",
    "projeto",
    "revisoes",
    "operacionalSha256",
    "migradorSha256",
    "banco",
    "usuario",
    "schema",
  ];
  for (const n of ["vertical", "imagemBanco"]) if (Object.hasOwn(m, n)) campos.push(n);
  exigir(iguais(Object.keys(m).sort(), campos.sort()), "MANIFESTO");
  exigir(
    m.versao === 1 &&
      /^[a-z0-9][a-z0-9_-]{1,63}$/.test(m.rodada) &&
      /^[a-z0-9][a-z0-9_-]{1,63}$/.test(m.projeto),
    "MANIFESTO",
  );
  for (const nome of ["operacionalSha256", "migradorSha256"])
    exigir(/^[a-f0-9]{64}$/.test(m[nome]), "MANIFESTO");
  exigir(iguais(Object.keys(m.revisoes).sort(), ["A", "B"]), "MANIFESTO");
  for (const r of Object.values(m.revisoes)) {
    exigir(iguais(Object.keys(r).sort(), ["commit", "contextoSha256", "imagem"]), "MANIFESTO");
    exigir(/^[a-f0-9]{40}$/.test(r.commit) && /^[a-f0-9]{64}$/.test(r.contextoSha256), "MANIFESTO");
    exigir(/^ensaio\/[a-z0-9_-]+:[a-z0-9_.-]+$/.test(r.imagem), "MANIFESTO");
  }
  exigir(
    m.revisoes.A.commit !== m.revisoes.B.commit && m.revisoes.A.imagem !== m.revisoes.B.imagem,
    "MANIFESTO",
  );
  for (const nome of ["banco", "usuario", "schema"])
    exigir(/^[a-z_][a-z0-9_]{0,62}$/.test(m[nome]), "MANIFESTO");
  return fixar(m);
}
export function validarPedido(m, p) {
  exigir(p && Object.getPrototypeOf(p) === Object.prototype, "PEDIDO");
  exigir(NOMES.includes(p.receita), "RECEITA");
  exigir(
    iguais(Object.keys(p).sort(), [
      "commit",
      "contextoSha256",
      "env",
      "operacionalSha256",
      "receita",
      "revisao",
    ]),
    "CAMPOS",
  );
  const r = m.revisoes[p.revisao];
  exigir(r && p.commit === r.commit, "COMMIT");
  exigir(
    p.contextoSha256 === r.contextoSha256 && p.operacionalSha256 === m.operacionalSha256,
    "CONTEXTO",
  );
  exigir(iguais(p.env, { APP_IMAGEM: r.imagem, COMMIT_SHA: r.commit }), "AMBIENTE");
  return r;
}
export function pedidoPara(m, receita, revisao) {
  const r = m.revisoes[revisao];
  exigir(r, "COMMIT");
  return {
    receita,
    revisao,
    commit: r.commit,
    contextoSha256: r.contextoSha256,
    operacionalSha256: m.operacionalSha256,
    env: { APP_IMAGEM: r.imagem, COMMIT_SHA: r.commit },
  };
}
export function receitaBanco(m, nome) {
  const argv =
    nome === "dump"
      ? [
          "pg_dump",
          "-U",
          m.usuario,
          "-d",
          m.banco,
          "-Fc",
          "--no-publications",
          "--no-subscriptions",
          "--strict-names",
          `--schema=${m.schema}`,
          "--lock-wait-timeout=30s",
        ]
      : nome === "listar-dump"
        ? ["pg_restore", "-l"]
        : nome === "sentinela"
          ? [
              "psql",
              "-X",
              "-U",
              m.usuario,
              "-d",
              m.banco,
              "-v",
              "ON_ERROR_STOP=1",
              "-tAc",
              "select valor from marcador",
            ]
          : null;
  exigir(argv, "RECEITA");
  return fixar({ nome, argv, env: {}, stdin: nome === "listar-dump" });
}
export function especificacao(m, papel, imagem) {
  return fixar({
    papel,
    imagem,
    rodada: m.rodada,
    projeto: m.projeto,
    rede: "none",
    somenteLeitura: true,
    usuario: "65534:65534",
    capacidades: [],
    nnp: true,
    memoria: 268435456,
    pids: 64,
    healthcheck: false,
    autoremove: false,
    portas: [],
    mounts: [],
  });
}
