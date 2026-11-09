// Caracteriza codec, escritor e leitor juntos em streams Node exclusivamente em memória.
import { Buffer } from "node:buffer";
import { PassThrough, Transform } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { escreverFrame } from "../../isolamento/administrativo/escritor.mjs";
import { lerFrames } from "../../isolamento/administrativo/leitor.mjs";
import type { FrameAdministrativo } from "../../isolamento/administrativo/protocolo.mjs";

function frame(): FrameAdministrativo {
  return {
    tipo: 4,
    flags: 0,
    requestId: 0x01020304,
    sequencia: 0xf0e0d0c0,
    payload: Buffer.from([0, 10, 255, 128]),
  };
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

describe("canal administrativo binário local em memória", () => {
  it("faz ida e volta de bytes opacos com pressão controlada pelo consumidor", async () => {
    const ida = new PassThrough({ highWaterMark: 1, autoDestroy: false });
    const volta = new PassThrough({ highWaterMark: 1, autoDestroy: false });
    const leitorIda = lerFrames(ida);
    const leitorVolta = lerFrames(volta);
    const write = vi.spyOn(ida, "write");
    const esperado = frame();
    const entrada = frame();
    try {
      const escrita = escreverFrame(ida, entrada);
      const observacao = observar(escrita);
      entrada.payload.fill(17);
      await turnoNode();
      expect(write.mock.calls[0]?.[0]).toEqual(
        Buffer.from("4641444d0104000001020304f0e0d0c000000004000aff80", "hex"),
      );
      expect(ida.writableNeedDrain).toBe(true);
      expect(ida.readableLength).toBe(24);
      expect(observacao.estado()).toBe("pendente");
      const primeiro = await leitorIda.next();
      expect(primeiro.done).toBe(false);
      if (primeiro.done) throw new Error("Frame de ida ausente.");
      expect(primeiro.value).toEqual(esperado);
      await escrita;
      await observacao.resultado;
      expect(observacao.estado()).toBe("sucesso");
      expect(ida.writableNeedDrain).toBe(false);

      const resposta: FrameAdministrativo = { ...primeiro.value, tipo: 6, sequencia: 0xffffffff };
      const respondendo = escreverFrame(volta, resposta);
      const observacaoVolta = observar(respondendo);
      primeiro.value.payload.fill(19);
      await turnoNode();
      expect(volta.writableNeedDrain).toBe(true);
      expect(observacaoVolta.estado()).toBe("pendente");
      const retorno = await leitorVolta.next();
      expect(retorno.done).toBe(false);
      if (retorno.done) throw new Error("Frame de volta ausente.");
      expect(retorno.value).toEqual({ ...esperado, tipo: 6, sequencia: 0xffffffff });
      expect(retorno.value.payload).not.toBe(resposta.payload);
      await respondendo;
      await observacaoVolta.resultado;
      expect(observacaoVolta.estado()).toBe("sucesso");

      // O leitor está suspenso no yield: só o próximo next libera esta escrita.
      const seguinte: FrameAdministrativo = {
        ...esperado,
        requestId: 0xffffffff,
        sequencia: 0,
        payload: Buffer.alloc(0),
      };
      const segundaEscrita = escreverFrame(ida, seguinte);
      const segundaObservacao = observar(segundaEscrita);
      await turnoNode();
      expect(ida.writableNeedDrain).toBe(true);
      expect(ida.readableLength).toBe(20);
      expect(segundaObservacao.estado()).toBe("pendente");
      expect(await leitorIda.next()).toEqual({ value: seguinte, done: false });
      await segundaEscrita;
      await segundaObservacao.resultado;
      expect(segundaObservacao.estado()).toBe("sucesso");
      for (const canal of [ida, volta]) {
        expect(canal.writableEnded).toBe(false);
        expect(canal.destroyed).toBe(false);
        canal.end();
      }
      expect(await leitorIda.next()).toEqual({ value: undefined, done: true });
      expect(await leitorVolta.next()).toEqual({ value: undefined, done: true });
    } finally {
      write.mockRestore();
      ida.destroy();
      volta.destroy();
      await Promise.allSettled([leitorIda.return(), leitorVolta.return()]);
    }
  });

  it.each(["close", "error"])(
    "não confirma escrita ou leitura completa após %s durante a pressão",
    async (evento) => {
      const canal = new PassThrough({ highWaterMark: 1, autoDestroy: false });
      const causa = new Error("Falha sintética no stream em memória.");
      const fechado = new Promise<void>((resolve) => canal.once("close", resolve));
      const escrita = escreverFrame(canal, frame());
      const observacao = observar(escrita);
      try {
        await turnoNode();
        expect(canal.writableNeedDrain).toBe(true);
        expect(observacao.estado()).toBe("pendente");
        canal.destroy(evento === "error" ? causa : undefined);
        const leitura = (async () => {
          const recebidos: FrameAdministrativo[] = [];
          for await (const recebido of lerFrames(canal)) recebidos.push(recebido);
          return recebidos;
        })();
        const verificarLeitura =
          evento === "error"
            ? expect(leitura).rejects.toBe(causa)
            : expect(leitura).rejects.toMatchObject({ code: "ERR_STREAM_PREMATURE_CLOSE" });
        if (evento === "error") await expect(escrita).rejects.toBe(causa);
        else await expect(escrita).rejects.toThrow(/fechou/);
        await verificarLeitura;
        await fechado;
        await observacao.resultado;
        expect(observacao.estado()).toBe("erro");
        await expect(escreverFrame(canal, frame())).rejects.toThrow();
        expect(observacao.estado()).toBe("erro");
      } finally {
        canal.destroy();
        await fechado;
      }
    },
  );

  it.each([
    { corte: 19, mensagem: "Cabeçalho incompleto." },
    { corte: 23, mensagem: "Payload incompleto." },
  ])(
    "não confunde callback local com frame completo no EOF: $mensagem",
    async ({ corte, mensagem }) => {
      const canal = new Transform({
        autoDestroy: false,
        transform(bytes: Buffer, _encoding, callback) {
          callback(null, bytes.subarray(0, corte));
        },
      });
      const leitor = lerFrames(canal);
      try {
        await escreverFrame(canal, frame());
        expect(canal.readableLength).toBe(corte);
        expect(canal.writableEnded).toBe(false);
        canal.end();
        await expect(leitor.next()).rejects.toThrow(mensagem);
      } finally {
        canal.destroy();
        await leitor.return();
      }
    },
  );
});
