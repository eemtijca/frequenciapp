// Protege Saídas e Entradas entre instâncias, inclusive quando o envio automático chama o manual.
import { AsyncLocalStorage } from "node:async_hooks";
import { comTravaPlanilha, type ControleTravaPlanilha } from "./trava-planilha";

export const CHAVE_TRAVA_MOVIMENTACOES = { namespace: 0x46524551, recurso: 2 } as const;
const contexto = new AsyncLocalStorage<ControleTravaPlanilha>();

export function controleTravaPlanilhaMovimentacoes(): ControleTravaPlanilha | undefined {
  return contexto.getStore();
}

export function comTravaPlanilhaMovimentacoes<T>(tarefa: () => Promise<T>): Promise<T> {
  const atual = contexto.getStore();
  if (atual) {
    atual.conferir();
    return tarefa();
  }
  return comTravaPlanilha(
    CHAVE_TRAVA_MOVIMENTACOES,
    "Outra atualização de Saídas e Entradas está em andamento. Aguarde e faça outra prévia.",
    (controle) => contexto.run(controle, tarefa),
  );
}
