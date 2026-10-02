// Limpeza de backups antigos na Gestão: prévia, cancelamento e toque duplo.
import { expect, test, type Page } from "@playwright/test";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
test.use({ serviceWorkers: "block" });
const copia = "_frequenciapp_backup_QA_20260930-130258-674";
async function abrir(page: Page) {
  await page.route("**/api/planilha", (rota) =>
    rota.fulfill({
      json: {
        integracao: {
          ativa: true,
          provedor: "GOOGLE",
          googleConectado: true,
          envioAutomatico: false,
          googlePlanilha: { id: "arquivo-sintetico", nome: "QA" },
          modo: "conservador",
          modoCompletoAte: null,
          sincronizacoes: [],
          alteradasDepois: 0,
          esquema: {
            planilha: { nome: "QA", url: "", fuso: "America/Fortaleza", versao: 1 },
            abas: [],
            mapa: [],
          },
        },
      },
    }),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  const cartao = page.locator('[data-secao="planilha-frequencia"]');
  await cartao.getByRole("button", { name: /Planilha de frequência/ }).click();
  await cartao.getByRole("button", { name: /Zona de risco/ }).click();
  return cartao;
}
test("mostra prévia, permite cancelar e remove uma única vez com senha e frase", async ({
  page,
}) => {
  const confirmacoes: unknown[] = [];
  let liberar = () => {};
  const liberacao = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await page.route("**/api/planilha/limpar-copias", async (rota) => {
    const corpo = rota.request().postDataJSON() as {
      planoHash?: string;
      senha?: string;
      frase?: string;
    };
    if (!corpo.planoHash)
      await rota.fulfill({ json: { previa: { copias: [copia], planoHash: "a".repeat(64) } } });
    else {
      confirmacoes.push(corpo);
      expect(corpo.senha).toBe("senha-sintetica");
      expect(corpo.frase).toBe("EDITAR PLANILHA");
      await liberacao;
      await rota.fulfill({ json: { removidas: 1 } });
    }
  });
  const cartao = await abrir(page);
  await cartao.getByRole("button", { name: "Remover abas de backup", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Remover abas de backup" });
  await expect(dialogo.getByText(copia, { exact: true })).toBeVisible();
  await page.screenshot({ path: `docs/imagens/limpeza-backups-${test.info().project.name}.png` });
  await expect(dialogo.getByRole("button", { name: "Remover cópias", exact: true })).toBeDisabled();
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(confirmacoes).toEqual([]);
  await cartao.getByRole("button", { name: "Remover abas de backup", exact: true }).click();
  await dialogo.getByLabel("Digite EDITAR PLANILHA").fill("EDITAR PLANILHA");
  await dialogo.getByLabel("Senha do administrador", { exact: true }).fill("senha-sintetica");
  await dialogo
    .getByRole("button", { name: "Remover cópias", exact: true })
    .evaluate((elemento) => {
      (elemento as HTMLButtonElement).click();
      (elemento as HTMLButtonElement).click();
    });
  await expect.poll(() => confirmacoes.length).toBe(1);
  await expect(dialogo.getByRole("button", { name: "Cancelar", exact: true })).toBeDisabled();
  liberar();
  await expect(dialogo).not.toBeVisible();
  expect(confirmacoes).toHaveLength(1);
});

test("não abre confirmação quando não existem cópias antigas", async ({ page }) => {
  await page.route("**/api/planilha/limpar-copias", (rota) =>
    rota.fulfill({ json: { previa: { copias: [], planoHash: "a".repeat(64) } } }),
  );
  const cartao = await abrir(page);
  await cartao.getByRole("button", { name: "Remover abas de backup", exact: true }).click();
  await expect(
    page.getByText("Nenhuma aba de backup para remover.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Remover abas de backup" })).not.toBeVisible();
});
