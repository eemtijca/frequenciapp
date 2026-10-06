// Serializa preparo mensal e envios da frequência, mantendo a proteção até a última escrita.
import { AsyncLocalStorage } from "node:async_hooks";
import { comTravaPlanilha, type ControleTravaPlanilha } from "./trava-planilha";

export const CHAVE_TRAVA_FREQUENCIA = { namespace: 0x46524551, recurso: 1 } as const;
const contexto = new AsyncLocalStorage<ControleTravaPlanilha>();

export function controleTravaPlanilhaFrequencia(): ControleTravaPlanilha | undefined {
  return contexto.getStore();
}

export function comTravaPlanilhaFrequencia<T>(tarefa: () => Promise<T>): Promise<T> {
  return comTravaPlanilha(
    CHAVE_TRAVA_FREQUENCIA,
    "Outra atualização da planilha está em andamento. Aguarde e tente novamente.",
    (controle) => contexto.run(controle, tarefa),
  );
}
