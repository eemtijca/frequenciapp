// Diretores de turma: cadastro na Gestão com turma, palavra-chave mostrada
// uma única vez, revogação com motivo, parâmetros de acesso e a visão só de
// leitura do diretor, que entra pelo identificador e troca a palavra.
import { expect, test } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import {
  comBanco,
  criarMassaE2E,
  limparMassaE2E,
  restaurarParametrosAcessoE2E,
} from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.describe("diretores de turma na Gestão", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });

  test.afterAll(async () => {
    await limparMassaE2E();
    await restaurarParametrosAcessoE2E();
  });

  test("escolhe a data de início pelo seletor em popover, inteiro na tela do celular", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Diretores/ }).click();
    await page
      .getByRole("button", { name: /Novo diretor|Cadastrar diretor/ })
      .first()
      .click();
    const formulario = page.getByRole("dialog");
    const gatilho = formulario.getByRole("button", {
      name: /Data de início do acompanhamento: .*, Hoje/,
    });
    await expect(gatilho).toBeVisible();
    await gatilho.click();
    const painel = page.getByRole("dialog", { name: "Data de início do acompanhamento" });
    await expect(painel).toBeVisible();
    const caixa = await painel.boundingBox();
    expect(caixa?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(360);
    await painel.getByRole("button", { name: "Mês anterior" }).click();
    await painel.getByRole("button", { name: /^10 de / }).click();
    await expect(
      formulario.getByRole("button", {
        name: /Data de início do acompanhamento: 10\/\d{2}\/\d{4}/,
      }),
    ).toBeVisible();
    await expect(formulario.getByRole("button", { name: "Cadastrar" })).toBeVisible();
  });

  test("cadastra, gera a palavra-chave uma vez e revoga com motivo", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Diretores/ }).click();

    await page
      .getByRole("button", { name: /Novo diretor|Cadastrar diretor/ })
      .first()
      .click();
    const formulario = page.getByRole("dialog");
    await formulario.getByLabel("Nome").fill("E2E Diretora");
    await formulario.getByLabel("Identificador de acesso").fill("e2e@errado");
    await expect(formulario.getByText(/Use letras minúsculas/)).toBeVisible();
    await formulario.getByLabel("Identificador de acesso").fill("e2e-diretora");
    await formulario.getByLabel("E2E Ano A").check();
    await formulario.getByRole("button", { name: "Cadastrar" }).click();
    await expect(page.getByText("Diretor cadastrado.")).toBeVisible();

    const item = page.locator('[data-diretor="e2e-diretora"]');
    await expect(item.getByText("Sem palavra-chave")).toBeVisible();
    await expect(item.getByText("E2E Ano A")).toBeVisible();

    await item.getByRole("button", { name: "Gerar palavra-chave" }).click();
    const palavra = page.locator("[data-palavra-chave]");
    await expect(palavra).toHaveText(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole("button", { name: "Já entreguei" }).click();
    await expect(palavra).toHaveCount(0);
    await expect(item.getByText("Aguardando primeiro acesso")).toBeVisible();

    await item.getByRole("button", { name: "Revogar a palavra-chave de E2E Diretora" }).click();
    const revogar = page.getByRole("alertdialog");
    await expect(revogar.getByRole("button", { name: "Revogar" })).toBeDisabled();
    await revogar.getByLabel("Motivo").fill("Teste de ponta a ponta");
    await revogar.getByRole("button", { name: "Revogar" }).click();
    await expect(page.getByText("Palavra-chave revogada.")).toBeVisible();
    await expect(item.getByText("Revogada", { exact: true })).toBeVisible();
    await expect(item.getByText(/revogada: Teste de ponta a ponta/)).toBeVisible();
  });

  test("ajusta os parâmetros de acesso em Configurações", async ({ page }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Config/ }).click();
    const secao = page.locator('[data-secao="config-acesso-diretores"]');
    await secao.getByRole("button", { name: /Acesso dos diretores/ }).click();
    const validade = secao.getByLabel("Validade da palavra-chave");
    await expect(validade).toHaveValue("90");
    await validade.fill("30");
    await expect(secao.getByLabel("Faltas", { exact: true })).toBeDisabled();
    await secao.getByRole("button", { name: "Salvar parâmetros" }).click();
    await expect(page.getByText("Parâmetros de acesso salvos.")).toBeVisible();
    await expect(secao.getByText("Palavra por 30 dias")).toBeVisible();
  });

  test("o diretor entra pelo identificador e só lê a própria turma", async ({ page, browser }) => {
    const baseURL = test.info().project.use.baseURL ?? "http://localhost:3000";
    // Chamada de hoje com falta do primeiro aluno, pela sessão da administração.
    const dia = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    const { turmaId, alunoId } = await comBanco(async (cliente) => {
      const linha = await cliente.query<{ turma_id: string; id: string }>(
        "select turma_id, id from alunos where nome = 'E2E Aluno Um'",
      );
      return { turmaId: linha.rows[0]?.turma_id ?? "", alunoId: linha.rows[0]?.id ?? "" };
    });
    const chamada = await page.request.post("/api/frequencias", {
      headers: { Origin: baseURL },
      data: { dia, turmaId, faltas: [alunoId], revisao: 0 },
    });
    expect(chamada.status()).toBe(200);

    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Gestão", "gestao");
    await page.getByRole("tab", { name: /Diretores/ }).click();
    await page
      .getByRole("button", { name: /Novo diretor|Cadastrar diretor/ })
      .first()
      .click();
    const formulario = page.getByRole("dialog");
    await formulario.getByLabel("Nome").fill("E2E Leitor");
    await formulario.getByLabel("Identificador de acesso").fill("e2e-leitor");
    await formulario.getByLabel("E2E Ano A").check();
    await formulario.getByRole("button", { name: "Cadastrar" }).click();
    const item = page.locator('[data-diretor="e2e-leitor"]');
    await item.getByRole("button", { name: "Gerar palavra-chave" }).click();
    const palavra = (await page.locator("[data-palavra-chave]").textContent()) ?? "";
    expect(palavra).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    await page.getByRole("button", { name: "Já entreguei" }).click();

    const contexto = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const diretor = await contexto.newPage();
    await diretor.goto("/");
    await aguardarHidratacao(diretor, "form button");
    await diretor.getByLabel("E-mail ou identificador").fill("E2E-Leitor");
    await diretor.getByLabel("Senha", { exact: true }).fill(palavra);
    await diretor.getByRole("button", { name: "Entrar" }).click();

    const troca = diretor.getByRole("dialog");
    await expect(troca.getByRole("heading", { name: "Crie sua palavra-chave" })).toBeVisible();
    await expect(
      diretor.getByText("Crie sua palavra-chave para ver as estatísticas."),
    ).toBeVisible();
    await troca.getByLabel("Palavra-chave recebida", { exact: true }).fill(palavra);
    await troca.getByLabel("Nova palavra-chave", { exact: true }).fill("LeitorE2E2026");
    await troca.getByLabel("Confirmar nova palavra-chave", { exact: true }).fill("LeitorE2E2026");
    await troca.getByRole("button", { name: "Salvar e continuar" }).click();

    await expect(diretor.getByRole("heading", { name: "Minhas turmas" })).toBeVisible();
    await expect(diretor.locator("main")).toHaveAttribute("data-visao", "diretor");
    await expect(diretor.getByText("E2E Ano A").first()).toBeVisible();
    await expect(diretor.getByRole("heading", { name: "Ausência por aluno" })).toBeVisible();
    await expect(diretor.getByRole("img", { name: /1 de 2 alcançam o limite/ })).toBeVisible();

    await diretor.getByRole("button", { name: "Tabela" }).click();
    const tabela = diretor.getByRole("table");
    await expect(tabela.getByRole("rowheader", { name: /E2E Aluno Um/ })).toContainText("em risco");
    await expect(tabela.getByRole("columnheader", { name: "Justificadas" })).toHaveCount(0);

    // Nada de navegação da equipe nem de edição.
    await expect(diretor.getByRole("navigation", { name: "Seções do aplicativo" })).toHaveCount(0);
    await expect(diretor.getByRole("button", { name: /Salvar chamada|Registrar/ })).toHaveCount(0);
    await contexto.close();
  });
});
