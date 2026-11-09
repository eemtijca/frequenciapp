// Confere a leitura incremental binária, sem sessão ou autoridade administrativa.
import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { lerFrames } from "../../isolamento/administrativo/leitor.mjs";
import {
  decodificarCabecalho,
  decodificarFrame,
} from "../../isolamento/administrativo/protocolo.mjs";

// Vetor independente do encoder: FADM, versão 1, STDIN e inteiros big-endian.
function frameManual(payload = Buffer.alloc(0)): Buffer {
  const cabecalho = Buffer.from([
    0x46, 0x41, 0x44, 0x4d, 1, 4, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0,
  ]);
  cabecalho.writeUInt32BE(payload.length, 16);
  return Buffer.concat([cabecalho, payload]);
}

async function* chunks(bytes: Buffer[]) {
  yield* bytes;
}

async function coletar(origem: AsyncIterable<Buffer>) {
  const frames = [];
  for await (const frame of lerFrames(origem)) frames.push(frame);
  return frames;
}

// Observa chamadas reais sem substituir alocações nem medir tempo.
async function observarBuffers<T>(acao: () => Promise<T>) {
  const alloc = vi.spyOn(Buffer, "alloc");
  const unsafe = vi.spyOn(Buffer, "allocUnsafe");
  const slow = vi.spyOn(Buffer, "allocUnsafeSlow");
  const concat = vi.spyOn(Buffer, "concat");
  const from = vi.spyOn(Buffer, "from");
  const copy = vi.spyOn(Buffer.prototype, "copy");
  let valor: T | undefined;
  let erro: unknown;
  try {
    try {
      valor = await acao();
    } catch (falha) {
      erro = falha;
    }
    const alocacoes = [...alloc.mock.calls, ...unsafe.mock.calls, ...slow.mock.calls].map(
      ([tamanho]) => tamanho,
    );
    const origens = from.mock.calls.map(([origem]) => origem);
    const copias = copy.mock.calls.map(([, , inicio, fim], i) => {
      const origem = copy.mock.contexts[i];
      if (!Buffer.isBuffer(origem))
        throw new TypeError("Origem observada da cópia deve ser Buffer.");
      if (inicio !== undefined && typeof inicio !== "number")
        throw new TypeError("Início observado da cópia deve ser número ou ausente.");
      if (fim !== undefined && typeof fim !== "number")
        throw new TypeError("Fim observado da cópia deve ser número ou ausente.");
      return { origem, inicio: inicio ?? 0, fim };
    });
    const concatenacoes = concat.mock.calls.length;
    return { valor, erro, alocacoes, origens, copias, concatenacoes };
  } finally {
    for (const espiao of [alloc, unsafe, slow, concat, from, copy]) espiao.mockRestore();
  }
}

