// Horários semanais: disciplinas por dia, gestão, consulta e formulário no celular.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { abrirNavegacao, aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const serie = "E2E Horários";
const rotulo = `${serie} A`;

async function limpar(): Promise<void> {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from horarios where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
      [serie],
    );
    await banco.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [serie],
    );
    await banco.query("delete from series where nome = $1", [serie]);
  });
}

test.beforeEach(async () => {
  await limpar();
  await comBanco(async (banco) => {
    const criada = await banco.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 97) returning id",
      [serie],
    );
    const turma = await banco.query<{ id: string }>(
      "insert into turmas (nome, serie_id) values ('A', $1) returning id",
      [criada.rows[0]?.id],
    );
    await banco.query(
      `insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo, disciplinas) values
         ($1, 1, '07:00', '07:50', '{1,2}', true, $2::jsonb),
         ($1, 2, '07:50', '08:40', '{1,2}', true, '{}'),
         ($1, 3, '08:40', '09:30', '{1,2}', false, $3::jsonb)`,
      [
        turma.rows[0]?.id,
        JSON.stringify({ "1": "Matemática", "2": "Português" }),
        JSON.stringify({ "1": "História", "2": "História" }),
      ],
    );
  });
});
test.afterEach(limpar);

async function abrirHorarios(page: Page): Promise<Locator> {
  await trocarVisao(page, "Horários", "horarios");
  const vista = page.getByRole("region", { name: "Horários semanais", exact: true });
  await vista.getByRole("combobox", { name: "Turma", exact: true }).click();
  await page.getByRole("option", { name: rotulo, exact: true }).click();
  return vista;
}

async function escolherDia(page: Page, vista: Locator, dia: string): Promise<void> {
  await vista.getByRole("combobox", { name: "Dia da semana", exact: true }).click();
  await page.getByRole("option", { name: dia, exact: true }).click();
}

async function abrirGestaoDaTurma(page: Page): Promise<Locator> {
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Turmas", exact: true }).click();
  await page.getByRole("button", { name: `Horários de ${rotulo}`, exact: true }).click();
  return page.getByRole("dialog", { name: `Horários de ${rotulo}`, exact: true });
}

test("a gestão configura disciplinas diferentes por dia e a consulta persiste após recarregar", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  const dialogo = await abrirGestaoDaTurma(page);
  await dialogo.getByRole("button", { name: "Editar aula 1", exact: true }).click();
  await expect(
    dialogo.getByRole("textbox", { name: "Disciplina de segunda-feira", exact: true }),
  ).toHaveValue("Matemática");
  await expect(
    dialogo.getByRole("textbox", { name: "Disciplina de terça-feira", exact: true }),
  ).toHaveValue("Português");
  await expect(dialogo.getByLabel(/professor/i)).toHaveCount(0);
  await dialogo
    .getByRole("textbox", { name: "Disciplina de segunda-feira", exact: true })
    .fill("Ciências");
  await dialogo
    .getByRole("textbox", { name: "Disciplina de terça-feira", exact: true })
    .fill("Geografia");
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
  await expect(
    dialogo.getByRole("textbox", { name: "Disciplina de segunda-feira", exact: true }),
  ).toHaveCount(0);
  const fechar = dialogo.getByRole("button", { name: "Fechar", exact: true });
  await expect(fechar).toBeEnabled();
  await fechar.click();
  await expect(dialogo).toBeHidden();

  let vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Segunda-feira");
  await expect(vista.getByText("Ciências", { exact: true })).toBeVisible();
  await expect(vista.getByText("Geografia", { exact: true })).toHaveCount(0);
  await page.reload();
  await aguardarHidratacao(page);
  vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Terça-feira");
  await expect(vista.getByText("Geografia", { exact: true })).toBeVisible();
  await expect(vista.getByText("Ciências", { exact: true })).toHaveCount(0);
  await expect(vista.getByText("07:00", { exact: false })).toBeVisible();
});

