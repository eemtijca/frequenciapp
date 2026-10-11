// Gestão de chaves no navegador: confirmação, segredo único e falha sem perda de formulário.
import { expect, test, type Page } from "@playwright/test";
import { comBanco, ADMIN_E2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
test.use({ serviceWorkers: "block" });
const prefixo = "E2E Chave BI";
async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações" }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações" })
    .getByRole("button", { name: "Acesso e avisos", exact: true })
    .click();
  const secao = page.locator('[data-secao="config-chaves-bi"]');
  const carregada = page.waitForResponse(
    (r) => r.url().endsWith("/api/bi/chaves") && r.request().method() === "GET",
  );
  await secao.getByRole("button", { name: /^FrequenciBI/ }).click();
  await carregada;
  return secao;
}
async function limpar() {
  await comBanco(async (db) => {
    await db.query(
      "delete from auditoria where acao like 'bi.chave.%' and alvo in (select id::text from chaves_bi where rotulo like $1)",
      [`${prefixo}%`],
    );
    await db.query("delete from chaves_bi where rotulo like $1", [`${prefixo}%`]);
  });
}
test.afterEach(limpar);
test("cria com senha e mostra o segredo uma única vez, sem perder a chave em falha de atualização", async ({
  page,
}) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Criar chave", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar chave", exact: true });
  await dialogo.getByLabel("Rótulo", { exact: true }).fill(`${prefixo} Principal`);
  await dialogo.getByLabel("Senha do administrador", { exact: true }).fill(ADMIN_E2E.senha);
  let enviado = false;
  await page.route("**/api/bi/chaves", async (rota) => {
    if (rota.request().method() === "POST") {
      enviado = true;
      await rota.continue();
    } else if (enviado) await rota.abort("failed");
    else await rota.continue();
  });
  await dialogo.getByRole("button", { name: "Confirmar", exact: true }).click();
  const segredo = page.getByRole("dialog", { name: "Guarde a chave", exact: true });
  await expect(segredo).toBeVisible();
  await expect(segredo.getByRole("textbox", { name: "Chave gerada" })).toHaveValue(
    /^fbi_[A-Za-z0-9_-]{43}$/,
  );
  await segredo.getByRole("button", { name: "Já guardei" }).click();
  await expect(page.getByRole("textbox", { name: "Chave gerada" })).toHaveCount(0);
  await expect(secao.getByRole("alert")).toContainText("Não foi possível atualizar");
  await page.unroute("**/api/bi/chaves");
  await secao.getByRole("button", { name: "Atualizar chaves" }).click();
  await expect(
    secao.getByRole("heading", { name: `${prefixo} Principal`, exact: true }),
  ).toBeVisible();
  await test.info().attach("gestao-chaves-bi", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
test("falha de envio mantém rótulo e escopo para tentar novamente e permite cancelar revogação", async ({
  page,
}) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Criar chave", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar chave", exact: true });
  await dialogo.getByLabel("Rótulo", { exact: true }).fill(`${prefixo} Recuperação`);
  await dialogo.getByLabel("Senha do administrador", { exact: true }).fill(ADMIN_E2E.senha);
  await page.route("**/api/bi/chaves", (rota) =>
    rota.request().method() === "POST" ? rota.abort("failed") : rota.continue(),
  );
  await dialogo.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(
    page.getByText("Não foi possível concluir a ação nas chaves.", { exact: true }),
  ).toBeVisible();
  await expect(dialogo.getByLabel("Rótulo", { exact: true })).toHaveValue(`${prefixo} Recuperação`);
  await page.unroute("**/api/bi/chaves");
  await dialogo.getByRole("button", { name: "Confirmar", exact: true }).click();
  const segredo = page.getByRole("dialog", { name: "Guarde a chave", exact: true });
  await expect(segredo).toBeVisible();
  await segredo.getByRole("button", { name: "Já guardei" }).click();
  const cartao = secao
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: `${prefixo} Recuperação` }) });
  await cartao.getByRole("button", { name: "Revogar", exact: true }).click();
  const revogar = page.getByRole("dialog", { name: "Revogar chave", exact: true });
  await revogar.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(cartao).toContainText("ativa");
});
