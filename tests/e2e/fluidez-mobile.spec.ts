// Regressões de fluidez no celular: busca, relatórios, foco e rolagem dos controles.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

const serie = "E2E Fluidez";
const turmaA = `${serie} A`;
const alvaro = "E2E Fluidez Álvaro";
const bruna = "E2E Fluidez Bruna";
const caio = "E2E Fluidez Caio";

test.use({ viewport: { width: 360, height: 740 }, serviceWorkers: "block" });

async function limpar(): Promise<void> {
  await comBanco(async (banco) => {
    await banco.query(
      "delete from frequencias where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
      [serie],
    );
    await banco.query(
      "delete from alunos where turma_id in (select id from turmas where serie_id in (select id from series where nome = $1))",
      [serie],
    );
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
      "insert into series (nome, ordem) values ($1, 98) returning id",
      [serie],
    );
    const turmas = await banco.query<{ id: string; nome: string }>(
      "insert into turmas (nome, serie_id) values ('A', $1), ('B', $1) returning id, nome",
      [criada.rows[0]?.id],
    );
    const idA = turmas.rows.find((turma) => turma.nome === "A")?.id;
    const idB = turmas.rows.find((turma) => turma.nome === "B")?.id;
    if (!idA || !idB) throw new Error("Turmas sintéticas não encontradas.");
    const aula = await banco.query<{ id: string }>(
      "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '00:00', '23:59', '{1,2,3,4,5,6,7}', true) returning id",
      [idA],
    );
    await banco.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) values ($1, $4, $4, 3), ($2, $4, $4, 1), ($3, $4, $4, 2)",
      [alvaro, bruna, caio, idA],
    );
    await banco.query(
      "insert into alunos (nome, turma_id, turma_original_id, ordem) select 'E2E Fluidez Lista ' || lpad(n::text, 2, '0'), $1, $1, n from generate_series(1, 32) n",
      [idB],
    );
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Fortaleza",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const mes = `${partes.find((parte) => parte.type === "year")?.value}-${partes.find((parte) => parte.type === "month")?.value}`;
    for (const [numero, justificativa] of [
      ["01", null],
      ["02", "D"],
    ] as const) {
      const frequencia = await banco.query<{ id: string }>(
        "insert into frequencias (turma_id, dia, atualizado_em) values ($1, $2::date, now()) returning id",
        [idA, `${mes}-${numero}`],
      );
      await banco.query(
        "insert into alunos_chamada (frequencia_id, aluno_id) select $1, id from alunos where turma_id = $2",
        [frequencia.rows[0]?.id, idA],
      );
      await banco.query(
        "insert into faltas (frequencia_id, aluno_id, horario_id, justificativa) select $1, id, $2, $3 from alunos where turma_id = $4 and nome = $5",
        [frequencia.rows[0]?.id, aula.rows[0]?.id, justificativa, idA, alvaro],
      );
    }
  });
});
test.afterEach(limpar);

async function abrirGestaoAlunos(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Alunos", exact: true }).click();
  return page.getByRole("tabpanel", { name: "Alunos", exact: true });
}

async function aguardarQuadros(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolver) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolver())),
      ),
  );
}

function painelDaTela(page: Page): Locator {
  return page.locator('[data-pager="principal"] > section:not([hidden])');
}

async function posicaoDaTela(page: Page): Promise<{ painel: number; janela: number }> {
  return {
    painel: await painelDaTela(page).evaluate((elemento) => elemento.scrollTop),
    janela: await page.evaluate(() => window.scrollY),
  };
}