describe("leitor incremental administrativo", () => {
  it("expõe validação de header sem prometer validação de payload ou comprimento total", () => {
    const bytes = frameManual(Buffer.from([0, 255, 10, 128]));
    const esperado = {
      tipo: 4,
      flags: 0,
      requestId: 0x01020304,
      sequencia: 0x05060708,
      tamanhoPayload: 4,
    };
    expect(decodificarCabecalho(bytes.subarray(0, 20))).toEqual(esperado);
    expect(decodificarCabecalho(Buffer.concat([bytes, bytes]))).toEqual(esperado);
    const externo = vi.fn(() => {
      throw new Error("Método externo acessado.");
    });
    expect(() =>
      Reflect.apply(decodificarCabecalho, undefined, [
        {
          get length() {
            return externo();
          },
        },
      ]),
    ).toThrow(TypeError);
    expect(externo).not.toHaveBeenCalled();
    expect(() => decodificarCabecalho(bytes.subarray(0, 19))).toThrow(/cabeçalho incompleto/i);
    expect(() => decodificarCabecalho(bytes, { limitePayload: 3 })).toThrow(/limite/i);
  });
  it("copia fragmentos linearmente sem concatenação acumulativa", async () => {
    const bytes = frameManual(Buffer.from(Array.from({ length: 256 }, (_, i) => i)));
    const fragmentos = Array.from(bytes, (_, i) => bytes.subarray(i, i + 1));
    const observado = await observarBuffers(() => coletar(chunks(fragmentos)));
    expect(observado.erro).toBeUndefined();
    expect(observado.valor).toEqual([decodificarFrame(bytes)]);
    expect(observado.concatenacoes).toBe(0);
    expect(observado.alocacoes.length).toBeGreaterThan(0);
    expect(observado.origens.length).toBeGreaterThan(0);
    expect(observado.copias.length).toBeGreaterThanOrEqual(fragmentos.length);
    const copiados = observado.copias.reduce(
      (total, { origem, inicio, fim }) => total + (fim ?? origem?.length ?? 0) - inicio,
      0,
    );
    expect(copiados).toBeLessThanOrEqual(2 * bytes.length);
    expect(observado.alocacoes.reduce((total, tamanho) => total + tamanho, 0)).toBeLessThanOrEqual(
      2 * bytes.length,
    );
  });
  it("mantém payloads opacos independentes da origem e entre resultados", async () => {
    const payload = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
    const bytes = Buffer.concat([frameManual(payload), frameManual(payload)]);
    const leitor = lerFrames(chunks([bytes]));
    const um = await leitor.next();
    if (um.done) throw new Error("Primeiro frame ausente.");
    expect(um.value.payload).toEqual(payload);
    bytes[20] = 99;
    expect(um.value.payload[0]).toBe(0);
    um.value.payload[1] = 200;
    const dois = await leitor.next();
    if (dois.done) throw new Error("Segundo frame ausente.");
    expect(dois.value.payload).toEqual(payload);
    dois.value.payload[2] = 201;
    expect(um.value.payload[2]).toBe(2);
    bytes.fill(7);
    expect(dois.value.payload[0]).toBe(0);
    expect(um.value.payload[0]).toBe(0);
    await leitor.return();
  });
  it("finaliza no return, throw, break e erro do consumidor sem ler adiante", async () => {
    const bytes = frameManual(Buffer.from([0, 255]));
    const original = new Error("Falha sintética do consumidor.");
    for (const modo of ["return", "throw", "break", "erro"] as const) {
      let puxados = 0;
      let finalizados = 0;
      const origem = {
        async *[Symbol.asyncIterator]() {
          try {
            puxados++;
            yield bytes;
            puxados++;
            yield bytes;
          } finally {
            finalizados++;
          }
        },
      };
      const leitor = lerFrames(origem);
      if (modo === "return" || modo === "throw") {
        await leitor.next();
        if (modo === "return") await leitor.return();
        else await expect(leitor.throw(original)).rejects.toBe(original);
      } else {
        const consumir = async () => {
          for await (const _frame of leitor) {
            if (modo === "erro") throw original;
            break;
          }
        };
        if (modo === "erro") await expect(consumir()).rejects.toBe(original);
        else await consumir();
      }
      expect(puxados).toBe(1);
      expect(finalizados).toBe(1);
      await expect(leitor.next()).resolves.toEqual({ done: true, value: undefined });
    }
    const finalizar = vi.fn(async (): Promise<IteratorResult<Buffer>> => {
      throw new Error("Falha secundária de fechamento.");
    });
    const origem = {
      [Symbol.asyncIterator]() {
        return { next: async () => ({ done: false as const, value: bytes }), return: finalizar };
      },
    };
    const leitor = lerFrames(origem);
    await leitor.next();
    await expect(leitor.throw(original)).rejects.toBe(original);
    expect(finalizar).toHaveBeenCalledOnce();
  });
  it("finaliza a origem que falha sem drenar nem mascarar o erro original", async () => {
    for (const original of [new Error("Falha sintética da origem."), undefined]) {
      const puxar = vi.fn(async (): Promise<IteratorResult<Buffer>> => {
        throw original;
      });
      const finalizar = vi.fn(async (): Promise<IteratorResult<Buffer>> => {
        throw new Error("Falha secundária ao finalizar.");
      });
      const origem = {
        [Symbol.asyncIterator]() {
          return { next: puxar, return: finalizar };
        },
      };
      const leitor = lerFrames(origem);
      await expect(leitor.next()).rejects.toBe(original);
      expect(finalizar).toHaveBeenCalledOnce();
      expect(puxar).toHaveBeenCalledOnce();
      await expect(leitor.next()).resolves.toEqual({ done: true, value: undefined });
      expect(finalizar).toHaveBeenCalledOnce();
    }
  });
  it("valida limite uint32 antes de puxar e respeita os limites inclusivos", async () => {
    for (const limitePayload of [0, -1, 0.5, NaN, Infinity, 0x1_0000_0000, null, "4"]) {
      const puxar = vi.fn(async () => ({ done: true as const, value: undefined }));
      const origem = {
        [Symbol.asyncIterator]() {
          return { next: puxar };
        },
      };
      const observado = await observarBuffers(() =>
        Reflect.apply(lerFrames, undefined, [origem, { limitePayload }]).next(),
      );
      expect(observado.erro).toBeInstanceOf(RangeError);
      expect(String(observado.erro)).toMatch(/limite/i);
      expect(observado.alocacoes).toEqual([]);
      expect(puxar).not.toHaveBeenCalled();
    }
    for (const limitePayload of [4, 65_536]) {
      const bytes = frameManual(Buffer.alloc(limitePayload, 255));
      const leitor = lerFrames(chunks([bytes]), { limitePayload });
      await expect(leitor.next()).resolves.toEqual({ done: false, value: decodificarFrame(bytes) });
      await expect(leitor.next()).resolves.toEqual({ done: true, value: undefined });
      const excesso = frameManual();
      excesso.writeUInt32BE(limitePayload + 1, 16);
      const observado = await observarBuffers(() =>
        lerFrames(
          chunks([excesso]),
          limitePayload === 65_536 ? undefined : { limitePayload },
        ).next(),
      );
      expect(String(observado.erro)).toMatch(/limite/i);
      expect(observado.alocacoes).toEqual([20]);
    }
    const vazio = frameManual();
    const leitor = lerFrames(chunks([vazio]), { limitePayload: 0xffffffff });
    await expect(leitor.next()).resolves.toEqual({ done: false, value: decodificarFrame(vazio) });
    await leitor.return();
  });
  it("valida o header completo antes de reservar ou copiar payload sem drenar", async () => {
    const vetores = [
      { offset: 0, valor: 0, erro: /magic/i },
      { offset: 4, valor: 2, erro: /versão/i },
      { offset: 5, valor: 13, erro: /tipo/i },
      { offset: 6, valor: 1, erro: /flags/i },
      { offset: 16, valor: 0, tamanho: 65_537, erro: /limite/i },
    ];
    for (const vetor of vetores) {
      const header = frameManual(Buffer.alloc(4)).subarray(0, 20);
      header[vetor.offset] = vetor.valor;
      if (vetor.tamanho !== undefined) header.writeUInt32BE(vetor.tamanho, 16);
      let puxados = 0;
      let finalizados = 0;
      const origem = {
        async *[Symbol.asyncIterator]() {
          try {
            puxados++;
            yield header.subarray(0, 3);
            puxados++;
            yield header.subarray(3);
            puxados++;
            yield Buffer.alloc(4);
          } finally {
            finalizados++;
          }
        },
      };
      const observado = await observarBuffers(() => lerFrames(origem).next());
      expect(String(observado.erro)).toMatch(vetor.erro);
      expect(puxados).toBe(2);
      expect(finalizados).toBe(1);
      expect(observado.alocacoes).toEqual([20]);
      expect(observado.origens).toEqual([]);
      expect(observado.concatenacoes).toBe(0);
      expect(observado.copias.length).toBe(2);
    }
  });
  it("suspende leitura e cópia dos próximos frames inclusive no mesmo chunk", async () => {
    const primeiro = frameManual(Buffer.from([0, 255, 10]));
    const segundo = frameManual(Buffer.alloc(17, 128));
    const invalido = frameManual();
    invalido[0] = 0;
    const conjunto = Buffer.concat([primeiro, segundo, invalido]);
    let puxados = 0;
    const origem = {
      async *[Symbol.asyncIterator]() {
        puxados++;
        yield conjunto;
        puxados++;
        yield primeiro;
      },
    };
    const leitor = lerFrames(origem);
    expect(puxados).toBe(0);
    const observado = await observarBuffers(() => leitor.next());
    expect(observado.erro).toBeUndefined();
    expect(observado.valor).toEqual({ done: false, value: decodificarFrame(primeiro) });
    expect(puxados).toBe(1);
    expect(observado.concatenacoes).toBe(0);
    expect(observado.alocacoes.every((tamanho) => tamanho <= primeiro.length)).toBe(true);
    expect(observado.origens.every((origem) => Buffer.isBuffer(origem) && origem.length <= 3)).toBe(
      true,
    );
    expect(
      observado.copias
        .filter(({ origem }) => origem === conjunto)
        .every(({ fim }) => fim !== undefined && fim <= primeiro.length),
    ).toBe(true);
    await expect(leitor.next()).resolves.toEqual({ done: false, value: decodificarFrame(segundo) });
    expect(puxados).toBe(1);
    await expect(leitor.next()).rejects.toThrow(/magic/i);
    expect(puxados).toBe(1);
  });
  it("recusa EOF com header ou payload truncado sem entregar frame parcial", async () => {
    const bytes = frameManual(Buffer.from([0, 255, 10, 128, 13]));
    for (let fim = 1; fim < bytes.length; fim++) {
      const leitor = lerFrames(chunks([bytes.subarray(0, fim), Buffer.alloc(0)]));
      await expect(leitor.next()).rejects.toThrow(
        fim < 20 ? /cabeçalho incompleto/i : /payload incompleto/i,
      );
      await expect(leitor.next()).resolves.toEqual({ done: true, value: undefined });
    }
    const leitor = lerFrames(chunks([Buffer.concat([bytes, bytes.subarray(0, 1)])]));
    await expect(leitor.next()).resolves.toEqual({ done: false, value: decodificarFrame(bytes) });
    await expect(leitor.next()).rejects.toThrow(/cabeçalho incompleto/i);
  });
  it("separa frames coalescidos preservando a ordem", async () => {
    const primeiro = frameManual(Buffer.from([0, 255]));
    const segundo = frameManual(Buffer.from([128, 10, 13]));
    const bytes = Buffer.concat([primeiro, segundo, frameManual()]);
    const esperado = [
      decodificarFrame(primeiro),
      decodificarFrame(segundo),
      decodificarFrame(frameManual()),
    ];
    for (let corte = 0; corte <= bytes.length; corte++) {
      expect(await coletar(chunks([bytes.subarray(0, corte), bytes.subarray(corte)]))).toEqual(
        esperado,
      );
    }
  });
  it("recompõe header e payload fragmentados em qualquer fronteira", async () => {
    const bytes = frameManual(Buffer.from([0, 255, 10, 128, 13]));
    const esperado = decodificarFrame(bytes);
    for (let corte = 1; corte < bytes.length; corte++) {
      expect(
        await coletar(chunks([bytes.subarray(0, corte), Buffer.alloc(0), bytes.subarray(corte)])),
      ).toEqual([esperado]);
    }
    expect(await coletar(chunks(Array.from(bytes, (_, i) => bytes.subarray(i, i + 1))))).toEqual([
      esperado,
    ]);
  });
  it("recusa não Buffer antes de acessar propriedades ou métodos externos", async () => {
    const acesso = vi.fn(() => {
      throw new Error("Propriedade externa acessada.");
    });
    const falso = {
      get length() {
        return acesso();
      },
      copy: acesso,
      readUInt32BE: acesso,
    };
    for (const entrada of [falso, new Uint8Array(0), [], "", null, undefined]) {
      const origem = {
        async *[Symbol.asyncIterator]() {
          yield entrada;
        },
      };
      await expect(Reflect.apply(coletar, undefined, [origem])).rejects.toThrow(TypeError);
    }
    expect(acesso).not.toHaveBeenCalled();
  });
  it("ignora chunks vazios e aceita EOF entre frames", async () => {
    const bytes = frameManual();
    expect(await coletar(chunks([]))).toEqual([]);
    expect(await coletar(chunks([Buffer.alloc(0), bytes, Buffer.alloc(0)]))).toEqual([
      decodificarFrame(bytes),
    ]);
  });
  it("entrega um frame completo com bytes opacos", async () => {
    const bytes = frameManual(Buffer.from([0, 255, 10, 128, 13]));
    expect(await coletar(chunks([bytes]))).toEqual([decodificarFrame(bytes)]);
  });
});
