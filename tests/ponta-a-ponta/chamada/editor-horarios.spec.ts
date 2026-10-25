// Editor semanal: acesso por turma, confirmação da grade, cópia e recuperação de falhas.
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { comBanco } from "../helpers/banco";
import { abrirNavegacao, aguardarHidratacao, trocarVisao } from "../helpers/pagina";

const serie = "E2E Editor Horários";
const origem = `${serie} A`;
const destino = `${serie} B`;
const conflito = `${serie} C`;

interface AulaNoBanco {
  id: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  disciplinas: Record<string, string>;
  ativo: boolean;
}

async function limpar(): Promise<void> {
  await comBanco(async (banco) => {
    await banco.query("delete from auditoria where acao like 'horario.%' and alvo like $1", [
      `%${serie}%`,
    ]);
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
    const serieId = criada.rows[0]?.id;
    if (!serieId) throw new Error("A série da massa do editor não foi criada.");
    const turmas = await banco.query<{ id: string; nome: string }>(
      "insert into turmas (nome, serie_id) values ('A', $1), ('B', $1), ('C', $1) returning id, nome",
      [serieId],
    );
    const turmaA = turmas.rows.find((turma) => turma.nome === "A")?.id;
    const turmaC = turmas.rows.find((turma) => turma.nome === "C")?.id;
    if (!turmaA || !turmaC) throw new Error("As turmas da massa do editor não foram criadas.");
    await banco.query(
      `insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo, disciplinas) values
         ($1, 1, '07:00', '07:50', '{1,2}', true, $2::jsonb),
         ($1, 2, '07:50', '08:40', '{1,2}', true, $3::jsonb),
         ($1, 3, '08:40', '09:30', '{1}', false, $4::jsonb),
         ($5, 2, '09:30', '10:20', '{3}', true, $6::jsonb)`,
      [
        turmaA,
        JSON.stringify({ "1": "Matemática", "2": "Português" }),
        JSON.stringify({ "1": "Artes", "2": "Geografia" }),
        JSON.stringify({ "1": "História" }),
        turmaC,
        JSON.stringify({ "3": "Educação Física" }),
      ],
    );
  });
});
test.afterEach(limpar);

async function aulasDaTurma(nome: string): Promise<AulaNoBanco[]> {
  return comBanco(async (banco) => {
    const resultado = await banco.query<AulaNoBanco>(
      `select h.id, h.ordem, h.inicio, h.fim, h.dias_semana as "diasSemana", h.disciplinas, h.ativo
       from horarios h join turmas t on t.id = h.turma_id join series s on s.id = t.serie_id
       where s.nome = $1 and t.nome = $2 order by h.ordem`,
      [serie, nome],
    );
    return resultado.rows;
  });
}

function observarGravacoes(page: Page): Request[] {
  const gravacoes: Request[] = [];
  page.on("request", (requisicao) => {
    if (
      new URL(requisicao.url()).pathname.startsWith("/api/horarios") &&
      ["POST", "PATCH", "DELETE"].includes(requisicao.method())
    )
      gravacoes.push(requisicao);
  });
  return gravacoes;
}