test.describe("falha de rede simulada", () => {
  // A suíte de PWA valida o service worker real; esta falha vem do transporte simulado.
  test.use({ serviceWorkers: "block" });

  test("uma recusa ao salvar mantém as disciplinas para corrigir e tentar novamente", async ({
    page,
  }) => {
    await page.goto("/");
    await aguardarHidratacao(page);
    const dialogo = await abrirGestaoDaTurma(page);
    await dialogo.getByRole("button", { name: "Editar aula 1", exact: true }).click();
    const disciplina = dialogo.getByRole("textbox", {
      name: "Disciplina de segunda-feira",
      exact: true,
    });
    await disciplina.fill("Ciências");
    await page.route("**/api/horarios/*", (rota) =>
      rota.request().method() === "PATCH"
        ? rota.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Não foi possível salvar a aula." }),
          })
        : rota.continue(),
    );
    const salvar = dialogo.getByRole("button", { name: "Salvar", exact: true });
    await salvar.click();
    await expect(
      dialogo.getByText("Não foi possível salvar a aula.", { exact: true }),
    ).toBeVisible();
    await expect(disciplina).toHaveValue("Ciências");
    await expect(
      dialogo.getByRole("textbox", { name: "Disciplina de terça-feira", exact: true }),
    ).toHaveValue("Português");
    await expect(salvar).toBeEnabled();
    await page.unroute("**/api/horarios/*");
    await salvar.click();
    await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
    const fechar = dialogo.getByRole("button", { name: "Fechar", exact: true });
    await expect(fechar).toBeEnabled();
    await fechar.click();
    await expect(dialogo).toBeHidden();
    const vista = await abrirHorarios(page);
    await escolherDia(page, vista, "Segunda-feira");
    await expect(vista.getByText("Ciências", { exact: true })).toBeVisible();
  });
});

test("no celular, a semana e a edição cabem na tela com os campos acessíveis", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await aguardarHidratacao(page);
  const navegacao = await abrirNavegacao(page);
  const secoes = await navegacao.getByRole("button").allTextContents();
  expect(secoes.indexOf("Horários")).toBe(secoes.indexOf("Chamada") + 1);
  const vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Semana completa");
  await expect(
    vista.getByRole("region", { name: "Aulas de Segunda-feira", exact: true }),
  ).toContainText("Matemática");
  await expect(
    vista.getByRole("region", { name: "Aulas de Terça-feira", exact: true }),
  ).toContainText("Português");
  await expect(vista.getByText("História", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("horarios-semana-celular", {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });

  const dialogo = await abrirGestaoDaTurma(page);
  await dialogo.getByRole("button", { name: "Editar aula 1", exact: true }).click();
  await page.setViewportSize({ width: 360, height: 480 });
  const disciplina = dialogo.getByRole("textbox", {
    name: "Disciplina de terça-feira",
    exact: true,
  });
  await disciplina.fill("Geografia");
  await expect(dialogo).toBeVisible();
  await expect(disciplina).toBeFocused();
  const salvar = dialogo.getByRole("button", { name: "Salvar", exact: true });
  await salvar.scrollIntoViewIfNeeded();
  await expect(salvar).toBeInViewport();
  const caixa = await dialogo.boundingBox();
  expect(caixa).not.toBeNull();
  expect(caixa?.x ?? -1).toBeGreaterThanOrEqual(0);
  expect((caixa?.x ?? 0) + (caixa?.width ?? 0)).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await salvar.click();
  await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
});

test.describe("consulta da coordenação", () => {
  test.use({ storageState: "tests/e2e/.auth/coordenacao.json" });

  test("consulta a semana por turma e dia sem controles de gestão nem aulas desativadas", async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?visao=horarios");
    await aguardarHidratacao(page);
    await expect(page.locator("main")).toHaveAttribute("data-visao", "horarios");
    await expect(
      page.getByRole("region", { name: "Horários semanais", exact: true }),
    ).toBeVisible();
    const navegacao = await abrirNavegacao(page);
    await expect(navegacao.getByRole("button", { name: "Gestão", exact: true })).toHaveCount(0);
    await expect(navegacao.getByRole("button", { name: "Horários", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const vista = await abrirHorarios(page);
    await escolherDia(page, vista, "Segunda-feira");
    await expect(vista.getByText("Matemática", { exact: true })).toBeVisible();
    await expect(vista.getByText("Sem disciplina", { exact: true })).toBeVisible();
    await expect(vista.getByText("Português", { exact: true })).toHaveCount(0);
    await expect(vista.getByText("História", { exact: true })).toHaveCount(0);
    await expect(vista.getByRole("button", { name: /editar|configurar|nova aula/i })).toHaveCount(
      0,
    );
    await escolherDia(page, vista, "Terça-feira");
    await expect(vista.getByText("Português", { exact: true })).toBeVisible();
    await expect(vista.getByText("Matemática", { exact: true })).toHaveCount(0);
    await escolherDia(page, vista, "Semana completa");
    await expect(
      vista.getByRole("table", { name: `Grade semanal de ${rotulo}`, exact: true }),
    ).toBeVisible();
    await expect(vista.getByText("História", { exact: true })).toHaveCount(0);
    await expect(vista.getByLabel(/professor/i)).toHaveCount(0);
    await info.attach("horarios-semana-desktop", {
      body: await page.screenshot({ animations: "disabled" }),
      contentType: "image/png",
    });
  });
});
