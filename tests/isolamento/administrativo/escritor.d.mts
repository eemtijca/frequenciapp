// Declara a escrita local de um frame administrativo em destino emprestado.
import type { Writable } from "node:stream";
import type { FrameAdministrativo, OpcoesCodec } from "./protocolo.mjs";

/**
 * Codifica e escreve um frame opaco em Writable Node já fornecido, sem abrir I/O.
 * Resolve somente após callback local e, se write retornar false, também drain.
 * Não promete recebimento remoto, flush físico, fsync nem durabilidade.
 * Uma chamada pendente por identidade; a segunda recusa antes de codificar/alocar,
 * sem fila. A reserva é liberada em sucesso ou erro, sem excluir escritas externas.
 * Não end/destroy/fecha o destino; preserva causas e listeners do chamador.
 * Listeners próprios de proteção podem sobreviver à rejeição até callback/error/close
 * causais do Node, evitando error não tratado durante destruição assíncrona.
 * OpcoesCodec conserva padrão de 65_536 e intervalo uint32 positivo.
 * Memória adicional limitada ao frame corrente, excluídos buffers do chamador
 * e a fila já existente no Writable. Não há fila própria de frames.
 * Sem multiplexação, prioridade, windows, sessão, timeouts, cancelamento remoto
 * ou autoridade. Destino sem progresso pode manter a Promise pendente.
 * Writable/JavaScript hostil não é sandbox; erros futuros não causais são do chamador.
 */
export function escreverFrame(
  destino: Writable,
  frame: FrameAdministrativo,
  opcoes?: OpcoesCodec,
): Promise<void>;
