// Exercita a retenção Dropbox com API, autoridade e journal sintéticos, sem rede.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as backup from "../../scripts/servidor/backup-recibos.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");

function fixture(quantidade = 6) {
  const identity = {
    accountId: "dbid:synthetic",
    namespaceId: "42",
    folderId: "id:synthetic-folder",
    destino: "fake:backups",
    alvo: "synthetic",
    banco: "db",
    schema: "public",
  };
  const objects = new Map(),
    receipts = [];
  for (let i = 0; i < quantidade; i++) {
    const base = `frequenciapp-20200101T000000Z-${i.toString(16).padStart(8, "0")}`;
    const name = `${base}.dump.gpg`,
      dump = Buffer.from(`dump-${i}`),
      side = Buffer.from(`${sha(dump)}  ${name}\n`);
    const r = {
      versao: 1,
      base,
      em: new Date(Date.UTC(2020, 0, i + 1)).toISOString(),
      criptografia: "gpg",
      destinatario: "fake",
      remoto: identity.destino,
      escopo: {
        tipo: "schema",
        alvo: identity.alvo,
        banco: identity.banco,
        schema: identity.schema,
      },
      etapas: { local: true, remotoVerificado: true, recuperacaoExercitada: false },
      artefatos: [
        { nome: name, sha256: sha(dump) },
        { nome: `${name}.sha256`, sha256: sha(side) },
      ],
    };
    const bytes = Buffer.from(JSON.stringify(r) + "\n");
    receipts.push({ r, bytes });
    for (const [n, b] of [
      [name, dump],
      [`${name}.sha256`, side],
      [`${base}.confirmado.json`, bytes],
    ])
      objects.set(n, { name: n, id: `id:${n}`, rev: `rev:${n}`, type: "file", bytes: b });
  }
  const deletes = [],
    journal = new Map();
  const api = {
    async identity() {
      return { ...identity };
    },
    async list() {
      return {
        entries: [...objects.values()].map(({ name, id, rev, type }) => ({ name, id, rev, type })),
        complete: true,
      };
    },
    async *download({ id, rev }) {
      const o = [...objects.values()].find((v) => v.id === id && v.rev === rev);
      if (!o) throw new Error("revisão ausente");
      yield o.bytes;
    },
    async delete({ id, parent_rev }) {
      const o = [...objects.values()].find((v) => v.id === id);
      if (!o || o.rev !== parent_rev) throw new Error("conflito de revisão");
      deletes.push({ id, parent_rev });
      objects.delete(o.name);
    },
  };
  const store = {
    async list() {
      return {
        complete: true,
        entries: [...journal].map(([chave, valor]) => ({ chave, valor: structuredClone(valor) })),
      };
    },
    async put(chave, valor) {
      journal.set(chave, structuredClone(valor));
    },
  };
  const authority = {
    async assertExclusive(expected) {
      assert.deepEqual(expected, identity);
      return true;
    },
  };
  return { identity, objects, receipts, deletes, journal, api, store, authority };
}

const opts = (f) => ({ ...f, agora: Date.UTC(2025, 0, 1), dias: 30, limiteBytes: 1024 * 1024 });

test("expurga o conjunto mais antigo e preserva os cinco mais novos", async () => {
  const f = fixture();
  assert.equal(typeof backup.executarRetencaoDropbox, "function");
  const resultado = await backup.executarRetencaoDropbox(opts(f));
  assert.deepEqual(resultado.removidos, [f.receipts[0].r.base]);
  assert.equal(f.deletes.length, 3);
  assert.equal(f.objects.size, 15);
  for (const d of f.deletes) assert.equal(d.parent_rev, `rev:${d.id.slice(3)}`);
  for (const { r } of f.receipts.slice(1))
    for (const a of r.artefatos) assert.ok(f.objects.has(a.nome));
  const diario = [...f.journal.values()][0];
  assert.equal(diario.removidos, 3);
  assert.equal(diario.pendente, null);
});

test("mínimo inferior a cinco exige autorização adotada no arquivo privado", async () => {
  const f = fixture();
  await assert.rejects(backup.executarRetencaoDropbox({ ...opts(f), minimo: 4 }), /política/);
  assert.equal(f.deletes.length, 0);
  const permitido = await backup.executarRetencaoDropbox({
    ...opts(f),
    minimo: 4,
    minimoAutorizado: 4,
  });
  assert.deepEqual(permitido.removidos, [f.receipts[0].r.base]);
  assert.equal(f.deletes.length, 3);
});

test("autoridade que nega exclusividade nunca permite exclusão", async () => {
  const f = fixture();
  f.authority.assertExclusive = async () => false;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /exclusividade/);
  assert.deepEqual(f.deletes, []);
  assert.equal(f.objects.size, 18);
});

test("identidade divergente ou inventário incompleto bloqueiam antes de apagar", async () => {
  for (const tipo of ["identity", "list"]) {
    const f = fixture();
    if (tipo === "identity") f.api.identity = async () => ({ ...f.identity, namespaceId: "43" });
    else f.api.list = async () => ({ entries: [], complete: false });
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)));
    assert.equal(f.deletes.length, 0);
  }
});

