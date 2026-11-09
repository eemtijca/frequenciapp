// Confere o codec puro de frame completo, sem transporte ou autoridade administrativa.
import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import {
  codificarFrame,
  decodificarFrame,
  TIPOS_FRAME,
} from "../../isolamento/administrativo/protocolo.mjs";

// Vetor independente: FADM, v1, STDIN, flags zero, requestId 0x01020304,
// sequência 0x05060708 e tamanho uint32 em ordem de rede no offset 16.
function frameManual(payload = Buffer.alloc(0)): Buffer {
  const cabecalho = Buffer.from([
    0x46, 0x41, 0x44, 0x4d, 1, 4, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0,
  ]);
  cabecalho.writeUInt32BE(payload.length, 16);
  return Buffer.concat([cabecalho, payload]);
}

// Observa as primitivas Buffer usadas pelo codec; não substitui seus resultados.
function observarCopia(acao: () => unknown) {
  const espioes = [
    vi.spyOn(Buffer, "alloc"),
    vi.spyOn(Buffer, "allocUnsafe"),
    vi.spyOn(Buffer, "allocUnsafeSlow"),
    vi.spyOn(Buffer, "from"),
    vi.spyOn(Buffer.prototype, "copy"),
    vi.spyOn(Buffer.prototype, "subarray"),
  ];
  let erro: unknown;
  let chamadas: number[] = [];
  try {
    acao();
  } catch (falha) {
    erro = falha;
  } finally {
    chamadas = espioes.map((espiao) => espiao.mock.calls.length);
    for (const espiao of espioes) espiao.mockRestore();
  }
  return { erro, chamadas };
}

