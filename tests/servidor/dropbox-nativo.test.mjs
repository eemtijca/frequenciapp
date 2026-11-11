// Exercita a CLI nativa contra API HTTPS sintética sem acesso a redes externas.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fixtureDropbox, sha } from "./dropbox-api-falso.mjs";

test("mínimo inferior exige valor exato adotado em arquivo privado, sem mudar padrão 30", async () => {
  const f = await fixtureDropbox(2);
  try {
    assert.equal((await f.executar({ BACKUP_RETER_MINIMO: "0" })).status, 1);
    assert.equal(f.objects.size, 6);
    f.config.minimoAutorizado = 0;
    f.gravar(f.configFile, JSON.stringify(f.config));
    const r = await f.executar({ BACKUP_RETER_MINIMO: "0" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.objects.size, 3);
    assert.equal((await f.executar({ BACKUP_RETER_MINIMO: "1" })).status, 1);
    assert.equal(f.objects.size, 3);
  } finally {
    await f.fechar();
  }
});

test("CLI Dropbox adotada remove dois conjuntos em duas rodadas e preserva os 30 mais novos", async () => {
  const f = await fixtureDropbox();
  try {
    const antes = new Map(
      [...f.objects.keys()].map((n) => [n, sha(fs.readFileSync(path.join(f.remoto, n)))]),
    );
    for (let i = 0; i < 2; i++) {
      const r = await f.executar();
      assert.equal(r.signal, null);
      assert.equal(r.status, 0, r.stderr);
      assert.equal(f.objects.size, 96 - (i + 1) * 3);
      assert.ok(!f.objects.has(f.receipts[i].r.artefatos[0].nome));
    }
    assert.equal((await f.executar()).status, 0);
    for (const [n, digest] of antes)
      if (f.objects.has(n)) assert.equal(sha(fs.readFileSync(path.join(f.remoto, n))), digest);
    const deletes = f.events.filter((e) => e.route === "/2/files/delete_v2");
    assert.equal(deletes.length, 6);
    assert.ok(
      deletes.every((e) => e.arg.path.startsWith("id:") && /^[a-f0-9]{9,}$/.test(e.arg.parent_rev)),
    );
    assert.equal(fs.readdirSync(f.catalogo).length, 32);
    assert.equal(fs.readdirSync(f.diarios).filter((n) => n.endsWith(".json")).length, 2);
  } finally {
    await f.fechar();
  }
});

const deletes = (f) => f.events.filter((e) => e.route === "/2/files/delete_v2");
const alterarConfig = (f, dados) => {
  Object.assign(f.config, dados);
  f.gravar(f.configFile, JSON.stringify(f.config));
};

test("adoção ausente, config/token inseguros, mapping ou identidades divergentes bloqueiam", async () => {
  const f = await fixtureDropbox();
  try {
    const original = JSON.stringify(f.config),
      mapping = fs.readFileSync(f.rclone);
    for (const caso of [
      "ausente",
      "config",
      "token",
      "mapping",
      "conta",
      "namespace",
      "pasta",
      "destino",
    ]) {
      f.gravar(f.configFile, original);
      f.gravar(f.rclone, mapping);
      fs.chmodSync(f.configFile, 0o600);
      fs.chmodSync(f.config.tokenFile, 0o600);
      const env = {};
      if (caso === "ausente") env.BACKUP_DROPBOX_CONFIG = "";
      if (caso === "config") fs.chmodSync(f.configFile, 0o644);
      if (caso === "token") fs.chmodSync(f.config.tokenFile, 0o644);
      if (caso === "mapping") f.gravar(f.rclone, "[falso]\ntype = crypt\nremote = outro:\n");
      if (caso === "conta") alterarConfig(f, { accountId: "dbid:outro" });
      if (caso === "namespace") alterarConfig(f, { namespaceId: "43" });
      if (caso === "pasta") alterarConfig(f, { folderId: "id:outra" });
      if (caso === "destino") alterarConfig(f, { destino: "falso:vizinho" });
      // O servidor conhece a adoção original, não a alteração feita no arquivo.
      f.config = JSON.parse(original);
      const r = await f.executar(env);
      assert.equal(r.status, 1, caso);
      assert.equal(r.signal, null, caso);
      assert.equal(deletes(f).length, 0, caso);
    }
    assert.equal(f.objects.size, 96);
  } finally {
    await f.fechar();
  }
});

test("erro OAuth, 401 e redirect não reproduzem pedidos nem vazam credenciais", async () => {
  const f = await fixtureDropbox();
  try {
    f.state.tokenError = true;
    assert.equal((await f.executar()).status, 1);
    f.state.tokenError = false;
    for (const status of [401, 302]) {
      f.state.hook = ({ req, res }) => {
        if (req.url !== "/2/users/get_current_account") return false;
        res.writeHead(status, { Location: "https://evil.invalid/receber" });
        res.end("segredo-na-resposta");
        return true;
      };
      const r = await f.executar();
      assert.equal(r.status, 1);
      assert.equal(r.signal, null);
      assert.ok(
        !/refresh-sintetico|access-sintetico|segredo-sintetico|segredo-na-resposta/.test(r.stderr),
      );
    }
    assert.equal(deletes(f).length, 0);
    assert.equal(f.events.filter((e) => e.route === "/oauth2/token").length, 3);
  } finally {
    await f.fechar();
  }
});

test("timeout absoluto durante JSON e oversized RPC chunked encerram recepção", async () => {
  const f = await fixtureDropbox();
  try {
    alterarConfig(f, { timeoutMs: 200 });
    for (const modo of ["timeout", "oversize"]) {
      let fechou = false;
      f.state.hook = ({ req, res }) => {
        if (req.url !== "/2/users/get_current_account") return false;
        res.on("close", () => {
          fechou = true;
        });
        res.writeHead(200, { "content-type": "application/json" });
        if (modo === "timeout") res.write("{");
        else {
          const t = setInterval(() => res.write(Buffer.alloc(65536, 32)), 1);
          res.on("close", () => clearInterval(t));
        }
        return true;
      };
      const r = await f.executar();
      assert.equal(r.status, 1);
      assert.equal(r.signal, null);
      assert.ok(fechou, modo);
      assert.equal(deletes(f).length, 0);
    }
  } finally {
    await f.fechar();
  }
});

test("stream HTTPS chunked acima do limite é abortado antes de qualquer delete", async () => {
  const f = await fixtureDropbox();
  try {
    alterarConfig(f, { limiteBytes: 1024 });
    let bytesEnviados = 0,
      fechou = false;
    f.state.hook = ({ req, res, arg, meta }) => {
      if (req.url !== "/2/files/download") return false;
      const n = [...f.objects.keys()].find((n) => f.objects.get(n).id === arg.path);
      res.writeHead(200, { "Dropbox-API-Result": JSON.stringify(meta(n)) });
      const t = setInterval(() => {
        bytesEnviados += 512;
        res.write(Buffer.alloc(512));
      }, 2);
      res.on("close", () => {
        clearInterval(t);
        fechou = true;
      });
      return true;
    };
    const r = await f.executar();
    assert.equal(r.status, 1);
    assert.equal(r.signal, null);
    assert.ok(fechou);
    assert.ok(bytesEnviados > 1024 && bytesEnviados < 65536);
    assert.equal(deletes(f).length, 0);
    assert.deepEqual(fs.readdirSync(f.diarios), []);
  } finally {
    await f.fechar();
  }
});

test("delete_v2 recusa troca de revisão sem apagar substituto ou conjuntos mais novos", async () => {
  const f = await fixtureDropbox();
  try {
    const n = f.receipts[0].r.artefatos[0].nome;
    f.state.hook = ({ req }) => {
      if (req.url !== "/2/files/delete_v2") return false;
      f.objects.get(n).rev = "fffffffff";
      return false;
    };
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
    assert.ok(f.objects.has(n));
    assert.equal(f.objects.size, 96);
    f.state.hook = null;
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
  } finally {
    await f.fechar();
  }
});

test("resposta de delete perdida mantém intenção incerta e nunca é adotada pela ausência", async () => {
  const f = await fixtureDropbox();
  try {
    f.state.hook = ({ req, res, arg }) => {
      if (req.url !== "/2/files/delete_v2") return false;
      const n = [...f.objects.keys()].find((n) => f.objects.get(n).id === arg.path);
      fs.unlinkSync(path.join(f.remoto, n));
      f.objects.delete(n);
      res.destroy();
      return true;
    };
    assert.equal((await f.executar()).status, 1);
    assert.equal(f.objects.size, 95);
    const journal = JSON.parse(fs.readFileSync(path.join(f.diarios, fs.readdirSync(f.diarios)[0])));
    assert.equal(journal.valor.pendente, 0);
    f.state.hook = null;
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, 1);
  } finally {
    await f.fechar();
  }
});

