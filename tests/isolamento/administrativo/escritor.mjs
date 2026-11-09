// Escreve um frame opaco no destino fornecido, sem abrir transporte.
import { finished } from "node:stream";
import { codificarFrame } from "./protocolo.mjs";

const pendentes = new WeakSet();
const protecoesErro = new WeakSet();

/**
 * Entrega UM frame binário opaco ao Writable Node emprestado.
 * Aguarda callback local e, quando write retorna false, também drain.
 * Não confirma recebimento remoto, fsync ou durabilidade; não abre nem fecha I/O.
 * Uma chamada pendente por identidade; concorrência recusa antes do codec, sem fila.
 * Não exclui escritas diretas externas nem confina um Writable/JavaScript hostil.
 * Memória própria: frame corrente (20 + payload), fora buffers do chamador e fila do Writable.
 * Sem sessão, multiplexação, prioridade, windows, timeouts ou cancelamento remoto.
 */
export async function escreverFrame(destino, frame, opcoes) {
  if (pendentes.has(destino)) throw new Error("Destino com escrita pendente.");
  pendentes.add(destino);
  try {
    if (destino.errored) {
      protegerErroPendente(destino);
      throw destino.errored;
    }
    if (destino.destroyed || destino.closed || destino.writableEnded || !destino.writable)
      throw new Error("Destino terminal ou indisponível para escrita.");
    await escrever(destino, codificarFrame(frame, opcoes));
  } finally {
    pendentes.delete(destino);
  }
}

function protegerErroPendente(destino) {
  if (protecoesErro.has(destino)) return;
  protecoesErro.add(destino);
  let remover;
  let encerrado = false;
  const limpar = () => {
    encerrado = true;
    protecoesErro.delete(destino);
    remover?.();
  };
  // closed pode anteceder error; o Node acompanha o término causal do stream.
  remover = finished(destino, { readable: false }, limpar);
  if (encerrado) remover();
}

async function escrever(destino, bytes) {
  await new Promise((resolve, reject) => {
    let retorno;
    let callbackConcluido = false;
    let drenado = false;
    let encerrado = false;
    const limpar = (protegerErro = false) => {
      destino.off("drain", aoDrenar);
      destino.off("close", aoFechar);
      destino.off("finish", aoTerminar);
      // O Node pode emitir error só após o callback ou a destruição assíncrona.
      if (protegerErro) destino.once("close", aoFecharProtecao);
      else {
        destino.off("error", aoErro);
        destino.off("close", aoFecharProtecao);
      }
    };
    const aoFecharProtecao = () => limpar();
    const falhar = (erro, protegerErro = false) => {
      if (encerrado) return;
      encerrado = true;
      limpar(protegerErro);
      reject(erro);
    };
    const concluir = () => {
      if (!encerrado && callbackConcluido && retorno !== undefined && (retorno || drenado)) {
        if (destino.errored) return falhar(destino.errored, true);
        if (destino.destroyed || destino.closed)
          return falhar(new Error("Destino fechou antes da conclusão local."), !destino.closed);
        encerrado = true;
        limpar();
        resolve();
      }
    };
    const aoDrenar = () => {
      drenado = true;
      concluir();
    };
    const aoErro = (erro) => {
      if (encerrado) {
        if (callbackConcluido) limpar();
      } else falhar(erro, !callbackConcluido);
    };
    const aoFechar = () =>
      falhar(destino.errored ?? new Error("Destino fechou antes da conclusão local."));
    const aoTerminar = () =>
      falhar(destino.errored ?? new Error("Destino terminou antes da conclusão local."));
    destino.on("finish", aoTerminar);
    destino.on("close", aoFechar);
    destino.on("drain", aoDrenar);
    destino.on("error", aoErro);
    try {
      retorno = destino.write(bytes, (erro) => {
        callbackConcluido = true;
        if (erro) falhar(erro, true);
        else if (encerrado) limpar();
        else concluir();
      });
      concluir();
    } catch (erro) {
      falhar(erro);
    }
  });
}
