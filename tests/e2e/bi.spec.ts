// BI no navegador com dados escolares simulados: isolamento, painéis, exportação, falhas e persistência.
import { expect, test, type Page } from "@playwright/test";
import type { PaginaBi, RecursoBi } from "@/domain/bi";
import { RECURSOS_BI } from "@/domain/bi";
import { aguardarHidratacao } from "./helpers/pagina";
import { esquemaFiltrosBi } from "@/domain/bi-analise";
test.use({ serviceWorkers: "block" });
const CHAVE_FALSA = `fbi_${"z".repeat(43)}`;
const dia = "2026-10-09";
const filtros = esquemaFiltrosBi.parse({ inicio: "2026-10-01", fim: "2026-10-31" });
const massa: Partial<Record<RecursoBi, PaginaBi["linhas"]>> = {
  series: [{ id: "s", nome: "QA Série" }],
  turmas: [{ id: "t", nome: "QA A", turma: "QA A", serie: "QA Série", serieId: "s", turmaId: "t" }],
  alunos: [
    {
      id: "a",
      alunoId: "a",
      nome: "QA Aluna",
      aluno: "QA Aluna",
      turmaId: "t",
      serieId: "s",
      ativo: true,
      desistenteEm: null,
    },
  ],
  chamadas: [
    {
      id: "c",
      dia,
      turma: "QA A",
      turmaId: "t",
      serie: "QA Série",
      serieId: "s",
      registrados: 10,
      presentes: 8,
      ausencias: 2,
      faltas: 1,
      justificadas: 1,
      presencaParcial: 0,
    },
  ],
  faltas: [
    {
      id: "f",
      dia,
      alunoId: "a",
      aluno: "QA Aluna",
      turma: "QA A",
      turmaId: "t",
      serie: "QA Série",
      serieId: "s",
      aula: 1,
      aulas: 1,
      disciplina: "QA Matemática",
      justificativa: "QA Transporte",
      tipo: "FJ",
      observacao: "QA Observação",
    },
  ],
  lista: [
    {
      id: "l",
      dia,
      alunoId: "a",
      aluno: "QA Aluna",
      turma: "QA A",
      turmaId: "t",
      serieId: "s",
      tipo: "P",
      registradoSeduc: false,
    },
  ],
  parciais: [
    {
      id: "p",
      dia,
      alunoId: "a",
      aluno: "QA Aluna",
      turma: "QA A",
      turmaId: "t",
      serieId: "s",
      tipo: "AULAS",
      aulas: [1, 2],
      registradoSeduc: false,
    },
  ],
  saidas: [],
  entradas: [],
  feriados: [],
};
async function preparar(page: Page) {
  await page.context().clearCookies();
  await page
    .context()
    .addCookies([{ name: "QA-BI-Sessao", value: "sintetica", domain: "localhost", path: "/" }]);
  await page.addInitScript(
    ({ filtros }) => {
      if (!localStorage.getItem("frequencibi:personalizacao"))
        localStorage.setItem(
          "frequencibi:personalizacao",
          JSON.stringify({
            versao: 2,
            visoes: [],
            paineis: [],
            preferencias: { filtros, aba: "geral", painelPadrao: "" },
          }),
        );
    },
    { filtros },
  );
  await page.route("**/api/bi?*", async (rota) => {
    const url = new URL(rota.request().url());
    const recurso = url.searchParams.get("recurso") as RecursoBi | "acesso";
    expect(rota.request().method()).toBe("GET");
    expect(rota.request().headers().cookie).toBeUndefined();
    const valida = rota.request().headers().authorization === `Bearer ${CHAVE_FALSA}`;
    await rota.fulfill({
      status: valida ? 200 : 401,
      json: valida
        ? {
            recurso,
            linhas: recurso === "acesso" ? [] : (massa[recurso] ?? []),
            pagina: 1,
            proximaPagina: null,
            consultadoEm: `${dia}T12:00:00Z`,
            escopo: {},
            recursos: RECURSOS_BI,
          }
        : { error: "Chave inválida." },
    });
  });
  await page.goto("/bi");
  await aguardarHidratacao(page, "#chave-bi");
  await expect(page.getByLabel("Chave de acesso", { exact: true })).toBeEnabled();
}
async function abrir(page: Page) {
  await preparar(page);
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_FALSA);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Seções do FrequenciBI" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText("20%");
}
async function aba(page: Page, nome: string) {
  await page
    .getByRole("navigation", { name: "Seções do FrequenciBI" })
    .getByRole("button", { name: nome, exact: true })
    .click();
}
async function escolher(page: Page, nome: string, valor: string) {
  await page.getByRole("combobox", { name: nome, exact: true }).click();
  await page.getByRole("option", { name: valor, exact: true }).click();
}
test("portão recusa chave inválida e consulta sem cookie, com taxas consistentes e sem excesso horizontal", async ({
  page,
}) => {
  await preparar(page);
  await expect(page.getByRole("navigation", { name: "Seções do FrequenciBI" })).toHaveCount(0);
  await page.getByLabel("Chave de acesso", { exact: true }).fill("QA inválida");
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "A chave não autoriza" })).toBeVisible();
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_FALSA);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText("20%");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await page
    .getByRole("heading", { name: "Evolução mensal", exact: true })
    .scrollIntoViewIfNeeded();
  await expect(page.locator("svg.recharts-surface").first()).toBeVisible();
  await test.info().attach("frequencibi-geral", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
test("cria visões e painel, move e redimensiona com teclado e preserva notas após recarga", async ({
  page,
}) => {
  await abrir(page);
  await aba(page, "Meus painéis");
  await page.getByRole("textbox", { name: "Nome do novo painel" }).fill("QA Painel");
  await page.getByRole("button", { name: "Criar painel", exact: true }).click();
  await aba(page, "Explorador");
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Taxa");
  await page.getByText("Anotação local", { exact: true }).click();
  await page.getByRole("textbox", { name: "Anotação do gráfico" }).fill("QA Meta acompanhada");
  await page.getByRole("textbox", { name: "Nome da visão salva" }).fill("QA Visão");
  await page.getByRole("button", { name: "Salvar visão", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar ao painel", exact: true }).click();
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Segundo");
  await page.getByRole("button", { name: "Adicionar ao painel", exact: true }).click();
  await aba(page, "Meus painéis");
  await expect(page.getByRole("heading", { name: "QA Taxa", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Mover QA Taxa", exact: true }).press("ArrowDown");
  await page.getByRole("button", { name: "Redimensionar QA Taxa", exact: true }).press("ArrowDown");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const p = JSON.parse(localStorage.getItem("frequencibi:personalizacao") ?? "{}");
        return [p.paineis[0].graficos[0].titulo, p.paineis[0].graficos[1].altura];
      }),
    )
    .toEqual(["QA Segundo", 400]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "QA Taxa", exact: true })).toBeVisible();
  await expect(page.getByText("QA Meta acompanhada", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Duplicar painel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nome do painel", exact: true })).toHaveValue(
    "QA Painel (cópia)",
  );
});
test("construtor filtra a tabela e exige confirmação antes de CSV e PNG sem incluir a chave", async ({
  page,
}) => {
  await abrir(page);
  await aba(page, "Explorador");
  await escolher(page, "Base", "Faltas por aula");
  await escolher(page, "Dimensão", "Aluno");
  await escolher(page, "Visualização", "Tabela detalhada");
  const cartao = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Minha análise", exact: true }) });
  await cartao.scrollIntoViewIfNeeded();
  await expect(
    cartao.getByRole("button", { name: "Filtrar: QA Aluna", exact: true }),
  ).toBeVisible();
  await cartao.getByRole("button", { name: "Exportar CSV de Minha análise" }).click();
  const dialogo = page.getByRole("alertdialog");
  await expect(dialogo).toContainText("dados pessoais");
  await dialogo.getByRole("button", { name: "Cancelar", exact: true }).click();
  const baixado = page.waitForEvent("download");
  await cartao.getByRole("button", { name: "Exportar CSV de Minha análise" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  const csv = await baixado;
  expect(csv.suggestedFilename()).toBe("frequencibi-tabela.csv");
  const png = page.waitForEvent("download");
  await cartao.getByRole("button", { name: "Exportar PNG de Minha análise" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  expect((await png).suggestedFilename()).toBe("frequencibi-grafico.png");
  await cartao.getByRole("button", { name: "Filtrar: QA Aluna", exact: true }).click();
  await page.getByText("Mais filtros", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Aluno", exact: true })).toContainText(
    "QA Aluna",
  );
});
test("revogação remove chave e cache, preservando as visões locais", async ({ page }) => {
  await abrir(page);
  await aba(page, "Explorador");
  await page.getByRole("button", { name: "Salvar visão", exact: true }).click();
  await page.route("**/api/bi?*", (rota) =>
    rota.fulfill({ status: 401, json: { error: "Acesso recusado." } }),
  );
  await page.getByText("Configurações deste navegador", { exact: true }).click();
  await page.getByRole("button", { name: "Conferir chave novamente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Testar e entrar", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("frequencibi:personalizacao") ?? "{}").visoes.length,
    ),
  ).toBe(1);
  const contagem = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const p = indexedDB.open("frequencibi-dados-v1", 1);
        p.onerror = () => reject();
        p.onsuccess = () => {
          const db = p.result;
          const t = db.transaction("retratos", "readonly");
          const c = t.objectStore("retratos").count();
          c.onsuccess = () => resolve(c.result);
          t.oncomplete = () => db.close();
        };
      }),
  );
  expect(contagem).toBe(0);
});
test("erro em página intermediária não vira total parcial e permite nova leitura", async ({
  page,
}) => {
  await preparar(page);
  let falhar = true;
  await page.route("**/api/bi?*", async (rota) => {
    const u = new URL(rota.request().url());
    if (u.searchParams.get("recurso") !== "chamadas") return rota.fallback();
    if (u.searchParams.get("pagina") === "2")
      return rota.fulfill({
        status: falhar ? 500 : 200,
        json: falhar
          ? { error: "QA indisponível" }
          : {
              recurso: "chamadas",
              linhas: [],
              pagina: 2,
              proximaPagina: null,
              consultadoEm: `${dia}T12:00:00Z`,
              escopo: {},
              recursos: RECURSOS_BI,
            },
      });
    await rota.fulfill({
      json: {
        recurso: "chamadas",
        linhas: massa.chamadas,
        pagina: 1,
        proximaPagina: 2,
        consultadoEm: `${dia}T12:00:00Z`,
        escopo: {},
        recursos: RECURSOS_BI,
      },
    });
  });
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_FALSA);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "QA indisponível" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText(
    "Sem base de cálculo",
  );
  falhar = false;
  await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText("20%");
});
test("armazenamento bloqueado avisa e mantém a leitura; importação incompatível preserva personalização", async ({
  page,
}) => {
  await preparar(page);
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("QA quota", "QuotaExceededError");
    };
  });
  await page.reload();
  await aguardarHidratacao(page, "#chave-bi");
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_FALSA);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText("20%");
  await expect(
    page.getByRole("alert").filter({ hasText: "bloqueou o armazenamento" }),
  ).toBeVisible();
  await page.getByText("Configurações deste navegador", { exact: true }).click();
  await page.getByRole("button", { name: "Importar configurações", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "qa.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ versao: 99, chave: CHAVE_FALSA })),
  });
  await expect(page.getByRole("alert").filter({ hasText: "Arquivo inválido" })).toBeVisible();
});
test("links compartilham só filtros e configuração exportada não inclui segredo", async ({
  page,
}) => {
  await abrir(page);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (texto: string) => {
          localStorage.setItem("QA:link", texto);
        },
      },
    });
  });
  await page.getByRole("button", { name: "Compartilhar filtros", exact: true }).click();
  const link = await page.evaluate(() => localStorage.getItem("QA:link"));
  expect(link).toContain("inicio=2026-10-01");
  expect(link).not.toContain(CHAVE_FALSA);
  expect(link).not.toMatch(/chave|anotacao|token/);
  await expect(
    page.getByText("Link copiado, sem chave ou anotações.", { exact: true }),
  ).toHaveCount(0);
  const configuracoes = page.getByText("Configurações deste navegador", { exact: true });
  if (test.info().project.use.hasTouch) await configuracoes.tap();
  else await configuracoes.click();
  await expect(configuracoes.locator("..")).toHaveJSProperty("open", true);
  const evento = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar configurações", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirmar", exact: true })
    .click();
  const download = await evento;
  const stream = await download.createReadStream();
  const partes: Buffer[] = [];
  if (stream) for await (const parte of stream) partes.push(Buffer.from(parte));
  const texto = Buffer.concat(partes).toString("utf8");
  expect(texto).not.toContain(CHAVE_FALSA);
  expect(JSON.parse(texto).versao).toBe(2);
});

