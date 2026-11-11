// Exercita revogação nas fronteiras assíncronas e recusas causais antes de efeitos.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { PassThrough, Readable, Writable } from "node:stream";
import { test } from "./atualizacao-integracao-casos.mjs";
import {
  Coordenador,
  atender,
  Cliente,
  Escritor,
  T,
  limitado,
} from "./atualizacao-integracao-adaptador.mjs";
import { especificacao, pedidoPara, hash, falha } from "./atualizacao-integracao-receitas.mjs";
import { prepararFontes, gravar, conferirFonte } from "./atualizacao-integracao-fontes.mjs";
import {
  Dispatcher,
  EngineFake,
  validarRaw,
  receitaCriar,
} from "./atualizacao-integracao-engine.mjs";
import { reconhecer } from "./atualizacao-integracao-shim.mjs";
const diferido = () => {
  let resolve, reject;
  const p = new Promise((r, j) => {
    resolve = r;
    reject = j;
  });
  return { p, resolve, reject };
};
const observar = (p) =>
  p.then(
    (valor) => ({ valor }),
    (erro) => ({ erro }),
  );
const turno = () => new Promise((r) => setImmediate(r));
const m = {
  versao: 1,
  rodada: "focal-autoridade",
  projeto: "focal-autoridade",
  revisoes: {
    A: { commit: "a".repeat(40), contextoSha256: "1".repeat(64), imagem: "ensaio/app:a" },
    B: { commit: "b".repeat(40), contextoSha256: "2".repeat(64), imagem: "ensaio/app:b" },
  },
  operacionalSha256: "3".repeat(64),
  migradorSha256: "4".repeat(64),
  banco: "frequencia",
  usuario: "frequencia",
  schema: "public",
};
function engineControlado(alvo) {
  const entrou = diferido(),
    liberar = diferido(),
    efeitos = [];
  let fase = "banco",
    running = false,
    inspects = 0;
  const gate = async (n) => {
    if (n === alvo) {
      entrou.resolve();
      await liberar.p;
    }
  };
  const exec = {
    id: randomUUID(),
    stdin: new Writable({
      write(_b, _e, cb) {
        cb();
      },
    }),
    stdout: Readable.from([]),
    stderr: Readable.from([]),
    fim: Promise.resolve({ codigo: 0, sinal: null }),
    confirmar: async () => ({ id: exec.id, running: false, codigo: 0, sinal: null }),
  };
  const e = {
    async intencao() {
      await gate(fase + "-intencao");
    },
    async criar() {
      efeitos.push("create");
      await gate("banco-create");
      return "id-banco-independente";
    },
    async persistirId() {
      await gate(fase + "-persistir");
    },
    async inspecionar() {
      inspects++;
      await gate(fase + "-inspect" + (fase === "banco" ? inspects : ""));
      return {
        id: "id-banco-independente",
        running,
        especificacao: especificacao(m, "db", "fixture-banco"),
      };
    },
    async iniciar() {
      efeitos.push("start");
      running = true;
    },
    async criarExec() {
      efeitos.push("exec-create");
      await gate("exec-create");
      return exec;
    },
    async iniciarExec() {
      efeitos.push("exec-start");
      await gate("exec-start");
    },
    exec,
    entrou,
    liberar,
    efeitos,
    setExec() {
      fase = "exec";
    },
  };
  return e;
}
for (const fase of [
  "banco-intencao",
  "banco-create",
  "banco-persistir",
  "banco-inspect1",
  "banco-inspect2",
  "exec-intencao",
  "exec-inspect",
  "exec-create",
  "exec-persistir",
  "exec-start",
]) {
  for (const fonte of ["revogar", "fechar"]) {
    test(`autoridade: ${fonte} durante ${fase} não envia efeito posterior`, async () => {
      const e = engineControlado(fase),
        c = new Coordenador(m, e);
      if (fase.startsWith("exec")) {
        await c.prepararBanco();
        e.setExec();
      }
      const op = observar(
        fase.startsWith("exec") ? c.abrir(pedidoPara(m, "dump", "A")) : c.prepararBanco(),
      );
      await limitado(e.entrou.p);
      const antes = [...e.efeitos];
      if (fonte === "fechar") await assert.rejects(c.fechar(), { code: "ATIVOS" });
      else c.revogar();
      assert.throws(() => c.autorizar(), { code: "REVOGADO" });
      e.liberar.resolve();
      const r = await limitado(op);
      assert.equal(r.erro.code, "REVOGADO");
      assert.deepEqual(e.efeitos, antes);
      assert.equal(c.ledger.length, 1);
      if (["banco-create", "banco-persistir", "banco-inspect1", "banco-inspect2"].includes(fase))
        assert.equal(c.ledger[0].id, "id-banco-independente");
      if (["exec-create", "exec-persistir"].includes(fase)) assert.equal(c.ledger[0].id, e.exec.id);
    });
  }
}
test("incerteza: confirmação rejeitada preserva ID e impede novo uso", async () => {
  const e = engineControlado(null),
    c = new Coordenador(m, e);
  await c.prepararBanco();
  e.setExec();
  let confirmacoes = 0;
  e.exec.confirmar = async () => {
    confirmacoes++;
    throw falha("CONFIRMACAO");
  };
  const x = await c.abrir(pedidoPara(m, "dump", "A"));
  await assert.rejects(x.confirmar({ codigo: 0, sinal: null }), { code: "CONFIRMACAO" });
  await assert.rejects(x.confirmar({ codigo: 0, sinal: null }), { code: "CONFIRMACAO" });
  assert.equal(confirmacoes, 1);
  assert.equal(c.ledger[0].id, e.exec.id);
  assert.equal(c.ledger[0].erro, "CONFIRMACAO");
  await assert.rejects(c.fechar(), { code: "ATIVOS" });
  assert.throws(() => c.autorizar(), { code: "REVOGADO" });
});
test("protocolo: FECHAR prematuro revoga sem bloquear leitura em crédito", async () => {
  const entrou = diferido(),
    fim = diferido(),
    ida = new PassThrough(),
    volta = new PassThrough();
  volta.resume();
  let revogado = false,
    confirmou = 0;
  const c = {
    historico: [],
    validar() {
      assert.equal(revogado, false);
    },
    revogar() {
      revogado = true;
    },
    async fechar() {
      assert.equal(revogado, true);
      assert.equal(confirmou, 1);
      return [];
    },
    async abrir() {
      entrou.resolve();
      return {
        id: "exec-pendente",
        stdin: new PassThrough(),
        stdout: Readable.from([]),
        stderr: Readable.from([]),
        fim: fim.p,
        async confirmar() {
          confirmou++;
        },
      };
    },
  };
  const servido = observar(atender(ida, volta, c)),
    w = new Escritor(ida);
  await w.enviar(T.abrir, 1, Buffer.from("{}"));
  await limitado(entrou.p);
  await w.enviar(T.fechar, 0);
  await turno();
  assert.equal(revogado, true);
  fim.resolve({ codigo: 0, sinal: null });
  const r = await limitado(servido);
  assert.equal(r.erro.code, "FECHAR_PREMATURO");
  assert.equal(confirmou, 1);
  assert.equal(ida.destroyed, true);
  await assert.rejects(w.fechar(), { code: "CANAL" });
});
test("canal: falha do último callback impede sucesso da sessão e fecha cliente", async () => {
  const entrada = new PassThrough(),
    entrou = diferido(),
    liberar = diferido();
  let revogado = false;
  const saida = new Writable({
    write(_b, _e, cb) {
      cb();
    },
    final(cb) {
      entrou.resolve();
      liberar.p.then(() => cb(falha("CALLBACK_FINAL")));
    },
  });
  const c = {
    historico: [],
    revogar() {
      revogado = true;
    },
    async fechar() {
      assert.equal(revogado, true);
      return [];
    },
  };
  const servido = observar(atender(entrada, saida, c)),
    w = new Escritor(entrada);
  await w.enviar(T.fechar, 0);
  await w.fechar();
  await limitado(entrou.p);
  assert.equal(revogado, true);
  liberar.resolve();
  assert.equal((await limitado(servido)).erro.code, "CALLBACK_FINAL");
  const ida = new PassThrough(),
    volta = new PassThrough(),
    cliente = new Cliente(volta, ida);
  volta.destroy(falha("CANAL"));
  await assert.rejects(cliente.fechar(), { code: "CANAL" });
  assert.equal(ida.destroyed, true);
  assert.equal(volta.destroyed, true);
});
test("prazo: Promise vencida não é close físico do callback final", async () => {
  const entrou = diferido(),
    liberar = diferido(),
    entrada = new PassThrough();
  let fisico = false,
    revogado = false;
  const saida = new Writable({
    write(_b, _e, cb) {
      cb();
    },
    final(cb) {
      entrou.resolve();
      liberar.p.then(() => {
        fisico = true;
        cb();
      });
    },
  });
  const close = new Promise((resolve) => saida.once("close", resolve));
  const c = {
    historico: [],
    revogar() {
      revogado = true;
    },
    async fechar() {
      assert.equal(revogado, true);
      return [];
    },
  };
  const servido = observar(atender(entrada, saida, c)),
    w = new Escritor(entrada);
  await w.enviar(T.fechar, 0);
  await w.fechar();
  await limitado(entrou.p);
  assert.equal(revogado, true);
  assert.equal(saida.writableFinished, false);
  const r = await limitado(servido, 4500);
  assert.equal(r.erro.code, "PRAZO");
  assert.equal(fisico, false);
  assert.equal(saida.closed, false);
  liberar.resolve();
  await limitado(close);
  assert.equal(fisico, true);
  assert.equal(saida.closed, true);
});
let fontes;
function fixture() {
  fontes ??= prepararFontes("/scratch/coeso-" + randomUUID().replaceAll("-", ""));
  return fontes;
}
test("dispatcher: ID, ambiente e OCI divergentes recusam antes do start", async () => {
  const m = fixture();
  for (const [nome, mudar, code] of [
    [
      "ID",
      (c) => {
        c.Id = "0".repeat(64);
      },
      "IDENTIDADE",
    ],
    [
      "env",
      (c) => {
        c.Config.Env.push("EXTRA=1");
      },
      "AMBIENTE",
    ],
    [
      "OCI",
      (c) => {
        c.Image = "sha256:" + "0".repeat(64);
      },
      "IDENTIDADE",
    ],
  ]) {
    const e = new EngineFake(m),
      c = new Dispatcher(m, e),
      original = e.inspect.bind(e);
    e.inspect = async (id) => {
      const raw = await original(id);
      mudar(raw);
      return raw;
    };
    await assert.rejects(c.abrir(pedidoPara(m, "identidade-banco", "A")), { code });
    assert.equal(
      e.efeitos.some((x) => ["start", "exec-start", "exec-create"].includes(x.tipo)),
      false,
      nome,
    );
    assert.equal(c.ledger.length, 1);
    assert.throws(() => c.autorizar(), { code: "REVOGADO" });
  }
});
test("fonte: contexto adulterado e manifesto extra não ganham autoridade", async () => {
  const m = fixture(),
    e = new EngineFake(m),
    c = new Dispatcher(m, e),
    p = pedidoPara(m, "construir", "B");
  p.contextoSha256 = "0".repeat(64);
  await assert.rejects(c.abrir(p), { code: "CONTEXTO" });
  assert.deepEqual(e.efeitos, []);
  assert.throws(() => new Dispatcher({ ...m, extra: true }, e), { code: "MANIFESTO" });
  const arquivo = `${m.vertical.host}/B/versao.txt`,
    antes = fs.readFileSync(arquivo);
  fs.writeFileSync(arquivo, "adulterado\n");
  assert.throws(() => conferirFonte(`${m.vertical.host}/B`, m.vertical.inventarios.B), {
    code: "CONTEXTO",
  });
  fs.writeFileSync(arquivo, antes);
});
test("shim: argv/ID/env/cwd extras e -f do B são recusados antes do transporte", () => {
  const m = fixture(),
    ids = { A: "a", B: "b", db: "d", caddy: "c" },
    env = { COMMIT_SHA: m.revisoes.A.commit };
  const argv = ["info", "--format", "{{json .}}"];
  assert.equal(reconhecer(m, "docker", argv, env, m.vertical.raiz, ids).receita, "daemon");
  for (const [a, en, cwd, code] of [
    [argv, { ...env, EXTRA: "1" }, m.vertical.raiz, "AMBIENTE"],
    [argv, env, "/", "CWD"],
    [["inspect", "alheio", "d", "c"], env, m.vertical.raiz, "ARGV"],
    [argv.concat("extra"), env, m.vertical.raiz, "ARGV"],
  ])
    assert.throws(() => reconhecer(m, "docker", a, en, cwd, ids), { code });
  const comp = [
    "compose",
    "--project-name",
    m.projeto,
    "--project-directory",
    m.vertical.app,
    "--env-file",
    `${m.vertical.config}/app.env`,
    "--env-file",
    `${m.vertical.config}/ops.env`,
    "-f",
    `${m.vertical.host}/B/compose.yml`,
    "config",
    "--quiet",
  ];
  assert.throws(() => reconhecer(m, "docker", comp, env, m.vertical.raiz, ids), {
    code: "SNAPSHOT",
  });
});
test("shim: imagem-alvo B manifestada não é confundida com contexto e ambiente A", () => {
  const m = fixture(),
    v = m.vertical,
    ids = { A: "a", B: "b", db: "d", caddy: "c" },
    env = {
      COMMIT_SHA: m.revisoes.A.commit,
      APP_IMAGEM: m.revisoes.A.imagem,
      APP_IMAGEM_BACKUP: `ensaio/backup:main-${m.revisoes.A.commit.slice(0, 12)}`,
    },
    consulta = [
      "image",
      "inspect",
      "--format",
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
      m.revisoes.B.imagem,
    ];
  assert.equal(
    reconhecer(m, "docker", ["info", "--format", "{{json .}}"], env, v.raiz, ids).revisao,
    "A",
  );
  let pedido;
  assert.doesNotThrow(() => {
    pedido = reconhecer(m, "docker", consulta, env, v.raiz, ids);
  }, "Consulta da imagem B deve preservar contexto e ambiente A válidos");
  assert.deepEqual(pedido, pedidoPara(m, "revisao-imagem", "B"));
});
test("shim: leitura da imagem manifestada preserva recusas de alvo, argv e ambiente", () => {
  const m = fixture(),
    v = m.vertical,
    ids = { A: "a", B: "b", db: "d", caddy: "c" },
    env = { COMMIT_SHA: m.revisoes.A.commit, APP_IMAGEM: m.revisoes.A.imagem },
    leitura = [
      "run",
      "--rm",
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--user",
      "65534:65534",
      "--entrypoint",
      "/bin/cat",
      m.revisoes.B.imagem,
      "/app/docker/app/migrar.mjs",
    ];
  assert.deepEqual(
    reconhecer(m, "docker", leitura, env, v.raiz, ids),
    pedidoPara(m, "validar-imagem", "B"),
  );
  for (const ruim of [
    leitura.with(11, "ensaio/app:nao-manifestada"),
    leitura.with(12, "/etc/passwd"),
    leitura.with(3, "host"),
    leitura.concat("--privileged"),
    [
      "image",
      "inspect",
      "--format",
      '{{ index .Config.Labels "org.opencontainers.image.revision" }}',
      "ensaio/app:nao-manifestada",
    ],
  ])
    assert.throws(() => reconhecer(m, "docker", ruim, env, v.raiz, ids), { code: "ARGV" });
  for (const ruim of [
    { ...env, APP_IMAGEM: m.revisoes.B.imagem },
    { ...env, DOCKER_HOST: "unix:///var/run/docker.sock" },
    { ...env, NODE_OPTIONS: "--inspect" },
  ])
    assert.throws(() => reconhecer(m, "docker", leitura, ruim, v.raiz, ids), { code: "AMBIENTE" });
});
test("pin: build sem pin recusa e não chama builder", async () => {
  const m = fixture(),
    e = new EngineFake(m),
    c = new Dispatcher(m, e);
  fs.mkdirSync(`${m.vertical.prefixo}/dados/journal`, { recursive: true, mode: 0o700 });
  await assert.rejects(c.abrir(pedidoPara(m, "construir", "B")), { code: "PIN" });
  assert.equal(
    e.efeitos.some((x) => x.tipo === "build"),
    false,
  );
});
test("raw independente: receita alterada não é devolvida pelo inspect", async () => {
  const m = fixture(),
    e = new EngineFake(m),
    image = e.imagens.get("B").id;
  const spec = receitaCriar(m, "leitor", "B"),
    id = await e.criar("leitor", "B", spec);
  spec.user = "0:0";
  const raw = await e.inspect(id);
  assert.equal(raw.Config.User, "65534:65534");
  validarRaw(m, raw, { id, papel: "leitor", image, running: false });
  const ruim = structuredClone(spec);
  await assert.rejects(e.criar("leitor", "B", ruim), { code: "RECEITA" });
});