/** A edição fica em Gestão, Configurações, categoria Horários. */
async function abrirHorarios(page: Page, turma = origem): Promise<Locator> {
  await page.goto("/?visao=gestao");
  await aguardarHidratacao(page);
  await expect(page.locator("main")).toHaveAttribute("data-visao", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await page.locator("#categoria-config-horarios").click();
  const vista = page.getByRole("region", { name: "Edição de horários", exact: true });
  await vista.getByRole("combobox", { name: "Turma", exact: true }).click();
  await page.getByRole("option", { name: turma, exact: true }).click();
  await vista.getByRole("combobox", { name: "Dia da semana", exact: true }).click();
  await page.getByRole("option", { name: "Semana completa", exact: true }).click();
  return vista;
}

/** A consulta da aba Horários, sem controles de edição. */
async function abrirConsulta(page: Page, turma = origem): Promise<Locator> {
  await page.goto("/?visao=horarios");
  await aguardarHidratacao(page);
  await expect(page.locator("main")).toHaveAttribute("data-visao", "horarios");
  const vista = page.getByRole("region", { name: "Horários semanais", exact: true });
  await vista.getByRole("combobox", { name: "Turma", exact: true }).click();
  await page.getByRole("option", { name: turma, exact: true }).click();
  await vista.getByRole("combobox", { name: "Dia da semana", exact: true }).click();
  await page.getByRole("option", { name: "Semana completa", exact: true }).click();
  return vista;
}

async function abrirDialogo(page: Page, vista: Locator, turma = origem): Promise<Locator> {
  await vista.getByRole("button", { name: `Editar horários de ${turma}`, exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: `Horários de ${turma}`, exact: true });
  await expect(dialogo).toBeVisible();
  return dialogo;
}

async function selecionarOrigem(page: Page, dialogo: Locator): Promise<void> {
  await dialogo.getByRole("button", { name: "Copiar de outra turma", exact: true }).click();
  await dialogo.getByRole("combobox", { name: "Turma de origem", exact: true }).click();
  await page.getByRole("option", { name: origem, exact: true }).click();
  await expect(dialogo.getByText(`3 aulas de ${origem}`, { exact: true })).toBeVisible();
  await expect(dialogo.getByText("Desativada", { exact: true })).toBeVisible();
}

async function pedirConfirmacao(page: Page, formulario: Locator): Promise<Locator> {
  await formulario.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  const confirmacao = page.getByRole("alertdialog", {
    name: "Confirmar alterações na aula",
    exact: true,
  });
  await expect(confirmacao).toBeVisible();
  return confirmacao;
}

async function mudarHorario(page: Page, formulario: Locator, nome: string, valor: string) {
  const [hora, minuto] = valor.split(":");
  const rotulo = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  await formulario.getByRole("button", { name: new RegExp(`^${rotulo}:`) }).click();
  const painel = page
    .getByRole("dialog")
    .filter({ has: page.getByRole("listbox", { name: "Horas", exact: true }) });
  await painel
    .getByRole("listbox", { name: "Horas", exact: true })
    .getByRole("option", { name: hora ?? "", exact: true })
    .click();
  await painel
    .getByRole("listbox", { name: "Minutos", exact: true })
    .getByRole("option", { name: minuto ?? "", exact: true })
    .click();
  await expect(painel).toHaveCount(0);
  await expect(formulario.getByRole("button", { name: new RegExp(`^${rotulo}:`) })).toContainText(
    valor,
  );
}

test("abre o diálogo da turma selecionada e conta apenas aulas ativas na Gestão", async ({
  page,
}) => {
  const gravacoes = observarGravacoes(page);
  const vista = await abrirHorarios(page, conflito);
  let dialogo = await abrirDialogo(page, vista, conflito);
  await expect(dialogo.getByRole("button", { name: "Editar aula 1", exact: true })).toHaveCount(0);
  await dialogo.getByRole("button", { name: "Editar aula 2", exact: true }).click();
  const disciplina = dialogo.getByRole("textbox", {
    name: "Disciplina de quarta-feira",
    exact: true,
  });
  await disciplina.fill("Ciências");
  expect(gravacoes).toHaveLength(0);
  await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
  expect(gravacoes).toHaveLength(1);
  expect(gravacoes[0]?.method()).toBe("PATCH");
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Turmas", exact: true }).click();
  const turma = page.getByRole("listitem").filter({ has: page.getByText(origem, { exact: true }) });
  await expect(turma.getByText("2 aulas", { exact: true })).toBeVisible();
  await expect(turma.getByText("3 aulas", { exact: true })).toHaveCount(0);
  await turma.getByRole("button", { name: `Horários de ${origem}`, exact: true }).click();
  dialogo = page.getByRole("dialog", { name: `Horários de ${origem}`, exact: true });
  await dialogo.getByRole("button", { name: "Desativar aula 2", exact: true }).click();
  const confirmacao = page.getByRole("alertdialog");
  await expect(confirmacao).toBeVisible();
  expect(gravacoes).toHaveLength(1);
  await confirmacao.getByRole("button", { name: "Desativar", exact: true }).click();
  await expect(page.getByText("Aula desativada.", { exact: true })).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await expect(turma.getByText("1 aula", { exact: true })).toBeVisible();
  expect((await aulasDaTurma("A")).filter((aula) => aula.ativo)).toHaveLength(1);
  expect((await aulasDaTurma("C"))[0]?.disciplinas).toEqual({ "3": "Ciências" });
});

test("a grade do desktop descarta sem gravar e confirma a disciplina antes de persistir", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const antes = await aulasDaTurma("A");
  const gravacoes = observarGravacoes(page);
  let vista = await abrirHorarios(page);
  const editar = vista.getByRole("button", {
    name: "Editar disciplina da 1ª aula de Segunda-feira",
    exact: true,
  });
  await editar.click();
  let formulario = vista.getByRole("form", {
    name: "Editar 1ª aula de Segunda-feira",
    exact: true,
  });
  await formulario.getByRole("textbox", { name: "Disciplina", exact: true }).fill("Ciências");
  expect(gravacoes).toHaveLength(0);
  await formulario.getByRole("button", { name: "Cancelar", exact: true }).click();
  const descarte = page.getByRole("alertdialog", { name: "Descartar alterações?", exact: true });
  await descarte.getByRole("button", { name: "Descartar alterações", exact: true }).click();
  await expect(formulario).toHaveCount(0);
  expect(gravacoes).toHaveLength(0);
  expect(await aulasDaTurma("A")).toEqual(antes);

  await editar.click();
  formulario = vista.getByRole("form", { name: "Editar 1ª aula de Segunda-feira", exact: true });
  await formulario.getByRole("textbox", { name: "Disciplina", exact: true }).fill("Ciências");
  let confirmacao = await pedirConfirmacao(page, formulario);
  expect(gravacoes).toHaveLength(0);
  await confirmacao.getByRole("button", { name: "Voltar à edição", exact: true }).click();
  await expect(formulario.getByRole("textbox", { name: "Disciplina", exact: true })).toHaveValue(
    "Ciências",
  );
  expect(gravacoes).toHaveLength(0);
  await info.attach("editor-horarios-grade-desktop", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  confirmacao = await pedirConfirmacao(page, formulario);
  await confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true }).click();
  await expect(formulario).toHaveCount(0);
  await expect(vista.getByText("Ciências", { exact: true }).locator("visible=true")).toBeVisible();
  expect(gravacoes).toHaveLength(1);
  const atual = await aulasDaTurma("A");
  expect(atual[0]?.disciplinas).toEqual({ "1": "Ciências", "2": "Português" });
  expect(atual[0]?.id).toBe(antes[0]?.id);
  expect(atual.slice(1)).toEqual(antes.slice(1));
  vista = await abrirHorarios(page);
  await expect(vista.getByText("Ciências", { exact: true }).locator("visible=true")).toBeVisible();
  await expect(vista.getByText("Português", { exact: true }).locator("visible=true")).toBeVisible();
});

