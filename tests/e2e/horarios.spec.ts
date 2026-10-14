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

async function abrirEdicaoDeHorarios(page: Page): Promise<Locator> {
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await page.locator("#categoria-config-horarios").click();
  const vista = page.getByRole("region", { name: "Edição de horários", exact: true });
  await vista.getByRole("combobox", { name: "Turma", exact: true }).click();
  await page.getByRole("option", { name: rotulo, exact: true }).click();
  return vista;
}

async function abrirGestaoDaTurma(page: Page): Promise<Locator> {
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Turmas", exact: true }).click();
  await page.getByRole("button", { name: `Horários de ${rotulo}`, exact: true }).click();
  return page.getByRole("dialog", { name: `Horários de ${rotulo}`, exact: true });
}

test("no celular, a consulta termina com folga abaixo do último cartão", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await comBanco((banco) =>
    banco.query(
      `insert into horarios (turma_id,ordem,inicio,fim,dias_semana,disciplinas)
       select t.id,a.ordem,a.inicio,a.fim,'{1}','{}'::jsonb
       from turmas t join series s on s.id=t.serie_id
       cross join (values (4,'09:20','10:10'),(5,'10:10','11:00'),(6,'11:00','11:50'),(7,'11:50','12:40')) as a(ordem,inicio,fim)
       where s.nome=$1`,
      [serie],
    ),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  const vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Segunda-feira");
  const pagina = vista.locator("xpath=ancestor::section[contains(@class,'pagina-painel')]");
  await pagina.evaluate((elemento) => elemento.scrollTo(0, elemento.scrollHeight));
  const cartao = vista.getByRole("region", { name: "Aulas de Segunda-feira · Manhã", exact: true });
  await expect(cartao).toBeInViewport({ ratio: 1 });
  const caixaCartao = await cartao.boundingBox();
  const caixaPagina = await pagina.boundingBox();
  const folga =
    (caixaPagina?.y ?? 0) +
    (caixaPagina?.height ?? 0) -
    ((caixaCartao?.y ?? 0) + (caixaCartao?.height ?? 0));
  expect(folga).toBeGreaterThanOrEqual(16);
});

test("separa manhã, almoço e tarde na consulta, sem controles de edição", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await comBanco((banco) =>
    banco.query(
      `insert into horarios (turma_id,ordem,inicio,fim,dias_semana,disciplinas)
       select t.id,a.ordem,a.inicio,a.fim,'{1}',a.disciplinas::jsonb
       from turmas t join series s on s.id=t.serie_id
       cross join (values
         (4,'13:00','13:50','{"1":"Física"}'),
         (5,'11:50','12:10','{"1":"Atividade cadastrada no almoço"}')
       ) as a(ordem,inicio,fim,disciplinas)
       where s.nome=$1`,
      [serie],
    ),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  const vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Segunda-feira");
  const manha = vista.getByRole("tab", { name: "Manhã", exact: true });
  const tarde = vista.getByRole("tab", { name: "Tarde", exact: true });
  await expect(manha).toHaveAttribute("aria-selected", "true");
  await expect(vista.getByText("Matemática", { exact: true })).toBeVisible();
  await expect(vista.getByText("Física", { exact: true })).toBeHidden();
  const almocoDaManha = vista.getByRole("listitem").filter({ hasText: /^Almoço/ });
  await expect(almocoDaManha).toContainText("11:50 às 13:00");
  await expect(vista.getByText("Atividade cadastrada no almoço", { exact: true })).toBeVisible();
  await tarde.click();
  await expect(tarde).toHaveAttribute("aria-selected", "true");
  await expect(vista.getByText("Física", { exact: true })).toBeVisible();
  await expect(vista.getByText("Matemática", { exact: true })).toBeHidden();
  await tarde.press("ArrowLeft");
  await expect(manha).toBeFocused();
  await expect(vista.getByText("Matemática", { exact: true })).toBeVisible();
  await expect(vista.getByRole("button", { name: /editar/i })).toHaveCount(0);
  await expect(vista.getByRole("form")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("horarios-turno-tarde", {
    body: await page.screenshot({ animations: "disabled", fullPage: true }),
    contentType: "image/png",
  });
  await escolherDia(page, vista, "Semana completa");
  await expect(vista.getByRole("tab", { name: "Manhã", exact: true })).toHaveCount(0);
  await expect(vista.getByText("Física", { exact: true }).filter({ visible: true })).toBeVisible();
});

test("mostra intervalos e almoço na posição do horário, nos dois turnos e na semana", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await comBanco((banco) =>
    banco.query(
      `insert into horarios (turma_id,ordem,inicio,fim,dias_semana,disciplinas)
       select t.id,a.ordem,a.inicio,a.fim,'{1}','{}'::jsonb
       from turmas t join series s on s.id=t.serie_id
       cross join (values
         (4,'09:20','10:10'),(5,'10:10','11:00'),(6,'11:00','11:50'),
         (7,'13:00','13:50'),(8,'13:50','14:40'),(9,'14:55','15:45')
       ) as a(ordem,inicio,fim)
       where s.nome=$1`,
      [serie],
    ),
  );
  await page.goto("/");
  await aguardarHidratacao(page);
  const vista = await abrirHorarios(page);
  await escolherDia(page, vista, "Segunda-feira");
  const textos = async (turno: string) => {
    const itens = vista
      .getByRole("region", { name: `Aulas de Segunda-feira · ${turno}`, exact: true })
      .getByRole("listitem");
    await expect(itens.first()).toBeVisible();
    return (await itens.allInnerTexts()).map((texto) => texto.replace(/\s+/g, " ").trim());
  };
  const manha = await textos("Manhã");
  expect(manha.findIndex((texto) => texto.startsWith("Intervalo"))).toBe(2);
  expect(manha[2]).toContain("09:00 às 09:20");
  expect(manha[manha.length - 1]).toMatch(/^Almoço.*11:50 às 13:00$/);
  await vista.getByRole("tab", { name: "Tarde", exact: true }).click();
  const tarde = await textos("Tarde");
  expect(tarde[0]).toMatch(/^Almoço.*11:50 às 13:00$/);
  expect(tarde[3]).toMatch(/^Intervalo.*14:40 às 14:55$/);
  expect(tarde).toHaveLength(5);
  await escolherDia(page, vista, "Semana completa");
  const grade = vista.getByRole("table", { name: `Grade semanal de ${rotulo}`, exact: true });
  await expect(grade.getByRole("row", { name: /^Intervalo.*09:00 às 09:20/ })).toBeVisible();
  await expect(grade.getByRole("row", { name: /^Almoço.*11:50 às 13:00/ })).toBeVisible();
  await expect(grade.getByRole("row", { name: /^Intervalo.*14:40 às 14:55/ })).toBeVisible();
});

