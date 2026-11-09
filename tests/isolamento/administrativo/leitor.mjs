// Lê frames administrativos binários sem interpretar operações ou sessões.
import { Buffer } from "node:buffer";
import { decodificarCabecalho, decodificarFrame } from "./protocolo.mjs";

/** Entrega sob demanda: não lê nem prepara o frame seguinte durante o yield.
 * Retém um header fixo, um frame e a cópia de payload do resultado corrente.
 * O chunk fornecido e resultados retidos pelo consumidor não entram nesse limite.
 * Fechamento finaliza apenas o iterador local; não cancela operações remotas.
 */
export async function* lerFrames(origem, { limitePayload = 65_536 } = {}) {
  if (!Number.isInteger(limitePayload) || limitePayload <= 0 || limitePayload > 0xffffffff)
    throw new RangeError("Limite de payload deve ser inteiro positivo uint32.");
  const opcoes = { limitePayload };
  const cabecalho = Buffer.alloc(20);
  let usados = 0;
  let frame = null;
  const iterador = origem[Symbol.asyncIterator]();
  let terminou = false;
  let falhou = false;
  try {
    while (true) {
      const passo = await iterador.next();
      if (passo.done) {
        terminou = true;
        break;
      }
      const bytes = passo.value;
      if (!Buffer.isBuffer(bytes)) throw new TypeError("Chunk deve ser Buffer.");
      let posicao = 0;
      while (posicao < bytes.length) {
        if (frame === null) {
          const quantidade = Math.min(20 - usados, bytes.length - posicao);
          bytes.copy(cabecalho, usados, posicao, posicao + quantidade);
          usados += quantidade;
          posicao += quantidade;
          if (usados < 20) continue;
          const { tamanhoPayload } = decodificarCabecalho(cabecalho, opcoes);
          frame = Buffer.alloc(20 + tamanhoPayload);
          cabecalho.copy(frame);
        }
        const quantidade = Math.min(frame.length - usados, bytes.length - posicao);
        bytes.copy(frame, usados, posicao, posicao + quantidade);
        usados += quantidade;
        posicao += quantidade;
        if (usados === frame.length) {
          yield decodificarFrame(frame, opcoes);
          frame = null;
          usados = 0;
        }
      }
    }
    if (usados > 0)
      throw new RangeError(frame === null ? "Cabeçalho incompleto." : "Payload incompleto.");
  } catch (erro) {
    falhou = true;
    throw erro;
  } finally {
    if (!terminou) {
      try {
        await iterador.return?.();
      } catch (erro) {
        if (!falhou) throw erro;
      }
    }
  }
}
