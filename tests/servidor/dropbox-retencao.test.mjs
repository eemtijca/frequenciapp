import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as backup from "../../scripts/servidor/backup-recibos.mjs";

const sha = (b) => createHash("sha256").update(b).digest("hex");
function fixture(quantidade = 31) {
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
      if (!o) throw new Error("revision missing");
      yield o.bytes;
    },
    async delete({ id, parent_rev }) {
      const o = [...objects.values()].find((v) => v.id === id);
      if (!o || o.rev !== parent_rev) throw new Error("revision conflict");
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
    async put(key, value) {
      journal.set(key, structuredClone(value));
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

test("expurga apenas o conjunto mais antigo após verificar 30 conjuntos protegidos", async () => {
  const f = fixture();
  assert.equal(
    typeof backup.executarRetencaoDropbox,
    "function",
    "executor Dropbox injetável deve existir",
  );
  const result = await backup.executarRetencaoDropbox({
    ...f,
    agora: Date.UTC(2025, 0, 1),
    dias: 30,
    limiteBytes: 1024 * 1024,
  });
  assert.deepEqual(result.removidos, [f.receipts[0].r.base]);
  assert.equal(f.deletes.length, 3);
  assert.equal(f.objects.size, 90);
  for (const d of f.deletes) assert.equal(d.parent_rev, `rev:${d.id.slice(3)}`);
  for (const { r } of f.receipts.slice(1))
    for (const a of r.artefatos) assert.ok(f.objects.has(a.nome));
});

test("autoridade que nega exclusividade nunca permite exclusão", async () => {
  const f = fixture();
  f.authority.assertExclusive = async () => false;
  await assert.rejects(
    backup.executarRetencaoDropbox({
      ...f,
      agora: Date.UTC(2025, 0, 1),
      dias: 30,
      limiteBytes: 1024 * 1024,
    }),
    /exclusividade/,
  );
  assert.deepEqual(f.deletes, []);
  assert.equal(f.objects.size, 93);
});

const opts = (f) => ({ ...f, agora: Date.UTC(2025, 0, 1), dias: 30, limiteBytes: 1024 * 1024 });
test("catálogo preservado avança para o segundo conjunto após conclusão do primeiro", async () => {
  const f = fixture(32);
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[0].r.base,
  ]);
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[1].r.base,
  ]);
  assert.equal(f.deletes.length, 6);
  assert.deepEqual(await backup.executarRetencaoDropbox(opts(f)), { removidos: [] });
  assert.equal(f.objects.size, 90);
});
test("intenção anterior bloqueia seleção de outro conjunto mesmo com primeiro objeto intacto", async () => {
  const f = fixture(33),
    antigo = f.receipts.shift();
  const nomes = [...antigo.r.artefatos.map((a) => a.nome), `${antigo.r.base}.confirmado.json`];
  const salvos = nomes.map((n) => f.objects.get(n));
  for (const n of nomes) f.objects.delete(n);
  const excluir = f.api.delete;
  f.api.delete = async () => {
    throw new Error("antes de transmitir");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /antes de transmitir/);
  assert.equal([...f.journal.values()][0].pendente, 0);
  f.receipts.push(antigo);
  for (const o of salvos) f.objects.set(o.name, o);
  f.api.delete = excluir;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /intenção anterior/);
  assert.equal(f.deletes.length, 0);
  assert.equal(f.objects.size, 99);
});
test("diário incompleto ou recibo anterior ausente suspende mesmo sem candidatos", async () => {
  for (const caso of ["listagem", "recibo", "política"]) {
    const f = fixture(),
      excluir = f.api.delete;
    f.api.delete = async () => {
      throw new Error("antes de transmitir");
    };
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /antes de transmitir/);
    f.api.delete = excluir;
    if (caso === "listagem") f.store.list = async () => ({ complete: false, entries: [] });
    if (caso === "recibo") f.receipts.shift();
    await assert.rejects(
      backup.executarRetencaoDropbox({ ...opts(f), dias: caso === "política" ? 0 : 30 }),
      /diário|intenção anterior/,
    );
    assert.equal(f.deletes.length, 0);
  }
});
test("identidade divergente ou inventário incompleto bloqueiam antes de apagar", async () => {
  for (const tipo of ["identity", "list"]) {
    const f = fixture();
    if (tipo === "identity") f.api.identity = async () => ({ ...f.identity, namespaceId: "other" });
    else f.api.list = async () => ({ entries: [], complete: false });
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)));
    assert.equal(f.deletes.length, 0);
  }
});
test("hash incorreto ou stream acima do limite bloqueiam antes de apagar", async () => {
  for (const tipo of ["hash", "limite"]) {
    const f = fixture();
    if (tipo === "hash")
      f.objects.get(f.receipts[1].r.artefatos[0].nome).bytes = Buffer.from("corrupt");
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
test("alteração de inventário durante conferência impede exclusão", async () => {
  const f = fixture(),
    list = f.api.list;
  let chamadas = 0;
  f.api.list = async (...args) => {
    if (++chamadas === 2) f.objects.get(f.receipts[30].r.artefatos[0].nome).rev = "rev:changed";
    return list(...args);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /concorrência/);
  assert.equal(f.deletes.length, 0);
});
test("inventário equivalente em ordem variável permite concluir exclusões", async () => {
  const f = fixture(),
    listar = f.api.list;
  let chamada = 0;
  f.api.list = async (...args) => {
    const inventario = await listar(...args);
    if (++chamada % 2 === 0) inventario.entries.reverse();
    return inventario;
  };
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[0].r.base,
  ]);
  assert.equal(f.deletes.length, 3);
  assert.equal(f.objects.size, 90);
});
test("alteração de tipo em inventário reordenado bloqueia exclusão", async () => {
  const f = fixture(),
    listar = f.api.list;
  let chamada = 0;
  f.api.list = async (...args) => {
    const inventario = await listar(...args);
    if (++chamada === 2) {
      inventario.entries.reverse();
      inventario.entries[0].type = "folder";
    }
    return inventario;
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /concorrência/);
  assert.equal(f.deletes.length, 0);
});
test("mudança de membro, identificador, tipo ou duplicação no inventário bloqueia", async () => {
  for (const caso of [
    "adicionado",
    "removido",
    "id",
    "tipo-inválido",
    "nome-duplicado",
    "id-duplicado",
  ]) {
    const f = fixture(),
      listar = f.api.list;
    let chamada = 0;
    f.api.list = async (...args) => {
      const inv = await listar(...args);
      if (++chamada === 2) {
        inv.entries.reverse();
        if (caso === "adicionado")
          inv.entries.push({ name: "extra", id: "id:extra", rev: "rev:extra", type: "file" });
        if (caso === "removido") inv.entries.pop();
        if (caso === "id") inv.entries[0].id = "id:alterado";
        if (caso === "tipo-inválido") inv.entries[0].type = 1;
        if (caso === "nome-duplicado") inv.entries.push({ ...inv.entries[0], id: "id:outro" });
        if (caso === "id-duplicado") inv.entries.push({ ...inv.entries[0], name: "outro" });
      }
      return inv;
    };
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /concorrência|inventário/);
    assert.equal(f.deletes.length, 0, caso);
  }
});
test("crash ao persistir confirmação não permite inferir exclusão pela ausência", async () => {
  const f = fixture(),
    put = f.store.put;
  f.store.put = async (chave, valor) => {
    if (valor.removidos === 1) throw new Error("crash antes da confirmação");
    await put(chave, valor);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /crash antes da confirmação/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].pendente, 0);
  f.store.put = put;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /exclusão incerta/);
  assert.equal(f.deletes.length, 1);
});
test("crash após persistir confirmação retoma somente membros restantes", async () => {
  const f = fixture(),
    put = f.store.put;
  f.store.put = async (chave, valor) => {
    await put(chave, valor);
    if (valor.removidos === 1) throw new Error("crash após confirmação");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /crash após confirmação/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].removidos, 1);
  f.store.put = put;
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[0].r.base,
  ]);
  assert.equal(f.deletes.length, 3);
  assert.equal(new Set(f.deletes.map((d) => d.id)).size, 3);
});
test("crash depois da confirmação final permite avançar sem repetir conjunto", async () => {
  const f = fixture(32),
    put = f.store.put;
  f.store.put = async (chave, valor) => {
    await put(chave, valor);
    if (valor.removidos === valor.itens.length) throw new Error("crash após conclusão");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /crash após conclusão/);
  assert.equal(f.deletes.length, 3);
  f.store.put = put;
  assert.deepEqual((await backup.executarRetencaoDropbox(opts(f))).removidos, [
    f.receipts[1].r.base,
  ]);
  assert.equal(f.deletes.length, 6);
  assert.equal(new Set(f.deletes.map((d) => d.id)).size, 6);
});
test("alteração de inventário após exclusão deixa intenção incerta e não avança", async () => {
  const f = fixture(),
    listar = f.api.list;
  let chamada = 0;
  f.api.list = async (...args) => {
    const inv = await listar(...args);
    if (++chamada === 3) inv.entries[0].rev = "rev:externa";
    return inv;
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /resultado de exclusão incerto/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].pendente, 0);
  f.api.list = listar;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /exclusão incerta/);
  assert.equal(f.deletes.length, 1);
});
test("reaparecimento de membro concluído impede próximo expurgo", async () => {
  const f = fixture(32),
    objeto = f.objects.get(f.receipts[0].r.artefatos[0].nome);
  await backup.executarRetencaoDropbox(opts(f));
  f.objects.set(objeto.name, objeto);
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /reapareceu/);
  assert.equal(f.deletes.length, 3);
});
test("falha após exclusão deixa intenção e ausência incerta não é adotada", async () => {
  const f = fixture(),
    excluir = f.api.delete;
  f.api.delete = async (args) => {
    await excluir(args);
    throw new Error("resposta perdida");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /resposta perdida/);
  assert.equal(f.deletes.length, 1);
  assert.equal([...f.journal.values()][0].pendente, 0);
  f.api.delete = excluir;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /exclusão incerta/);
  assert.equal(f.deletes.length, 1);
});
test("falha antes da exclusão permite retomada somente da mesma revisão", async () => {
  const f = fixture(),
    excluir = f.api.delete;
  f.api.delete = async () => {
    throw new Error("antes de transmitir");
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /antes de transmitir/);
  f.api.delete = excluir;
  const resultado = await backup.executarRetencaoDropbox(opts(f));
  assert.deepEqual(resultado.removidos, [f.receipts[0].r.base]);
  assert.equal(f.deletes.length, 3);
});
test("não aceita mínimo inferior a 30", async () => {
  const f = fixture();
  await assert.rejects(backup.executarRetencaoDropbox({ ...opts(f), minimo: 29 }), /política/);
  assert.equal(f.deletes.length, 0);
});
test("conflito de revisão atômico não remove a versão substituta", async () => {
  const f = fixture(),
    excluir = f.api.delete;
  f.api.delete = async (args) => {
    f.objects.get(f.receipts[0].r.artefatos[0].nome).rev = "rev:substituta";
    return excluir(args);
  };
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /revision conflict/);
  assert.equal(f.deletes.length, 0);
  assert.equal(f.objects.size, 93);
  f.api.delete = excluir;
  await assert.rejects(backup.executarRetencaoDropbox(opts(f)), /revisão mudou/);
  assert.equal(f.deletes.length, 0);
});
test("30 conjuntos confirmados não geram exclusão", async () => {
  const f = fixture();
  f.receipts.shift();
  assert.deepEqual(await backup.executarRetencaoDropbox(opts(f)), { removidos: [] });
  assert.equal(f.deletes.length, 0);
});

