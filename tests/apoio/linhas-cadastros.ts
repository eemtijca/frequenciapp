// Confere no navegador os limites e alvos dos registros empilhados.
import type { Locator } from "@playwright/test";
import { expect } from "vitest";

export async function conferirRegistrosEmpilhados(
  registros: ReadonlyArray<{ linha: Locator; editar: Locator }>,
) {
  const medidas = await Promise.all(
    registros.map(async ({ linha }) => {
      const [registro, identidade, acoes] = await Promise.all([
        linha.boundingBox(),
        linha.getByRole("rowheader").boundingBox(),
        linha.getByRole("cell").boundingBox(),
      ]);
      if (!registro || !identidade || !acoes) throw new Error("Registro não renderizado");
      return { registro, identidade, acoes };
    }),
  );
  for (const [i, { registro, identidade, acoes }] of medidas.entries()) {
    const fim = registro.y + registro.height;
    expect(identidade.y + identidade.height, "identidade antes das ações").toBeLessThanOrEqual(
      acoes.y + 1,
    );
    expect(
      acoes.y + acoes.height,
      "ações dentro do registro, sem sobreposição",
    ).toBeLessThanOrEqual(fim + 1);
    const proximo = medidas[i + 1];
    if (proximo) {
      expect(fim, "registros consecutivos sem sobreposição").toBeLessThanOrEqual(
        proximo.registro.y + 1,
      );
      expect(
        acoes.y + acoes.height,
        "ações sem sobreposição com o próximo nome",
      ).toBeLessThanOrEqual(proximo.identidade.y + 1);
    }
  }

  for (const { editar } of registros) {
    await editar.scrollIntoViewIfNeeded();
    const alvo = await editar.evaluate((botao) => {
      const { left, top, width, height } = botao.getBoundingClientRect();
      const pontos = [2, 46].flatMap((x) => [2, 46].map((y) => [left + x, top + y] as const));
      return {
        width,
        height,
        recebeToque: pontos.every(([x, y]) => botao.contains(document.elementFromPoint(x, y))),
      };
    });
    expect(alvo.width).toBeGreaterThanOrEqual(48);
    expect(alvo.height).toBeGreaterThanOrEqual(48);
    expect(alvo.recebeToque).toBe(true);
    await editar.focus();
    expect(
      await editar.evaluate((el) => el === document.activeElement && el.matches(":focus-visible")),
    ).toBe(true);
  }
}
