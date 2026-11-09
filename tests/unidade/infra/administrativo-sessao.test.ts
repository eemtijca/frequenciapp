// Exercita a sessão binária com clientes locais sem rede ou processo externo.
import { PassThrough, Writable } from "node:stream";
import { expect, it } from "vitest";
import { executarSessao } from "../../isolamento/administrativo/sessao.mjs";
import { escreverFrame } from "../../isolamento/administrativo/escritor.mjs";
import { lerFrames } from "../../isolamento/administrativo/leitor.mjs";
import {
  TIPOS_FRAME as T,
  codificarFrame,
  decodificarCabecalho,
  type TipoFrame,
} from "../../isolamento/administrativo/protocolo.mjs";
import { criarBarreiraEngine } from "../../isolamento/administrativo/engine-gate.mjs";
import type { Supervisionar, ResultadoExec } from "../../isolamento/administrativo/engine-gate.mjs";

function fixture(supervisionar?: Supervisionar, prazoMs?: number) {
  const rodada = "c".repeat(32);
  const id = "e".repeat(64);
  const imagem = `sha256:${"f".repeat(64)}`;
  const spec = {
    Image: imagem,
    Cmd: ["postgres"],
    Env: ["POSTGRES_DB=sintetico"],
    Labels: { "br.frequenciapp.isolamento": rodada, "br.frequenciapp.isolamento.tipo": "banco" },
    HostConfig: {
      NetworkMode: "none",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      Memory: 268435456,
      NanoCpus: 1000000000,
      PidsLimit: 64,
      LogConfig: { Type: "local", Config: { "max-size": "1m", "max-file": "1" } },
    },
  };
  let running = false;
  let existe = true;
  const eventos: string[] = [];
  const gate = criarBarreiraEngine({
    rodada,
    receitas: { banco: spec },
    imagens: { [imagem]: { volumes: [] } },
    supervisionar,
    prazoMs,
    persistir: async () => {},
    requisitar: async (metodo, caminho) => {
      eventos.push(`${metodo} ${caminho}`);
      if (caminho === "/containers/create") return { Id: id };
      if (caminho.endsWith("/json"))
        return existe
          ? {
              Id: id,
              Config: spec,
              HostConfig: spec.HostConfig,
              Mounts: [],
              State: { Running: running, ExitCode: 0 },
            }
          : null;
      if (caminho.endsWith("/start")) running = true;
      else if (caminho.endsWith("/stop")) running = false;
      else if (metodo === "DELETE") existe = false;
      else throw new Error("Cliente sintético recebeu endpoint indevido.");
      return null;
    },
  });
  return { gate, eventos, id };
}
async function canal(
  supervisionar?: Supervisionar,
  signal?: AbortSignal,
  timeoutMs?: number,
  prazoMs?: number,
  coletar: () => Promise<void> = async () => {},
) {
  const f = fixture(supervisionar, prazoMs);
  const handle = await f.gate.criar("banco");
  if (supervisionar) await f.gate.iniciar(handle);
  const entrada = new PassThrough();
  const saida = new PassThrough();
  const sequencias = new Map<number, number>();
  const receber = lerFrames(saida);
  const enviar = async (tipo: TipoFrame, requestId: number, corpo: unknown = {}) => {
    const sequencia = sequencias.get(requestId) ?? 0;
    sequencias.set(requestId, sequencia + 1);
    await escreverFrame(entrada, {
      tipo,
      requestId,
      sequencia,
      flags: 0,
      payload: Buffer.isBuffer(corpo) ? corpo : Buffer.from(JSON.stringify(corpo)),
    });
  };
  const sessao = executarSessao({
    origem: entrada,
    destino: saida,
    gate: f.gate,
    coletar,
    signal,
    timeoutMs,
  });
  await enviar(T.HELLO, 0, { versao: 1 });
  expect((await receber.next()).value).toMatchObject({ tipo: T.HELLO });
  return { ...f, handle, entrada, saida, receber, enviar, sessao };
}