for (const fase of [
  "exec-intencao",
  "exec-inspect",
  "exec-create",
  "exec-persistir",
  "exec-start",
]) {
  test(`cliente: AbortController durante ${fase} revoga o coordenador real`, async () => {
    const e = engineControlado(fase),
      c = new Coordenador(m, e);
    await c.prepararBanco();
    e.setExec();
    const revogou = diferido(),
      original = c.revogar.bind(c);
    c.revogar = () => {
      original();
      revogou.resolve();
    };
    const ida = new PassThrough(),
      volta = new PassThrough(),
      servido = observar(atender(ida, volta, c)),
      cliente = new Cliente(volta, ida),
      abort = new AbortController();
    const op = observar(cliente.executar(pedidoPara(m, "dump", "A"), { signal: abort.signal }));
    await limitado(e.entrou.p);
    const antes = [...e.efeitos];
    abort.abort();
    await limitado(revogou.p);
    assert.throws(() => c.autorizar(), { code: "REVOGADO" });
    e.liberar.resolve();
    assert.equal((await limitado(op)).erro.code, "CANCELADO");
    assert.deepEqual(e.efeitos, antes);
    assert.equal(c.ledger.length, 1);
    if (["exec-create", "exec-persistir", "exec-start"].includes(fase)) {
      assert.equal(c.ledger[0].id, e.exec.id);
      assert.equal(c.handles[0], e.exec);
    }
    await assert.rejects(cliente.fechar(), { code: "CANCELADO" });
    assert.equal((await limitado(servido)).erro.code, "CANCELADO");
    assert.equal(ida.destroyed, true);
    assert.equal(volta.destroyed, true);
  });
}
test("OCI: label de revisão divergente recusa antes de create/start", async () => {
  const m = fixture(),
    e = new EngineFake(m),
    c = new Dispatcher(m, e);
  await e.build("B", {
    context: `${m.vertical.host}/B`,
    commit: m.revisoes.B.commit,
    contextoSha256: m.revisoes.B.contextoSha256,
    operacionalSha256: m.operacionalSha256,
    baseTag: m.vertical.baseTag,
    baseIdConferido: m.vertical.baseId,
    from: m.vertical.baseTag,
    pull: false,
    network: "none",
    image: m.revisoes.B.imagem,
  });
  const im = e.imagens.get("B");
  assert.equal(im.config.Config.Labels["org.opencontainers.image.revision"], m.revisoes.B.commit);
  im.config.Config.Labels["org.opencontainers.image.revision"] = m.revisoes.A.commit;
  await assert.rejects(c.abrir(pedidoPara(m, "validar-imagem", "B")), { code: "OCI" });
  assert.equal(
    e.efeitos.some((x) => ["create", "start", "attach"].includes(x.tipo)),
    false,
  );
  assert.equal(c.ledger.length, 1);
});
for (const fase of [
  "intencao",
  "inspect",
  "exec-create",
  "exec-id",
  "leitor-create",
  "create-id",
  "leitor-inspect",
]) {
  test(`dispatcher: cancelamento pelo cliente durante ${fase} preserva IDs tardios`, async () => {
    const m = prepararFontes("/scratch/coeso-" + randomUUID().replaceAll("-", "")),
      e = new EngineFake(m),
      c = new Dispatcher(m, e);
    const leitor = fase.startsWith("leitor-") || fase === "create-id";
    if (leitor) {
      await e.build("B", {
        context: `${m.vertical.host}/B`,
        commit: m.revisoes.B.commit,
        contextoSha256: m.revisoes.B.contextoSha256,
        operacionalSha256: m.operacionalSha256,
        baseTag: m.vertical.baseTag,
        baseIdConferido: m.vertical.baseId,
        from: m.vertical.baseTag,
        pull: false,
        network: "none",
        image: m.revisoes.B.imagem,
      });
      const base = `${m.vertical.prefixo}/dados`,
        op = "fixture-pin";
      gravar(`${base}/journal/${op}/intencao.json`, "{}\n");
      const arquivos = [];
      for (let i = 0; i < 4; i++) {
        const nome = `artefato-${i}`,
          b = Buffer.from(`sintetico-${i}`);
        gravar(`${base}/pins/${op}/${nome}`, b);
        arquivos.push({ nome, sha256: hash(b) });
      }
      gravar(`${base}/pins/${op}/pin.json`, JSON.stringify({ operacao: op, arquivos }) + "\n");
    }
    const entrou = diferido(),
      liberar = diferido(),
      revogou = diferido();
    const originalRevogar = c.revogar.bind(c);
    c.revogar = () => {
      originalRevogar();
      revogou.resolve();
    };
    const gate = async () => {
      entrou.resolve();
      await liberar.p;
    };
    if (["intencao", "exec-id", "create-id"].includes(fase)) {
      const original = c.registro.bind(c);
      c.registro = async (r, n) => {
        await original(r, n);
        if (n === fase) await gate();
      };
    } else {
      const metodo =
          fase === "exec-create" ? "criarExec" : fase === "leitor-create" ? "criar" : "inspect",
        original = e[metodo].bind(e);
      e[metodo] = async (...args) => {
        const r = await original(...args);
        await gate();
        return r;
      };
    }
    const ida = new PassThrough(),
      volta = new PassThrough(),
      servido = observar(atender(ida, volta, c)),
      cliente = new Cliente(volta, ida),
      abort = new AbortController();
    const op = observar(
      cliente.executar(
        pedidoPara(m, leitor ? "validar-imagem" : "identidade-banco", leitor ? "B" : "A"),
        { signal: abort.signal },
      ),
    );
    await limitado(entrou.p);
    const antes = e.efeitos.map((x) => x.tipo);
    abort.abort();
    await limitado(revogou.p);
    liberar.resolve();
    assert.equal((await limitado(op)).erro.code, "CANCELADO");
    assert.deepEqual(
      e.efeitos.map((x) => x.tipo),
      antes,
    );
    assert.equal(c.ledger.length, 1);
    assert.throws(() => c.autorizar(), { code: "REVOGADO" });
    if (leitor) assert.equal(c.ledger[0].id, e.ids.leitor);
    if (["exec-create", "exec-id"].includes(fase)) {
      const x = e.efeitos.find((x) => x.tipo === "exec-create");
      assert.equal(c.ledger[0].id, x.id);
      assert.equal(c.handles.get(x.id).id, x.id);
    }
    assert.equal(e.filhos.size, 0);
    await assert.rejects(cliente.fechar(), { code: "CANCELADO" });
    assert.equal((await limitado(servido)).erro.code, "CANCELADO");
  });
}
test("entrada fechada: opções ausentes ou desconhecidas recusam sem etapas", async () => {
  const { comando } = await import("./atualizacao-integracao-driver.mjs");
  for (const args of [[], ["--outro"]]) {
    const r = await comando(
      "/bin/bash",
      ["/repo/tests/servidor/atualizacao-integracao.sh", ...args],
      { cwd: "/repo", registrar: false },
    );
    assert.equal(r.codigo, 78);
    assert.equal(r.sinal, null);
    assert.equal(r.erro, null);
    assert.equal(r.bytes.length, 0);
    assert.match(
      Buffer.from(r.stderr, "base64").toString(),
      /^Ensaio restrito ao perfil EngineFake Root\/cap0 sem daemon\.\n$/,
    );
  }
});
