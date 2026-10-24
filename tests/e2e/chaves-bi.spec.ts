// Gestão de chaves do BI no rascunho: aplicação sem senha na seção,
// confirmação com senha no lote, segredo único e desfazer antes de salvar.
import { expect, test, type Page } from "@playwright/test";
import { comBanco, ADMIN_E2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";
import { salvarConfiguracoes } from "./helpers/configuracoes";

test.use({ serviceWorkers: "block" });
test.describe.configure({ timeout: 90_000 });
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
  const gatilho = secao.getByRole("button", { name: /^FrequenciBI/ });
  if ((await gatilho.getAttribute("aria-expanded")) !== "true") await gatilho.click();
  await expect(secao.getByRole("button", { name: "Criar chave", exact: true })).toBeVisible();
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

test("cria no rascunho, exige a senha no lote e mostra o segredo uma única vez", async ({
  page,
}) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Criar chave", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar chave", exact: true });
  await dialogo.getByLabel("Rótulo", { exact: true }).fill(`${prefixo} Principal`);
  await dialogo.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await expect(secao.getByRole("heading", { name: `${prefixo} Principal` })).toBeVisible();

  // Sem a senha, o lote não é gravado e o diálogo de revisão permanece.
  await page.getByRole("button", { name: "Salvar configurações", exact: true }).click();
  const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?" });
  await expect(revisao.getByLabel("Senha do administrador", { exact: true })).toBeVisible();
  await revisao.getByLabel("Senha do administrador", { exact: true }).fill(ADMIN_E2E.senha);
  await revisao.getByRole("button", { name: "Salvar configurações", exact: true }).click();

  const segredo = page.getByRole("dialog", { name: "Guarde as chaves do BI", exact: true });
  await expect(segredo).toBeVisible();
  await expect(
    segredo.getByRole("textbox", { name: `Chave gerada para ${prefixo} Principal` }),
  ).toHaveValue(/^fbi_[A-Za-z0-9_-]{43}$/);
  await expect(revisao).toBeHidden();
  await segredo.getByRole("button", { name: "Já guardei" }).click();
  await expect(segredo).toBeHidden();

  // A chave permanece na lista, sem expor o segredo.
  await expect(
    secao.getByRole("heading", { name: `${prefixo} Principal`, exact: true }),
  ).toBeVisible();
  await expect(secao.getByText(/^fbi_/)).toHaveCount(0);
  await test.info().attach("gestao-chaves-bi", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("validade usa data e hora próprias lado a lado e o escopo abre pelo botão da seção", async ({
  page,
}) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Criar chave", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar chave", exact: true });
  await dialogo.getByLabel("Rótulo", { exact: true }).fill(`${prefixo} Validade`);

  const data = dialogo.locator("#bi-validade");
  const hora = dialogo.locator("#bi-validade-hora");
  await expect(data).toHaveAccessibleName(/Sem prazo$/);
  await expect(hora).toHaveAccessibleName(/23:59$/);
  const caixaData = await data.boundingBox();
  const caixaHora = await hora.boundingBox();
  expect(caixaData).not.toBeNull();
  expect(caixaHora).not.toBeNull();
  expect(Math.abs((caixaData?.y ?? 0) - (caixaHora?.y ?? 0))).toBeLessThanOrEqual(1);
  expect((caixaData?.x ?? 0) + (caixaData?.width ?? 0)).toBeLessThanOrEqual(caixaHora?.x ?? 0);
  await expect(hora).toBeDisabled();

  await data.click();
  const calendario = page.getByRole("dialog", {
    name: "Data de validade da chave",
    exact: true,
  });
  await calendario.getByRole("button", { name: "Mês seguinte", exact: true }).click();
  await calendario
    .getByRole("button", { name: /^1 de / })
    .first()
    .click();
  await expect(hora).toBeEnabled();

  await hora.click();
  const relogio = page.getByRole("dialog", { name: "Hora de validade da chave", exact: true });
  await relogio
    .getByRole("listbox", { name: "Horas" })
    .getByRole("option", { name: "18", exact: true })
    .click();
  await relogio
    .getByRole("listbox", { name: "Minutos" })
    .getByRole("option", { name: "30", exact: true })
    .click();
  await expect(hora).toHaveAccessibleName(/18:30$/);

  const escopo = dialogo.getByRole("button", { name: /^Escopo/ });
  await expect(escopo).toHaveAttribute("aria-expanded", "false");
  await expect(escopo).toContainText("Todas as séries");
  await escopo.click();
  await expect(escopo).toHaveAttribute("aria-expanded", "true");
  await expect(dialogo.getByRole("region", { name: "Escopo da chave" })).toBeVisible();

  await dialogo.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await expect(
    secao.getByRole("heading", { name: `${prefixo} Validade`, exact: true }),
  ).toBeVisible();
});