it("entrega ao supervisor o ID devolvido pela criação, não o handle", async () => {
  let recebido: { id: string; argv: string[] } | undefined;
  const f = fixture(async ({ id, argv }) => {
    recebido = { id, argv };
    return {
      stdout: (async function* () {})(),
      stderr: (async function* () {})(),
      resultado: Promise.resolve({ codigo: 0, sinal: null, grupoEncerrado: true }),
      cancelar: async () => ({ codigo: 0, sinal: null, grupoEncerrado: true }),
    };
  });
  const handle = await f.gate.criar("banco");
  await f.gate.iniciar(handle);
  const exec = await f.gate.executar(
    handle,
    "dump",
    (async function* () {})(),
    new AbortController().signal,
  );
  await exec.resultado;
  expect(recebido).toEqual({
    id: f.id,
    argv: ["pg_dump", "--format=custom", "--dbname=sintetico"],
  });
  expect(recebido?.id).not.toBe(handle);
  await f.gate.encerrar(async () => {});
});

it("executa controle fechado pelo wire e encerra com coleta e remoção exata", async () => {
  const c = await canal();
  await c.enviar(T.REQUEST, 1, { operacao: "consultarServico", servico: c.handle });
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED, requestId: 1 });
  const resultado = (await c.receber.next()).value;
  expect(resultado).toMatchObject({ tipo: T.RESULT, requestId: 1 });
  expect(JSON.parse(resultado?.payload.toString() ?? "null")).toMatchObject({
    codigo: 0,
    sinal: null,
    confirmado: true,
    dados: { estado: "parado" },
  });
  await c.enviar(T.SESSION_END, 0);
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.SESSION_END });
  expect(await c.sessao).toMatchObject({ codigo: 0, limpeza: { removidos: [c.handle] } });
  expect(c.eventos).toContain(`DELETE /containers/${c.id}`);
  c.entrada.destroy();
  c.saida.destroy();
});

it("projeta configuração por handles e coleta sem aceitar destinos do cliente", async () => {
  const c = await canal();
  await c.enviar(T.REQUEST, 1, { operacao: "consultarConfiguracao" });
  const aceito = await Promise.race([
    c.receber.next(),
    c.sessao.then(() => {
      throw new Error("Configuração fechada indisponível.");
    }),
  ]);
  expect(aceito.value).toMatchObject({ tipo: T.ACCEPTED });
  const resposta = (await c.receber.next()).value;
  expect(JSON.parse(resposta?.payload.toString() ?? "null")).toMatchObject({
    dados: { servicos: [{ handle: c.handle, slot: "banco" }] },
  });
  expect(resposta?.payload.toString()).not.toContain(c.id);
  await c.enviar(T.REQUEST, 2, { operacao: "coletar" });
  await c.receber.next();
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.RESULT });
  await c.enviar(T.SESSION_END, 0);
  await c.receber.next();
  expect(await c.sessao).toMatchObject({ codigo: 0 });
  c.entrada.destroy();
  c.saida.destroy();
});

it("recusa controles desconhecidos, UTF-8 inválido e IDs reutilizados", async () => {
  for (const corpo of [
    { operacao: "docker", servico: "x" },
    { operacao: "consultarServico", servico: "x", argv: ["sh"] },
    { operacao: "executar", servico: "x", variante: "sh" },
    Buffer.from([255]),
  ]) {
    const c = await canal();
    const marco = c.eventos.length;
    await c.enviar(T.REQUEST, 1, corpo);
    expect(await c.sessao).toMatchObject({ codigo: 1 });
    expect(c.eventos.slice(marco).every((e) => !e.includes("/start") && !e.includes("/exec"))).toBe(
      true,
    );
    c.entrada.destroy();
    c.saida.destroy();
  }
  const c = await canal();
  await c.enviar(T.REQUEST, 1, { operacao: "consultarServico", servico: c.handle });
  await c.receber.next();
  await c.receber.next();
  await c.enviar(T.REQUEST, 1, { operacao: "consultarServico", servico: c.handle });
  expect(await c.sessao).toMatchObject({ codigo: 1 });
  c.entrada.destroy();
  c.saida.destroy();
});