test("a janela da aula no desktop só muda depois da confirmação", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const antes = await aulasDaTurma("A");
  const gravacoes = observarGravacoes(page);
  const vista = await abrirHorarios(page);
  await vista.getByRole("button", { name: "Editar horário da 1ª aula", exact: true }).click();
  const formulario = vista.getByRole("form", { name: "Editar 1ª aula", exact: true });
  await mudarHorario(page, formulario, "Início da aula", "07:10");
  await mudarHorario(page, formulario, "Fim da aula", "07:55");
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(formulario).toBeVisible();
  await expect(formulario.getByRole("button", { name: /^Início da aula:/ })).toContainText("07:10");
  await expect(formulario.getByRole("button", { name: /^Fim da aula:/ })).toContainText("07:55");
  expect(gravacoes).toHaveLength(0);
  expect(await aulasDaTurma("A")).toEqual(antes);
  const confirmacao = await pedirConfirmacao(page, formulario);
  expect(gravacoes).toHaveLength(0);
  await confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true }).click();
  await expect(formulario).toHaveCount(0);
  const atual = await aulasDaTurma("A");
  expect(atual[0]).toEqual({ ...antes[0], inicio: "07:10", fim: "07:55" });
  expect(atual.slice(1)).toEqual(antes.slice(1));
  expect(gravacoes).toHaveLength(1);
});

