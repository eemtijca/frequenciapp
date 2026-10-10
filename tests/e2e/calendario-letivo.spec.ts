// Calendário anual de feriados: cadastro, bloqueio de chamadas e proteção do histórico.
// A massa usa nomes próprios e datas livres, sem apagar registros preexistentes.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaLocal } from "@/domain/frequencia";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao, escolherTurmaNaChamada, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });

const PREFIXO = "E2E Calendário";
const DIA_ANUAL = "1994-05-02";
const NOME_ANUAL = `${PREFIXO} do ano de 1994`;
let turmaId = "";
let alunoId = "";
let diaUtil = "";
let sabado = "";
let diaProtegido = "";

async function limparRegistros(): Promise<void> {
  await comBanco(async (cliente) => {
    await cliente.query("delete from feriados where nome like $1", [`${PREFIXO}%`]);
    await cliente.query("delete from frequencias_parciais where aluno_nome like $1", [
      `${PREFIXO}%`,
    ]);
    await cliente.query(
      "delete from frequencias where turma_id in (select t.id from turmas t join series s on s.id = t.serie_id where s.nome = $1)",
      [PREFIXO],
    );
  });
}

async function limparMassa(): Promise<void> {
  await limparRegistros();
  await comBanco(async (cliente) => {
    await cliente.query("delete from alunos where nome like $1", [`${PREFIXO}%`]);
    await cliente.query(
      "delete from turmas where serie_id in (select id from series where nome = $1)",
      [PREFIXO],
    );
    await cliente.query("delete from series where nome = $1", [PREFIXO]);
  });
}

