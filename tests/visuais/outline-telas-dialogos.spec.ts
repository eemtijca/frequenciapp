import { expect, test, type Locator, type Page } from "@playwright/test";

const fixture = "/tests/fixtures/outline-telas-dialogos/";
async function abrir(page: Page, tipo: string) {
  await page.goto(`${fixture}?tipo=${tipo}`);
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function contornado(controle: Locator) {
  await expect(controle).toHaveClass(/\bcontrole-contornado\b/);
}

test("links diretos de Sobre são contornados e preservam seus destinos", async ({ page }) => {
  await abrir(page, "sobre");
  const links = page.getByRole("dialog").getByRole("link");
  await expect(links).toHaveCount(5);
  for (const link of await links.all()) {
    await contornado(link);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  }
});

test("dias de aula mantêm estado pressionado e alternam pelo teclado", async ({ page }) => {
  await abrir(page, "aulas");
  await page.getByRole("button", { name: "Nova aula" }).click();
  const sabado = page.getByRole("button", { name: "sábado" });
  const segunda = page.getByRole("button", { name: "segunda-feira" });
  await contornado(sabado);
  await contornado(segunda);
  await expect(sabado).toHaveAttribute("aria-pressed", "false");
  await expect(segunda).toHaveAttribute("aria-pressed", "true");
  await sabado.focus();
  await page.keyboard.press("Space");
  await expect(sabado).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(sabado).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(sabado).toHaveCount(0);
});

test("frequência parcial preserva seleção, confirmação e cancelamento", async ({ page }) => {
  await abrir(page, "parcial");
  const porAulas = page.getByRole("radio", { name: "Por aulas" });
  await contornado(porAulas);
  await expect(porAulas).toHaveAttribute("aria-checked", "false");
  await porAulas.focus();
  await page.keyboard.press("Space");
  await expect(porAulas).toHaveAttribute("aria-checked", "true");
  const primeira = page.getByRole("checkbox", { name: "1ª aula frequentada" });
  await contornado(primeira);
  await expect(primeira).toHaveAttribute("aria-checked", "false");
  await primeira.focus();
  await page.keyboard.press("Space");
  await expect(primeira).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(primeira).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("salvos")).toHaveText("0");
  await page.getByRole("button", { name: "Salvar frequência parcial" }).click();
  await page.getByRole("button", { name: "Confirmar e salvar frequência" }).click();
  await expect(page.getByLabel("salvos")).toHaveText("1");
});

test("aulas individuais não marcadas recebem contorno", async ({ page }) => {
  await abrir(page, "parcial");
  await page.getByRole("radio", { name: "Por aulas" }).click();
  await contornado(page.getByRole("checkbox", { name: "1ª aula frequentada" }));
});

test("rótulos de formato preservam rádio nativo e cancelamento", async ({ page }) => {
  await abrir(page, "download");
  const zip = page.getByRole("radio", { name: "ZIP protegido por senha" });
  const original = page.getByRole("radio", { name: "Arquivo original sem senha" });
  await contornado(zip.locator(".."));
  await contornado(original.locator(".."));
  await expect(zip).toBeChecked();
  await zip.focus();
  await page.keyboard.press("ArrowDown");
  await expect(original).toBeChecked();
  await expect(original.locator("..")).toHaveClass(/\bselecionado\b/);
  await expect(zip.locator("..")).not.toHaveClass(/\bselecionado\b/);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("salvos")).toHaveText("0");
});

test("links de meses preservam acesso e bloqueio das abas ocultas", async ({ page }) => {
  await page.route("**/api/planilha/mensal/visibilidade", (route) =>
    route.fulfill({
      json: {
        abas: [
          {
            aba: "Turma visível",
            mes: "2026-10",
            url: "https://example.com/visivel",
            oculta: false,
          },
          { aba: "Turma oculta", mes: "2026-10", url: "https://example.com/oculta", oculta: true },
        ],
        legadas: [],
      },
    }),
  );
  await page.goto(`${fixture}?tipo=mes`);
  await page.getByRole("button", { name: "Meses da frequência" }).click();
  const visivel = page.getByRole("link", { name: "Abrir Turma visível" });
  const oculta = page.getByRole("link", { name: "Abrir Turma oculta" });
  await contornado(visivel);
  await contornado(oculta);
  await expect(visivel).toHaveAttribute("href", "https://example.com/visivel");
  await expect(oculta).toHaveAttribute("aria-disabled", "true");
  await oculta.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Use Liberar meses para acessar as abas ocultas.")).toBeVisible();
});