it.each(["consultarConfiguracao", "coletar", "consultarServico", "executar"])(
  "ADM-LOCAL-05 recusa discriminador array no despacho real: %s",
  async (operacao) => {
    let coletas = 0;
    const c = await canal(undefined, undefined, undefined, undefined, async () => {
      coletas++;
    });
    const pedido = {
      operacao: [operacao],
      ...(["consultarServico", "executar"].includes(operacao) ? { servico: c.handle } : {}),
      ...(operacao === "executar" ? { variante: "dump" } : {}),
    };
    c.entrada.end(
      Buffer.concat([
        codificarFrame({
          tipo: T.REQUEST,
          flags: 0,
          requestId: 1,
          sequencia: 0,
          payload: Buffer.from(JSON.stringify(pedido)),
        }),
        codificarFrame({
          tipo: T.SESSION_END,
          flags: 0,
          requestId: 0,
          sequencia: 1,
          payload: Buffer.from("{}"),
        }),
      ]),
    );
    try {
      const resultado = await c.sessao;
      expect(resultado.codigo).toBe(1);
      expect(resultado.erro).toBeInstanceOf(Error);
      expect(coletas).toBe(1); // Somente a coleta obrigatória do cleanup, nunca despacho residual.
    } finally {
      c.entrada.destroy();
      c.saida.destroy();
    }
  },
);

it("sinais e prazo host encerram a sessão ociosa com coleta sem novos pedidos", async () => {
  for (const sinal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
    const abort = new AbortController();
    const c = await canal(undefined, abort.signal);
    abort.abort(sinal);
    const resultado = await Promise.race([
      c.sessao,
      new Promise((_, rejeitar) => {
        const t = setTimeout(() => rejeitar(new Error("Sinal ignorado.")), 500);
        t.unref();
      }),
    ]);
    expect(resultado).toMatchObject({ codigo: 1, limpeza: { removidos: [c.handle] } });
    c.entrada.destroy();
    c.saida.destroy();
  }
  const c = await canal(undefined, undefined, 10);
  expect(await c.sessao).toMatchObject({ codigo: 1, limpeza: { removidos: [c.handle] } });
  c.entrada.destroy();
  c.saida.destroy();
});

it("um dump sem crédito não bloqueia outro dump grande nem seu cancelamento", async () => {
  let chamadas = 0;
  const pulls = [0, 0];
  const esperado = Buffer.from(Array.from({ length: 524288 }, (_, n) => n % 256));
  const c = await canal(async () => {
    const indice = chamadas++;
    const fim = Promise.withResolvers<ResultadoExec>();
    return {
      stdout: (async function* () {
        for (let pos = 0; pos < esperado.length; pos += 65536) {
          pulls[indice] = (pulls[indice] ?? 0) + 1;
          yield esperado.subarray(pos, pos + 65536);
        }
        fim.resolve({ codigo: 0, sinal: null, grupoEncerrado: true });
      })(),
      stderr: (async function* () {})(),
      resultado: fim.promise,
      cancelar: async () => {
        const r: ResultadoExec = { codigo: null, sinal: "SIGTERM", grupoEncerrado: true };
        fim.resolve(r);
        return r;
      },
    };
  });
  for (const id of [1, 2]) {
    await c.enviar(T.REQUEST, id, { operacao: "executar", servico: c.handle, variante: "dump" });
    expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED, requestId: id });
  }
  await c.enviar(T.WINDOW, 2, { stream: "stdout", bytes: 65536 });
  await c.enviar(T.WINDOW, 2, { stream: "stderr", bytes: 65536 });
  const blocos: Buffer[] = [];
  for (;;) {
    const f = (await c.receber.next()).value;
    if (!f) throw new Error("Frame ausente.");
    expect(f.requestId).toBe(2);
    if (f.tipo === T.RESULT) break;
    expect(f.tipo).toBe(T.STDOUT);
    expect(f.payload.length).toBeLessThanOrEqual(16384);
    blocos.push(f.payload);
    await c.enviar(T.WINDOW, 2, { stream: "stdout", bytes: f.payload.length });
  }
  expect(Buffer.concat(blocos)).toEqual(esperado);
  expect(pulls[0]).toBe(0);
  await c.enviar(T.CANCEL, 1);
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.CANCELLED, requestId: 1 });
  await c.receber.next();
  await c.enviar(T.SESSION_END, 0);
  await c.receber.next();
  expect(await c.sessao).toMatchObject({ codigo: 1 });
  c.entrada.destroy();
  c.saida.destroy();
});