test("os cartões do celular editam disciplina e janela com campos e confirmação acessíveis", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const gravacoes = observarGravacoes(page);
  const vista = await abrirHorarios(page);
  await vista.getByRole("button", { name: "Editar 1ª aula de Segunda-feira", exact: true }).click();
  const formulario = vista.getByRole("form", {
    name: "Editar 1ª aula de Segunda-feira",
    exact: true,
  });
  const disciplina = formulario.getByRole("textbox", { name: "Disciplina", exact: true });
  await disciplina.fill("Ciências");
  await page.setViewportSize({ width: 360, height: 480 });
  await expect(disciplina).toBeFocused();
  await mudarHorario(page, formulario, "Início da aula", "07:10");
  expect(gravacoes).toHaveLength(0);
  const salvar = formulario.getByRole("button", { name: "Salvar alterações", exact: true });
  await salvar.scrollIntoViewIfNeeded();
  await expect(salvar).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await info.attach("editor-horarios-grade-celular", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  const confirmacao = await pedirConfirmacao(page, formulario);
  const confirmar = confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true });
  await confirmar.scrollIntoViewIfNeeded();
  await expect(confirmar).toBeInViewport();
  await confirmar.click();
  await expect(formulario).toHaveCount(0);
  const atual = await aulasDaTurma("A");
  expect(atual[0]?.inicio).toBe("07:10");
  expect(atual[0]?.disciplinas).toEqual({ "1": "Ciências", "2": "Português" });
  expect(gravacoes).toHaveLength(1);
  await expect(vista.getByText("Ciências", { exact: true }).locator("visible=true")).toBeVisible();
});