test("recibos válidos de outro escopo ou não verificados não contam nem bloqueiam", async () => {
  for (const alterar of [
    (r) => {
      r.escopo.alvo = "outro";
    },
    (r) => {
      r.escopo.banco = "outro";
    },
    (r) => {
      r.escopo.schema = "outro";
    },
    (r) => {
      r.remoto = "fake:outro";
    },
    (r) => {
      r.etapas.remotoVerificado = false;
    },
  ]) {
    for (const quantidade of [31, 32]) {
      const f = fixture(quantidade),
        ignorado = f.receipts.at(-1);
      alterar(ignorado.r);
      ignorado.bytes = Buffer.from(JSON.stringify(ignorado.r) + "\n");
      const nomes = ignorado.r.artefatos
        .map((a) => a.nome)
        .concat(`${ignorado.r.base}.confirmado.json`);
      const resultado = await backup.executarRetencaoDropbox(opts(f));
      assert.deepEqual(resultado.removidos, quantidade === 31 ? [] : [f.receipts[0].r.base]);
      assert.equal(f.deletes.length, quantidade === 31 ? 0 : 3);
      for (const nome of nomes) assert.ok(f.objects.has(nome));
    }
  }
});

test("recibo inelegível mais antigo nunca é candidato", async () => {
  const f = fixture(32),
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

test("catálogo malformado, divergente ou duplicado bloqueia antes de apagar", async () => {
  for (const caso of ["json", "candidato", "divergente-inelegível", "base-duplicada-inelegível"]) {
    const f = fixture(32),
      candidato = f.receipts[0],
      outro = f.receipts.at(-1);
    if (caso === "json") candidato.bytes = Buffer.from("{");
    if (caso === "candidato") {
      candidato.r.artefatos[0].sha256 = "inválido";
      candidato.bytes = Buffer.from(JSON.stringify(candidato.r));
    }
    if (caso === "divergente-inelegível") outro.r.escopo.alvo = "outro";
    if (caso === "base-duplicada-inelegível") {
      const r = structuredClone(candidato.r);
      r.escopo.alvo = "outro";
      f.receipts.push({ r, bytes: Buffer.from(JSON.stringify(r)) });
    }
    await assert.rejects(backup.executarRetencaoDropbox(opts(f)), undefined, caso);
    assert.equal(f.deletes.length, 0, caso);
    assert.equal(f.journal.size, 0, caso);
  }
});

test("diário com recibo que perde elegibilidade bloqueia retomada", async () => {
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
