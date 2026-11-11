// Interrompe efeitos dos casos posteriores à primeira falha inesperada do arquivo.
import testeNativo from "node:test";
let bloqueado = false;
export function test(nome, opcoes, corpo) {
  if (typeof opcoes === "function") {
    corpo = opcoes;
    opcoes = {};
  }
  return testeNativo(nome, opcoes, async (t) => {
    if (bloqueado) {
      t.skip("Não iniciado após primeira falha inesperada.");
      return;
    }
    try {
      await corpo(t);
    } catch (e) {
      bloqueado = true;
      throw e;
    }
  });
}
