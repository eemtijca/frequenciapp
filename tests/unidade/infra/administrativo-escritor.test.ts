// Verifica escrita binária e conclusão local em Writable real somente em memória.
import { Buffer } from "node:buffer";
import { errorMonitor } from "node:events";
import { Writable, type WritableOptions } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { escreverFrame } from "../../isolamento/administrativo/escritor.mjs";
import type { FrameAdministrativo } from "../../isolamento/administrativo/protocolo.mjs";

function frame(payload = Buffer.from([0, 10, 255, 128])): FrameAdministrativo {
  return { tipo: 4, flags: 0, requestId: 0x01020304, sequencia: 0xf0e0d0c0, payload };
}

function controlarDestino(highWaterMark = 1024, autoDestroy = true) {
  const recebidos: Buffer[] = [];
  const callbacks: ((erro?: Error | null) => void)[] = [];
  const destino = new Writable({
    highWaterMark,
    autoDestroy,
    write(bytes: Buffer, _encoding, callback) {
      recebidos.push(bytes);
      callbacks.push(callback);
    },
  });
  function liberar(erro?: Error) {
    const callback = callbacks.shift();
    if (!callback) throw new Error("Callback da escrita ausente.");
    callback(erro);
  }
  return { destino, recebidos, liberar };
}

function observar(promessa: Promise<void>) {
  let estado = "pendente";
  const resultado = promessa.then(
    () => {
      estado = "sucesso";
    },
    () => {
      estado = "erro";
    },
  );
  return { estado: () => estado, resultado };
}

