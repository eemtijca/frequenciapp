// Configuração dos limites de infrequência na Gestão e leitura pela API.
import { expect, test } from "@playwright/test";
import type { Configuracoes } from "@/domain/frequencia";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

test("a Gestão grava os limites de infrequência e a API devolve os valores", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  const antes = (await (await page.request.get("/api/configuracoes")).json()) as {
    configuracoes: Configuracoes;
  };

  try {
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Configurações/ }).click();
    await page.getByRole("button", { name: "Escola", exact: true }).click();

    const secao = page.locator('[data-secao="config-infrequencia"]');
    await expect(secao).toBeVisible();
    await secao.locator("button").first().click();
    await page.locator("#infrequencia-atencao").fill("5");
    await page.locator("#infrequencia-critica").fill("15");

    await page.getByRole("button", { name: "Salvar configurações", exact: true }).first().click();
    const dialogo = page.getByRole("alertdialog");
    await expect(dialogo).toBeVisible();
    await dialogo.getByRole("button", { name: "Salvar configurações", exact: true }).click();
    await expect(dialogo).toBeHidden({ timeout: 30_000 });

    const depois = (await (await page.request.get("/api/configuracoes")).json()) as {
      configuracoes: Configuracoes;
    };
    expect(depois.configuracoes.infrequenciaAtencaoPercentual).toBe(5);
    expect(depois.configuracoes.infrequenciaCriticaPercentual).toBe(15);
  } finally {
    const atual = (await (await page.request.get("/api/configuracoes")).json()) as {
      configuracoes: Configuracoes;
    };
    await page.request.patch("/api/configuracoes", {
      data: {
        infrequenciaAtencaoPercentual: antes.configuracoes.infrequenciaAtencaoPercentual,
        infrequenciaCriticaPercentual: antes.configuracoes.infrequenciaCriticaPercentual,
        atualizadoEm: atual.configuracoes.atualizadoEm,
      },
    });
  }
});