test("hash incorreto ou stream acima do limite bloqueiam antes de apagar", async () => {
  for (const tipo of ["hash", "limite"]) {
    const f = fixture();
    if (tipo === "hash")
      f.objects.get(f.receipts[1].r.artefatos[0].nome).bytes = Buffer.from("corrompido");
    else {
      const download = f.api.download;
      f.api.download = async function* (ref) {
        yield Buffer.alloc(1025);
        yield* download(ref);
      };
    }
    await assert.rejects(
      backup.executarRetencaoDropbox({
        ...opts(f),
        limiteBytes: tipo === "limite" ? 1024 : 1024 * 1024,
      }),
    );
    assert.equal(f.deletes.length, 0);
  }
});

test("alteração de inventário durante a conferência impede exclusão", async () => {
  const f = fixture(),
    list = f.api.list;
  let chamadas = 0;
  f.api.list = async (...args) => {
    if (++chamadas === 2) f.objects.get(f.receipts[5].r.artefatos[0].nome).rev = "rev:changed";
    return list(...args);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /concorrência/);
  assert.equal(f.deletes.length, 0);
});

test("journal confirmado retoma somente os membros restantes", async () => {
  const f = fixture(),
    put = f.store.put;
  f.store.put = async (chave, valor) => {
    await put(chave, valor);
    if (valor.removidos === 1) throw new Error("falha após a confirmação");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /falha após a confirmação/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].removidos, 1);
  f.store.put = put;
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[0].r.base,
  ]);
  assert.equal(f.deletes.length, 3);
  assert.equal(new Set(f.deletes.map((d) => d.id)).size, 3);
});

test("intenção sem confirmação não é adotada pela ausência do objeto", async () => {
  const f = fixture(),
    put = f.store.put;
  f.store.put = async (chave, valor) => {
    if (valor.removidos === 1) throw new Error("falha antes da confirmação");
    await put(chave, valor);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /falha antes da confirmação/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].pendente, 0);
  f.store.put = put;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /exclusão incerta/);
  assert.equal(f.deletes.length, 1);
});

test("conflito de revisão não remove a versão substituta", async () => {
  const f = fixture(),
    excluir = f.api.delete;
  f.api.delete = async (args) => {
    f.objects.get(f.receipts[0].r.artefatos[0].nome).rev = "rev:substituta";
    return excluir(args);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /conflito de revisão/);
  assert.equal(f.deletes.length, 0);
  assert.equal(f.objects.size, 18);
  f.api.delete = excluir;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /revisão mudou/);
  assert.equal(f.deletes.length, 0);
});

test("reaparecimento de membro concluído impede o próximo expurgo", async () => {
  const f = fixture(7),
    objeto = f.objects.get(f.receipts[0].r.artefatos[0].nome);
  await backup.executarRetencaoDropbox(opts(f));
  f.objects.set(objeto.name, objeto);
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /reapareceu/);
  assert.equal(f.deletes.length, 3);
});

test("catálogo malformado, divergente ou duplicado bloqueia antes de apagar", async () => {
  for (const caso of ["json", "candidato", "divergente", "duplicado"]) {
    const f = fixture(),
      candidato = f.receipts[0],
      outro = f.receipts.at(-1);
    if (caso === "json") candidato.bytes = Buffer.from("{");
    if (caso === "candidato") {
      candidato.r.artefatos[0].sha256 = "inválido";
      candidato.bytes = Buffer.from(JSON.stringify(candidato.r));
    }
    if (caso === "divergente") outro.r.escopo.alvo = "outro";
    if (caso === "duplicado") {
      const r = structuredClone(candidato.r);
      r.escopo.alvo = "outro";
      f.receipts.push({ r, bytes: Buffer.from(JSON.stringify(r)) });
    }
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)), undefined, caso);
    assert.equal(f.deletes.length, 0, caso);
    assert.equal(f.journal.size, 0, caso);
  }
});

test("recibos inelegíveis não contam no mínimo nem viram candidatos", async () => {
  const f = fixture(7),
    ignorado = f.receipts[0];
  ignorado.r.etapas.remotoVerificado = false;
  ignorado.bytes = Buffer.from(JSON.stringify(ignorado.r) + "\n");
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[1].r.base,
  ]);
  for (const nome of ignorado.r.artefatos
    .map((a) => a.nome)
    .concat(`${ignorado.r.base}.confirmado.json`))
    assert.ok(f.objects.has(nome));
});

test("diário com recibo que perde elegibilidade bloqueia a retomada", async () => {
  const f = fixture(),
    excluir = f.api.delete;
  f.api.delete = async () => {
    throw new Error("antes de transmitir");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /antes de transmitir/);
  f.api.delete = excluir;
  const recibo = f.receipts[0];
  recibo.r.etapas.remotoVerificado = false;
  recibo.bytes = Buffer.from(JSON.stringify(recibo.r) + "\n");
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /diário sem recibo/);
  assert.equal(f.deletes.length, 0);
});

test("política com zero dias não apaga nem cria journal", async () => {
  const f = fixture();
  assert.deepEqual(await backup.executarRetencaoDropbox({ ...opts(f), dias: 0 }), {
    removidos: [],
  });
  assert.equal(f.deletes.length, 0);
  assert.equal(f.journal.size, 0);
});