test("a edição fica em Gestão, Configurações, e a consulta mostra a mudança", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await aguardarHidratacao(page);
  const edicao = await abrirEdicaoDeHorarios(page);
  await escolherDia(page, edicao, "Segunda-feira");
  const manha = edicao.getByRole("tab", { name: "Manhã", exact: true });
  const tarde = edicao.getByRole("tab", { name: "Tarde", exact: true });
  await edicao
    .getByRole("button", { name: "Editar 1ª aula de Segunda-feira", exact: true })
    .click();
  const formulario = edicao.getByRole("form", {
    name: "Editar 1ª aula de Segunda-feira",
    exact: true,
  });
  const disciplina = formulario.getByRole("textbox", { name: "Disciplina", exact: true });
  await expect(disciplina).toBeEnabled();
  await disciplina.fill("Ciências");
  await expect(manha).toBeDisabled();
  await expect(tarde).toBeDisabled();
  await expect(disciplina).toHaveValue("Ciências");
  await formulario.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Confirmar alterações na aula", exact: true })
    .getByRole("button", { name: "Confirmar alterações", exact: true })
    .click();
  await expect(edicao.getByText("Ciências", { exact: true })).toBeVisible();
  await expect(tarde).toBeEnabled();
  const consulta = await abrirHorarios(page);
  await escolherDia(page, consulta, "Segunda-feira");
  await expect(consulta.getByText("Ciências", { exact: true })).toBeVisible();
  await expect(consulta.getByRole("button", { name: /editar/i })).toHaveCount(0);
});

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
  // A Chamada Parcial é item próprio logo abaixo de Chamada, e Horários vem em seguida.
  expect(secoes.indexOf("Chamada Parcial")).toBe(secoes.indexOf("Chamada") + 1);
  expect(secoes.indexOf("Horários")).toBe(secoes.indexOf("Chamada Parcial") + 1);
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

  test("abre a tarde quando não há manhã e mostra turnos vazios sem esconder a semana", async ({
    page,
  }) => {
    await comBanco(async (banco) => {
      await banco.query(
        "update horarios set dias_semana='{1}' where turma_id in (select t.id from turmas t join series s on s.id=t.serie_id where s.nome=$1)",
        [serie],
      );
      await banco.query(
        `insert into horarios (turma_id,ordem,inicio,fim,dias_semana,disciplinas)
         select t.id,4,'13:00','13:50','{2}','{"2":"Física"}'::jsonb
         from turmas t join series s on s.id=t.serie_id where s.nome=$1`,
        [serie],
      );
    });
    await page.goto("/");
    await aguardarHidratacao(page);
    const vista = await abrirHorarios(page);
    await escolherDia(page, vista, "Terça-feira");
    await expect(vista.getByRole("tab", { name: "Tarde", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(vista.getByText("Física", { exact: true })).toBeVisible();
    await vista.getByRole("tab", { name: "Manhã", exact: true }).click();
    await expect(vista.getByText("Sem aulas neste turno.", { exact: true })).toBeVisible();
    await escolherDia(page, vista, "Quarta-feira");
    await expect(vista.getByText("Sem aulas neste turno.", { exact: true })).toBeVisible();
    await expect(vista.getByRole("button", { name: /editar|configurar/i })).toHaveCount(0);
  });

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
