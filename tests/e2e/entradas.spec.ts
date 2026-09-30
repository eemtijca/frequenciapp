// Entradas atrasadas na interface, persistência e prévia com Sheets API falsa.
import { test, expect } from "@playwright/test";
import { criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
// O worker encaminha fetch fora do page.route; a suíte PWA o testa separadamente.
test.use({ serviceWorkers: "block" });
test.beforeAll(criarMassaE2E);
test.afterAll(limparMassaE2E);
test("registra chegada, preserva após recarregar e remove para correção", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await page.locator("#entrada-dia").fill("2026-06-15");
  await page.locator("#entrada-turma").click();
  await page.getByRole("option", { name: "E2E Ano A" }).click();
  await page.locator("#entrada-aluno").click();
  await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
  await page.locator("#entrada-horario").fill("08:15");
  await page.locator("#entrada-motivo").fill("Transporte atrasou");
  await page.getByRole("button", { name: "Registrar entrada", exact: true }).click();
  await expect(page.getByText("Entrada registrada.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Entradas registradas" }).getByText("Transporte atrasou"),
  ).toBeVisible();
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await page.locator("#entrada-dia").fill("2026-06-15");
  await expect(
    page.getByRole("region", { name: "Entradas registradas" }).getByText("Transporte atrasou"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover entrada de E2E Aluno Um" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("chamada");
  await page.getByRole("button", { name: "Remover entrada", exact: true }).click();
  await expect(page.getByText("Nenhuma entrada registrada neste recorte.")).toBeVisible();
});
test("revê a aba e o envio em confirmação própria", async ({ page }) => {
  let preparou = 0;
  let enviou = 0;
  await page.route("**/api/planilha-entradas/**", async (route) => {
    const acao = new URL(route.request().url()).pathname.split("/").at(-1);
    if (acao === "preparar") preparou++;
    if (acao === "enviar") {
      enviou++;
      expect(route.request().postDataJSON()).toMatchObject({
        planoHash: "previa-qa",
        de: "2026-06-15",
        ate: "2026-06-15",
      });
    }
    await route.fulfill({
      json:
        acao === "estado"
          ? { podeEnviar: true, planilhaNome: "QA Planilha" }
          : acao === "simular"
            ? {
                planoHash: "previa-qa",
                novas: 1,
                existentes: 0,
                bloqueado: false,
                avisos: [],
                criar: [{ nome: "E2E Aluno", linha: 2 }],
              }
            : acao === "preparar"
              ? { criada: true }
              : { linhasCriadas: 1 },
    });
  });
  await page.route("**/api/entradas?**", (route) =>
    route.fulfill({
      json: {
        entradas: [
          {
            id: "qa",
            nome: "E2E Aluno",
            turmaRotulo: "E2E Ano A",
            horario: "08:00",
            motivo: "Transporte",
            registradoPorNome: "E2E Direção",
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e entradas", "saidas");
  await page.getByRole("button", { name: "Entradas", exact: true }).click();
  await page.locator("#entrada-dia").fill("2026-06-15");
  await page.getByRole("button", { name: "Preparar aba Entradas" }).click();
  expect(preparou).toBe(0);
  await page.getByRole("button", { name: "Preparar aba", exact: true }).click();
  await expect(page.getByText("Aba Entradas criada.")).toBeVisible();
  expect(preparou).toBe(1);
  await page.getByRole("button", { name: "Prévia das entradas" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("1 linha nova");
  expect(enviou).toBe(0);
  await page.getByRole("button", { name: "Enviar entradas", exact: true }).click();
  await expect(page.getByText("Envio confirmado: 1 linha criada.")).toBeVisible();
  expect(enviou).toBe(1);
  await expect(page.getByText("Envio confirmado: 1 linha criada.")).not.toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({ path: "playwright-report/entradas-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  const painel = page.locator('[data-pager="principal"] > section:not([hidden])');
  await painel.evaluate((elemento) => {
    elemento.scrollTop = 0;
  });
  const botao = page
    .getByRole("navigation", { name: "Seções do aplicativo" })
    .getByRole("button", { name: "Saídas e entradas" });
  await expect(botao).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "playwright-report/entradas-360.png", fullPage: true });
  await painel.evaluate((elemento) => {
    elemento.scrollTop = elemento.scrollHeight;
  });
  await page.screenshot({ path: "playwright-report/entradas-360-lista.png", fullPage: true });
});