async function turnoNode() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("escritor administrativo local", () => {
  it.each(["padrão", "síncrono"])(
    "preserva proteção na emissão causal após fechamento %s",
    async (modo) => {
      await turnoNode();
      const causa = new Error("Erro externo anterior ao fechamento síncrono.");
      const opcoes: WritableOptions = {
        write(_bytes, _encoding, callback) {
          callback(causa);
        },
      };
      if (modo === "síncrono") opcoes.destroy = (erro, callback) => callback(erro);
      const destino = new Writable(opcoes);
      const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
      let protecaoNaEmissao: number | undefined;
      let erroCausal: Error | undefined;
      let fechadoNaEmissao = false;
      let salvaguardaUsada = false;
      const monitor = (erro: Error) => {
        erroCausal = erro;
        fechadoNaEmissao = destino.closed;
        protecaoNaEmissao = destino.listenerCount("error");
        // A salvaguarda só entra depois da observação causal, inclusive no RED.
        if (protecaoNaEmissao === 0) {
          salvaguardaUsada = true;
          destino.once("error", () => undefined);
        }
      };
      destino.on(errorMonitor, monitor);
      const callbacksExternos: (Error | null | undefined)[] = [];
      destino.write(Buffer.from([1]), (erro) => callbacksExternos.push(erro));
      expect(destino.errored).toBe(causa);
      expect(destino.destroyed).toBe(false);
      expect(destino.closed).toBe(false);
      const write = vi.spyOn(destino, "write");
      let consultasFrame = 0;
      try {
        await expect(
          escreverFrame(destino, {
            tipo: 4,
            flags: 0,
            requestId: 1,
            sequencia: 0,
            get payload() {
              consultasFrame += 1;
              return Buffer.from([0, 10, 255]);
            },
          }),
        ).rejects.toBe(causa);
        await fechado;
        await turnoNode();
        expect(callbacksExternos).toEqual([causa]);
        expect(erroCausal).toBe(causa);
        expect(fechadoNaEmissao).toBe(true);
        expect(write).not.toHaveBeenCalled();
        expect(consultasFrame).toBe(0);
        expect(protecaoNaEmissao).toBeGreaterThan(0);
        expect(salvaguardaUsada).toBe(false);
        for (const evento of ["drain", "error", "close", "finish", "end"]) {
          expect(destino.listenerCount(evento)).toBe(0);
        }
      } finally {
        destino.off(errorMonitor, monitor);
        write.mockRestore();
      }
    },
  );
  it("reavalia proteção quando erro externo síncrono inicia autoDestroy no nextTick", async () => {
    const causa = new Error("Falha externa anterior ao autoDestroy.");
    let callbackDestruicao: ((erro?: Error | null) => void) | undefined;
    const callbacksExternos: (Error | null | undefined)[] = [];
    const destino = new Writable({
      write(_bytes, _encoding, callback) {
        callback(causa);
      },
      destroy(erro, callback) {
        expect(erro).toBe(causa);
        callbackDestruicao = callback;
      },
    });
    destino.write(Buffer.from([1]), (erro) => callbacksExternos.push(erro));
    expect(destino.errored).toBe(causa);
    expect(destino.destroyed).toBe(false);
    expect(callbackDestruicao).toBeUndefined();
    const write = vi.spyOn(destino, "write");
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    const erros: Error[] = [];
    const emergencia = (erro: Error) => erros.push(erro);
    try {
      await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
      await turnoNode();
      expect(callbacksExternos).toEqual([causa]);
      expect(callbackDestruicao).toBeTypeOf("function");
      expect(destino.destroyed).toBe(true);
      expect(destino.closed).toBe(false);
      expect(destino.errored).toBe(causa);
      expect(write).not.toHaveBeenCalled();
      expect(destino.listenerCount("error")).toBe(1);
      await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
      expect(destino.listenerCount("error")).toBe(1);
    } finally {
      destino.on("error", emergencia);
      if (!callbackDestruicao) throw new Error("Destruição não iniciou.");
      callbackDestruicao(causa);
      await fechado;
      destino.off("error", emergencia);
      write.mockRestore();
    }
    expect(erros).toEqual([causa]);
    for (const evento of ["drain", "error", "close", "finish"]) {
      expect(destino.listenerCount(evento)).toBe(0);
    }
  });
  it("protege erro de destruição assíncrona iniciada sem causa no drain", async () => {
    const causa = new Error("Falha tardia da destruição sem causa inicial.");
    let callbackEscrita: (() => void) | undefined;
    let callbackDestruicao: ((erro?: Error | null) => void) | undefined;
    const destino = new Writable({
      highWaterMark: 1,
      write(_bytes, _encoding, callback) {
        callbackEscrita = callback;
      },
      destroy(erro, callback) {
        expect(erro).toBeNull();
        callbackDestruicao = callback;
      },
    });
    const ordem: string[] = [];
    const chamador = () => {
      ordem.push("drain");
      destino.destroy();
    };
    destino.on("drain", chamador);
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    const erros: Error[] = [];
    const emergencia = (erro: Error) => erros.push(erro);
    try {
      expect(destino.writableNeedDrain).toBe(true);
      if (!callbackEscrita) throw new Error("Escrita não iniciou.");
      callbackEscrita();
      expect(ordem).toEqual(["drain"]);
      expect(callbackDestruicao).toBeTypeOf("function");
      expect(destino.destroyed).toBe(true);
      expect(destino.closed).toBe(false);
      expect(destino.errored).toBeNull();
      await expect(escrita).rejects.toThrow(/fechou/);
      expect(observacao.estado()).toBe("erro");
      await expect(escreverFrame(destino, frame())).rejects.toThrow(/terminal/);
      expect(destino.listenerCount("error")).toBe(1);
    } finally {
      // A salvaguarda entra só após a asserção, inclusive no RED.
      destino.on("error", emergencia);
      if (!callbackDestruicao) throw new Error("Destruição não iniciou.");
      callbackDestruicao(causa);
      await fechado;
      destino.off("error", emergencia);
    }
    expect(erros).toEqual([causa]);
    expect(observacao.estado()).toBe("erro");
    expect(destino.listeners("drain")).toEqual([chamador]);
    for (const evento of ["error", "close", "finish"]) {
      expect(destino.listenerCount(evento)).toBe(0);
    }
  });
  it.each(["error", "close"])(
    "rejeita %s real após callback enquanto drain falta",
    async (evento) => {
      const { destino, liberar } = controlarDestino(1);
      const causa = new Error("Falha sintética após callback.");
      const escrita = escreverFrame(destino, frame());
      const observacao = observar(escrita);
      destino.write(Buffer.from([1]));
      liberar();
      destino.destroy(evento === "error" ? causa : undefined);
      await turnoNode();
      expect(observacao.estado()).toBe("erro");
      if (evento === "error") await expect(escrita).rejects.toBe(causa);
      else await expect(escrita).rejects.toThrow(/fechou/);
      liberar();
      for (const nome of ["drain", "error", "close", "finish"]) {
        expect(destino.listenerCount(nome)).toBe(0);
      }
    },
  );
  it.each(["encerrando", "terminado"])("recusa destino %s antes de write", async (estado) => {
    let finalizar: (() => void) | undefined;
    const destino = new Writable({
      autoDestroy: false,
      write(_bytes, _encoding, callback) {
        callback();
      },
      final(callback) {
        finalizar = callback;
      },
    });
    const terminado = new Promise<void>((resolve) => destino.once("finish", resolve));
    destino.end();
    await turnoNode();
    if (!finalizar) throw new Error("Finalização não iniciou.");
    if (estado === "terminado") {
      finalizar();
      await terminado;
    }
    const write = vi.spyOn(destino, "write");
    try {
      await expect(escreverFrame(destino, frame())).rejects.toThrow(/terminal/);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
      if (estado === "encerrando") {
        finalizar();
        await terminado;
      }
    }
  });
  it("mantém reserva após callback enquanto drain falta sem alocar o segundo frame", async () => {
    const { destino, liberar } = controlarDestino(1);
    const primeira = escreverFrame(destino, frame());
    destino.write(Buffer.from([1]));
    liberar();
    const proxima = frame();
    const alocar = vi.spyOn(Buffer, "alloc");
    try {
      await expect(escreverFrame(destino, proxima)).rejects.toThrow(/pendente/);
      expect(alocar).not.toHaveBeenCalled();
    } finally {
      alocar.mockRestore();
      liberar();
      await primeira;
    }
  });
  it("preserva todos os listeners do chamador em sucessos repetidos sem end ou destroy", async () => {
    const destino = new Writable({
      write(_bytes, _encoding, callback) {
        callback();
      },
    });
    const eventos = ["drain", "error", "close", "finish"];
    const chamador = () => undefined;
    for (const evento of eventos) destino.on(evento, chamador);
    const end = vi.spyOn(destino, "end");
    const destroy = vi.spyOn(destino, "destroy");
    try {
      for (let indice = 0; indice < 20; indice += 1) await escreverFrame(destino, frame());
      for (const evento of eventos) expect(destino.listeners(evento)).toEqual([chamador]);
      expect(end).not.toHaveBeenCalled();
      expect(destroy).not.toHaveBeenCalled();
    } finally {
      end.mockRestore();
      destroy.mockRestore();
    }
  });
  it.each([
    { autoDestroy: true, emitClose: true },
    { autoDestroy: false, emitClose: true },
    { autoDestroy: true, emitClose: false },
  ])("absorve apenas o error causal sem listener do chamador: %j", async (opcoes) => {
    const causa = new Error("Falha síncrona no callback real.");
    const destino = new Writable({
      ...opcoes,
      write(_bytes, _encoding, callback) {
        callback(causa);
      },
    });
    await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
    await turnoNode();
    for (const evento of ["drain", "error", "close", "finish"]) {
      expect(destino.listenerCount(evento)).toBe(0);
    }
  });
  it("preserva limites do codec com alocação somente do frame corrente", async () => {
    const limite = Buffer.alloc(65_536);
    const excesso = Buffer.alloc(65_537);
    const pequeno = Buffer.from([0, 10, 255, 128]);
    const vazio = Buffer.alloc(0);
    const tamanhos: number[] = [];
    const destino = new Writable({
      write(bytes: Buffer, _encoding, callback) {
        tamanhos.push(bytes.length);
        callback();
      },
    });
    const alocar = vi.spyOn(Buffer, "alloc");
    const write = vi.spyOn(destino, "write");
    try {
      await escreverFrame(destino, frame(limite));
      await expect(escreverFrame(destino, frame(excesso))).rejects.toThrow(/limite/);
      await escreverFrame(destino, frame(pequeno), { limitePayload: 4 });
      await expect(escreverFrame(destino, frame(pequeno), { limitePayload: 3 })).rejects.toThrow(
        /limite/,
      );
      await escreverFrame(destino, frame(vazio), { limitePayload: 0xffffffff });
      for (const limitePayload of [0, -1, 1.5, 0x100000000]) {
        await expect(escreverFrame(destino, frame(vazio), { limitePayload })).rejects.toThrow(
          /uint32/,
        );
      }
      expect(write).toHaveBeenCalledTimes(3);
      expect(alocar.mock.calls.map(([tamanho]) => tamanho)).toEqual([20 + limite.length, 24, 20]);
      expect(tamanhos).toEqual([20 + limite.length, 24, 20]);
    } finally {
      write.mockRestore();
      alocar.mockRestore();
    }
  });
  it("retém callback após drain emitido pelo Writable real", async () => {
    const { destino, liberar } = controlarDestino(1);
    const ordem: string[] = [];
    let estadoNoDrain = "não observado";
    const chamador = () => {
      ordem.push("drain");
      estadoNoDrain = observacao.estado();
    };
    destino.on("drain", chamador);
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    expect(destino.writableNeedDrain).toBe(true);
    liberar();
    expect(estadoNoDrain).toBe("pendente");
    await escrita;
    ordem.push("concluiu");
    expect(ordem).toEqual(["drain", "concluiu"]);
    expect(destino.listeners("drain")).toEqual([chamador]);
  });
  it("não acumula proteções ao repetir recusas durante a mesma destruição", async () => {
    const causa = new Error("Destruição sintética repetida.");
    let concluirDestruicao: ((erro?: Error | null) => void) | undefined;
    const destino = new Writable({
      write(_bytes, _encoding, callback) {
        callback();
      },
      destroy(_erro, callback) {
        concluirDestruicao = callback;
      },
    });
    destino.destroy(causa);
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    try {
      await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
      await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
      expect(destino.listenerCount("error")).toBe(1);
    } finally {
      if (!concluirDestruicao) throw new Error("Destruição não iniciou.");
      concluirDestruicao(causa);
      await fechado;
    }
    expect(destino.listenerCount("error")).toBe(0);
  });
  it("protege error ainda pendente de destino já destruído antes da chamada", async () => {
    const causa = new Error("Destruição anterior ainda pendente.");
    let concluirDestruicao: ((erro?: Error | null) => void) | undefined;
    const destino = new Writable({
      write(_bytes, _encoding, callback) {
        callback();
      },
      destroy(_erro, callback) {
        concluirDestruicao = callback;
      },
    });
    destino.destroy(causa);
    await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    const emergencia = () => undefined;
    try {
      expect(destino.listenerCount("error")).toBeGreaterThan(0);
    } finally {
      destino.on("error", emergencia);
      if (!concluirDestruicao) throw new Error("Destruição não iniciou.");
      concluirDestruicao(causa);
      await fechado;
      destino.off("error", emergencia);
    }
    expect(destino.listenerCount("error")).toBe(0);
    expect(destino.listenerCount("close")).toBe(0);
  });
  it("protege erro tardio do callback após error sem substituir a primeira causa", async () => {
    const { destino, liberar } = controlarDestino(1024, false);
    const primeiraCausa = new Error("Primeiro error sintético.");
    const causaCallback = new Error("Erro posterior sintético.");
    const erros: Error[] = [];
    const chamador = (erro: Error) => erros.push(erro);
    destino.on("error", chamador);
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    destino.emit("error", primeiraCausa);
    await expect(escrita).rejects.toBe(primeiraCausa);
    try {
      expect(destino.listenerCount("error")).toBeGreaterThan(1);
    } finally {
      liberar(causaCallback);
    }
    await turnoNode();
    expect(observacao.estado()).toBe("erro");
    expect(erros).toEqual([primeiraCausa, causaCallback]);
    expect(destino.listeners("error")).toEqual([chamador]);
  });
  it("não confirma sucesso se o chamador destrói no drain anterior ao callback", async () => {
    const { destino, liberar } = controlarDestino(1);
    const causa = new Error("Destruição sintética no drain.");
    const erros: Error[] = [];
    destino.on("error", (erro: Error) => erros.push(erro));
    destino.on("drain", () => destino.destroy(causa));
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    liberar();
    await turnoNode();
    expect(observacao.estado()).toBe("erro");
    await expect(escrita).rejects.toBe(causa);
    expect(erros).toEqual([causa]);
  });
  it("preserva erro prévio registrado pelo Writable sem nova escrita", async () => {
    const causa = new Error("Falha anterior sintética.");
    const destino = new Writable({
      autoDestroy: false,
      write(_bytes, _encoding, callback) {
        callback(causa);
      },
    });
    const falhou = new Promise<Error>((resolve) => destino.once("error", resolve));
    destino.write(Buffer.from([1]), () => undefined);
    expect(await falhou).toBe(causa);
    expect(destino.errored).toBe(causa);
    const write = vi.spyOn(destino, "write");
    try {
      await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });
  it("rejeita finish real que substitui drain durante a pressão", async () => {
    const { destino, liberar } = controlarDestino(1, false);
    const drenos: string[] = [];
    const chamador = () => {
      drenos.push("drain");
    };
    destino.on("drain", chamador);
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    destino.write(Buffer.from([1]));
    const terminado = new Promise<void>((resolve) => destino.once("finish", resolve));
    destino.end();
    liberar();
    liberar();
    await terminado;
    await turnoNode();
    expect(drenos).toEqual([]);
    expect(observacao.estado()).toBe("erro");
    await expect(escrita).rejects.toThrow(/terminou/);
    expect(destino.destroyed).toBe(false);
    expect(destino.listeners("drain")).toEqual([chamador]);
    expect(destino.listenerCount("finish")).toBe(0);
    expect(destino.listenerCount("error")).toBe(0);
  });
  it("rejeita close real antes do callback sem sucesso tardio", async () => {
    const { destino, liberar } = controlarDestino(1);
    const fechamentos: string[] = [];
    const chamador = () => {
      fechamentos.push("close");
    };
    destino.on("close", chamador);
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    destino.destroy();
    await fechado;
    await turnoNode();
    expect(observacao.estado()).toBe("erro");
    await expect(escrita).rejects.toThrow(/fechou/);
    liberar();
    await observacao.resultado;
    expect(observacao.estado()).toBe("erro");
    expect(fechamentos).toEqual(["close"]);
    expect(destino.listeners("close")).toEqual([chamador]);
    expect(destino.listenerCount("error")).toBe(0);
    expect(destino.listenerCount("drain")).toBe(0);
  });
  it("preserva throw síncrono de write sem fechar destino nem deixar listeners", async () => {
    const causa = new Error("Throw sintético em write.");
    const destino = new Writable({
      write() {
        throw causa;
      },
    });
    await expect(escreverFrame(destino, frame())).rejects.toBe(causa);
    for (const evento of ["drain", "error", "close", "finish"]) {
      expect(destino.listenerCount(evento)).toBe(0);
    }
    expect(destino.destroyed).toBe(false);
    expect(destino.writableEnded).toBe(false);
    await expect(escreverFrame(destino, { ...frame(), requestId: -1 })).rejects.toThrow(/uint32/);
  });
  it("mantém proteção de error até a destruição assíncrona após erro no callback", async () => {
    const causa = new Error("Falha sintética do callback.");
    let callbackEscrita: ((erro?: Error | null) => void) | undefined;
    let callbackDestruicao: ((erro?: Error | null) => void) | undefined;
    const destino = new Writable({
      write(_bytes, _encoding, callback) {
        callbackEscrita = callback;
      },
      destroy(_erro, callback) {
        callbackDestruicao = callback;
      },
    });
    const erros: Error[] = [];
    const chamador = (erro: Error) => erros.push(erro);
    destino.on("error", chamador);
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    const escrita = escreverFrame(destino, frame());
    if (!callbackEscrita) throw new Error("Escrita não iniciou.");
    callbackEscrita(causa);
    try {
      await expect(escrita).rejects.toBe(causa);
      expect(destino.listenerCount("error")).toBeGreaterThan(1);
    } finally {
      if (!callbackDestruicao) throw new Error("Destruição não iniciou.");
      callbackDestruicao(causa);
      await fechado;
    }
    expect(erros).toEqual([causa]);
    expect(destino.listeners("error")).toEqual([chamador]);
    expect(destino.listenerCount("drain")).toBe(0);
  });
  it("rejeita error do destino e preserva a causa e os listeners do chamador", async () => {
    const { destino, liberar } = controlarDestino();
    const causa = new Error("Falha sintética do destino.");
    const erros: Error[] = [];
    const chamador = (erro: Error) => erros.push(erro);
    destino.on("error", chamador);
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    destino.emit("error", causa);
    await turnoNode();
    expect(observacao.estado()).toBe("erro");
    await expect(escrita).rejects.toBe(causa);
    await expect(escreverFrame(destino, { ...frame(), requestId: -1 })).rejects.toThrow(/uint32/);
    liberar();
    expect(erros).toEqual([causa]);
    expect(destino.listeners("error")).toEqual([chamador]);
    expect(destino.listenerCount("drain")).toBe(0);
    expect(destino.destroyed).toBe(false);
  });
  it("recusa destino já destruído antes de codificar ou chamar write", async () => {
    const { destino } = controlarDestino();
    const fechado = new Promise<void>((resolve) => destino.once("close", resolve));
    destino.destroy();
    await fechado;
    const write = vi.spyOn(destino, "write");
    let consultas = 0;
    try {
      await expect(
        escreverFrame(destino, {
          ...frame(),
          get payload() {
            consultas += 1;
            return Buffer.alloc(0);
          },
        }),
      ).rejects.toThrow();
      expect(consultas).toBe(0);
      expect(write).not.toHaveBeenCalled();
    } finally {
      write.mockRestore();
    }
  });
  it("recusa frame inválido sem write nem listeners residuais e libera a reserva", async () => {
    const { destino, liberar, recebidos } = controlarDestino();
    const antes = destino.listeners("drain");
    await expect(escreverFrame(destino, { ...frame(), requestId: -1 })).rejects.toThrow(/uint32/);
    expect(recebidos).toEqual([]);
    expect(destino.listeners("drain")).toEqual(antes);
    const valida = escreverFrame(destino, frame());
    liberar();
    await valida;
  });
  it("recusa concorrência por identidade antes de consultar o segundo frame", async () => {
    const { destino, liberar, recebidos } = controlarDestino();
    const primeira = escreverFrame(destino, frame());
    let consultas = 0;
    const segunda = escreverFrame(destino, {
      ...frame(),
      get payload() {
        consultas += 1;
        return Buffer.from([1]);
      },
    });
    const observacao = observar(segunda);
    await Promise.resolve();
    await Promise.resolve();
    expect(observacao.estado()).toBe("erro");
    expect(consultas).toBe(0);
    expect(recebidos).toHaveLength(1);
    await expect(segunda).rejects.toThrow(/pendente/);
    const outro = controlarDestino();
    const independente = escreverFrame(outro.destino, frame());
    outro.liberar();
    await independente;
    liberar();
    await primeira;
    const seguinte = escreverFrame(destino, frame());
    liberar();
    await seguinte;
    expect(recebidos).toHaveLength(2);
  });
  it("espera drain depois do callback sem excluir escrita externa", async () => {
    const { destino, liberar, recebidos } = controlarDestino(1);
    const ordem: string[] = [];
    destino.on("drain", () => ordem.push("drain"));
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    expect(destino.writableNeedDrain).toBe(true);
    destino.write(Buffer.from([99]), () => ordem.push("externa"));
    liberar();
    await Promise.resolve();
    await Promise.resolve();
    expect(recebidos).toHaveLength(2);
    expect(ordem).toEqual([]);
    expect(observacao.estado()).toBe("pendente");
    liberar();
    await escrita;
    await observacao.resultado;
    expect(ordem).toEqual(["drain", "externa"]);
  });
  it("espera o callback local mesmo sem pressão", async () => {
    const { destino, liberar } = controlarDestino();
    const escrita = escreverFrame(destino, frame());
    const observacao = observar(escrita);
    expect(destino.writableNeedDrain).toBe(false);
    await Promise.resolve();
    expect(observacao.estado()).toBe("pendente");
    liberar();
    await escrita;
    await observacao.resultado;
    expect(observacao.estado()).toBe("sucesso");
  });
  it("escreve um vetor wire independente com cópia dos bytes opacos", async () => {
    const recebidos: Buffer[] = [];
    const destino = new Writable({
      write(bytes: Buffer, _encoding, callback) {
        recebidos.push(bytes);
        callback();
      },
    });
    const entrada = frame();
    const escrita = escreverFrame(destino, entrada);
    entrada.payload.fill(17);
    await escrita;
    expect(recebidos).toEqual([
      Buffer.from("4641444d0104000001020304f0e0d0c000000004000aff80", "hex"),
    ]);
    expect(destino.writableEnded).toBe(false);
    expect(destino.destroyed).toBe(false);
  });
});