test("buscar sem acento e limpar conserva a ordem do cadastro e permite editar", async ({
  page,
}) => {
  const painel = await abrirGestaoAlunos(page);
  const grupo = painel.getByRole("heading", { name: turmaA, exact: true }).locator("../..");
  const nomes = grupo.getByRole("listitem").locator("p.font-medium");
  await expect(nomes).toHaveText([bruna, caio, alvaro]);
  const busca = painel.getByRole("searchbox", {
    name: "Buscar aluno",
    exact: true,
  });
  await busca.pressSequentially("alvaro");
  await expect(busca).toBeFocused();
  await expect(nomes).toHaveText([alvaro]);
  await painel.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(nomes).toHaveText([bruna, caio, alvaro]);
  await grupo.getByRole("button", { name: `Editar ${alvaro}`, exact: true }).click();
  const dialogo = page.getByRole("dialog", {
    name: `Editar ${alvaro}`,
    exact: true,
  });
  await expect(dialogo.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue(alvaro);
  await dialogo.getByRole("combobox", { name: "Turma atual", exact: true }).click();
  const filtro = page.getByRole("textbox", {
    name: "Filtrar opções",
    exact: true,
  });
  await filtro.pressSequentially("e2e fluidez");
  await expect(
    page.getByRole("listbox", { name: "Opções", exact: true }).getByRole("option"),
  ).toHaveCount(2);
  await filtro.press("Escape");
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByRole("combobox", { name: "Turma atual", exact: true })).toBeFocused();
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Aluno atualizado.", { exact: true })).toBeVisible();
  await expect(painel.getByRole("button", { name: `Editar ${alvaro}`, exact: true })).toBeVisible();
});

