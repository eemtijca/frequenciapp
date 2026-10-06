// Exclusão dos envios parciais com a proteção compartilhada de planilhas.
import { comTravaPlanilha, type ControleTravaPlanilha } from "./trava-planilha";

export const CHAVE_TRAVA_PARCIAL = { namespace: 0x46524551, recurso: 3 } as const;
export type ControleTravaParcial = ControleTravaPlanilha;

export function comTravaPlanilhaParcial<T>(
  tarefa: (controle: ControleTravaParcial) => Promise<T>,
): Promise<T> {
  return comTravaPlanilha(
    CHAVE_TRAVA_PARCIAL,
    "Outro envio parcial está em andamento. Aguarde e faça outra prévia.",
    tarefa,
  );
}
