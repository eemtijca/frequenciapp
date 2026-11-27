// Perfil Secretaria: a administração cria a conta na Equipe e a Secretaria abre o aplicativo reduzido, só com o
// Painel e, em Relatórios, a Grade e o Por aluno, sem caminho para chamada, avisos, cadastros nem gestão.
import { test, expect, type Locator, type Page } from "@playwright/test";
import { selecionarCadastroGestao } from "../../helpers/categorias-configuracoes";
import { comBanco, criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { escolherDomingo, ultimoDomingo } from "../helpers/calendario-historico";
import { hashearSenha } from "../../../src/infra/auth/hash";
import { abrirMenuConta, abrirNavegacao, aguardarHidratacao, trocarVisao } from "../helpers/pagina";

test.use({ serviceWorkers: "block" });

const senha = "SecretariaE2E2026";
const senhaZip = "SecretariaZip2026!";
const emailCriadoNaTela = "e2e.secretaria.tela@escola.exemplo";
const emailDeLeitura = "e2e.secretaria.leitura@escola.exemplo";

async function limpar() {
  await comBanco(async (banco) => {
    await banco.query("delete from usuarios where email = any($1::text[])", [
      [emailCriadoNaTela, emailDeLeitura],
    ]);
  });
}

test.beforeAll(async () => {
  await criarMassaE2E();
  await limpar();
  const senhaHash = await hashearSenha(senha);
  await comBanco(async (banco) => {
    await banco.query(
      `insert into usuarios (email, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
       values ($1, $2, 'E2E Secretaria Leitura', 'SECRETARIA', true, now(), now())`,
      [emailDeLeitura, senhaHash],
    );
  });
});

test.afterAll(async () => {
  await limpar();
  await limparMassaE2E();
});

async function abrirGradeDaSecretaria(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await aguardarHidratacao(page);
  const nav = await abrirNavegacao(page);
  await nav.getByRole("button", { name: "Relatórios", exact: true }).click();
  await nav.getByRole("button", { name: "Grade", exact: true }).click();
  const grade = page.getByRole("region", { name: "Grade de frequência", exact: true });
  await expect(grade).toBeVisible();
  const turma = grade.getByRole("button", { name: /E2E Ano A/ });
  if (await turma.isVisible().catch(() => false)) {
    await turma.evaluate((elemento: HTMLElement) => elemento.click());
  }
  await expect(grade.getByRole("button", { name: "Baixar planilha (CSV)" })).toBeEnabled();
  return grade;
}

async function baixarDaGrade(page: Page, grade: Locator, botao: string) {
  await grade.getByRole("button", { name: botao }).click();
  const dialogo = page.getByRole("dialog", { name: "Preparar download" });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel("Senha do ZIP", { exact: true }).fill(senhaZip);
  await dialogo.getByLabel("Confirmar senha do ZIP").fill(senhaZip);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialogo.getByRole("button", { name: "Baixar ZIP protegido" }).click(),
  ]);
  return download;
}

test("a administração cria a Secretaria na Equipe e a lista mostra o papel", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await selecionarCadastroGestao(page, "Equipe");
  await page.getByRole("button", { name: "Nova conta" }).click();

  const dialogo = page.getByRole("dialog");
  await dialogo.locator("#nome-usuario").fill("E2E Secretaria Tela");
  await dialogo.locator("#email-usuario").fill(emailCriadoNaTela);
  await dialogo.locator("#senha-usuario").fill(senha);
  await dialogo.getByRole("combobox", { name: /Papel/ }).click();
  await page.getByRole("option", { name: "Secretaria (só consulta)" }).click();
  await expect(
    dialogo.getByText(/A Secretaria vê o Painel e, em Relatórios, a Grade e o Por aluno/),
  ).toBeVisible();
  await dialogo.getByRole("button", { name: "Criar", exact: true }).click();

  const linha = page.getByRole("row").filter({ hasText: "E2E Secretaria Tela" });
  await expect(linha).toBeVisible();
  await expect(linha.getByText("Secretaria", { exact: true })).toBeVisible();

  const gravado = await comBanco(async (banco) =>
    banco.query<{ papel: string }>("select papel from usuarios where email = $1", [
      emailCriadoNaTela,
    ]),
  );
  expect(gravado.rows).toEqual([{ papel: "SECRETARIA" }]);
});