test("erro antes da mutação retoma a mesma revisão sem repetir membros confirmados", async () => {
  const f = await fixtureDropbox();
  try {
    let falhou = false;
    f.state.hook = ({ req, json }) => {
      if (req.url !== "/2/files/delete_v2" || deletes(f).length !== 2) return false;
      falhou = true;
      json({ error: "erro_sintetico" }, 503);
      return true;
    };
    assert.equal((await f.executar()).status, 1);
    assert.ok(falhou);
    assert.equal(f.objects.size, 95);
    f.state.hook = null;
    assert.equal((await f.executar()).status, 0);
    assert.equal(f.objects.size, 93);
    assert.equal(deletes(f).length, 4);
    assert.equal(deletes(f).filter((e) => e.arg.path === deletes(f)[0].arg.path).length, 1);
  } finally {
    await f.fechar();
  }
});

test("mutex cooperativo exclui concorrentes e libera ao fechar o descritor", async () => {
  const { adquirirAutoridadeDropbox } = await import("../../scripts/servidor/dropbox-estado.mjs");
  const f = await fixtureDropbox();
  const autoridade = adquirirAutoridadeDropbox(f.config);
  try {
    const antes = f.events.length;
    assert.equal((await f.executar()).status, 1);
    assert.equal(f.events.length, antes);
    autoridade.close();
    assert.equal((await f.executar()).status, 0);
    assert.equal(f.objects.size, 93);
  } finally {
    autoridade.close();
    await f.fechar();
  }
});

