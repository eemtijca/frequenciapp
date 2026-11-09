// Codifica e decodifica um frame completo, sem transporte nem dispatch.
import { Buffer } from "node:buffer";

/**
 * Cabeçalho fixo de 20 bytes, inteiros unsigned em ordem de rede (big-endian):
 * offset 0: magic uint32 0x4641444d (FADM); 4: versão uint8 1; 5: tipo uint8;
 * 6: flags uint16 (zero obrigatório); 8: requestId uint32; 12: sequência uint32;
 * 16: tamanho uint32 do payload, que começa no offset 20.
 * IDs e sequência admitem 0..0xffffffff sem semântica de sessão ou reutilização.
 * Entrada e payload exigem Buffer. A saída copia bytes sem alterar a entrada.
 * Exige exatamente um frame: recusa incompletos e bytes extras, sem acumulá-los.
 * Streaming incremental, multiplexação, backpressure e cancelamento ficam fora
 * deste codec. Tipos nomeiam mensagens, não autorizam operações ou fases.
 * Nenhum parsing JSON/UTF-8, dispatch, I/O ou guarda administrativa é implementado.
 */
// Escolha técnica inicial de 64 KiB por payload, não suporte integrado de transporte.
const limitePayloadPadrao = 65_536;

export const TIPOS_FRAME = Object.freeze({
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
const tiposPermitidos = new Set(Object.values(TIPOS_FRAME));

function validarTipo(tipo) {
  if (!tiposPermitidos.has(tipo)) throw new RangeError("Tipo de frame desconhecido.");
}

function validarFlags(flags) {
  if (flags !== 0) throw new RangeError("Flags reservadas devem ser zero.");
}

function validarLimite(limite) {
  if (!Number.isInteger(limite) || limite <= 0 || limite > 0xffffffff)
    throw new RangeError("Limite de payload deve ser inteiro positivo uint32.");
}

function validarUint32(valor, campo) {
  if (!Number.isInteger(valor) || valor < 0 || valor > 0xffffffff)
    throw new RangeError(`${campo} deve ser uint32.`);
}

export function codificarFrame(
  { tipo, flags, requestId, sequencia, payload },
  { limitePayload = limitePayloadPadrao } = {},
) {
  validarLimite(limitePayload);
  validarTipo(tipo);
  validarFlags(flags);
  validarUint32(requestId, "requestId");
  validarUint32(sequencia, "sequencia");
  if (!Buffer.isBuffer(payload)) throw new TypeError("Payload deve ser Buffer.");
  if (payload.length > limitePayload) throw new RangeError("Payload excede o limite.");
  const bytes = Buffer.alloc(20 + payload.length);
  bytes.writeUInt32BE(0x4641444d, 0);
  bytes.writeUInt8(1, 4);
  bytes.writeUInt8(tipo, 5);
  bytes.writeUInt16BE(flags, 6);
  bytes.writeUInt32BE(requestId, 8);
  bytes.writeUInt32BE(sequencia, 12);
  bytes.writeUInt32BE(payload.length, 16);
  payload.copy(bytes, 20);
  return bytes;
}

/** Valida somente os primeiros 20 bytes; não valida payload nem comprimento total. */
export function decodificarCabecalho(bytes, { limitePayload = limitePayloadPadrao } = {}) {
  validarLimite(limitePayload);
  if (!Buffer.isBuffer(bytes)) throw new TypeError("Frame deve ser Buffer.");
  if (bytes.length < 20) throw new RangeError("Cabeçalho incompleto.");
  if (bytes.readUInt32BE(0) !== 0x4641444d) throw new Error("Magic inválido.");
  if (bytes.readUInt8(4) !== 1) throw new Error("Versão desconhecida.");
  const tipo = bytes.readUInt8(5);
  validarTipo(tipo);
  const flags = bytes.readUInt16BE(6);
  validarFlags(flags);
  const tamanhoPayload = bytes.readUInt32BE(16);
  if (tamanhoPayload > limitePayload) throw new RangeError("Payload excede o limite.");
  return {
    tipo,
    flags,
    requestId: bytes.readUInt32BE(8),
    sequencia: bytes.readUInt32BE(12),
    tamanhoPayload,
  };
}

export function decodificarFrame(bytes, { limitePayload = limitePayloadPadrao } = {}) {
  const {
    tipo,
    flags,
    requestId,
    sequencia,
    tamanhoPayload: tamanho,
  } = decodificarCabecalho(bytes, { limitePayload });
  if (bytes.length - 20 > limitePayload) throw new RangeError("Payload excede o limite.");
  if (bytes.length !== 20 + tamanho) throw new RangeError("Tamanho do frame divergente.");
  return {
    tipo,
    flags,
    requestId,
    sequencia,
    payload: Buffer.from(bytes.subarray(20)),
  };
}
