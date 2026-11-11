// Confere quiescência do protocolo com callbacks e iteradores reais controlados.
import assert from "node:assert/strict";
import { PassThrough, Writable } from "node:stream";
import { test } from "./atualizacao-integracao-casos.mjs";
import {
  Cliente,
  Coordenador,
  atender,
  T,
  limitado,
  quadros,
  Escritor,
} from "./atualizacao-integracao-adaptador.mjs";
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

test("quiescência: recusa não publica resultado nem FECHAR antes do callback do produtor", async () => {
  const entrada = new PassThrough(),
    volta = new PassThrough(),
    entrou = diferido(),
    soltar = diferido();
  const frames = [];
  const ida = new Writable({
    write(b, _e, cb) {
      frames.push(b[5]);
      entrada.write(b);
      if (b[5] === T.abrir) {
        entrou.resolve();
        soltar.p.then(() => cb());
      } else cb();
    },
    final(cb) {
      entrada.end(cb);
    },
  });
  let revogado = false,
    fechamentos = 0;
  const coordenador = {
    validar() {
      assert.equal(revogado, false);
      throw Object.assign(new Error("RECEITA"), { code: "RECEITA" });
    },
    revogar() {
      revogado = true;
    },
    async fechar() {
      assert.equal(revogado, true);
      fechamentos++;
      return [];
    },
    historico: [],
  };
  const servidor = observar(atender(entrada, volta, coordenador));
  const cliente = new Cliente(volta, ida);
  let concluido = false;
  const resultado = observar(cliente.executar({ receita: "shell" })).then((r) => {
    concluido = true;
    return r;
  });
  await limitado(entrou.p);
  await turno();
  await turno();
  const fechamento = observar(cliente.fechar());
  await turno();
  const precoce = { concluido, frames: [...frames] };
  soltar.resolve();
  const r = await limitado(resultado);
  const fechado = await limitado(fechamento),
    servido = await limitado(servidor);
  assert.equal(precoce.concluido, false, "recusa não é confirmação de quiescência");
  assert.deepEqual(precoce.frames, [T.abrir]);
  assert.equal(r.erro.code, "RECEITA");
  assert.deepEqual(fechado, { valor: undefined });
  assert.deepEqual(servido, { valor: [] });
  assert.equal(fechamentos, 1);
  assert.equal(revogado, true);
  const fim = frames.indexOf(T.fechar);
  assert.ok(fim >= 0);
  assert.equal(fim, frames.length - 1);
  const quantidade = frames.length;
  await turno();
  assert.equal(frames.length, quantidade);
});

test("quiescência: cancelamento entra em next e observa rejeição tardia e return antes do resultado", async () => {
  const ida = new PassThrough(),
    volta = new PassThrough(),
    next = diferido(),
    voltar = diferido();
  const frames = [];
  let finalizar;
  let returnEntrou = false;
  const servidor = (async () => {
    const e = new Escritor(volta);
    for await (const q of quadros(ida)) {
      frames.push(q.tipo);
      if (q.tipo === T.abrir) {
        const b = Buffer.alloc(5);
        b[0] = T.entrada;
        b.writeUInt32BE(65536, 1);
        await e.enviar(T.credito, q.id, b);
      } else if (q.tipo === T.cancelar) {
        finalizar = q.id;
        await e.enviar(T.recusa, q.id, Buffer.from('{"code":"CANCELADO"}'));
      } else if (q.tipo === T.fechar) {
        assert.equal(q.id, 0);
        await e.enviar(T.fim, 0, Buffer.from('{"codigo":0,"sinal":null,"id":"sessao"}'));
      }
    }
    await e.fechar();
  })();
  const s = observar(servidor),
    cliente = new Cliente(volta, ida),
    abort = new AbortController();
  const entrada = {
    [Symbol.asyncIterator]() {
      return this;
    },
    next() {
      next.resolve();
      return voltar.p;
    },
    return() {
      returnEntrou = true;
      return Promise.resolve({ done: true });
    },
  };
  let terminou = false;
  const r = observar(cliente.executar({ receita: "dump" }, { entrada, signal: abort.signal })).then(
    (r) => {
      terminou = true;
      return r;
    },
  );
  await limitado(next.p);
  abort.abort();
  await turno();
  await turno();
  assert.equal(terminou, false);
  assert.ok(finalizar);
  voltar.reject(Object.assign(new Error("ITERADOR_TARDIO"), { code: "ITERADOR_TARDIO" }));
  const resultado = await limitado(r);
  assert.equal(resultado.erro.code, "CANCELADO");
  assert.equal(returnEntrou, true);
  await cliente.fechar();
  await limitado(s);
  const fim = frames.indexOf(T.fechar);
  assert.ok(fim >= 0);
  assert.equal(fim, frames.length - 1);
});

test("quiescência: EOF truncado revoga antes de qualquer efeito e mantém causa", async () => {
  const entrada = new PassThrough(),
    saida = new PassThrough();
  saida.resume();
  let revogacoes = 0;
  let fechamentos = 0;
  const c = {
    validar() {
      assert.fail("pedido não pode alcançar validação");
    },
    revogar() {
      revogacoes++;
    },
    async fechar() {
      assert.ok(revogacoes > 0);
      fechamentos++;
      return [];
    },
    historico: [],
  };
  const s = observar(atender(entrada, saida, c));
  entrada.end(Buffer.from("FAAB"));
  const r = await limitado(s);
  assert.equal(r.erro.code, "TRUNCADO");
  assert.ok(revogacoes > 0);
  assert.equal(fechamentos, 1);
});

test("quiescência: callback final pendente impede fechamento antecipado", async () => {
  const liberar = diferido(),
    entrou = diferido();
  let terminou = false;
  const destino = new Writable({
    write(_b, _e, cb) {
      cb();
    },
    final(cb) {
      entrou.resolve();
      liberar.p.then(() => cb());
    },
  });
  const e = new Escritor(destino);
  await e.enviar(T.eof, 1);
  const p = e.fechar().then(() => {
    terminou = true;
  });
  await limitado(entrou.p);
  await turno();
  assert.equal(terminou, false);
  liberar.resolve();
  await limitado(p);
  assert.equal(terminou, true);
});

test("fronteira final: fechamento normal revoga também a autoridade do coordenador", async () => {
  const manifesto = {
    versao: 1,
    rodada: "ensaio-fechar",
    projeto: "atualizacao-fechar",
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
  let efeitos = 0;
  const engine = {
    criar() {
      efeitos++;
      assert.fail("nenhum efeito novo após encerrar canal");
    },
  };
  const coordenador = new Coordenador(manifesto, engine),
    ida = new PassThrough(),
    volta = new PassThrough();
  const s = observar(atender(ida, volta, coordenador)),
    cliente = new Cliente(volta, ida);
  await cliente.fechar();
  assert.deepEqual(await limitado(s), { valor: [] });
  await assert.rejects(cliente.executar({ receita: "shell" }), { code: "FECHADO" });
  assert.equal(efeitos, 0);
  assert.throws(
    () => coordenador.autorizar(),
    { code: "REVOGADO" },
    "fim do canal deve extinguir a autoridade, não apenas fechar streams",
  );
});