test("a desativação em outra área mantém o rascunho acessível para descartar e libera a grade", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 740 });
  const antes = await aulasDaTurma("A");
  const gravacoes = observarGravacoes(page);
  const vista = await abrirHorarios(page);
  await vista.getByRole("button", { name: "Editar 1ª aula de Segunda-feira", exact: true }).click();
  const formulario = vista.getByRole("form", {
    name: "Editar 1ª aula de Segunda-feira",
    exact: true,
  });
  const disciplina = formulario.getByRole("textbox", { name: "Disciplina", exact: true });
  await disciplina.fill("Ciências");
  const navegacao = await abrirNavegacao(page);
  await navegacao.getByRole("button", { name: "Painel", exact: true }).click();
  const avisoSaida = page.getByRole("alertdialog", {
    name: "Há alterações não salvas nos Horários",
    exact: true,
  });
  await expect(avisoSaida).toBeVisible();
  expect(gravacoes).toHaveLength(0);
  await avisoSaida.getByRole("button", { name: "Mudar de tela", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-visao", "painel");
  await trocarVisao(page, "Gestão", "gestao");
  await expect(formulario).toBeVisible();
  await page.getByRole("tab", { name: "Turmas", exact: true }).click();
  await page.getByRole("button", { name: `Horários de ${origem}`, exact: true }).click();
  const dialogo = page.getByRole("dialog", { name: `Horários de ${origem}`, exact: true });
  await dialogo.getByRole("button", { name: "Desativar aula 1", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Desativar", exact: true })
    .click();
  await expect(page.getByText("Aula desativada.", { exact: true })).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await expect(
    vista.getByText("Esta aula não está mais disponível na grade.", { exact: true }),
  ).toBeVisible();
  await expect(formulario).toBeVisible();
  await expect(disciplina).toHaveValue("Ciências");
  await expect(disciplina).toBeDisabled();
  await expect(
    formulario.getByRole("button", { name: "Salvar alterações", exact: true }),
  ).toBeDisabled();
  expect(gravacoes).toHaveLength(1);
  await formulario.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page
    .getByRole("alertdialog", { name: "Descartar alterações?", exact: true })
    .getByRole("button", { name: "Descartar alterações", exact: true })
    .click();
  await expect(formulario).toHaveCount(0);
  await expect(vista.getByRole("combobox", { name: "Turma", exact: true })).toBeEnabled();
  await expect(vista.getByRole("combobox", { name: "Dia da semana", exact: true })).toBeEnabled();
  await expect(
    vista.getByRole("button", { name: "Editar 2ª aula de Segunda-feira", exact: true }),
  ).toBeEnabled();
  expect(gravacoes).toHaveLength(1);
  const atual = await aulasDaTurma("A");
  expect(atual[0]).toEqual({ ...antes[0], ativo: false });
  expect(atual.slice(1)).toEqual(antes.slice(1));
});

test("a cópia exige confirmação e preserva dias, disciplinas e aulas desativadas", async ({
  page,
}, info) => {
  const antes = await aulasDaTurma("A");
  const gravacoes = observarGravacoes(page);
  const vista = await abrirHorarios(page, destino);
  let dialogo = await abrirDialogo(page, vista, destino);
  await selecionarOrigem(page, dialogo);
  expect(gravacoes).toHaveLength(0);
  expect(await aulasDaTurma("B")).toEqual([]);
  await dialogo.getByRole("button", { name: "Copiar grade", exact: true }).click();
  let confirmacao = page.getByRole("alertdialog", { name: "Copiar grade?", exact: true });
  await expect(confirmacao).toBeVisible();
  expect(gravacoes).toHaveLength(0);
  await confirmacao.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    dialogo.getByRole("combobox", { name: "Turma de origem", exact: true }),
  ).toContainText(origem);
  expect(await aulasDaTurma("B")).toEqual([]);
  await info.attach("editor-horarios-copia-previa", {
    body: await page.screenshot({ animations: "disabled" }),
    contentType: "image/png",
  });
  await dialogo.getByRole("button", { name: "Copiar grade", exact: true }).click();
  confirmacao = page.getByRole("alertdialog", { name: "Copiar grade?", exact: true });
  await confirmacao.getByRole("button", { name: "Confirmar cópia", exact: true }).click();
  await expect(dialogo.getByRole("button", { name: "Editar aula 3", exact: true })).toBeVisible();
  expect(gravacoes).toHaveLength(1);
  expect(new URL(gravacoes[0]?.url() ?? "http://localhost").pathname).toBe("/api/horarios/copiar");
  const copiada = await aulasDaTurma("B");
  expect(copiada.map(({ id: _id, ...aula }) => aula)).toEqual(
    antes.map(({ id: _id, ...aula }) => aula),
  );
  for (const aula of copiada) expect(antes.map((item) => item.id)).not.toContain(aula.id);
  expect(await aulasDaTurma("A")).toEqual(antes);
  await page.reload();
  await aguardarHidratacao(page);
  const recarregada = await abrirHorarios(page, destino);
  dialogo = await abrirDialogo(page, recarregada, destino);
  await expect(dialogo.getByRole("button", { name: "Ativar aula 3", exact: true })).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Editar aula 2", exact: true })).toBeVisible();
});

test("um conflito de ordem recusa a grade inteira e mantém as duas turmas", async ({ page }) => {
  const antesOrigem = await aulasDaTurma("A");
  const antesDestino = await aulasDaTurma("C");
  const vista = await abrirHorarios(page, conflito);
  const dialogo = await abrirDialogo(page, vista, conflito);
  await selecionarOrigem(page, dialogo);
  await dialogo.getByRole("button", { name: "Copiar grade", exact: true }).click();
  const resposta = page.waitForResponse(
    (resposta) =>
      new URL(resposta.url()).pathname === "/api/horarios/copiar" &&
      resposta.request().method() === "POST",
  );
  await page
    .getByRole("alertdialog", { name: "Copiar grade?", exact: true })
    .getByRole("button", { name: "Confirmar cópia", exact: true })
    .click();
  expect((await resposta).status()).toBe(409);
  await expect(
    dialogo.getByText("A turma de destino já tem a aula 2. Nenhuma aula foi copiada.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Copiar grade", exact: true })).toBeEnabled();
  await expect(
    dialogo.getByRole("combobox", { name: "Turma de origem", exact: true }),
  ).toContainText(origem);
  expect(await aulasDaTurma("C")).toEqual(antesDestino);
  expect(await aulasDaTurma("A")).toEqual(antesOrigem);
  await expect(dialogo.getByRole("button", { name: "Editar aula 1", exact: true })).toHaveCount(0);
});

