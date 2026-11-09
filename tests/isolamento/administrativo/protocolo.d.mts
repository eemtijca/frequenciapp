// Define o contrato do codec puro de um frame administrativo completo.
import type { Buffer } from "node:buffer";

export const TIPOS_FRAME: Readonly<{
  HELLO: 1;
  REQUEST: 2;
  ACCEPTED: 3;
  STDIN: 4;
  STDIN_END: 5;
  STDOUT: 6;
  STDERR: 7;
  WINDOW: 8;
  CANCEL: 9;
  CANCELLED: 10;
  RESULT: 11;
  SESSION_END: 12;
}>;
export type TipoFrame = (typeof TIPOS_FRAME)[keyof typeof TIPOS_FRAME];

/** Cabeçalho de 20 bytes: magic uint32 FADM, versão uint8 1 e tipo uint8.
 * Offsets: magic 0, versão 4, tipo 5, flags uint16 6, requestId uint32 8,
 * sequência uint32 12 e tamanho uint32 16. Inteiros unsigned big-endian.
 */
export interface FrameAdministrativo {
  tipo: TipoFrame;
  /** Todos os bits são reservados e devem ser zero. */
  flags: 0;
  /** Inteiro entre 0 e 0xffffffff. Não confere identidade nem não reutilização. */
  requestId: number;
  /** Inteiro entre 0 e 0xffffffff. Não confere ordem entre frames. */
  sequencia: number;
  /** Bytes opacos, inclusive NUL, newline e UTF-8 inválido. Somente Buffer. */
  payload: Buffer;
}

export interface OpcoesCodec {
  /** Inteiro positivo até 0xffffffff, inclusivo. Default: 65_536 bytes (64 KiB).
   * Escolha técnica conservadora inicial, não limite de transporte já integrado.
   * O limite cobre só o payload; o frame soma 20 bytes de cabeçalho.
   */
  limitePayload?: number;
}

export interface CabecalhoFrameAdministrativo extends Omit<FrameAdministrativo, "payload"> {
  tamanhoPayload: number;
}

/** Valida campos e tamanho declarado dos primeiros 20 bytes sem alocar payload.
 * Não valida o payload nem o comprimento total; admite bytes posteriores ao header.
 */
export function decodificarCabecalho(
  bytes: Buffer,
  opcoes?: OpcoesCodec,
): CabecalhoFrameAdministrativo;

/** Valida campos e tamanho antes da alocação/cópia; devolve Buffer independente. */
export function codificarFrame(frame: FrameAdministrativo, opcoes?: OpcoesCodec): Buffer;
/** Exige exatamente um frame completo. Recusa truncamento e bytes extras antes
 * de copiar o payload para um Buffer independente. Não acumula fragmentos.
 * Sem dispatch, parsing de controle, estado de sessão, multiplexação ou backpressure.
 */
export function decodificarFrame(bytes: Buffer, opcoes?: OpcoesCodec): FrameAdministrativo;
