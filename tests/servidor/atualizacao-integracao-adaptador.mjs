// Transporta receitas fechadas com janelas independentes e barreiras de conclusão física.
import { Writable } from "node:stream";
import {
  exigir,
  falha,
  iguais,
  manifestoFechado,
  receitaBanco,
  especificacao,
  validarPedido,
} from "./atualizacao-integracao-receitas.mjs";

export const LIMITES = Object.freeze({
  quadro: 16384,
  janela: 65536,
  operacoes: 4,
  total: 32 * 1024 * 1024,
  prazo: 15000,
  fechar: 3000,
});
export const T = Object.freeze({
  abrir: 1,
  entrada: 2,
  eof: 3,
  saida: 4,
  erro: 5,
  fim: 6,
  recusa: 7,
  cancelar: 8,
  credito: 9,
  fechar: 10,
});
const vazio = Buffer.alloc(0);
const json = (obj) => Buffer.from(JSON.stringify(obj));
const lerJson = (b) => {
  try {
    return JSON.parse(b.toString("utf8"));
  } catch {
    throw falha("JSON");
  }
};
const observado = (p) =>
  Promise.resolve(p).then(
    (valor) => ({ valor }),
    (erro) => ({ erro }),
  );
export async function limitado(p, ms = LIMITES.fechar) {
  let timer;
  try {
    return await Promise.race([
      p,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(falha("PRAZO")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export function escrever(stream, bytes) {
  return limitado(
    new Promise((resolve, reject) => {
      if (stream.destroyed || stream.writableEnded) return reject(falha("CANAL"));
      stream.write(bytes, (e) => (e ? reject(e) : resolve()));
    }),
  );
}
function terminar(stream) {
  return limitado(
    new Promise((resolve, reject) => {
      if (stream.destroyed) return reject(falha("CANAL"));
      stream.once("error", reject);
      stream.end((e) => {
        stream.off("error", reject);
        e ? reject(e) : resolve();
      });
    }),
  );
}
export class Escritor {
  constructor(stream) {
    this.stream = stream;
    this.cauda = Promise.resolve();
    this.falhou = null;
    this.pendente = 0;
    stream.on("error", () => {});
  }
  enviar(tipo, id, corpo = vazio) {
    exigir(
      Buffer.isBuffer(corpo) && corpo.length <= LIMITES.quadro && Number.isInteger(id) && id >= 0,
      "QUADRO",
    );
    exigir(this.pendente + corpo.length + 16 <= 2 * LIMITES.operacoes * LIMITES.janela, "FILA");
    const cab = Buffer.alloc(16);
    cab.write("FAAB", 0);
    cab[4] = 1;
    cab[5] = tipo;
    cab.writeUInt32BE(id, 8);
    cab.writeUInt32BE(corpo.length, 12);
    const b = Buffer.concat([cab, corpo]);
    this.pendente += b.length;
    const p = this.cauda.then(() => {
      if (this.falhou) throw this.falhou;
      return escrever(this.stream, b);
    });
    this.cauda = p
      .catch((e) => {
        this.falhou = e;
      })
      .finally(() => {
        this.pendente -= b.length;
      });
    return p;
  }
  async fechar() {
    await this.cauda;
    if (this.falhou) throw this.falhou;
    await terminar(this.stream);
  }
}
export async function* quadros(stream) {
  let b = vazio;
  for await (const parte of stream) {
    let atual = Buffer.from(parte);
    while (atual.length) {
      const alvo = b.length < 16 ? 16 : 16 + b.readUInt32BE(12);
      const n = Math.min(alvo - b.length, atual.length);
      b = Buffer.concat([b, atual.subarray(0, n)]);
      atual = atual.subarray(n);
      if (b.length < 16) continue;
      exigir(
        b.subarray(0, 4).toString() === "FAAB" &&
          b[4] === 1 &&
          b.readUInt16BE(6) === 0 &&
          Object.values(T).includes(b[5]),
        "PROTOCOLO",
      );
      const tamanho = b.readUInt32BE(12);
      exigir(tamanho <= LIMITES.quadro, "LIMITE");
      if (b.length === tamanho + 16) {
        yield { tipo: b[5], id: b.readUInt32BE(8), corpo: b.subarray(16) };
        b = vazio;
      }
    }
  }
  exigir(b.length === 0, "TRUNCADO");
}
class Janela {
  constructor() {
    this.valor = 0;
    this.espera = [];
    this.erro = null;
  }
  somar(n) {
    exigir(Number.isInteger(n) && n > 0 && this.valor + n <= LIMITES.janela, "CREDITO");
    this.valor += n;
    for (const r of this.espera.splice(0)) r();
  }
  async tirar(n) {
    while (this.valor < n && !this.erro) await new Promise((resolve) => this.espera.push(resolve));
    if (this.erro) throw this.erro;
    this.valor -= n;
  }
  abortar(e) {
    this.erro ??= e;
    for (const r of this.espera.splice(0)) r();
  }
}
const credito = (canal, n) => {
  const b = Buffer.alloc(5);
  b[0] = canal;
  b.writeUInt32BE(n, 1);
  return b;
};
function receberCredito(b, janelas) {
  exigir(b.length === 5 && janelas.has(b[0]), "CREDITO");
  janelas.get(b[0]).somar(b.readUInt32BE(1));
}
function canais() {
  return new Map([T.entrada, T.saida, T.erro].map((n) => [n, new Janela()]));
}
function abortarJanelas(j, e) {
  for (const v of j.values()) v.abortar(e);
}
function autorizado(signal) {
  if (signal?.aborted) throw signal.reason ?? falha("CANCELADO");
}
async function transmitir(stream, tipo, id, escritor, janela, signal) {
  const iterador = stream[Symbol.asyncIterator]();
  let total = 0,
    terminou = false,
    pendente = Promise.resolve();
  let recusar;
  const cancelado = new Promise((_, reject) => {
    recusar = reject;
  });
  const abortar = () => {
    stream.destroy?.();
    recusar(signal.reason ?? falha("CANCELADO"));
  };
  signal?.addEventListener("abort", abortar, { once: true });
  // A rejeição de cancelamento é observada mesmo entre duas chamadas a next.
  const aviso = observado(cancelado);
  try {
    autorizado(signal);
    while (true) {
      pendente = Promise.resolve(iterador.next());
      const proximo = await Promise.race([pendente, cancelado]);
      autorizado(signal);
      if (proximo.done) {
        terminou = true;
        break;
      }
      const b = Buffer.from(proximo.value);
      total += b.length;
      exigir(total <= LIMITES.total, "LIMITE");
      for (let i = 0; i < b.length; i += LIMITES.quadro) {
        const p = b.subarray(i, i + LIMITES.quadro);
        await janela.tirar(p.length);
        autorizado(signal);
        await escritor.enviar(tipo, id, p);
      }
    }
  } finally {
    signal?.removeEventListener("abort", abortar);
    if (!terminou) {
      stream.destroy?.();
      // next e return são produtores distintos: ambos ficam observados até a barreira.
      const finalizar = Promise.resolve().then(() => iterador.return?.());
      await limitado(Promise.all([observado(pendente), observado(finalizar)]));
    }
    void aviso;
  }
}
export class Coordenador {
  #m;
  #engine;
  #fechado = false;
  #db = null;
  #pendentes = new Set();
  #historico = [];
  #handles = new Map();
  constructor(manifesto, engine) {
    this.#m = manifestoFechado(manifesto);
    this.#engine = engine;
  }
  get manifesto() {
    return this.#m;
  }
  get historico() {
    return structuredClone(this.#historico);
  }
  get ledger() {
    return [...this.#pendentes].map((p) => ({ ...p }));
  }
  get handles() {
    return [...this.#handles.values()];
  }
  autorizar() {
    exigir(!this.#fechado, "REVOGADO");
  }
  async prepararBanco() {
    this.autorizar();
    exigir(!this.#db, "FASE");
    const r = { fase: "intencao-banco", id: null };
    this.#pendentes.add(r);
    try {
      await this.#engine.intencao?.(r.fase);
      this.autorizar();
      const spec = especificacao(this.#m, "db", this.#m.imagemBanco ?? "fixture-banco");
      const id = await this.#engine.criar("db", spec);
      r.id = id;
      r.fase = "banco-criado";
      this.#db = { id, spec };
      await this.#engine.persistirId?.(id);
      this.autorizar();
      await this.#conferir(this.#db, false);
      this.autorizar();
      await this.#engine.iniciar(id);
      await this.#conferir(this.#db, true);
      this.autorizar();
      this.#pendentes.delete(r);
    } catch (e) {
      r.erro = e.code ?? "INTERNO";
      this.revogar();
      throw e;
    }
  }
  async #conferir(r, running) {
    const observado = await this.#engine.inspecionar(r.id);
    exigir(
      observado.id === r.id &&
        observado.running === running &&
        iguais(observado.especificacao, r.spec),
      "IDENTIDADE",
    );
    return observado;
  }
  validar(p) {
    this.autorizar();
    validarPedido(this.#m, p);
  }
  async abrir(p, signal) {
    this.validar(p);
    exigir(this.#db, "FASE");
    const receita = receitaBanco(this.#m, p.receita);
    const r = { fase: "intencao-exec", id: null, recurso: this.#db.id };
    this.#pendentes.add(r);
    let exec;
    try {
      await this.#engine.intencao?.(r.fase);
      this.autorizar();
      autorizado(signal);
      await this.#conferir(this.#db, true);
      this.autorizar();
      autorizado(signal);
      exec = await this.#engine.criarExec(this.#db.id, receita);
      exigir(typeof exec.id === "string" && exec.id.length > 0, "IDENTIDADE");
      r.id = exec.id;
      r.fase = "exec-criado";
      this.#handles.set(exec.id, exec);
      await this.#engine.persistirId?.(exec.id);
      this.autorizar();
      autorizado(signal);
      await this.#engine.iniciarExec(exec, { signal });
      r.fase = "exec-iniciado";
      this.autorizar();
      autorizado(signal);
    } catch (e) {
      r.erro = e.code ?? "INTERNO";
      this.revogar();
      throw e;
    }
    let confirmacao;
    const confirmar = (fim) =>
      (confirmacao ??= (async () => {
        try {
          const estado = await limitado(exec.confirmar());
          exigir(
            estado.id === exec.id &&
              estado.running === false &&
              estado.codigo === fim.codigo &&
              estado.sinal === fim.sinal &&
              Number.isInteger(fim.codigo) &&
              !fim.sinal,
            "CONCLUSAO",
          );
          this.#historico.push({
            id: exec.id,
            recurso: this.#db.id,
            receita: p.receita,
            codigo: fim.codigo,
            running: false,
          });
          this.#pendentes.delete(r);
          this.#handles.delete(exec.id);
        } catch (e) {
          r.erro = e.code ?? "INTERNO";
          this.revogar();
          throw e;
        }
      })());
    return { ...exec, confirmar };
  }
  revogar() {
    this.#fechado = true;
  }
  async fechar() {
    this.revogar();
    exigir(this.#pendentes.size === 0, "ATIVOS");
    return this.historico;
  }
}
export async function atender(entrada, saida, coordenador) {
  const escritor = new Escritor(saida),
    ativos = new Map(),
    encerrados = new Map(),
    tarefas = [];
  let ultimo = 0,
    fechando = false,
    causa = null;
  const revogar = (e) => {
    causa ??= e;
    coordenador.revogar();
    for (const s of ativos.values()) {
      s.abort.abort(causa);
      abortarJanelas(s.janelas, causa);
      s.disponivel();
      s.receberEof?.();
    }
  };
  const recusar = (id, e) =>
    escritor.enviar(
      T.recusa,
      id,
      json({ code: /^[A-Z_]+$/.test(e.code ?? "") ? e.code : "INTERNO" }),
    );
  async function executar(id, p, s) {
    let exec,
      fim,
      erro = null,
      fluxos = [],
      confirmou = false;
    const timer = setTimeout(() => revogar(falha("PRAZO")), LIMITES.prazo);
    try {
      exec = await coordenador.abrir(p, s.abort.signal);
      s.exec = exec;
      for (const stream of [exec.stdin, exec.stdout, exec.stderr]) stream.on?.("error", () => {});
      autorizado(s.abort.signal);
      s.disponivel();
      await escritor.enviar(T.credito, id, credito(T.entrada, LIMITES.janela));
      fluxos = [
        transmitir(exec.stdout, T.saida, id, escritor, s.janelas.get(T.saida), s.abort.signal),
        transmitir(exec.stderr, T.erro, id, escritor, s.janelas.get(T.erro), s.abort.signal),
      ];
      for (const f of fluxos) f.catch(revogar);
      fim = await limitado(exec.fim, LIMITES.prazo);
      const resultados = await limitado(Promise.all(fluxos.map(observado)));
      const falhou = resultados.find((r) => r.erro);
      if (falhou) throw falhou.erro;
      await limitado(s.eofPronto);
      await limitado(s.cauda);
      exigir(s.eof, "EOF");
      confirmou = true;
      await exec.confirmar(fim);
      if (causa) throw causa;
    } catch (e) {
      erro = causa ?? e;
      revogar(erro);
    } finally {
      s.disponivel();
      const barreira = await observado(
        limitado(Promise.all([...fluxos.map(observado), observado(s.cauda)])),
      );
      if (barreira.erro) {
        erro ??= barreira.erro;
        revogar(erro);
      }
      if (exec && erro && !confirmou) {
        const confirmacao = await observado(
          limitado(
            (async () => {
              const f = await exec.fim;
              await exec.confirmar(f);
            })(),
          ),
        );
        if (confirmacao.erro) revogar(confirmacao.erro);
      }
      erro ??= causa;
      const envio = await observado(
        erro
          ? recusar(id, erro)
          : escritor.enviar(T.fim, id, json({ codigo: fim.codigo, sinal: fim.sinal, id: exec.id })),
      );
      if (envio.erro) revogar(envio.erro);
      clearTimeout(timer);
      encerrados.set(id, s);
      ativos.delete(id);
    }
  }
  try {
    for await (const q of quadros(entrada)) {
      exigir(!fechando, "FECHADO");
      if (q.tipo === T.abrir) {
        exigir(q.id > ultimo && q.id <= 1024, "ID");
        ultimo = q.id;
        let p;
        try {
          p = lerJson(q.corpo);
          coordenador.validar(p);
          exigir(ativos.size < LIMITES.operacoes, "CONCORRENCIA");
        } catch (e) {
          encerrados.set(q.id, { janelas: canais(), eof: false });
          await recusar(q.id, e);
          continue;
        }
        let disponivel;
        const pronto = new Promise((r) => {
          disponivel = r;
        });
        let receberEof;
        const eofPronto = new Promise((r) => {
          receberEof = r;
        });
        const s = {
          abort: new AbortController(),
          janelas: canais(),
          eof: false,
          eofPronto,
          receberEof,
          saldo: LIMITES.janela,
          total: 0,
          cauda: Promise.resolve(),
          disponivel,
          pronto,
        };
        ativos.set(q.id, s);
        const t = executar(q.id, p, s);
        tarefas.push(t);
        t.catch(revogar);
      } else if (q.tipo === T.fechar) {
        exigir(q.id === 0 && q.corpo.length === 0, "QUADRO");
        coordenador.revogar();
        fechando = true;
        exigir(ativos.size === 0, "FECHAR_PREMATURO");
      } else {
        const s = ativos.get(q.id),
          encerrado = encerrados.get(q.id);
        if (!s && encerrado) {
          if (q.tipo === T.credito) receberCredito(q.corpo, encerrado.janelas);
          else exigir([T.eof, T.cancelar].includes(q.tipo) && q.corpo.length === 0, "ID");
          continue;
        }
        exigir(s, "ID");
        if (q.tipo === T.credito) receberCredito(q.corpo, s.janelas);
        else if (q.tipo === T.cancelar) {
          exigir(q.corpo.length === 0, "QUADRO");
          revogar(falha("CANCELADO"));
        } else if (q.tipo === T.entrada) {
          exigir(!s.eof && q.corpo.length > 0 && q.corpo.length <= s.saldo, "FLUXO");
          s.saldo -= q.corpo.length;
          s.total += q.corpo.length;
          exigir(s.total <= LIMITES.total, "LIMITE");
          s.cauda = s.cauda.then(async () => {
            await s.pronto;
            autorizado(s.abort.signal);
            exigir(s.exec, "CANCELADO");
            await escrever(s.exec.stdin, q.corpo);
            s.saldo += q.corpo.length;
            autorizado(s.abort.signal);
            await escritor.enviar(T.credito, q.id, credito(T.entrada, q.corpo.length));
          });
          s.cauda.catch(revogar);
        } else if (q.tipo === T.eof) {
          exigir(!s.eof && q.corpo.length === 0, "EOF");
          s.eof = true;
          s.receberEof();
          s.cauda = s.cauda.then(async () => {
            await s.pronto;
            autorizado(s.abort.signal);
            exigir(s.exec, "CANCELADO");
            await terminar(s.exec.stdin);
          });
          s.cauda.catch(revogar);
        } else throw falha("DIRECAO");
      }
    }
    exigir(fechando, "DESCONEXAO");
  } catch (e) {
    revogar(e);
  } finally {
    coordenador.revogar();
    if (!fechando) revogar(causa ?? falha("DESCONEXAO"));
    const barreira = await observado(
      limitado(Promise.allSettled(tarefas), LIMITES.prazo + LIMITES.fechar),
    );
    if (barreira.erro) revogar(barreira.erro);
    const conferencia = await observado(coordenador.fechar());
    if (conferencia.erro) revogar(conferencia.erro);
    const recibo = await observado(
      causa
        ? recusar(0, causa)
        : escritor.enviar(T.fim, 0, json({ codigo: 0, sinal: null, id: "sessao" })),
    );
    if (recibo.erro) revogar(recibo.erro);
    const fechamento = await observado(escritor.fechar());
    if (fechamento.erro) revogar(fechamento.erro);
  }
  if (causa) throw causa;
  return coordenador.historico;
}
export class Cliente {
  #escritor;
  #entrada;
  #sessao = false;
  #ativos = new Map();
  #ultimo = 0;
  #leitura;
  #fechado = false;
  #erro = null;
  #tarefas = [];
  constructor(entrada, saida) {
    this.#entrada = entrada;
    this.#escritor = new Escritor(saida);
    this.#leitura = this.#ler(entrada);
    this.#leitura.catch((e) => this.#falhar(e));
  }
  #falhar(e) {
    this.#erro ??= e;
    for (const [id, s] of this.#ativos) if (!s.terminal) this.#finalizar(id, s, null, this.#erro);
  }
  #cancelar(id, s, e) {
    if (s.terminal || s.abort.signal.aborted) return;
    s.causa ??= e;
    s.abort.abort(s.causa);
    abortarJanelas(s.janelas, s.causa);
    const p = this.#escritor.enviar(T.cancelar, id);
    s.controles.push(observado(p));
    p.catch((erro) => this.#falhar(erro));
  }
  #finalizar(id, s, resultado, erro) {
    exigir(!s.terminal, "CONCLUSAO");
    s.terminal = true;
    if (erro) {
      s.causa ??= erro;
      s.abort.abort(s.causa);
      abortarJanelas(s.janelas, s.causa);
    }
    const tarefa = (async () => {
      let causa = s.causa;
      try {
        const bomba = await limitado(observado(s.bomba));
        causa ??= bomba.erro;
        const resultados = await limitado(
          Promise.all(
            [...s.canais.values()].map(async (c) => {
              const r = await observado(c.cauda);
              if (r.erro) return r;
              return observado(terminar(c.stream));
            }),
          ),
        );
        causa ??= resultados.find((r) => r.erro)?.erro;
        await limitado(Promise.all(s.controles));
      } catch (e) {
        causa ??= e;
      } finally {
        s.limpar();
        this.#ativos.delete(id);
        if (causa) s.rejeitar(causa);
        else s.resolver(resultado);
      }
    })();
    this.#tarefas.push(tarefa);
    tarefa.catch((e) => this.#falhar(e));
  }
  async #ler(entrada) {
    try {
      for await (const q of quadros(entrada)) {
        if (q.id === 0) {
          exigir(this.#fechado && !this.#sessao && [T.fim, T.recusa].includes(q.tipo), "CONCLUSAO");
          const r = lerJson(q.corpo);
          if (q.tipo === T.recusa) {
            exigir(iguais(Object.keys(r), ["code"]) && /^[A-Z_]+$/.test(r.code), "CONCLUSAO");
            throw falha(r.code);
          }
          exigir(iguais(r, { codigo: 0, sinal: null, id: "sessao" }), "CONCLUSAO");
          this.#sessao = true;
          continue;
        }
        const s = this.#ativos.get(q.id);
        exigir(s, "ID");
        if (q.tipo === T.credito) receberCredito(q.corpo, s.janelas);
        else if (q.tipo === T.saida || q.tipo === T.erro) {
          exigir(!s.terminal, "CONCLUSAO");
          const canal = s.canais.get(q.tipo);
          exigir(q.corpo.length > 0 && q.corpo.length <= canal.saldo, "FLUXO");
          canal.saldo -= q.corpo.length;
          canal.total += q.corpo.length;
          exigir(canal.total <= LIMITES.total, "LIMITE");
          canal.cauda = canal.cauda.then(async () => {
            await escrever(canal.stream, q.corpo);
            canal.saldo += q.corpo.length;
            if (!s.terminal && !s.abort.signal.aborted)
              await this.#escritor.enviar(T.credito, q.id, credito(q.tipo, q.corpo.length));
          });
          canal.cauda.catch((e) => this.#cancelar(q.id, s, e));
        } else if (q.tipo === T.fim || q.tipo === T.recusa) {
          const resultado = lerJson(q.corpo);
          if (q.tipo === T.recusa) {
            exigir(
              iguais(Object.keys(resultado), ["code"]) && /^[A-Z_]+$/.test(resultado.code),
              "CONCLUSAO",
            );
            this.#finalizar(q.id, s, null, falha(resultado.code));
          } else {
            exigir(
              iguais(Object.keys(resultado).sort(), ["codigo", "id", "sinal"]) &&
                Number.isInteger(resultado.codigo) &&
                resultado.codigo >= 0 &&
                resultado.codigo <= 255 &&
                resultado.sinal === null &&
                typeof resultado.id === "string",
              "CONCLUSAO",
            );
            this.#finalizar(q.id, s, resultado, null);
          }
        } else throw falha("DIRECAO");
      }
      await limitado(Promise.allSettled(this.#tarefas));
      exigir(this.#ativos.size === 0 && this.#fechado && this.#sessao, "DESCONEXAO");
    } catch (e) {
      this.#falhar(e);
      await limitado(Promise.allSettled(this.#tarefas));
      throw e;
    }
  }
  executar(pedido, { entrada = null, saida = null, erro = null, signal = null } = {}) {
    if (this.#fechado || this.#erro || signal?.aborted)
      return Promise.reject(this.#erro ?? falha(signal?.aborted ? "CANCELADO" : "FECHADO"));
    const id = ++this.#ultimo,
      janelas = canais();
    let resolver, rejeitar;
    const p = new Promise((r, j) => {
      resolver = r;
      rejeitar = j;
    });
    const sumidouro = () =>
      new Writable({
        write(_b, _e, cb) {
          cb();
        },
      });
    const canaisSaida = new Map(
      [
        [T.saida, saida ?? sumidouro()],
        [T.erro, erro ?? sumidouro()],
      ].map(([k, stream]) => {
        stream.on("error", () => {});
        return [k, { stream, saldo: LIMITES.janela, total: 0, cauda: Promise.resolve() }];
      }),
    );
    const s = {
      janelas,
      canais: canaisSaida,
      resolver,
      rejeitar,
      limpar: null,
      bomba: null,
      terminal: false,
      causa: null,
      abort: new AbortController(),
      controles: [],
      resultado: p,
    };
    const cancelar = () => this.#cancelar(id, s, falha("CANCELADO"));
    s.limpar = () => signal?.removeEventListener("abort", cancelar);
    this.#ativos.set(id, s);
    s.bomba = (async () => {
      await this.#escritor.enviar(T.abrir, id, json(pedido));
      if (s.terminal) return;
      autorizado(s.abort.signal);
      await this.#escritor.enviar(T.credito, id, credito(T.saida, LIMITES.janela));
      if (s.terminal) return;
      autorizado(s.abort.signal);
      await this.#escritor.enviar(T.credito, id, credito(T.erro, LIMITES.janela));
      if (s.terminal) return;
      signal?.addEventListener("abort", cancelar, { once: true });
      if (signal?.aborted) cancelar();
      autorizado(s.abort.signal);
      if (entrada)
        await transmitir(
          entrada,
          T.entrada,
          id,
          this.#escritor,
          janelas.get(T.entrada),
          s.abort.signal,
        );
      autorizado(s.abort.signal);
      if (!s.terminal) await this.#escritor.enviar(T.eof, id);
    })();
    s.bomba.catch((e) => this.#cancelar(id, s, e));
    return p;
  }
  async fechar() {
    exigir(!this.#fechado, "FECHADO");
    this.#fechado = true;
    let causa;
    try {
      await limitado(
        Promise.allSettled([...this.#ativos.values()].map((s) => s.resultado)),
        LIMITES.prazo + LIMITES.fechar,
      );
      await limitado(Promise.allSettled(this.#tarefas));
      if (this.#erro) throw this.#erro;
      exigir(this.#ativos.size === 0, "ATIVOS");
      await this.#escritor.enviar(T.fechar, 0);
      await this.#escritor.fechar();
      await limitado(this.#leitura);
    } catch (e) {
      causa = this.#erro ?? e;
      this.#falhar(causa);
    } finally {
      if (causa) {
        this.#entrada.destroy?.();
        this.#escritor.stream.destroy?.();
        await observado(limitado(this.#leitura));
      }
    }
    if (causa) throw causa;
  }
}