test("renderiza as dez visualizações e organiza o painel por puxadores de arraste", async ({
  page,
}) => {
  await abrir(page);
  await aba(page, "Explorador");
  const cartao = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Minha análise", exact: true }) });
  for (const tipo of [
    "Barras",
    "Barras horizontais",
    "Barras agrupadas",
    "Linha",
    "Área",
    "Rosca",
    "Dispersão",
    "Mapa de calor",
    "Tabela detalhada",
    "Indicadores",
  ]) {
    await escolher(page, "Visualização", tipo);
    await cartao.scrollIntoViewIfNeeded();
    if (tipo === "Tabela detalhada") await expect(cartao.getByRole("table")).toBeVisible();
    else if (tipo === "Indicadores") await expect(cartao).toContainText("QA A");
    else
      await expect(cartao.locator("svg.recharts-surface, svg[data-grafico]").first()).toBeVisible();
  }
  await aba(page, "Meus painéis");
  await page.getByRole("textbox", { name: "Nome do novo painel" }).fill("QA Arraste");
  await page.getByRole("button", { name: "Criar painel", exact: true }).click();
  await aba(page, "Explorador");
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Primeiro");
  await page.getByRole("button", { name: "Adicionar ao painel", exact: true }).click();
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Segundo");
  await page.getByRole("button", { name: "Adicionar ao painel", exact: true }).click();
  await aba(page, "Meus painéis");
  await expect(page.getByText("Gráfico adicionado ao painel.", { exact: true })).toHaveCount(0);
  const itens = page.locator("[data-painel-item]");
  await itens.first().evaluate((el) => el.scrollIntoView({ block: "start" }));
  const origem = await page
    .getByRole("button", { name: "Mover QA Primeiro", exact: true })
    .boundingBox();
  const destino = await itens.nth(1).boundingBox();
  expect(origem).not.toBeNull();
  expect(destino).not.toBeNull();
  if (origem && destino) {
    await page.mouse.move(origem.x + origem.width / 2, origem.y + origem.height / 2);
    await page.mouse.down();
    await page.mouse.move(destino.x + destino.width / 2, destino.y + 30, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("frequencibi:personalizacao") ?? "{}").paineis[0]
            .graficos[0].titulo,
      ),
    )
    .toBe("QA Segundo");
  const tamanho = page.getByRole("button", { name: "Redimensionar QA Segundo", exact: true });
  await tamanho.scrollIntoViewIfNeeded();
  const caixa = await tamanho.boundingBox();
  if (caixa) {
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2 + 60, { steps: 8 });
    await page.mouse.up();
  }
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("frequencibi:personalizacao") ?? "{}").paineis[0]
            .graficos[0].altura,
      ),
    )
    .toBe(420);
});