test("journal usa fsync de arquivo, rename e fsync de diretório; crash confirmado retoma", async () => {
  const f = await fixtureDropbox();
  try {
    const log = path.join(f.tmp, "ordem.jsonl"),
      injecao = path.join(f.tmp, "crash-confirmado.mjs");
    f.gravar(
      injecao,
      `import fs from 'node:fs'; import path from 'node:path';\nconst log=${JSON.stringify(log)}, dir=${JSON.stringify(f.diarios)};\nconst sync=fs.fsyncSync, rename=fs.renameSync;\nfs.renameSync=function(a,b) { if(path.dirname(b)===dir) fs.appendFileSync(log,JSON.stringify({evento:'rename',destino:b})+'\\n'); return rename(a,b); };\nfs.fsyncSync=function(fd) { const diretorio=fs.fstatSync(fd).isDirectory(); sync(fd); fs.appendFileSync(log,JSON.stringify({evento:diretorio?'fsync-dir':'fsync-file'})+'\\n'); if(diretorio && fs.readdirSync(dir).some(n=>n.endsWith('.json') && JSON.parse(fs.readFileSync(path.join(dir,n))).valor.removidos===1)) { process.stderr.write('CRASH_CONFIRMADO\\n'); process.exit(73); } };\n`,
    );
    const r = await f.executar({}, undefined, ["--import", injecao]);
    assert.equal(r.status, 73);
    assert.match(r.stderr, /CRASH_CONFIRMADO/);
    assert.equal(f.objects.size, 95);
    const ordem = fs
      .readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map(JSON.parse)
      .map((e) => e.evento);
    assert.deepEqual(ordem, [
      "fsync-file",
      "rename",
      "fsync-dir",
      "fsync-file",
      "rename",
      "fsync-dir",
      "fsync-file",
      "rename",
      "fsync-dir",
    ]);
    assert.equal((await f.executar()).status, 0);
    assert.equal(f.objects.size, 93);
    assert.equal(deletes(f).length, 3);
  } finally {
    await f.fechar();
  }
});