test("ação principal permanece acessível em tela estreita", async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await abrir(page, "parcial");
  await page.getByRole("radio", { name: "Por aulas" }).click();
  const salvar = page.getByRole("button", { name: "Salvar frequência parcial" });
  await expect(salvar).not.toHaveClass(/\bcontrole-contornado\b/);
  await salvar.scrollIntoViewIfNeeded();
  await expect(salvar).toBeInViewport();
  await page.screenshot({ path: info.outputPath("parcial-320-acao.png") });
});

async function mesmasCoresSemVariante(alvo: Locator) {
  const cores = await alvo.evaluate((elemento) => {
    const css = (el: Element) => {
      const estilo = getComputedStyle(el);
      return [estilo.backgroundColor, estilo.borderColor, estilo.color];
    };
    const antes = css(elemento);
    elemento.classList.remove("controle-contornado");
    const depois = css(elemento);
    elemento.classList.add("controle-contornado");
    return { antes, depois };
  });
  expect(cores.antes).toEqual(cores.depois);
}

for (const largura of [320, 390, 1280]) {
  for (const escuro of [false, true]) {
    test(`renderização em ${largura}px no tema ${escuro ? "escuro" : "claro"}`, async ({
      page,
    }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.route("**/api/planilha/mensal/visibilidade", (route) =>
        route.fulfill({
          json: {
            abas: [
              {
                aba: "Turma visível",
                mes: "2026-10",
                url: "https://example.com/visivel",
                oculta: false,
              },
            ],
            legadas: [],
          },
        }),
      );
      for (const tipo of ["aulas", "parcial", "download", "sobre", "mes"]) {
        await page.goto(`${fixture}?tipo=${tipo}`);
        await page.evaluate(
          (dark) => document.documentElement.classList.toggle("dark", dark),
          escuro,
        );
        await expect(page.locator("html")).toHaveClass(escuro ? /\bdark\b/ : /^(?!.*\bdark\b).*$/);
        await page.addStyleTag({
          content:
            "*, *::before, *::after { transition: none !important; animation: none !important; }",
        });
        if (tipo === "mes") await page.getByRole("button", { name: "Meses da frequência" }).click();
        if (tipo === "aulas") await page.getByRole("button", { name: "Nova aula" }).click();
        if (tipo === "parcial") await page.getByRole("radio", { name: "Por aulas" }).click();
        await page.mouse.move(0, 0);
        const dialogo = page.getByRole("dialog");
        await expect(dialogo).toBeVisible();
        const elementos = dialogo.locator(".controle-contornado");
        expect(await elementos.count()).toBeGreaterThan(0);
        for (const elemento of await elementos.all()) {
          const dimensoes = await elemento.boundingBox();
          expect(dimensoes).not.toBeNull();
          expect(dimensoes?.height ?? 0).toBeGreaterThanOrEqual(43.9);
          if (escuro) await mesmasCoresSemVariante(elemento);
        }
        if (!escuro) {
          const neutro =
            tipo === "aulas"
              ? page.getByRole("button", { name: "sábado" })
              : tipo === "parcial"
                ? page.getByRole("checkbox", { name: "1ª aula frequentada" })
                : tipo === "download"
                  ? page.getByRole("radio", { name: "Arquivo original sem senha" }).locator("..")
                  : elementos.first();
          const estilo = await neutro.evaluate((el) => {
            const css = getComputedStyle(el);
            return {
              fundo: css.backgroundColor,
              borda: css.borderTopStyle,
              espessura: css.borderTopWidth,
            };
          });
          expect(estilo.fundo).toBe("rgba(0, 0, 0, 0)");
          expect(estilo.borda).not.toBe("none");
          expect(parseFloat(estilo.espessura)).toBeGreaterThan(0);
          const selecionado =
            tipo === "aulas"
              ? page.getByRole("button", { name: "segunda-feira" })
              : tipo === "parcial"
                ? page.getByRole("radio", { name: "Por aulas" })
                : tipo === "download"
                  ? page.getByRole("radio", { name: "ZIP protegido por senha" }).locator("..")
                  : null;
          if (selecionado) await mesmasCoresSemVariante(selecionado);
          const foco =
            tipo === "download"
              ? page.getByRole("radio", { name: "Arquivo original sem senha" })
              : neutro;
          await page.keyboard.press("Tab");
          await foco.focus();
          await expect(foco).toBeFocused();
          const indicador = await foco.evaluate((el) => {
            const css = getComputedStyle(el);
            return { outline: css.outlineStyle, largura: css.outlineWidth, sombra: css.boxShadow };
          });
          expect(
            (indicador.outline !== "none" && indicador.largura !== "0px") ||
              indicador.sombra !== "none",
          ).toBeTruthy();
        }
        await page.screenshot({
          path: info.outputPath(`${tipo}-${largura}-${escuro ? "escuro" : "claro"}.png`),
        });
      }
    });
  }
}