describe("codec administrativo de frame completo", () => {
  it("aceita bytes somente como Buffer antes de acessar métodos do chamador", () => {
    const metodoExterno = vi.fn();
    const falso = { length: 0, copy: metodoExterno, readUInt32BE: metodoExterno };
    for (const entrada of [falso, new Uint8Array(0), [], "bytes", null, undefined]) {
      const frame = { tipo: 4, flags: 0, requestId: 1, sequencia: 0, payload: entrada };
      for (const acao of [
        () => Reflect.apply(codificarFrame, undefined, [frame]),
        () => Reflect.apply(decodificarFrame, undefined, [entrada]),
      ]) {
        const resultado = observarCopia(acao);
        expect(resultado.erro).toBeInstanceOf(TypeError);
        expect(String(resultado.erro)).toMatch(/Buffer/);
        expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
        expect(metodoExterno).not.toHaveBeenCalled();
      }
    }
  });
  it.each(["requestId", "sequencia"])("exige %s uint32 sem coerção ou truncamento", (campo) => {
    const frame = {
      tipo: 4 as const,
      flags: 0 as const,
      requestId: 1,
      sequencia: 0,
      payload: Buffer.alloc(0),
    };
    for (const valor of [1.5, NaN, -1, 0x1_0000_0000, Infinity, "1", undefined]) {
      const invalido = { ...frame, [campo]: valor };
      const resultado = observarCopia(() => Reflect.apply(codificarFrame, undefined, [invalido]));
      expect(resultado.erro).toBeInstanceOf(RangeError);
      expect(String(resultado.erro)).toContain(campo);
      expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
    }
    for (const valor of [0, 0xffffffff]) {
      const valido = { ...frame, [campo]: valor };
      expect(decodificarFrame(codificarFrame(valido))).toEqual(valido);
    }
  });
  it("exige limite configurado inteiro positivo representável em uint32", () => {
    const payload = Buffer.alloc(0);
    const bytes = frameManual(payload);
    const frame = { tipo: 4 as const, flags: 0 as const, requestId: 1, sequencia: 0, payload };
    for (const limitePayload of [NaN, 0, -1, 0.5, Infinity, 0x1_0000_0000, null, "4"]) {
      const opcoes = { limitePayload };
      for (const acao of [
        () => Reflect.apply(codificarFrame, undefined, [frame, opcoes]),
        () => Reflect.apply(decodificarFrame, undefined, [bytes, opcoes]),
      ]) {
        const resultado = observarCopia(acao);
        expect(resultado.erro).toBeInstanceOf(RangeError);
        expect(String(resultado.erro)).toMatch(/limite/i);
        expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
      }
    }
    for (const limitePayload of [1, 0xffffffff]) {
      expect(decodificarFrame(codificarFrame(frame, { limitePayload }), { limitePayload })).toEqual(
        frame,
      );
    }
  });
  it("recusa todos os bits de flags reservadas antes de alocar ou copiar", () => {
    const payload = Buffer.alloc(0);
    for (const flags of [
      1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65535,
    ]) {
      const bytes = frameManual();
      bytes.writeUInt16BE(flags, 6);
      const frame = { tipo: 4, flags, requestId: 1, sequencia: 0, payload };
      for (const acao of [
        () => Reflect.apply(codificarFrame, undefined, [frame]),
        () => decodificarFrame(bytes),
      ]) {
        const resultado = observarCopia(acao);
        expect(String(resultado.erro)).toMatch(/flags/i);
        expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
      }
    }
    for (const flags of [-1, 0.5, NaN, "0", undefined]) {
      const frame = { tipo: 4, flags, requestId: 1, sequencia: 0, payload };
      const resultado = observarCopia(() => Reflect.apply(codificarFrame, undefined, [frame]));
      expect(String(resultado.erro)).toMatch(/flags/i);
      expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
    }
  });
  it("aceita apenas os doze tipos fechados, sem coerção numérica", () => {
    const payload = Buffer.alloc(0);
    for (const tipo of [0, 13, 255, -1, 1.5, NaN, "4", undefined]) {
      const frame = { tipo, flags: 0, requestId: 1, sequencia: 0, payload };
      const resultado = observarCopia(() => Reflect.apply(codificarFrame, undefined, [frame]));
      expect(String(resultado.erro)).toMatch(/tipo/i);
      expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
    }
    for (let tipo = 0; tipo <= 255; tipo++) {
      const bytes = frameManual();
      bytes[5] = tipo;
      if (tipo >= 1 && tipo <= 12) {
        expect(codificarFrame(decodificarFrame(bytes))).toEqual(bytes);
      } else {
        const resultado = observarCopia(() => decodificarFrame(bytes));
        expect(String(resultado.erro)).toMatch(/tipo/i);
        expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
      }
    }
    expect(TIPOS_FRAME).toEqual({
      HELLO: 1,
      REQUEST: 2,
      ACCEPTED: 3,
      STDIN: 4,
      STDIN_END: 5,
      STDOUT: 6,
      STDERR: 7,
      WINDOW: 8,
      CANCEL: 9,
      CANCELLED: 10,
      RESULT: 11,
      SESSION_END: 12,
    });
    expect(Object.isFrozen(TIPOS_FRAME)).toBe(true);
  });
  it("recusa truncamento, tamanho divergente e bytes extras antes de alocar ou copiar", () => {
    const completo = frameManual(Buffer.from([0, 255, 10, 128]));
    const invalidos: Buffer[] = [];
    for (const declarado of [0, 3, 5]) {
      const divergente = Buffer.from(completo);
      divergente.writeUInt32BE(declarado, 16);
      invalidos.push(divergente);
    }
    invalidos.push(...Array.from({ length: 24 }, (_, tamanho) => completo.subarray(0, tamanho)));
    invalidos.push(
      Buffer.concat([completo, Buffer.from([0])]),
      Buffer.concat([completo, completo]),
    );
    for (const bytes of invalidos) {
      const resultado = observarCopia(() => decodificarFrame(bytes));
      expect(resultado.erro).toBeInstanceOf(RangeError);
      expect(String(resultado.erro)).toMatch(/incompleto|tamanho/i);
      expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
    }
    const declaradoExcessivo = frameManual();
    declaradoExcessivo.writeUInt32BE(0xffffffff, 16);
    const excesso = observarCopia(() => decodificarFrame(declaradoExcessivo));
    expect(String(excesso.erro)).toMatch(/limite/i);
    expect(excesso.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it("limita payload antes de alocar ou copiar, com limite inclusivo configurável", () => {
    for (const limitePayload of [4, 65_536]) {
      const payload = Buffer.alloc(limitePayload + 1, 0xff);
      const bytes = frameManual(payload);
      const frame = { tipo: 4 as const, flags: 0 as const, requestId: 1, sequencia: 0, payload };
      const opcoes = limitePayload === 4 ? { limitePayload } : undefined;
      for (const acao of [
        () => codificarFrame(frame, opcoes),
        () => decodificarFrame(bytes, opcoes),
      ]) {
        const resultado = observarCopia(acao);
        expect(resultado.erro).toBeInstanceOf(RangeError);
        expect(String(resultado.erro)).toMatch(/limite/i);
        expect(resultado.chamadas).toEqual([0, 0, 0, 0, 0, 0]);
      }
      const noLimite = { ...frame, payload: payload.subarray(0, limitePayload) };
      expect(decodificarFrame(codificarFrame(noLimite, opcoes), opcoes)).toEqual(noLimite);
    }
  });
  it("preserva payload binário arbitrário e o cabeçalho em ordem de rede", () => {
    for (const payload of [
      Buffer.alloc(0),
      Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
    ]) {
      const frame = {
        tipo: 4 as const,
        flags: 0 as const,
        requestId: 0x01020304,
        sequencia: 0x05060708,
        payload,
      };
      const bytes = codificarFrame(frame);
      expect(bytes).toEqual(frameManual(payload));
      const decodificado = decodificarFrame(bytes);
      expect(decodificado).toEqual(frame);
      // Controles positivos das mesmas primitivas observadas nas recusas.
      const codificacao = observarCopia(() => codificarFrame(frame));
      const decodificacao = observarCopia(() => decodificarFrame(bytes));
      expect(codificacao.erro).toBeUndefined();
      expect(decodificacao.erro).toBeUndefined();
      expect(codificacao.chamadas[0]).toBeGreaterThan(0);
      expect(decodificacao.chamadas[3]).toBeGreaterThan(0);
      if (payload.length > 0) {
        payload.fill(7);
        expect(bytes[20]).toBe(0);
        bytes[20] = 9;
        expect(decodificado.payload[0]).toBe(0);
      }
    }
  });
  it.each([
    { campo: "magic", offset: 0, valor: 0, erro: /magic/i },
    { campo: "versão", offset: 4, valor: 2, erro: /versão/i },
  ])("recusa $campo inválido sem alcançar dispatch local", ({ offset, valor, erro }) => {
    const bytes = frameManual();
    bytes[offset] = valor;
    const anterior = Buffer.from(bytes);
    const dispatch = vi.fn();

    expect(() => dispatch(decodificarFrame(bytes))).toThrow(erro);
    expect(dispatch).not.toHaveBeenCalled();
    expect(bytes).toEqual(anterior);
  });
});