it("prazo local interrompe uma escrita sem progresso sem declarar sucesso", async () => {
  const f = fixture();
  const handle = await f.gate.criar("banco");
  const entrada = new PassThrough();
  let liberar: (() => void) | undefined;
  const saida = new Writable({
    write(_bytes, _enc, cb) {
      liberar = cb;
    },
  });
  const sessao = executarSessao({
    origem: entrada,
    destino: saida,
    gate: f.gate,
    coletar: async () => {},
    timeoutMs: 10,
  });
  await escreverFrame(entrada, {
    tipo: T.HELLO,
    flags: 0,
    requestId: 0,
    sequencia: 0,
    payload: Buffer.from('{"versao":1}'),
  });
  try {
    const resultado = await Promise.race([
      sessao,
      new Promise((_, rejeitar) => {
        const t = setTimeout(() => rejeitar(new Error("Prazo não interrompeu escrita.")), 500);
        t.unref();
      }),
    ]);
    expect(resultado).toMatchObject({ codigo: 1, limpeza: { removidos: [handle] } });
  } finally {
    liberar?.();
    entrada.destroy();
    saida.destroy();
    await sessao;
  }
});

it.each(["prazo", "abort"] as const)(
  "ADM-LOCAL-04 mantém interrupção na escrita SESSION_END: %s",
  async (variante) => {
    const f = fixture();
    const handle = await f.gate.criar("banco");
    const entrada = new PassThrough();
    const abort = new AbortController();
    const bloqueou = Promise.withResolvers<void>();
    let liberar: (() => void) | undefined;
    const tipos: number[] = [];
    const saida = new Writable({
      highWaterMark: 1,
      write(bytes: Buffer, _enc, cb) {
        const { tipo } = decodificarCabecalho(bytes);
        tipos.push(tipo);
        if (tipo === T.SESSION_END) {
          liberar = cb;
          bloqueou.resolve();
        } else cb();
      },
    });
    const sessao = executarSessao({
      origem: entrada,
      destino: saida,
      gate: f.gate,
      coletar: async () => {},
      signal: abort.signal,
      timeoutMs: variante === "prazo" ? 100 : 1000,
    });
    await escreverFrame(entrada, {
      tipo: T.HELLO,
      flags: 0,
      requestId: 0,
      sequencia: 0,
      payload: Buffer.from('{"versao":1}'),
    });
    await escreverFrame(entrada, {
      tipo: T.SESSION_END,
      flags: 0,
      requestId: 0,
      sequencia: 1,
      payload: Buffer.from("{}"),
    });
    await bloqueou.promise;
    if (variante === "abort") abort.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const resultado = await Promise.race([
        sessao,
        new Promise<never>((_, rejeitar) => {
          timer = setTimeout(() => rejeitar(new Error("SESSION_END ficou sem interrupção.")), 500);
        }),
      ]);
      expect(tipos).toEqual([T.HELLO, T.SESSION_END]);
      expect(resultado).toMatchObject({ codigo: 1, limpeza: { removidos: [handle] } });
      expect(resultado.erro).toBeInstanceOf(Error);
      expect(saida.destroyed).toBe(true);
    } finally {
      clearTimeout(timer);
      liberar?.();
      entrada.destroy();
      saida.destroy();
      await sessao;
    }
  },
);

it("cancelamento sem confirmação tem prazo e preserva o resíduo", async () => {
  let cancelamentos = 0;
  const c = await canal(
    async () => ({
      stdout: (async function* () {})(),
      stderr: (async function* () {})(),
      resultado: new Promise(() => {}),
      cancelar: async () => {
        cancelamentos++;
        return new Promise(() => {});
      },
    }),
    undefined,
    1000,
    20,
  );
  await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "dump" });
  await c.receber.next();
  await c.enviar(T.CANCEL, 1);
  const resultado = await Promise.race([
    c.sessao,
    new Promise((_, rejeitar) => {
      const t = setTimeout(() => rejeitar(new Error("Cancelamento ficou pendente.")), 500);
      t.unref();
    }),
  ]);
  expect(resultado).toMatchObject({
    codigo: 1,
    limpeza: { removidos: [], preservados: [c.handle] },
  });
  expect(cancelamentos).toBe(1);
  c.entrada.destroy();
  c.saida.destroy();
});

