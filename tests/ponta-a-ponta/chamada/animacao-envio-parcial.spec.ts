// Confere o reinício seguro e as operações do diálogo de envio parcial.
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

async function abrirParcial(page: Page) {
  await page.route("**/api/planilha-parcial/estado", (rota) =>
    rota.fulfill({ json: { podeEnviar: true, planilhaNome: "Planilha de teste" } }),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  const gatilho = page.getByTestId("chamada-parcial").getByRole("button", {
    name: "Enviar para a planilha",
  });
  await expect(gatilho).toBeEnabled();
  await gatilho.click();
  return gatilho;
}

test("reabre sem a prévia e os filtros anteriores", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.route("**/api/planilha-parcial/simular", (rota) =>
    rota.fulfill({
      json: {
        novas: 1,
        atualizacoes: 0,
        existentes: 0,
        criar: [],
        atualizar: [],
        avisos: [],
        bloqueado: false,
        planoHash: "teste",
      },
    }),
  );
  const gatilho = await abrirParcial(page);
  const dialogo = page.getByRole("dialog", { name: "Enviar chamada parcial" });
  await dialogo.getByRole("switch", { name: "Atualizar registros já enviados" }).click();
  await dialogo.getByRole("button", { name: "Conferir envio" }).click();
  await expect(dialogo.getByRole("button", { name: "Confirmar envio" })).toBeVisible();
  await dialogo.getByRole("button", { name: "Cancelar" }).click();
  await expect(dialogo).toHaveCount(0);
  await gatilho.click();
  await expect(dialogo.getByRole("button", { name: "Conferir envio" })).toBeVisible();
  await expect(
    dialogo.getByRole("switch", { name: "Atualizar registros já enviados" }),
  ).not.toBeChecked();
});

test("impede o fechamento durante a conferência e exige nova prévia após falha", async ({
  page,
}) => {
  let liberar: () => void = () => {};
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let simulacoes = 0;
  let envios = 0;
  await page.route("**/api/planilha-parcial/simular", async (rota) => {
    simulacoes += 1;
    await espera;
    await rota.fulfill({
      json: {
        novas: 1,
        atualizacoes: 0,
        existentes: 0,
        criar: [],
        atualizar: [],
        avisos: [],
        bloqueado: false,
        planoHash: "teste",
      },
    });
  });
  await page.route("**/api/planilha-parcial/enviar", async (rota) => {
    envios += 1;
    await rota.fulfill({ status: 500, json: { error: "Falha no envio" } });
  });
  await abrirParcial(page);
  const dialogo = page.getByRole("dialog", { name: "Enviar chamada parcial" });
  await dialogo.getByRole("button", { name: "Conferir envio" }).click();
  await expect(dialogo.getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialogo).toBeVisible();
  liberar();
  await dialogo.getByRole("button", { name: "Confirmar envio" }).click();
  await expect(
    dialogo.getByText("Confira o resultado na planilha e gere outra prévia."),
  ).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Confirmar envio" })).toHaveCount(0);
  expect(simulacoes).toBe(1);
  expect(envios).toBe(1);
});