test("selecionar todos respeita a busca e a edição usa os dados atuais da linha", async ({
  page,
}) => {
  const painel = await abrirGestaoAlunos(page);
  const busca = painel.getByRole("searchbox", {
    name: "Buscar aluno",
    exact: true,
  });
  await busca.fill("alvaro");
  await painel.getByRole("button", { name: "Definir origem", exact: true }).click();
  await painel.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await expect(painel.getByText("1 aluno selecionado", { exact: true })).toBeVisible();
  await expect(
    painel.getByRole("button", { name: `Selecionar ${alvaro}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await painel.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(
    painel.getByRole("button", { name: `Selecionar ${bruna}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    painel.getByRole("button", { name: `Selecionar ${caio}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    painel.getByRole("button", {
      name: /^Selecionar E2E Fluidez/,
      pressed: true,
    }),
  ).toHaveCount(1);
  await painel.getByRole("button", { name: "Cancelar", exact: true }).click();

  await busca.fill("bruna");
  await painel.getByRole("button", { name: "Definir origem", exact: true }).click();
  await painel.getByRole("button", { name: "Selecionar todos", exact: true }).click();
  await expect(painel.getByText("1 aluno selecionado", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(
    painel.getByRole("button", { name: `Selecionar ${bruna}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    painel.getByRole("button", { name: `Selecionar ${alvaro}`, exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    painel.getByRole("button", {
      name: /^Selecionar E2E Fluidez/,
      pressed: true,
    }),
  ).toHaveCount(1);
  await painel.getByRole("button", { name: "Cancelar", exact: true }).click();

  await painel.getByRole("button", { name: `Editar ${alvaro}`, exact: true }).click();
  const primeiro = page.getByRole("dialog", {
    name: `Editar ${alvaro}`,
    exact: true,
  });
  await expect(primeiro.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue(alvaro);
  await primeiro.getByRole("button", { name: "Cancelar", exact: true }).click();
  await painel.getByRole("button", { name: `Editar ${bruna}`, exact: true }).click();
  const dialogo = page.getByRole("dialog", {
    name: `Editar ${bruna}`,
    exact: true,
  });
  const nome = dialogo.getByRole("textbox", { name: "Nome", exact: true });
  await expect(nome).toHaveValue(bruna);
  const atualizado = `${bruna} Revisada`;
  await nome.fill(atualizado);
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Aluno atualizado.", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: `Editar ${atualizado}`, exact: true }).click();
  const reaberto = page.getByRole("dialog", {
    name: `Editar ${atualizado}`,
    exact: true,
  });
  await expect(reaberto.getByRole("textbox", { name: "Nome", exact: true })).toHaveValue(
    atualizado,
  );
  await reaberto.getByRole("button", { name: "Cancelar", exact: true }).click();
});

test("a busca e o filtro por turma preservam os totais e o detalhe do aluno", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Por aluno", exact: true }).click();
  const relatorio = page.getByRole("region", {
    name: "Relatório por aluno",
    exact: true,
  });
  await relatorio.locator("#por-aluno-turma").click();
  await page.getByRole("option", { name: turmaA, exact: true }).click();
  const linhas = relatorio.getByRole("listitem");
  await expect(linhas).toHaveCount(3);
  await expect(linhas.first()).toContainText(alvaro);
  const busca = relatorio.getByRole("searchbox", {
    name: "Buscar aluno",
    exact: true,
  });
  await busca.pressSequentially("alvaro");
  await expect(busca).toBeFocused();
  await expect(linhas).toHaveCount(1);
  const aluno = linhas.first().getByRole("button");
  await expect(aluno.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
  await expect(aluno.getByRole("img", { name: "1 falta justificada", exact: true })).toBeVisible();
  await aluno.click();
  await expect(aluno).toHaveAttribute("aria-expanded", "true");
  await expect(linhas.first().getByText(/^01\/\d{2}F$/)).toBeVisible();
  await expect(linhas.first().getByText(/^02\/\d{2}FJ$/)).toBeVisible();
  await relatorio.getByRole("button", { name: "Limpar busca", exact: true }).click();
  await expect(linhas).toHaveCount(3);
  await expect(linhas.first()).toContainText(alvaro);
  await expect(linhas.first().getByRole("button")).toHaveAttribute("aria-expanded", "true");
  await expect(relatorio.locator("#por-aluno-turma")).toContainText(turmaA);
  await expect(aluno.getByRole("img", { name: "1 falta", exact: true })).toBeVisible();
});

test("a grade suspende a consulta fora da aba e a retoma conservando turma, período e busca", async ({
  page,
}) => {
  const consultas: string[] = [];
  page.on("request", (pedido) => {
    const url = new URL(pedido.url());
    if (url.pathname === "/api/frequencias" && url.searchParams.has("de"))
      consultas.push(pedido.url());
  });
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Grade", exact: true }).click();
  const grade = page.getByRole("region", {
    name: "Grade de frequência",
    exact: true,
  });
  await grade.getByRole("button", { name: new RegExp(`^${turmaA} `) }).click();
  await grade.getByRole("searchbox", { name: "Buscar aluno", exact: true }).fill("alvaro");
  await grade.getByRole("combobox", { name: "Período da consulta", exact: true }).click();
  const primeira = page.waitForResponse((resposta) =>
    new URL(resposta.url()).searchParams.has("de"),
  );
  await page.getByRole("option", { name: "Um dia", exact: true }).click();
  await (await primeira).finished();
  await expect(
    grade.getByRole("button", { name: "Atualizar consulta", exact: true }),
  ).toBeEnabled();
  const antes = consultas.length;

  await page.getByRole("tab", { name: "Histórico", exact: true }).click();
  const historico = page.getByRole("region", {
    name: "Histórico de frequências",
    exact: true,
  });
  const mensal = page.waitForResponse((resposta) => {
    const url = new URL(resposta.url());
    return url.pathname === "/api/frequencias" && url.searchParams.has("mes");
  });
  await historico.getByRole("button", { name: "Mês anterior", exact: true }).click();
  await (await mensal).finished();
  await aguardarQuadros(page);
  expect(consultas).toHaveLength(antes);

  const retomada = page.waitForResponse((resposta) =>
    new URL(resposta.url()).searchParams.has("de"),
  );
  await page.getByRole("tab", { name: "Grade", exact: true }).click();
  await (await retomada).finished();
  await expect(grade.getByRole("searchbox", { name: "Buscar aluno", exact: true })).toHaveValue(
    "alvaro",
  );
  await expect(
    grade.getByRole("combobox", { name: "Período da consulta", exact: true }),
  ).toContainText("Um dia");
  await expect(grade.getByRole("button", { name: new RegExp(`^${turmaA} `) })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(grade.getByRole("row").filter({ hasText: alvaro })).toHaveCount(1);
  const aposAba = consultas.length;
  await trocarVisao(page, "Horários", "horarios");
  await aguardarQuadros(page);
  expect(consultas).toHaveLength(aposAba);
  const volta = page.waitForResponse((resposta) => new URL(resposta.url()).searchParams.has("de"));
  await trocarVisao(page, "Relatórios", "relatorios");
  await (await volta).finished();
  await expect(grade.getByRole("searchbox", { name: "Buscar aluno", exact: true })).toHaveValue(
    "alvaro",
  );
});

test("buscar e percorrer horários com teclado rola apenas o painel de opções", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 500 });
  await page.goto("/?visao=saidas&aba=saidas");
  await aguardarHidratacao(page);
  const aluno = page.locator("#saida-aluno");
  await aluno.scrollIntoViewIfNeeded();
  await painelDaTela(page).evaluate((elemento) => {
    elemento.scrollTop = Math.max(1, elemento.scrollTop);
  });
  await aluno.click();
  const busca = page.getByRole("textbox", {
    name: "Filtrar opções",
    exact: true,
  });
  await busca.fill("E2E Fluidez Lista");
  await expect(busca).toBeFocused();
  const lista = page.getByRole("listbox", { name: "Opções", exact: true });
  await expect(lista.getByRole("option")).toHaveCount(32);
  const posicaoBusca = await posicaoDaTela(page);
  expect(posicaoBusca.painel).toBeGreaterThan(0);
  for (let indice = 0; indice < 31; indice++) await busca.press("ArrowDown");
  await expect(busca).toBeFocused();
  await expect(lista.getByRole("option", { name: /E2E Fluidez Lista 32/ })).toBeInViewport();
  expect(await lista.evaluate((elemento) => elemento.scrollTop)).toBeGreaterThan(0);
  expect(await posicaoDaTela(page)).toEqual(posicaoBusca);
  await busca.press("Enter");
  await expect(aluno).toContainText("E2E Fluidez Lista 32");
  await expect(aluno).toBeFocused();

  const horario = page.locator("#saida-horario");
  await horario.scrollIntoViewIfNeeded();
  await horario.click();
  const painel = page.getByRole("dialog", {
    name: "Horário da saída",
    exact: true,
  });
  const horas = painel.getByRole("listbox", { name: "Horas", exact: true });
  const minutos = painel.getByRole("listbox", { name: "Minutos", exact: true });
  await expect(horas.getByRole("option", { selected: true })).toBeFocused();
  const posicaoHorario = await posicaoDaTela(page);
  await page.keyboard.press("End");
  await expect(horas.getByRole("option", { name: "23", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await expect(minutos.getByRole("option", { name: "59", exact: true })).toBeFocused();
  await expect(minutos.getByRole("option", { name: "59", exact: true })).toBeInViewport();
  expect(await posicaoDaTela(page)).toEqual(posicaoHorario);
  await page.keyboard.press("Enter");
  await expect(painel).toHaveCount(0);
  await expect(horario).toHaveText("23:59");
  await expect(horario).toBeFocused();
  await horario.click();
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(horario).toBeFocused();
  expect(await posicaoDaTela(page)).toEqual(posicaoHorario);
});

test("a confirmação de exclusão permite alcançar as ações na tela baixa e cancelar", async ({
  page,
}) => {
  const nomeCompleto =
    "E2E Fluidez Álvaro de Almeida Fernandes Rodrigues Monteiro Cavalcante Albuquerque Nascimento Silva";
  await comBanco((banco) =>
    banco.query(
      "update alunos set nome = $1 where nome = $2 and turma_id in (select id from turmas where serie_id in (select id from series where nome = $3))",
      [nomeCompleto, alvaro, serie],
    ),
  );
  const painel = await abrirGestaoAlunos(page);
  await painel.getByRole("button", { name: `Excluir ${nomeCompleto}`, exact: true }).click();
  const confirmacao = page.getByRole("alertdialog", {
    name: `Excluir ${nomeCompleto}?`,
    exact: true,
  });
  await expect(confirmacao).toBeVisible();
  await page.setViewportSize({ width: 360, height: 320 });
  await expect
    .poll(() =>
      confirmacao.evaluate((elemento) => {
        const caixa = elemento.getBoundingClientRect();
        return caixa.top >= 0 && caixa.bottom <= innerHeight;
      }),
    )
    .toBe(true);
  expect(
    await confirmacao.evaluate((elemento) => elemento.scrollHeight > elemento.clientHeight),
  ).toBe(true);
  const excluir = confirmacao.getByRole("button", {
    name: "Excluir",
    exact: true,
  });
  await excluir.scrollIntoViewIfNeeded();
  await expect(excluir).toBeInViewport();
  await expect(excluir).toBeEnabled();
  const cancelar = confirmacao.getByRole("button", {
    name: "Cancelar",
    exact: true,
  });
  await cancelar.scrollIntoViewIfNeeded();
  await expect(cancelar).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await cancelar.click();
  await expect(confirmacao).toHaveCount(0);
  await expect(
    painel.getByRole("button", { name: `Editar ${nomeCompleto}`, exact: true }),
  ).toBeVisible();
});
