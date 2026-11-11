// Exercita o hook real e recusas de origem sem banco ou rede.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fixture } from "../servidor/origem-backup.test.mjs";
import {
  assinarRecibo,
  verificarReciboAutenticado,
  conferirConfiguracao,
} from "../../scripts/servidor/origem-backup.mjs";
const raiz = path.resolve(import.meta.dirname, "../..");
function ponteiro(f, r) {
  fs.writeFileSync(path.join(f.banco, `${r.base}.confirmado.json`), JSON.stringify(r));
  fs.writeFileSync(
    path.join(f.estado, "ultimo-backup.json"),
    JSON.stringify({
      em: r.em,
      modo: "url",
      arquivo: f.nome,
      sha256: r.artefatos[0].sha256,
      schema: r.escopo.schema,
      criptografia: r.criptografia,
      remoto: r.remoto,
      verificadoRemoto: r.etapas.remotoVerificado,
      ambiente: "",
      ambienteSha256: "",
      recibo: `${r.base}.confirmado.json`,
    }),
  );
}
function hook(f, args = []) {
  const r = spawnSync(
    "bash",
    ["infra/kubernetes/frequenciapp/files/verificar-backup.sh", ...args],
    {
      cwd: raiz,
      env: { PATH: process.env.PATH, HOME: f.raiz, ...f.env },
      encoding: "utf8",
      timeout: 10000,
    },
  );
  assert.equal(r.error, undefined);
  assert.equal(r.signal, null);
  return r;
}

test("hook protegido aceita produtor autenticado sem flag de bypass", async () => {
  const f = fixture();
  try {
    ponteiro(f, await assinarRecibo(f.recibo, f.evidencia, f.env));
    const r = hook(f);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /Origem autenticada/);
  } finally {
    fs.rmSync(f.raiz, { recursive: true, force: true });
  }
});

for (const [nome, mutar, erro] of [
  [
    "hashes e dump adulterados em conjunto",
    (f, r) => {
      fs.appendFileSync(path.join(f.banco, f.nome), "x");
      r.artefatos[0].sha256 = "f".repeat(64);
    },
    /HMAC/,
  ],
  [
    "artefato alterado sem mudar recibo",
    (f) => fs.appendFileSync(path.join(f.banco, f.nome), "x"),
    /Artefato/,
  ],
  ["chave divergente", (f) => fs.writeFileSync(f.chave, Buffer.alloc(32, 72)), /HMAC/],
  [
    "schema divergente",
    (_, r) => {
      r.escopo.schema = "outro";
    },
    /HMAC/,
  ],
  [
    "endpoint independente divergente",
    (f) => {
      f.p.endpoint.host = "127.0.0.2";
      fs.writeFileSync(f.politica, JSON.stringify(f.p));
    },
    /policy/,
  ],
  [
    "produtor divergente",
    (_, r) => {
      r.origem.produtor = "outro";
    },
    /Origem autenticada/,
  ],
  [
    "recibo legado sem assinatura",
    (_, r) => {
      delete r.origem;
    },
    /Origem autenticada/,
  ],
  [
    "timestamp alterado",
    (_, r) => {
      r.origem.inicio = "2000-01-01T00:00:00Z";
    },
    /HMAC/,
  ],
  [
    "chave no PVC",
    (f) => {
      fs.copyFileSync(f.chave, path.join(f.banco, "segredo"));
      f.env.BACKUP_ORIGEM_CHAVE = path.join(f.banco, "segredo");
    },
    /PVC/,
  ],
])
  test(`hook recusa ${nome}`, async () => {
    const f = fixture();
    try {
      const r = await assinarRecibo(f.recibo, f.evidencia, f.env);
      await verificarReciboAutenticado(r, f.banco, f.env);
      mutar(f, r);
      ponteiro(f, r);
      const resultado = hook(f);
      assert.equal(resultado.status, 1, resultado.stdout + resultado.stderr);
      assert.match(resultado.stderr, erro);
    } finally {
      fs.rmSync(f.raiz, { recursive: true, force: true });
    }
  });

test("runtime e migrador recusam override de endpoint, schema, URL e PGOPTIONS antes de conectar", () => {
  const f = fixture();
  try {
    conferirConfiguracao(f.env);
    for (const alterar of [
      { DIRECT_URL: f.env.DIRECT_URL.replace("127.0.0.1", "127.0.0.2") },
      { DATABASE_SCHEMA: "outro" },
      { PGOPTIONS: "-c search_path=outro" },
      { DATABASE_URL: f.env.DATABASE_URL + "&sslmode=disable" },
    ])
      assert.throws(
        () => conferirConfiguracao({ ...f.env, ...alterar }),
        /URL|override|Override|Schema/,
      );
  } finally {
    fs.rmSync(f.raiz, { recursive: true, force: true });
  }
});

test("ausência de adoção e flag antiga não autorizam hook", () => {
  const f = fixture();
  try {
    delete f.env.BACKUP_ORIGEM_POLICY;
    f.env.ENSAIO_SEM_PROTECAO = "true";
    const r = hook(f);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /Adoção|adoção/);
  } finally {
    fs.rmSync(f.raiz, { recursive: true, force: true });
  }
});
