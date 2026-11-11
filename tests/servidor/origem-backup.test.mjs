// Exercita a adoção independente e a autenticação de recibos do produtor URL.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const modulo = new URL("../../scripts/servidor/origem-backup.mjs", import.meta.url);
const hash = (b) => createHash("sha256").update(b).digest("hex");
export function fixture() {
  const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "origem-backup-"));
  const banco = path.join(raiz, "pvc/banco");
  const estado = path.join(raiz, "pvc/estado");
  fs.mkdirSync(banco, { recursive: true });
  fs.mkdirSync(estado, { recursive: true });
  const ca = path.join(raiz, "ca.crt");
  const chave = path.join(raiz, "hmac");
  const politica = path.join(raiz, "policy.json");
  fs.writeFileSync(ca, "CA sintética, sem conexão de rede\n");
  fs.writeFileSync(chave, Buffer.alloc(32, 71), { mode: 0o600 });
  const p = {
    versao: 1,
    adocao: "operador-confiavel-v1",
    perfil: "postgres-direto-tls-snapshot-v1",
    produtor: "cron-banco-escola",
    chaveId: "chave-sintetica-v1",
    endpoint: { host: "127.0.0.1", port: 5432, database: "sintetico", user: "sintetico" },
    tls: { caSha256: hash(fs.readFileSync(ca)), rootCert: ca },
    identidade: { systemIdentifier: "987654321", databaseOid: "16384", schemaOid: "2200" },
    schema: "public",
    remoto: "",
    criptografia: "age",
    destinatario: "a".repeat(64),
    idadeMaximaHoras: 36,
    duracaoMaximaSegundos: 3600,
  };
  fs.writeFileSync(politica, JSON.stringify(p));
  const url = `postgresql://sintetico:senha-sintetica@127.0.0.1:5432/sintetico?sslmode=verify-full&sslrootcert=${encodeURIComponent(ca)}&schema=public`;
  const env = {
    BACKUP_ORIGEM_POLICY: politica,
    BACKUP_ORIGEM_CHAVE: chave,
    DATABASE_URL: url,
    DIRECT_URL: url,
    BACKUP_DATABASE_URL: url,
    DATABASE_SCHEMA: "public",
    BACKUP_BANCO_DIR: banco,
    ESTADO_DIR: estado,
  };
  const base = "frequenciapp-20261110T020000Z-abcdef01";
  const nome = `${base}.dump.age`;
  const bytes = Buffer.from("dump cifrado sintético\n");
  const lista = `${hash(bytes)}  ${nome}\n`;
  fs.writeFileSync(path.join(banco, nome), bytes);
  fs.writeFileSync(path.join(banco, nome + ".sha256"), lista);
  const em = new Date().toISOString();
  const recibo = {
    versao: 1,
    base,
    em,
    escopo: { tipo: "schema", schema: "public", banco: "sintetico", alvo: "origem-pendente" },
    criptografia: "age",
    destinatario: p.destinatario,
    remoto: "",
    etapas: { local: true, remotoVerificado: false, recuperacaoExercitada: false },
    artefatos: [
      { nome, sha256: hash(bytes) },
      { nome: nome + ".sha256", sha256: hash(lista) },
    ],
  };
  const evidencia = {
    inicio: em,
    fim: em,
    snapshot: "00000003-0000001A-1",
    dumpSha256: hash("dump bruto"),
    dumpBytes: 10,
    identidade: p.identidade,
  };
  return { raiz, banco, estado, ca, chave, politica, p, env, recibo, evidencia, nome };
}

test("produtor autentica recibo exato que o consumidor verifica contra policy independente", async () => {
  const { assinarRecibo, verificarReciboAutenticado } = await import(modulo);
  const f = fixture();
  try {
    const r = await assinarRecibo(f.recibo, f.evidencia, f.env);
    const verificado = await verificarReciboAutenticado(r, f.banco, f.env);
    assert.equal(verificado.escopo.banco, "sintetico");
    assert.equal(r.origem.dumpSha256, f.evidencia.dumpSha256);
    assert.equal(JSON.stringify(r).includes("senha-sintetica"), false);
    assert.equal(JSON.stringify(r).includes(fs.readFileSync(f.chave).toString("hex")), false);
  } finally {
    fs.rmSync(f.raiz, { recursive: true, force: true });
  }
});