test.describe("recuperação de falha de transporte", () => {
  // Os mocks ficam fora do service worker real, coberto pela suíte própria de PWA.
  test.use({ serviceWorkers: "block" });

  test("a falha de edição mantém os campos e exige nova confirmação para tentar novamente", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const antes = await aulasDaTurma("A");
    const gravacoes = observarGravacoes(page);
    const vista = await abrirHorarios(page);
    await vista
      .getByRole("button", { name: "Editar 1ª aula de Segunda-feira", exact: true })
      .click();
    const formulario = vista.getByRole("form", {
      name: "Editar 1ª aula de Segunda-feira",
      exact: true,
    });
    const disciplina = formulario.getByRole("textbox", { name: "Disciplina", exact: true });
    await disciplina.fill("Ciências");
    await mudarHorario(page, formulario, "Fim da aula", "07:55");
    await page.route("**/api/horarios/*", (rota) =>
      rota.request().method() === "PATCH"
        ? rota.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Não foi possível salvar a aula." }),
          })
        : rota.continue(),
    );
    let confirmacao = await pedirConfirmacao(page, formulario);
    await confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true }).click();
    await expect(
      formulario.getByText("Não foi possível salvar a aula.", { exact: true }),
    ).toBeVisible();
    await expect(disciplina).toHaveValue("Ciências");
    await expect(formulario.getByRole("button", { name: /^Fim da aula:/ })).toContainText("07:55");
    expect(await aulasDaTurma("A")).toEqual(antes);
    expect(gravacoes).toHaveLength(1);
    await page.unroute("**/api/horarios/*");
    confirmacao = await pedirConfirmacao(page, formulario);
    expect(gravacoes).toHaveLength(1);
    await confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true }).click();
    await expect(formulario).toHaveCount(0);
    expect(gravacoes).toHaveLength(2);
    expect((await aulasDaTurma("A"))[0]).toEqual({
      ...antes[0],
      fim: "07:55",
      disciplinas: { "1": "Ciências", "2": "Português" },
    });
  });

  test("a falha de cópia mantém a origem e permite confirmar novamente sem grade parcial", async ({
    page,
  }) => {
    const gravacoes = observarGravacoes(page);
    const vista = await abrirHorarios(page, destino);
    const dialogo = await abrirDialogo(page, vista, destino);
    await selecionarOrigem(page, dialogo);
    await page.route("**/api/horarios/copiar", (rota) =>
      rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Não foi possível copiar a grade." }),
      }),
    );
    await dialogo.getByRole("button", { name: "Copiar grade", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: "Copiar grade?", exact: true })
      .getByRole("button", { name: "Confirmar cópia", exact: true })
      .click();
    await expect(
      dialogo.getByText("Não foi possível copiar a grade.", { exact: true }),
    ).toBeVisible();
    await expect(
      dialogo.getByRole("combobox", { name: "Turma de origem", exact: true }),
    ).toContainText(origem);
    expect(await aulasDaTurma("B")).toEqual([]);
    expect(gravacoes).toHaveLength(1);
    await page.unroute("**/api/horarios/copiar");
    await page.route("**/api/turmas", (rota) =>
      rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "A leitura da grade falhou." }),
      }),
    );
    await dialogo.getByRole("button", { name: "Copiar grade", exact: true }).click();
    await page
      .getByRole("alertdialog", { name: "Copiar grade?", exact: true })
      .getByRole("button", { name: "Confirmar cópia", exact: true })
      .click();
    await expect(
      page.getByText("Recarregue a página para visualizar os horários atualizados.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Grade copiada.", { exact: true }).first()).toBeVisible();
    expect(await aulasDaTurma("B")).toHaveLength(3);
    expect(gravacoes).toHaveLength(2);
    await page.unroute("**/api/turmas");
    const recarregada = await abrirHorarios(page, destino);
    const dialogoRecarregado = await abrirDialogo(page, recarregada, destino);
    await expect(
      dialogoRecarregado.getByRole("button", { name: "Editar aula 3", exact: true }),
    ).toBeVisible();
    expect(gravacoes).toHaveLength(2);
  });

  test("a falha de leitura após salvar pelo diálogo preserva o sucesso sem repetir a gravação", async ({
    page,
  }) => {
    const gravacoes = observarGravacoes(page);
    const vista = await abrirHorarios(page, conflito);
    const dialogo = await abrirDialogo(page, vista, conflito);
    await dialogo.getByRole("button", { name: "Editar aula 2", exact: true }).click();
    const disciplina = dialogo.getByRole("textbox", {
      name: "Disciplina de quarta-feira",
      exact: true,
    });
    await disciplina.fill("Ciências");
    await page.route("**/api/turmas", (rota) =>
      rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "A leitura da grade falhou." }),
      }),
    );
    await dialogo.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
    await expect(page.getByText("Alteração salva.", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Recarregue a página para visualizar os horários atualizados.", {
        exact: true,
      }),
    ).toBeVisible();
    await expect(disciplina).toHaveCount(0);
    await expect(dialogo.getByText("Não foi possível salvar a aula.", { exact: true })).toHaveCount(
      0,
    );
    expect(gravacoes).toHaveLength(1);
    expect((await aulasDaTurma("C"))[0]?.disciplinas).toEqual({ "3": "Ciências" });
    await page.unroute("**/api/turmas");
    const recarregada = await abrirHorarios(page, conflito);
    const dialogoRecarregado = await abrirDialogo(page, recarregada, conflito);
    await dialogoRecarregado.getByRole("button", { name: "Editar aula 2", exact: true }).click();
    await expect(
      dialogoRecarregado.getByRole("textbox", {
        name: "Disciplina de quarta-feira",
        exact: true,
      }),
    ).toHaveValue("Ciências");
    expect(gravacoes).toHaveLength(1);
  });

  test("a falha de leitura após confirmar a grade não recupera um rascunho já salvo", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const gravacoes = observarGravacoes(page);
    const vista = await abrirHorarios(page);
    await vista
      .getByRole("button", { name: "Editar 1ª aula de Segunda-feira", exact: true })
      .click();
    const formulario = vista.getByRole("form", {
      name: "Editar 1ª aula de Segunda-feira",
      exact: true,
    });
    await formulario.getByRole("textbox", { name: "Disciplina", exact: true }).fill("Ciências");
    await page.route("**/api/turmas", (rota) =>
      rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "A leitura da grade falhou." }),
      }),
    );
    const confirmacao = await pedirConfirmacao(page, formulario);
    await confirmacao.getByRole("button", { name: "Confirmar alterações", exact: true }).click();
    await expect(page.getByText("Horário atualizado.", { exact: true })).toBeVisible();
    await expect(page.getByText("A leitura da grade falhou.", { exact: true })).toBeVisible();
    await expect(formulario).toHaveCount(0);
    await expect(page.getByText("Não foi possível salvar a aula.", { exact: true })).toHaveCount(0);
    expect((await aulasDaTurma("A"))[0]?.disciplinas).toEqual({
      "1": "Ciências",
      "2": "Português",
    });
    expect(gravacoes).toHaveLength(1);
    await page.unroute("**/api/turmas");
    const recarregada = await abrirHorarios(page);
    await expect(
      recarregada.getByText("Ciências", { exact: true }).locator("visible=true"),
    ).toBeVisible();
    expect(gravacoes).toHaveLength(1);
  });
});

test.describe("consulta pela coordenação", () => {
  test.use({ storageState: "tests/ponta-a-ponta/.auth/coordenacao.json" });

  test("mantém a consulta semanal sem edição, cópia nem aulas desativadas", async ({ page }) => {
    const vista = await abrirConsulta(page);
    await expect(
      vista.getByText("Matemática", { exact: true }).locator("visible=true"),
    ).toBeVisible();
    await expect(
      vista.getByText("Português", { exact: true }).locator("visible=true"),
    ).toBeVisible();
    await expect(vista.getByText("História", { exact: true })).toHaveCount(0);
    await expect(vista.getByRole("button", { name: /editar|copiar|salvar/i })).toHaveCount(0);
    await expect(vista.getByRole("textbox")).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: `Horários de ${origem}`, exact: true }),
    ).toHaveCount(0);
  });
});