test.describe("aplicativo reduzido da Secretaria", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    const origem = process.env.TEST_BASE_URL ?? "http://localhost:3000";
    const resposta = await page.request.post("/api/auth/entrar", {
      headers: { Origin: origem, "Content-Type": "application/json" },
      data: { email: emailDeLeitura, senha },
    });
    expect(resposta.status()).toBe(200);
  });

  test("a gaveta tem só Painel e Relatórios, sem caminho para chamada, avisos, cadastros ou gestão", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const nav = await abrirNavegacao(page);
    await expect(nav.getByRole("button", { name: "Painel", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Relatórios", exact: true })).toBeVisible();
    for (const fora of [
      "Chamada",
      "Chamada Parcial",
      "Horários",
      "Saídas e Entradas",
      "Provas",
      "Alunos",
      "Gestão",
    ]) {
      await expect(nav.getByRole("button", { name: fora, exact: true })).toHaveCount(0);
    }
    await expect(nav.getByRole("link", { name: /FrequenciBI/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Configurar notificações" })).toHaveCount(0);

    const menu = await abrirMenuConta(page);
    await expect(menu.getByRole("menuitem", { name: "Trocar senha" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Notificações" })).toHaveCount(0);
    await page.keyboard.press("Escape");
  });

  test("Relatórios oferece só a Grade e o Por aluno, e os dois abrem", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    const nav = await abrirNavegacao(page);
    await nav.getByRole("button", { name: "Relatórios", exact: true }).click();

    await expect(nav.getByRole("button", { name: "Grade", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Por aluno", exact: true })).toBeVisible();
    for (const fora of ["Resumo", "Histórico", "Saídas e Entradas"]) {
      await expect(nav.getByRole("button", { name: fora, exact: true })).toHaveCount(0);
    }

    await nav.getByRole("button", { name: "Grade", exact: true }).click();
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", "relatorios");
    await expect(
      page.getByRole("region", { name: "Grade de frequência", exact: true }),
    ).toBeVisible();
    await nav.getByRole("button", { name: "Por aluno", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Relatório por aluno", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Histórico de frequências", exact: true }),
    ).toHaveCount(0);
  });

  test("links diretos para áreas de fora abrem o Painel, ou a Grade no caso dos relatórios fechados", async ({
    page,
  }) => {
    await page.goto("/?visao=chamada");
    await aguardarHidratacao(page);
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", "painel");

    await page.goto("/?visao=gestao");
    await aguardarHidratacao(page);
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", "painel");

    await page.goto("/?visao=historico");
    await aguardarHidratacao(page);
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", "relatorios");
    await expect(
      page.getByRole("region", { name: "Grade de frequência", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Histórico de frequências", exact: true }),
    ).toHaveCount(0);
  });

  test("navegar pelo Painel, pela Grade e pelo Por aluno não dispara nenhuma requisição recusada", async ({
    page,
  }) => {
    const recusadas: string[] = [];
    page.on("response", (resposta) => {
      const caminho = new URL(resposta.url()).pathname;
      if (caminho.startsWith("/api/") && resposta.status() >= 400) {
        recusadas.push(`${resposta.status()} ${caminho}`);
      }
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const nav = await abrirNavegacao(page);
    await expect(page.locator("main").first()).toHaveAttribute("data-visao", "painel");
    await nav.getByRole("button", { name: "Relatórios", exact: true }).click();
    await nav.getByRole("button", { name: "Grade", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Grade de frequência", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar para a planilha" })).toHaveCount(0);
    await nav.getByRole("button", { name: "Por aluno", exact: true }).click();
    await expect(
      page.getByRole("region", { name: "Relatório por aluno", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(recusadas).toEqual([]);
  });

  test("o resumo de domingo não consulta operações nem mostra seções de operação", async ({
    page,
  }) => {
    const caminhos: string[] = [];
    const recusadas: string[] = [];
    page.on("request", (requisicao) => {
      const caminho = new URL(requisicao.url()).pathname;
      if (caminho === "/api/entradas" || caminho === "/api/frequencias-personalizadas") {
        caminhos.push(caminho);
      }
    });
    page.on("response", (resposta) => {
      const caminho = new URL(resposta.url()).pathname;
      if (caminho.startsWith("/api/") && resposta.status() >= 400) {
        recusadas.push(`${resposta.status()} ${caminho}`);
      }
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await aguardarHidratacao(page);
    const domingo = ultimoDomingo();
    await escolherDomingo(page, "#dia-painel", domingo);

    const resumo = page.getByRole("region", { name: "Resumo da semana", exact: true });
    await expect(resumo).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(caminhos).toEqual([]);
    expect(recusadas).toEqual([]);
    await expect(resumo.locator('[data-secao="resumo-movimentacoes"]')).toHaveCount(0);
    await expect(resumo.locator('[data-secao="resumo-pendenciasSeduc"]')).toHaveCount(0);
  });

  test("baixa o CSV da Grade sem requisição recusada", async ({ page }) => {
    const registros: number[] = [];
    page.on("response", (resposta) => {
      if (new URL(resposta.url()).pathname === "/api/exportacoes/registro") {
        registros.push(resposta.status());
      }
    });
    const grade = await abrirGradeDaSecretaria(page);
    const download = await baixarDaGrade(page, grade, "Baixar planilha (CSV)");
    expect(download.suggestedFilename()).toBe("frequenciapp-grade.zip");
    expect(registros).toEqual([200]);
  });

  test("baixa o PDF da Grade sem requisição recusada", async ({ page }) => {
    const registros: number[] = [];
    page.on("response", (resposta) => {
      if (new URL(resposta.url()).pathname === "/api/exportacoes/registro") {
        registros.push(resposta.status());
      }
    });
    const grade = await abrirGradeDaSecretaria(page);
    const download = await baixarDaGrade(page, grade, "Emitir relatório em PDF da turma de origem");
    expect(download.suggestedFilename()).toBe("frequenciapp-relatorio.zip");
    expect(registros).toEqual([200]);
  });

  test("no celular, o menu tem as mesmas duas áreas", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const nav = await abrirNavegacao(page);
    await expect(nav.getByRole("button", { name: "Painel", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Relatórios", exact: true })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Chamada", exact: true })).toHaveCount(0);
    await expect(nav.getByRole("button", { name: "Gestão", exact: true })).toHaveCount(0);
  });
});
