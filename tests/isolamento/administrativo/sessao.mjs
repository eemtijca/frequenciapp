// Conduz controles fechados e exec binário local com créditos separados por stream.
import { TextDecoder } from "node:util";
import { lerFrames } from "./leitor.mjs";
import { escreverFrame } from "./escritor.mjs";
import { TIPOS_FRAME as T } from "./protocolo.mjs";

const JANELA = 65536;
const BLOCO = 16384;
const TRANSFERENCIA = 8 * 1024 * 1024;
function controle(payload, campos) {
  const valor = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
  if (
    !valor ||
    Array.isArray(valor) ||
    typeof valor !== "object" ||
    Object.keys(valor).sort().join(",") !== [...campos].sort().join(",")
  )
    throw new Error("Controle administrativo inválido.");
  return valor;
}
export async function executarSessao({
  origem,
  destino,
  gate,
  coletar,
  signal,
  timeoutMs = 60000,
}) {
  const entradaSeq = new Map();
  const saidaSeq = new Map();
  const usados = new Set();
  const ativos = new Map();
  const saidasPendentes = [];
  let hello = false;
  let fim = false;
  let codigo = 0;
  let erro = null;
  let escrita = Promise.resolve();
  function falhar(causa) {
    codigo = 1;
    erro ??= causa;
    for (const op of ativos.values()) abortar(op);
    origem.destroy(causa instanceof Error ? causa : new Error("Falha administrativa."));
    destino.destroy();
  }
  const interromper = () => falhar(new Error("Sessão interrompida pelo host."));
  signal?.addEventListener("abort", interromper, { once: true });
  const prazo = setTimeout(
    () => falhar(new Error("Prazo administrativo excedido.")),
    Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 60000 ? timeoutMs : 1,
  );
  prazo.unref();
  if (signal?.aborted) interromper();
  function enviar(tipo, requestId, valor) {
    const sequencia = saidaSeq.get(requestId) ?? 0;
    saidaSeq.set(requestId, sequencia + 1);
    const frame = {
      tipo,
      requestId,
      sequencia,
      flags: 0,
      payload: Buffer.isBuffer(valor) ? valor : Buffer.from(JSON.stringify(valor)),
    };
    const atual = escrita.then(() => escreverFrame(destino, frame));
    escrita = atual.catch(falhar);
    return atual;
  }
  async function* stdin(op) {
    for (;;) {
      while (!op.fila.length && !op.eof && !op.abort.signal.aborted)
        await new Promise((resolve) => {
          op.acordarEntrada = resolve;
        });
      if (op.abort.signal.aborted) return;
      const bytes = op.fila.shift();
      if (!bytes) return;
      yield bytes;
      op.creditoEntrada += bytes.length;
      await enviar(T.WINDOW, op.id, { stream: "stdin", bytes: bytes.length });
    }
  }
  async function aguardarSaida(op, nome, etapa, acao) {
    let timer;
    let limitar;
    const limite = new Promise((_, rejeitar) => {
      limitar = () => {
        timer = setTimeout(() => {
          saidasPendentes.push({ requestId: op.id, stream: nome, etapa });
          rejeitar(new Error(`Saída do supervisor pendente: ${nome}/${etapa}.`));
        }, 100);
        timer.unref();
      };
      op.abort.signal.addEventListener("abort", limitar, { once: true });
      if (op.abort.signal.aborted) limitar();
    });
    try {
      // A corrida observa também rejeições tardias; abort não cancela o produtor.
      return await Promise.race([Promise.resolve().then(acao), limite]);
    } finally {
      clearTimeout(timer);
      op.abort.signal.removeEventListener("abort", limitar);
    }
  }
  async function saida(op, nome, origemBytes, tipo, falha) {
    const iterador = origemBytes[Symbol.asyncIterator]();
    try {
      for (;;) {
        while (op.creditos[nome] === 0 && !op.abort.signal.aborted)
          await new Promise((resolve) => {
            op.acordar[nome] = resolve;
          });
        if (op.abort.signal.aborted) return;
        const proximo = await aguardarSaida(op, nome, "next", () => iterador.next());
        if (proximo.done) return;
        const bytes = proximo.value;
        if (!Buffer.isBuffer(bytes) || bytes.length > JANELA)
          throw new Error("Chunk do supervisor inválido.");
        for (let offset = 0; offset < bytes.length;) {
          while (op.creditos[nome] === 0 && !op.abort.signal.aborted)
            await new Promise((resolve) => {
              op.acordar[nome] = resolve;
            });
          if (op.abort.signal.aborted) return;
          const tamanho = Math.min(BLOCO, bytes.length - offset, op.creditos[nome]);
          op.total += tamanho;
          if (op.total > TRANSFERENCIA) throw new Error("Transferência excedida.");
          op.creditos[nome] -= tamanho;
          await enviar(tipo, op.id, bytes.subarray(offset, offset + tamanho));
          offset += tamanho;
        }
      }
    } catch (causa) {
      // Aciona abort antes de finalizar o iterador: return também pode ficar pendente.
      falha(causa);
      throw causa;
    } finally {
      await aguardarSaida(op, nome, "return", () => iterador.return?.());
    }
  }
  async function executar(op, pedido) {
    op.exec = await gate.executar(pedido.servico, pedido.variante, stdin(op), op.abort.signal);
    op.aceito = true;
    await enviar(T.ACCEPTED, op.id, { stdin: JANELA });
    let falhou = false;
    let primeiraFalha;
    const falha = (causa) => {
      if (!falhou) {
        falhou = true;
        primeiraFalha = causa;
      }
      falhar(causa);
    };
    // Só agrega esperas limitadas: resultado pelo gate, next/return após abort.
    // A primeira falha interrompe o canal e aciona cleanup/cancelamento, não a barreira.
    const [conclusao] = await Promise.allSettled(
      [
        op.exec.resultado,
        saida(op, "stdout", op.exec.stdout, T.STDOUT, falha),
        saida(op, "stderr", op.exec.stderr, T.STDERR, falha),
      ].map((promessa) =>
        promessa.catch((causa) => {
          falha(causa);
          throw causa;
        }),
      ),
    );
    if (falhou) throw primeiraFalha;
    const resultado = conclusao.value;
    if (!op.abort.signal.aborted)
      await enviar(T.RESULT, op.id, {
        codigo: resultado.codigo,
        sinal: resultado.sinal,
        confirmado: true,
      });
    if (resultado.codigo !== 0) codigo = 1;
  }
  function abortar(op) {
    op.abort.abort();
    op.acordarEntrada?.();
    op.acordar.stdout?.();
    op.acordar.stderr?.();
  }
  try {
    for await (const frame of lerFrames(origem)) {
      const { tipo, requestId, sequencia, payload } = frame;
      if (sequencia !== (entradaSeq.get(requestId) ?? 0))
        throw new Error("Sequência administrativa inválida.");
      entradaSeq.set(requestId, sequencia + 1);
      if (!hello) {
        if (tipo !== T.HELLO || requestId !== 0 || controle(payload, ["versao"]).versao !== 1)
          throw new Error("HELLO obrigatório.");
        hello = true;
        await enviar(T.HELLO, 0, { versao: 1 });
        continue;
      }
      if (tipo === T.SESSION_END && requestId === 0) {
        controle(payload, []);
        if (ativos.size) throw new Error("Sessão ainda tem operações ativas.");
        fim = true;
        break;
      }
      if (tipo === T.REQUEST) {
        if (!requestId || usados.has(requestId) || usados.size >= 4096 || ativos.size >= 4)
          throw new Error("Pedido administrativo fora da fase.");
        usados.add(requestId);
        const base = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(payload));
        const campos = {
          executar: ["operacao", "servico", "variante"],
          consultarServico: ["operacao", "servico"],
          consultarConfiguracao: ["operacao"],
          coletar: ["operacao"],
        };
        if (typeof base?.operacao !== "string" || !Object.hasOwn(campos, base.operacao))
          throw new Error("Operação administrativa não autorizada.");
        const pedido = controle(payload, campos[base.operacao]);
        if (
          ["consultarServico", "executar"].includes(pedido.operacao) &&
          typeof pedido.servico !== "string"
        )
          throw new Error("Serviço inválido.");
        if (pedido.operacao === "executar") {
          if (!["consultarIdentidade", "dump", "restaurar"].includes(pedido.variante))
            throw new Error("Variante não autorizada.");
          const op = {
            id: requestId,
            abort: new AbortController(),
            fila: [],
            eof: false,
            creditoEntrada: JANELA,
            creditos: { stdout: 0, stderr: 0 },
            acordar: {},
            total: 0,
            aceito: false,
          };
          ativos.set(requestId, op);
          op.done = executar(op, pedido).then(() => {
            ativos.delete(requestId);
          });
          op.done.catch(falhar);
        } else {
          let dados;
          if (pedido.operacao === "consultarServico") dados = await gate.consultar(pedido.servico);
          else if (pedido.operacao === "consultarConfiguracao")
            dados = { servicos: gate.inventario() };
          else if (pedido.operacao === "coletar") {
            await coletar();
            dados = { coletado: true };
          } else throw new Error("Operação administrativa não autorizada.");
          await enviar(T.ACCEPTED, requestId, {});
          await enviar(T.RESULT, requestId, { codigo: 0, sinal: null, confirmado: true, dados });
        }
        continue;
      }
      const op = ativos.get(requestId);
      if (!op?.aceito || op.abort.signal.aborted) throw new Error("Operação fora da fase.");
      if (tipo === T.CANCEL) {
        controle(payload, []);
        abortar(op);
        const recibo = await op.exec.cancelar();
        await op.done;
        await enviar(T.CANCELLED, requestId, { confirmado: true });
        await enviar(T.RESULT, requestId, {
          codigo: recibo.codigo,
          sinal: recibo.sinal,
          confirmado: true,
        });
        codigo = 1;
      } else if (tipo === T.STDIN) {
        if (
          op.eof ||
          !payload.length ||
          payload.length > BLOCO ||
          payload.length > op.creditoEntrada
        )
          throw new Error("Crédito de entrada excedido.");
        op.total += payload.length;
        if (op.total > TRANSFERENCIA) throw new Error("Transferência excedida.");
        op.creditoEntrada -= payload.length;
        op.fila.push(payload);
        op.acordarEntrada?.();
      } else if (tipo === T.STDIN_END) {
        if (op.eof || payload.length) throw new Error("EOF inválido.");
        op.eof = true;
        op.acordarEntrada?.();
      } else if (tipo === T.WINDOW) {
        const janela = controle(payload, ["stream", "bytes"]);
        if (
          !["stdout", "stderr"].includes(janela.stream) ||
          !Number.isInteger(janela.bytes) ||
          janela.bytes <= 0 ||
          janela.bytes + op.creditos[janela.stream] > JANELA
        )
          throw new Error("Janela inválida.");
        op.creditos[janela.stream] += janela.bytes;
        op.acordar[janela.stream]?.();
      } else throw new Error("Mensagem administrativa fora da fase.");
    }
    if (!fim) throw new Error("Sessão truncada.");
  } catch (causa) {
    codigo = 1;
    erro ??= causa;
  }
  for (const op of ativos.values()) {
    abortar(op);
    try {
      if (op.exec) await op.exec.cancelar();
    } catch (causa) {
      erro ??= causa;
      codigo = 1;
    }
    // Falha do recibo não dispensa consolidar os produtores locais já iniciados.
    try {
      await op.done;
    } catch (causa) {
      erro ??= causa;
      codigo = 1;
    }
  }
  try {
    const limpeza = await gate.encerrar(coletar);
    if (limpeza.falhas.length) codigo = 1;
    if (fim) {
      try {
        await enviar(T.SESSION_END, 0, { codigo });
      } catch (causa) {
        codigo = 1;
        erro ??= causa;
      }
    }
    return { codigo, erro, limpeza, saidasPendentes };
  } finally {
    clearTimeout(prazo);
    signal?.removeEventListener("abort", interromper);
  }
}