async function escolherDia(
  page: Page,
  secao: Locator,
  id: string,
  rotuloAcessivel: string,
  dia: string,
): Promise<void> {
  const gatilho = secao.locator(`#${id}`);
  const diaFormatado = dia.split("-").reverse().join("/");
  if ((await gatilho.getAttribute("aria-label"))?.includes(diaFormatado)) return;
  await gatilho.click();
  const calendario = page.getByRole("dialog", { name: rotuloAcessivel, exact: true });
  const data = new Date(`${dia}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  const mesCompleto = `${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  const nomesDosMeses = Array.from({ length: 12 }, (_, indice) =>
    new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" }).format(
      new Date(Date.UTC(2000, indice, 1)),
    ),
  );
  for (let indice = 0; indice < 12; indice += 1) {
    if (
      await calendario.getByRole("group", { name: `Dias de ${mesCompleto}`, exact: true }).count()
    )
      break;
    const grade = calendario.getByRole("group", { name: /^Dias de / });
    const anterior = await grade.getAttribute("aria-label");
    const partes = /^Dias de (\S+) de (\d{4})$/.exec(anterior ?? "");
    const numeroDoMes = nomesDosMeses.indexOf((partes?.[1] ?? "").toLowerCase()) + 1;
    if (!partes?.[2] || numeroDoMes < 1)
      throw new Error("Mês visível do calendário não encontrado.");
    const mesVisivel = `${partes[2]}-${String(numeroDoMes).padStart(2, "0")}`;
    await calendario
      .getByRole("button", {
        name: mesVisivel > dia.slice(0, 7) ? "Mês anterior" : "Mês seguinte",
        exact: true,
      })
      .click();
    await expect(grade).not.toHaveAttribute("aria-label", anterior ?? "");
  }
  const nomeDoDia = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  await calendario.getByRole("button", { name: new RegExp(`^${nomeDoDia}(,|$)`) }).click();
  await expect(calendario).toHaveCount(0);
}

async function abrirCalendario(page: Page): Promise<Locator> {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Gestão", "gestao");
  await page.getByRole("tab", { name: "Configurações", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Categorias de configurações", exact: true })
    .getByRole("button", { name: "Escola", exact: true })
    .click();
  const secao = page.locator('[data-secao="config-calendario"]');
  const abrir = secao.getByRole("button", { name: /^Calendário letivo/ });
  await expect(abrir).toBeVisible();
  if ((await abrir.getAttribute("aria-expanded")) !== "true") await abrir.click();
  await expect(secao.getByLabel("Ano do calendário", { exact: true })).toBeVisible();
  return secao;
}

async function adicionarPelaInterface(page: Page, secao: Locator, dia: string, nome: string) {
  await secao.getByLabel("Ano do calendário", { exact: true }).fill(dia.slice(0, 4));
  await escolherDia(page, secao, "calendario-feriado-data", "Data do feriado", dia);
  await secao.getByLabel("Nome do feriado", { exact: true }).fill(nome);
  const [resposta] = await Promise.all([
    page.waitForResponse(
      (item) =>
        new URL(item.url()).pathname === "/api/calendario-letivo" &&
        item.request().method() === "POST",
    ),
    secao.getByRole("button", { name: "Adicionar feriado", exact: true }).click(),
  ]);
  return resposta;
}

async function chamada(page: Page, recarregar = false): Promise<Locator> {
  if (recarregar) await page.reload();
  else await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  await escolherTurmaNaChamada(secao, new RegExp(`^${PREFIXO} A$`));
  return secao;
}

async function lerChamada(page: Page, dia: string): Promise<unknown> {
  const resposta = await page.request.get(`/api/frequencias?dia=${dia}&turmaId=${turmaId}`);
  expect(resposta.status()).toBe(200);
  return resposta.json();
}

test.beforeAll(async () => {
  await limparMassa();
  await comBanco(async (cliente) => {
    const hoje = diaLocal(new Date(), process.env.TZ_APP ?? "America/Fortaleza");
    const livres = await cliente.query<{ dia: string; semana: number }>(
      `select to_char(d.dia, 'YYYY-MM-DD') as dia, extract(isodow from d.dia)::int as semana
       from generate_series($1::date - interval '83 days', $1::date, interval '1 day') as d(dia)
       where extract(isodow from d.dia) <= 6
         and not exists (select 1 from feriados f where f.dia = d.dia::date)
         and not exists (select 1 from frequencias f where f.dia = d.dia::date)
         and not exists (select 1 from frequencias_parciais f where f.dia = d.dia::date)
       order by d.dia desc`,
      [hoje],
    );
    const uteis = livres.rows.filter((item) => item.semana < 6);
    diaUtil = uteis[0]?.dia ?? "";
    diaProtegido = uteis[1]?.dia ?? "";
    sabado = livres.rows.find((item) => item.semana === 6)?.dia ?? "";
    if (!diaUtil || !diaProtegido || !sabado)
      throw new Error("Não há datas livres para o calendário de teste.");
    const reservada = await cliente.query<{ ocupada: boolean }>(
      "select exists (select 1 from feriados where dia = $1) or exists (select 1 from frequencias where dia = $1) or exists (select 1 from frequencias_parciais where dia = $1) as ocupada",
      [DIA_ANUAL],
    );
    if (reservada.rows[0]?.ocupada) throw new Error("A data anual do teste já contém registros.");
    const serie = await cliente.query<{ id: string }>(
      "insert into series (nome, ordem) values ($1, 92) returning id",
      [PREFIXO],
    );
    for (const nome of ["A", "B"]) {
      const turma = await cliente.query<{ id: string }>(
        "insert into turmas (serie_id, nome) values ($1, $2) returning id",
        [serie.rows[0]?.id, nome],
      );
      const id = turma.rows[0]?.id ?? "";
      const aluno = await cliente.query<{ id: string }>(
        "insert into alunos (nome, turma_id, turma_original_id, ordem, ativo) values ($1, $2, $2, 1, true) returning id",
        [`${PREFIXO} Aluna ${nome}`, id],
      );
      await cliente.query(
        "insert into horarios (turma_id, ordem, inicio, fim, dias_semana, ativo) values ($1, 1, '07:00', '07:50', array[1,2,3,4,5], true), ($1, 2, '07:50', '08:40', array[1,2,3,4,5], true)",
        [id],
      );
      if (nome === "A") {
        turmaId = id;
        alunoId = aluno.rows[0]?.id ?? "";
      }
    }
  });
});

test.beforeEach(async ({ page }) => {
  await limparRegistros();
  await page.addInitScript(() => localStorage.setItem("theme", "system"));
});

test.afterAll(limparMassa);

test("cadastra feriado no ano escolhido, recarrega e remove somente após confirmar", async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  let secao = await abrirCalendario(page);
  const ano = secao.getByLabel("Ano do calendário", { exact: true });
  await expect(ano).toHaveAttribute("min", "1900");
  await expect(ano).toHaveAttribute("max", "2199");
  expect((await adicionarPelaInterface(page, secao, DIA_ANUAL, NOME_ANUAL)).status()).toBe(201);
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toBeVisible();
  await secao.getByRole("button", { name: "Ano seguinte", exact: true }).click();
  await expect(ano).toHaveValue("1995");
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toHaveCount(0);
  await secao.getByRole("button", { name: "Ano anterior", exact: true }).click();
  await expect(ano).toHaveValue("1994");
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toBeVisible();

  secao = await abrirCalendario(page);
  await secao.getByLabel("Ano do calendário", { exact: true }).fill("1994");
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toBeVisible();
  for (const largura of [320, 360, 1280]) {
    await page.setViewportSize({ width: largura, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const tema of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: tema });
      await expect(page.locator("html")).toHaveClass(tema === "dark" ? /dark/ : /light/);
      await info.attach(`Calendário ${largura}px ${tema}`, {
        body: await secao.screenshot(),
        contentType: "image/png",
      });
    }
  }

  const remover = secao.getByRole("button", { name: `Remover feriado ${NOME_ANUAL}`, exact: true });
  await remover.click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText(NOME_ANUAL);
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toBeVisible();
  await remover.click();
  await dialogo.getByRole("button", { name: /^(Remover feriado|Remover)$/ }).click();
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toHaveCount(0);
  const resposta = await page.request.get("/api/calendario-letivo?ano=1994");
  const dados = (await resposta.json()) as { feriados: { dia: string; nome: string }[] };
  expect(dados.feriados.some((item) => item.dia === DIA_ANUAL)).toBe(false);
});

test("feriado deixa a cobertura neutra e bloqueia Chamada e Parcial, inclusive no sábado", async ({
  page,
}) => {
  test.setTimeout(90_000);
  for (const [dia, nome] of [
    [diaUtil, `${PREFIXO} em dia útil`],
    [sabado, `${PREFIXO} no sábado`],
  ]) {
    const resposta = await page.request.post("/api/calendario-letivo", { data: { dia, nome } });
    expect(resposta.status()).toBe(201);
  }
  const secao = await chamada(page);
  const aluno = secao.getByRole("button", { name: new RegExp(`^${PREFIXO} Aluna A:`) });
  const grupo = secao.getByRole("group", { name: "Turma atual", exact: true });
  for (const [dia, nome] of [
    [diaUtil, `${PREFIXO} em dia útil`],
    [sabado, `${PREFIXO} no sábado`],
  ]) {
    await escolherDia(page, secao, "dia-frequencia", "Data da chamada", dia ?? "");
    await expect(secao.getByRole("status").filter({ hasText: `Feriado · ${nome}` })).toBeVisible();
    await expect(aluno).toBeDisabled();
    await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
    await expect(grupo.getByRole("button", { name: PREFIXO, exact: true })).toHaveAttribute(
      "data-situacao",
      "feriado",
    );
    await expect(grupo.getByRole("button", { name: `${PREFIXO} A`, exact: true })).toHaveAttribute(
      "data-situacao",
      "feriado",
    );
    await expect(grupo.locator("svg[data-progresso]")).toHaveCount(0);
    const liberarSabado = secao.getByRole("button", {
      name: "Desbloquear sábado letivo",
      exact: true,
    });
    if (await liberarSabado.count()) await expect(liberarSabado).toBeDisabled();
  }
  const recusada = await page.request.post("/api/frequencias", {
    data: { turmaId, dia: sabado, faltas: [], revisao: 0, sabadoLetivo: true },
  });
  expect(recusada.status()).toBe(400);
  expect(await recusada.json()).toMatchObject({ error: expect.stringContaining("feriado") });
  const parcialRecusada = await page.request.post("/api/frequencias-parciais", {
    data: { alunoId, turmaId, dia: diaUtil, tipo: "DIA_INTEIRO", revisao: 0 },
  });
  expect(parcialRecusada.status()).toBe(400);
  expect(await parcialRecusada.json()).toMatchObject({ error: expect.stringContaining("feriado") });

  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  await page.locator("#parcial-turma").click();
  await page.getByRole("option", { name: `${PREFIXO} A`, exact: true }).click();
  const parcial = page.getByTestId("chamada-parcial");
  await escolherDia(page, parcial, "dia-chamada-parcial", "Data da chamada parcial", diaUtil);
  await expect(
    parcial.getByRole("status").filter({ hasText: `${PREFIXO} em dia útil` }),
  ).toBeVisible();
  await expect(
    parcial.getByRole("button", {
      name: `Registrar frequência parcial de ${PREFIXO} Aluna A`,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(parcial.locator("#dia-chamada-parcial")).toBeEnabled();

  await trocarVisao(page, "Painel", "painel");
  const painel = page.getByRole("region", { name: "Painel de frequência", exact: true });
  await escolherDia(page, painel, "dia-painel", "Dia do painel", diaUtil);
  const resumo = painel.getByRole("group", { name: "Resumo do dia", exact: true });
  await expect(resumo.getByText("Feriado", { exact: true })).toBeVisible();
  await expect(resumo.getByText(/\d+(?:,\d+)?%/)).toHaveCount(0);
  const escola = painel.getByRole("article", { name: /: Toda a escola$/ });
  await expect(escola.getByText(`${PREFIXO} em dia útil`, { exact: true })).toBeVisible();
  await expect(escola.getByRole("progressbar")).toHaveCount(0);
  await expect(escola.getByText(/\d+ turmas? pendentes?/)).toHaveCount(0);
});

test("recusa transformar chamada salva em feriado e preserva a frequência após erro e exclusão inexistente", async ({
  page,
}) => {
  const secaoChamada = await chamada(page);
  await escolherDia(page, secaoChamada, "dia-frequencia", "Data da chamada", diaProtegido);
  const aluno = secaoChamada.getByRole("button", { name: new RegExp(`^${PREFIXO} Aluna A:`) });
  await expect(aluno).toBeEnabled();
  await aluno.click();
  await secaoChamada.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(secaoChamada.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  const antes = await lerChamada(page, diaProtegido);
  const secaoCalendario = await abrirCalendario(page);
  const proposta = `${PREFIXO} em data já salva`;
  const resposta = await adicionarPelaInterface(page, secaoCalendario, diaProtegido, proposta);
  expect(resposta.status()).toBe(409);
  expect(await resposta.json()).toMatchObject({
    error: expect.stringContaining("frequência salva"),
  });
  await expect(secaoCalendario.getByText(proposta, { exact: true })).toHaveCount(0);
  await expect(
    secaoCalendario.getByRole("button", { name: "Adicionar feriado", exact: true }),
  ).toBeEnabled();
  expect(await lerChamada(page, diaProtegido)).toEqual(antes);
  const inexistente = await page.request.delete(`/api/calendario-letivo/${diaProtegido}`);
  expect(inexistente.status()).toBe(404);
  expect(await lerChamada(page, diaProtegido)).toEqual(antes);
  const feriados = await page.request.get(`/api/calendario-letivo?ano=${diaProtegido.slice(0, 4)}`);
  const dados = (await feriados.json()) as { feriados: { dia: string }[] };
  expect(dados.feriados.some((item) => item.dia === diaProtegido)).toBe(false);
});

test("recarrega após falha de leitura sem cadastrar o mesmo feriado novamente", async ({
  page,
}) => {
  const secao = await abrirCalendario(page);
  let falhar = true;
  let cadastros = 0;
  page.on("request", (pedido) => {
    if (pedido.method() === "POST" && new URL(pedido.url()).pathname === "/api/calendario-letivo")
      cadastros += 1;
  });
  await page.route("**/api/configuracoes", async (rota) => {
    if (falhar && rota.request().method() === "GET") {
      await rota.fulfill({
        status: 503,
        json: { error: "Não foi possível atualizar o calendário." },
      });
    } else {
      await rota.continue();
    }
  });
  expect((await adicionarPelaInterface(page, secao, DIA_ANUAL, NOME_ANUAL)).status()).toBe(201);
  const recarregar = secao.getByRole("button", { name: "Recarregar calendário", exact: true });
  await expect(recarregar).toBeEnabled();
  await expect(
    secao.getByRole("button", { name: "Adicionar feriado", exact: true }),
  ).toBeDisabled();
  expect(cadastros).toBe(1);
  const resposta = await page.request.get("/api/calendario-letivo?ano=1994");
  const dados = (await resposta.json()) as { feriados: { dia: string; nome: string }[] };
  expect(dados.feriados).toContainEqual({ dia: DIA_ANUAL, nome: NOME_ANUAL });
  falhar = false;
  await recarregar.click();
  await expect(secao.getByText(NOME_ANUAL, { exact: true })).toBeVisible();
  await expect(recarregar).toHaveCount(0);
  await expect(secao.getByLabel("Nome do feriado", { exact: true })).toBeEnabled();
  expect(cadastros).toBe(1);
});

test("preserva o rascunho quando outro administrador cadastra feriado e permite salvar após sua remoção", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let secao = await chamada(page);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  const nomeDoAluno = new RegExp(`^${PREFIXO} Aluna A:`);
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeEnabled();
  await secao.getByRole("button", { name: nomeDoAluno }).click();
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(
        ({ dia, turma }) =>
          Object.keys(sessionStorage).some((chave) => chave.endsWith(`:${dia}:${turma}`)),
        { dia: diaUtil, turma: turmaId },
      ),
    )
    .toBe(true);
  const rascunho = await page.evaluate(
    ({ dia, turma }) => {
      const chave = Object.keys(sessionStorage).find((item) => item.endsWith(`:${dia}:${turma}`));
      if (!chave) throw new Error("Rascunho do calendário não encontrado.");
      const bruto = sessionStorage.getItem(chave);
      if (!bruto) throw new Error("Rascunho do calendário vazio.");
      return { chave, bruto };
    },
    { dia: diaUtil, turma: turmaId },
  );
  expect(JSON.parse(rascunho.bruto)).toMatchObject({
    revisao: 0,
    faltas: [{ alunoId }],
  });

  // Uma alteração externa chega pela API sem atualizar a tela que contém o rascunho.
  const nomeDoFeriado = `${PREFIXO} durante o rascunho`;
  const criado = await page.request.post("/api/calendario-letivo", {
    data: { dia: diaUtil, nome: nomeDoFeriado },
  });
  expect(criado.status()).toBe(201);
  secao = await chamada(page, true);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  const feriado = secao.getByRole("status").filter({ hasText: `Feriado · ${nomeDoFeriado}` });
  await expect(feriado).toBeVisible();
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBe(
    rascunho.bruto,
  );

  await secao.getByRole("button", { name: "Descartar", exact: true }).click();
  const dialogo = page.getByRole("alertdialog", { name: "Descartar alterações?", exact: true });
  await dialogo.getByRole("button", { name: "Continuar marcando", exact: true }).click();
  await expect(dialogo).toHaveCount(0);
  secao = await chamada(page, true);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  await expect(
    secao.getByRole("status").filter({ hasText: `Feriado · ${nomeDoFeriado}` }),
  ).toBeVisible();
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBe(
    rascunho.bruto,
  );
  expect(await lerChamada(page, diaUtil)).toMatchObject({ frequencia: null });

  const removido = await page.request.delete(`/api/calendario-letivo/${diaUtil}`);
  expect(removido.status()).toBe(200);
  secao = await chamada(page, true);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  await expect(secao.getByRole("status").filter({ hasText: "Feriado ·" })).toHaveCount(0);
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeEnabled();
  const salvar = secao.getByRole("button", { name: "Salvar", exact: true });
  await expect(salvar).toBeEnabled();
  await salvar.click();
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  expect(await lerChamada(page, diaUtil)).toMatchObject({
    frequencia: { dia: diaUtil, turmaId, faltas: [{ alunoId }] },
    feriado: null,
  });
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeDisabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBeNull();
});

test("falha de leitura em dia útil bloqueia a edição e preserva o rascunho até tentar novamente", async ({
  page,
}) => {
  test.setTimeout(90_000);
  let secao = await chamada(page);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  const nomeDoAluno = new RegExp(`^${PREFIXO} Aluna A:`);
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeEnabled();
  await secao.getByRole("button", { name: nomeDoAluno }).click();
  await expect
    .poll(() =>
      page.evaluate(
        ({ dia, turma }) =>
          Object.keys(sessionStorage).some((chave) => chave.endsWith(`:${dia}:${turma}`)),
        { dia: diaUtil, turma: turmaId },
      ),
    )
    .toBe(true);
  const rascunho = await page.evaluate(
    ({ dia, turma }) => {
      const chave = Object.keys(sessionStorage).find((item) => item.endsWith(`:${dia}:${turma}`));
      if (!chave) throw new Error("Rascunho em dia útil não encontrado.");
      const bruto = sessionStorage.getItem(chave);
      if (!bruto) throw new Error("Rascunho em dia útil vazio.");
      return { chave, bruto };
    },
    { dia: diaUtil, turma: turmaId },
  );
  expect(JSON.parse(rascunho.bruto)).toMatchObject({ revisao: 0, faltas: [{ alunoId }] });
  let falhar = true;
  await page.route("**/api/frequencias?dia=**", async (rota) => {
    const pedido = rota.request();
    if (
      falhar &&
      pedido.method() === "GET" &&
      new URL(pedido.url()).searchParams.get("dia") === diaUtil
    ) {
      await rota.fulfill({
        status: 503,
        json: { error: "Não foi possível carregar a frequência." },
      });
    } else {
      await rota.continue();
    }
  });

  secao = await chamada(page, true);
  await escolherDia(page, secao, "dia-frequencia", "Data da chamada", diaUtil);
  const tentar = secao.getByRole("button", { name: "Tentar novamente", exact: true });
  await expect(tentar).toBeEnabled();
  await expect(secao.locator("#dia-frequencia")).toBeEnabled();
  await expect(
    secao.getByRole("group", { name: "Turma atual", exact: true }).getByRole("button", {
      name: `${PREFIXO} B`,
      exact: true,
    }),
  ).toBeEnabled();
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeDisabled();
  await expect(secao.getByRole("button", { name: "Salvar", exact: true })).toBeDisabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBe(
    rascunho.bruto,
  );

  falhar = false;
  await tentar.click();
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(secao.getByRole("button", { name: nomeDoAluno })).toBeEnabled();
  const salvar = secao.getByRole("button", { name: "Salvar", exact: true });
  await expect(salvar).toBeEnabled();
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBe(
    rascunho.bruto,
  );
  await salvar.click();
  await expect(secao.getByRole("button", { name: /^Desbloquear chamada de/ })).toBeVisible();
  expect(await lerChamada(page, diaUtil)).toMatchObject({
    frequencia: { dia: diaUtil, turmaId, faltas: [{ alunoId }] },
    feriado: null,
  });
  expect(await page.evaluate((chave) => sessionStorage.getItem(chave), rascunho.chave)).toBeNull();
});