test("falha do lote mantém o rascunho e a revogação pode ser desfeita antes de salvar", async ({
  page,
}) => {
  const secao = await abrir(page);
  await secao.getByRole("button", { name: "Criar chave", exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: "Criar chave", exact: true });
  await dialogo.getByLabel("Rótulo", { exact: true }).fill(`${prefixo} Recuperação`);
  await dialogo.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();

  // Falha de transporte: o rascunho não é perdido.
  await page.route("**/api/configuracoes/lote", (rota) => rota.abort("failed"));
  await page.getByRole("button", { name: "Salvar configurações", exact: true }).click();
  const revisao = page.getByRole("alertdialog", { name: "Salvar configurações?" });
  await revisao.getByLabel("Senha do administrador", { exact: true }).fill(ADMIN_E2E.senha);
  await revisao.getByRole("button", { name: "Salvar configurações", exact: true }).click();
  await expect(revisao).toBeVisible();
  await expect(revisao.getByText(/Não foi possível salvar as configurações/)).toBeVisible();
  await revisao.getByRole("button", { name: "Continuar revisando", exact: true }).click();
  await expect(revisao).toBeHidden();
  await page.unroute("**/api/configuracoes/lote");

  // O cartão continua no rascunho; revogar e desfazer também é local.
  const cartao = secao
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: `${prefixo} Recuperação` }) });
  await expect(cartao).toBeVisible();
  await cartao.getByRole("button", { name: "Revogar", exact: true }).click();
  const revogar = page.getByRole("dialog", { name: "Revogar chave", exact: true });
  await revogar.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await expect(cartao.getByText("revogada", { exact: true })).toBeVisible();
  await cartao.getByRole("button", { name: "Desfazer revogação", exact: true }).click();
  await expect(cartao.getByText("ativa", { exact: true })).toBeVisible();

  // Agora o lote grava e o segredo aparece.
  await salvarConfiguracoes(page, ADMIN_E2E.senha);
  const segredo = page.getByRole("dialog", { name: "Guarde as chaves do BI", exact: true });
  await expect(segredo).toBeVisible();
  await segredo.getByRole("button", { name: "Já guardei" }).click();

  // Revogar de verdade e limpar o histórico exige a senha outra vez.
  await cartao.getByRole("button", { name: "Revogar", exact: true }).click();
  await revogar.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await salvarConfiguracoes(page, ADMIN_E2E.senha);
  await expect(cartao.getByText("revogada", { exact: true })).toBeVisible();
  await expect(cartao.getByRole("heading", { name: `${prefixo} Recuperação` })).toBeVisible();

  await secao.getByRole("button", { name: "Limpar histórico", exact: true }).click();
  const limparDialogo = page.getByRole("dialog", {
    name: "Limpar histórico de chaves",
    exact: true,
  });
  await limparDialogo.getByRole("button", { name: "Aplicar ao rascunho", exact: true }).click();
  await salvarConfiguracoes(page, ADMIN_E2E.senha);
  await expect(
    secao.getByRole("heading", { name: `${prefixo} Recuperação`, exact: true }),
  ).toHaveCount(0);
});