it("preserva recurso sem repetir cancelamento cujo recibo não confirma o grupo", async () => {
  const fim = Promise.withResolvers<ResultadoExec>();
  let cancelamentos = 0;
  const recibo: ResultadoExec = { codigo: null, sinal: "SIGTERM", grupoEncerrado: false };
  const c = await canal(async () => ({
    stdout: (async function* () {})(),
    stderr: (async function* () {})(),
    resultado: fim.promise,
    cancelar: async () => {
      cancelamentos++;
      fim.resolve(recibo);
      return recibo;
    },
  }));
  await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "dump" });
  await c.receber.next();
  await c.enviar(T.CANCEL, 1);
  expect(await c.sessao).toMatchObject({
    codigo: 1,
    limpeza: { removidos: [], preservados: [c.handle] },
  });
  expect(cancelamentos).toBe(1);
  expect(c.eventos.some((e) => e.startsWith("DELETE"))).toBe(false);
  c.entrada.destroy();
  c.saida.destroy();
});

it.each(
  ["next", "return"].flatMap((etapa) =>
    ["CANCEL", "abort-host", "prazo-host"].map((interrupcao) => ({ etapa, interrupcao })),
  ),
)("ADM-LOCAL-03 limita produtor pendente: $etapa/$interrupcao", async ({ etapa, interrupcao }) => {
  const entrou = Promise.withResolvers<void>();
  const pendente = Promise.withResolvers<IteratorResult<Buffer>>();
  const fim = Promise.withResolvers<ResultadoExec>();
  const abort = new AbortController();
  let cancelamentos = 0;
  const c = await canal(
    async () => ({
      stdout: {
        [Symbol.asyncIterator]() {
          return {
            next: () => {
              if (etapa !== "next")
                return Promise.resolve({ done: true, value: undefined } as const);
              entrou.resolve();
              return pendente.promise;
            },
            return: () => {
              if (etapa !== "return")
                return Promise.resolve({ done: true, value: undefined } as const);
              entrou.resolve();
              return pendente.promise;
            },
          };
        },
      },
      stderr: (async function* () {})(),
      resultado: fim.promise,
      cancelar: async () => {
        cancelamentos++;
        const r: ResultadoExec = { codigo: null, sinal: "SIGTERM", grupoEncerrado: true };
        fim.resolve(r);
        return r;
      },
    }),
    abort.signal,
    interrupcao === "prazo-host" ? 100 : 1000,
  );
  await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "dump" });
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED });
  await c.enviar(T.WINDOW, 1, { stream: "stdout", bytes: 1 });
  await entrou.promise;
  if (interrupcao === "CANCEL") await c.enviar(T.CANCEL, 1);
  else if (interrupcao === "abort-host") abort.abort();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resultado = await Promise.race([
      c.sessao,
      new Promise<never>((_, rejeitar) => {
        timer = setTimeout(() => rejeitar(new Error("Produtor bloqueou cleanup local.")), 500);
      }),
    ]);
    expect(resultado).toMatchObject({ codigo: 1, limpeza: { removidos: [c.handle] } });
    expect(resultado.erro).toBeInstanceOf(Error);
    expect(resultado).toHaveProperty("saidasPendentes", [
      { requestId: 1, stream: "stdout", etapa },
    ]);
    expect(cancelamentos).toBe(1);
  } finally {
    clearTimeout(timer);
    pendente.reject(new Error("Rejeição tardia observada do produtor."));
    c.entrada.destroy();
    c.saida.destroy();
    await c.sessao;
  }
});

