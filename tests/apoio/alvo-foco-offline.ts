// Verifica o alvo e o foco da ação nativa da página sem conexão.
import assert from "node:assert/strict";

export function verificarAlvoOffline(largura: number, altura: number, sondas: boolean[]): void {
  assert(largura >= 48 && altura >= 48, "ALVO_48");
  assert(sondas.length === 5 && sondas.every((atingiu) => atingiu), "HIT_ALVO_48");
}

export function verificarFocoOffline(
  ativo: boolean,
  visivel: boolean,
  estilo: string,
  espessura: number,
): void {
  assert(ativo && visivel && estilo === "solid" && espessura >= 3, "FOCO_3");
}