test("crash antes de rename de confirmação deixa tmp e intenção, retomada fail-closed", async () => {
  const f = await fixtureDropbox();
  try {
    const injecao = path.join(f.tmp, "crash-antes-rename.mjs");
    f.gravar(
      injecao,
      `import fs from 'node:fs'; import path from 'node:path';\nconst rename=fs.renameSync, dir=${JSON.stringify(f.diarios)};\nfs.renameSync=function(a,b) { if(path.dirname(b)===dir && JSON.parse(fs.readFileSync(a)).valor.removidos===1) { process.stderr.write('CRASH_ANTES_RENAME\\n'); process.exit(74); } return rename(a,b); };\n`,
    );
    const r = await f.executar({}, undefined, ["--import", injecao]);
    assert.equal(r.status, 74);
    assert.match(r.stderr, /CRASH_ANTES_RENAME/);
    assert.equal(f.objects.size, 95);
    assert.ok(fs.readdirSync(f.diarios).some((n) => n.endsWith(".tmp")));
    const antes = deletes(f).length;
    assert.equal((await f.executar()).status, 1);
    assert.equal(deletes(f).length, antes);
  } finally {
    await f.fechar();
  }
});

test("paginação nativa verifica conjunto inteiro e preserva objetos sem recibo", async () => {
  const f = await fixtureDropbox();
  try {
    const extra = "arquivo-alheio.txt";
    f.gravar(path.join(f.remoto, extra), "preservar");
    f.objects.set(extra, { id: "id:alheio", rev: "abcdef123" });
    f.state.hook = ({ req, arg, json, meta }) => {
      if (req.url === "/2/files/list_folder") {
        const entries = [...f.objects.keys()].map(meta);
        json({ entries: entries.slice(0, 45), has_more: true, cursor: "pagina2" });
        return true;
      }
      if (req.url === "/2/files/list_folder/continue") {
        assert.equal(arg.cursor, "pagina2");
        json({
          entries: [...f.objects.keys()].map(meta).slice(45),
          has_more: false,
          cursor: "final",
        });
        return true;
      }
      return false;
    };
    assert.equal((await f.executar()).status, 0);
    assert.equal(f.objects.size, 94);
    assert.ok(f.objects.has(extra));
    const oldest = f.receipts[0].r;
    const esperados = new Set([
      ...oldest.artefatos.map((a) => a.nome),
      `${oldest.base}.confirmado.json`,
    ]);
    const nomes = f.events.filter((e) => e.route === "/2/files/download").map((e) => e.arg.path);
    assert.ok(!nomes.includes("id:alheio"));
    assert.equal(esperados.size, deletes(f).length);
    assert.ok(f.events.some((e) => e.route.endsWith("/continue")));
  } finally {
    await f.fechar();
  }
});

test("renovação de token na cópia rclone mantém mapping adotado; mudança de namespace não", async () => {
  const f = await fixtureDropbox();
  try {
    const copia = path.join(f.tmp, "rclone-copia.conf");
    f.gravar(copia, fs.readFileSync(f.rclone, "utf8").replace("sintetico", "token-renovado"));
    const r = await f.executar({ RCLONE_CONFIG: copia });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(f.objects.size, 93);
    const antes = deletes(f).length;
    f.gravar(
      copia,
      fs.readFileSync(copia, "utf8").replace("root_namespace = 42", "root_namespace = 43"),
    );
    assert.equal((await f.executar({ RCLONE_CONFIG: copia })).status, 1);
    assert.equal(deletes(f).length, antes);
  } finally {
    await f.fechar();
  }
});

test("mapeamento oficial rclone root_namespace permite expurgo após adoção", async () => {
  const f = await fixtureDropbox();
  try {
    assert.match(fs.readFileSync(f.rclone, "utf8"), /^root_namespace = 42$/m);
    alterarConfig(f, { rcloneConfigSha256: sha(fs.readFileSync(f.rclone)) });
    const r = await f.executar();
    assert.equal(r.status, 0, "INI oficial root_namespace foi recusado: " + r.stderr);
    assert.equal(f.objects.size, 93);
  } finally {
    await f.fechar();
  }
});