it.each(
  (["stdout", "stderr"] as const).flatMap((primeiro) =>
    (["CANCEL", "erro-produtor", "CANCEL-inconclusivo"] as const).map((modo) => ({
      primeiro,
      modo,
    })),
  ),
)(
  "ADM-CORRETIVO-02 consolida produtores antes da coleta: $primeiro/$modo",
  async ({ primeiro, modo }) => {
    const segundo = primeiro === "stdout" ? "stderr" : "stdout";
    const entradas = {
      stdout: Promise.withResolvers<void>(),
      stderr: Promise.withResolvers<void>(),
    };
    const nexts = {
      stdout: Promise.withResolvers<IteratorResult<Buffer>>(),
      stderr: Promise.withResolvers<IteratorResult<Buffer>>(),
    };
    const retornos = {
      stdout: Promise.withResolvers<IteratorResult<Buffer>>(),
      stderr: Promise.withResolvers<IteratorResult<Buffer>>(),
    };
    const fim = Promise.withResolvers<ResultadoExec>();
    const cancelou = Promise.withResolvers<void>();
    const eventos: string[] = [];
    let naColeta: string[] = [];
    let cancelamentos = 0;
    const erroOriginal = new Error(`Falha original de ${primeiro}/next.`);
    const inconclusivo = modo === "CANCEL-inconclusivo";
    const produtor = (nome: "stdout" | "stderr"): AsyncIterable<Buffer> => ({
      [Symbol.asyncIterator]() {
        return {
          next: () => {
            eventos.push(`next-${nome}`);
            entradas[nome].resolve();
            return nexts[nome].promise;
          },
          return: () => {
            eventos.push(`return-${nome}`);
            if (nome === primeiro && modo === "CANCEL")
              return Promise.resolve({ done: true, value: undefined } as const);
            return retornos[nome].promise;
          },
        };
      },
    });
    const c = await canal(
      async () => ({
        stdout: produtor("stdout"),
        stderr: produtor("stderr"),
        resultado: fim.promise,
        cancelar: async () => {
          cancelamentos++;
          const r: ResultadoExec = {
            codigo: null,
            sinal: "SIGTERM",
            grupoEncerrado: !inconclusivo,
          };
          eventos.push("cancelar");
          fim.resolve(r);
          cancelou.resolve();
          return r;
        },
      }),
      undefined,
      1000,
      1000,
      async () => {
        naColeta = [...eventos];
      },
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "dump" });
      expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED });
      for (const stream of [primeiro, segundo] as const) {
        await c.enviar(T.WINDOW, 1, { stream, bytes: 1 });
        await entradas[stream].promise;
      }
      if (modo !== "erro-produtor") {
        await c.enviar(T.CANCEL, 1);
        await cancelou.promise;
      }
      if (!inconclusivo) nexts[primeiro].reject(erroOriginal);
      const imediato = await Promise.race([
        c.sessao.then((resultado) => ({
          resultado,
          serializado: JSON.stringify(resultado.saidasPendentes),
        })),
        new Promise<never>((_, rejeitar) => {
          timer = setTimeout(
            () => rejeitar(new Error("Produtores não consolidaram em limite local.")),
            500,
          );
        }),
      ]);
      clearTimeout(timer);
      // Janela de observação posterior, não usada para ordenar os produtores.
      await new Promise((resolve) => setTimeout(resolve, 250));
      const esperados = inconclusivo
        ? ["stdout", "stderr"].flatMap((stream) =>
            ["next", "return"].map((etapa) => ({
              requestId: 1,
              stream,
              etapa,
            })),
          )
        : [
            { requestId: 1, stream: segundo, etapa: "next" },
            { requestId: 1, stream: segundo, etapa: "return" },
            ...(modo === "erro-produtor"
              ? [{ requestId: 1, stream: primeiro, etapa: "return" }]
              : []),
          ];
      expect.soft(JSON.parse(imediato.serializado)).toEqual(expect.arrayContaining(esperados));
      expect.soft(JSON.parse(imediato.serializado)).toHaveLength(esperados.length);
      expect.soft(JSON.stringify(imediato.resultado.saidasPendentes)).toBe(imediato.serializado);
      expect
        .soft(naColeta)
        .toEqual(expect.arrayContaining(["return-stdout", "return-stderr", "cancelar"]));
      expect.soft(imediato.resultado).toMatchObject({
        codigo: 1,
        limpeza: inconclusivo
          ? { removidos: [], preservados: [c.handle] }
          : { removidos: [c.handle], preservados: [] },
      });
      if (!inconclusivo) expect.soft(imediato.resultado.erro).toBe(erroOriginal);
      else expect.soft(imediato.resultado.erro).toBeInstanceOf(Error);
      expect.soft(cancelamentos).toBe(1);
      if (inconclusivo) expect.soft(c.eventos.some((e) => e.startsWith("DELETE"))).toBe(false);
    } finally {
      clearTimeout(timer);
      for (const pendente of [
        ...Object.values(nexts),
        ...Object.entries(retornos)
          .filter(([nome]) => nome !== primeiro || modo !== "CANCEL")
          .map(([, r]) => r),
      ])
        pendente.reject(new Error("Rejeição tardia observada após consolidação."));
      c.entrada.destroy();
      c.saida.destroy();
      await c.sessao;
      await new Promise((resolve) => setImmediate(resolve));
    }
  },
);

