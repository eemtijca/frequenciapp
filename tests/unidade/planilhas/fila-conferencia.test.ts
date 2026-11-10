// Separa término automático de resolução operacional e protege a repetição incerta.
import { expect, it } from "vitest";
import { desfechoDoItem, resumirSituacoes } from "@/domain/fila-planilha";
it.each(["sem_confirmacao", "pendente_manual", "sem_mapa", "sem_autor", "inesperado"])(
  "retém atenção do operador: %s",
  (situacao) => {
    expect(desfechoDoItem(situacao, 1, new Date())).toMatchObject({
      estado: "CONCLUIDO",
      requerConferencia: true,
      proximaTentativaEm: null,
    });
  },
);
it.each(["falha_preparo", "nao_processado"])("agenda nova tentativa segura: %s", (situacao) => {
  expect(desfechoDoItem(situacao, 1, new Date())).toMatchObject({
    estado: "AGUARDANDO",
    requerConferencia: false,
  });
});
it("não repete todas as origens depois de escrita incerta em uma delas", () => {
  expect(resumirSituacoes(["sem_confirmacao", "falhou"])).toBe("sem_confirmacao");
  expect(resumirSituacoes(["pendente_manual", "falhou"])).toBe("pendente_manual");
  expect(resumirSituacoes(["enviado", "falhou"])).toBe("falhou");
});
