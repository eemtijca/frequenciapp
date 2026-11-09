// Declara o leitor binário administrativo sem autoridade operacional.
import type { Buffer } from "node:buffer";
import type { FrameAdministrativo, OpcoesCodec } from "./protocolo.mjs";

/** Lê Buffers fragmentados/coalescidos sob demanda, ignorando chunks vazios.
 * Valida opções no primeiro next(), antes de obter o iterador da origem.
 * EOF entre frames conclui; header/payload truncado e frame inválido falham.
 * Não puxa outro chunk nem prepara o próximo frame durante a suspensão no yield.
 * Payloads são cópias independentes. Memória adicional O(limitePayload), mais
 * header fixo; exclui o chunk já fornecido e resultados retidos pelo consumidor.
 * A origem deve manter estáveis os bytes ainda não consumidos do chunk entregue.
 * Após iniciar, return/throw/erro finalizam a origem via return, sem drenar;
 * falha secundária de fechamento não substitui erro original, mesmo undefined.
 * Não interrompe um next já pendente nem cancela I/O ou processos remotos.
 * Sem multiplexação, windows, sessão ou autoridade; não é sandbox de JavaScript.
 */
export function lerFrames(
  origem: AsyncIterable<Buffer>,
  opcoes?: OpcoesCodec,
): AsyncGenerator<FrameAdministrativo, void, unknown>;