it("CANCEL confirma o grupo sem depender de crédito de saída", async () => {
  const fim = Promise.withResolvers<ResultadoExec>();
  let pulls = 0;
  let cancelamentos = 0;
  const recibo: ResultadoExec = { codigo: null, sinal: "SIGTERM", grupoEncerrado: true };
  const c = await canal(async () => ({
    stdout: (async function* () {
      pulls++;
      yield Buffer.alloc(65536, 71);
    })(),
    stderr: (async function* () {})(),
    resultado: fim.promise,
    cancelar: async () => {
      cancelamentos++;
      fim.resolve(recibo);
      return recibo;
    },
  }));
  await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "dump" });
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED });
  await c.enviar(T.REQUEST, 2, { operacao: "consultarServico", servico: c.handle });
  await c.receber.next();
  await c.receber.next();
  expect(pulls).toBe(0);
  await c.enviar(T.CANCEL, 1);
  const cancelado = await Promise.race([
    c.receber.next(),
    c.sessao.then(() => {
      throw new Error("Sessão morreu em vez de confirmar CANCEL.");
    }),
  ]);
  expect(cancelado.value).toMatchObject({ tipo: T.CANCELLED, requestId: 1 });
  expect(cancelamentos).toBe(1);
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.RESULT, requestId: 1 });
  await c.enviar(T.SESSION_END, 0);
  await c.receber.next();
  expect(await c.sessao).toMatchObject({ codigo: 1, limpeza: { removidos: [c.handle] } });
  c.entrada.destroy();
  c.saida.destroy();
});

it("executa variante fechada com stdin e saídas binárias independentes", async () => {
  const fim = Promise.withResolvers<ResultadoExec>();
  const c = await canal(async ({ id, argv, entrada }) => {
    expect(id).toBe("e".repeat(64));
    expect(argv).toEqual(["pg_restore", "--exit-on-error", "--dbname=sintetico"]);
    return {
      stdout: (async function* () {
        for await (const bytes of entrada) yield bytes;
        fim.resolve({ codigo: 0, sinal: null, grupoEncerrado: true });
      })(),
      stderr: (async function* () {
        yield Buffer.from([255, 10, 0]);
      })(),
      resultado: fim.promise,
      cancelar: async () => {
        const r: ResultadoExec = { codigo: null, sinal: "SIGTERM", grupoEncerrado: true };
        fim.resolve(r);
        return r;
      },
    };
  });
  expect(typeof c.gate.executar).toBe("function");
  await c.enviar(T.REQUEST, 1, { operacao: "executar", servico: c.handle, variante: "restaurar" });
  expect((await c.receber.next()).value).toMatchObject({ tipo: T.ACCEPTED });
  const bytes = Buffer.from([0, 255, 10, 13, 123, 125]);
  await c.enviar(T.STDIN, 1, bytes);
  await c.enviar(T.STDIN_END, 1, Buffer.alloc(0));
  await c.enviar(T.WINDOW, 1, { stream: "stdout", bytes: 65536 });
  await c.enviar(T.WINDOW, 1, { stream: "stderr", bytes: 65536 });
  const out: Buffer[] = [];
  const err: Buffer[] = [];
  for (;;) {
    const frame = (await c.receber.next()).value;
    if (!frame) throw new Error("Saída ausente.");
    if (frame.tipo === T.STDOUT) out.push(frame.payload);
    if (frame.tipo === T.STDERR) err.push(frame.payload);
    if (frame.tipo === T.RESULT) {
      expect(JSON.parse(frame.payload.toString())).toMatchObject({ codigo: 0, confirmado: true });
      break;
    }
  }
  expect(Buffer.concat(out)).toEqual(bytes);
  expect(Buffer.concat(err)).toEqual(Buffer.from([255, 10, 0]));
  await c.enviar(T.SESSION_END, 0);
  await c.receber.next();
  expect(await c.sessao).toMatchObject({ codigo: 0 });
  c.entrada.destroy();
  c.saida.destroy();
});
