// BI no navegador com dados escolares simulados: isolamento, painéis, exportação, falhas e persistência.
import { expect, test, type Page } from "@playwright/test";
import type { PaginaBi, RecursoBi } from "@/domain/bi";
import { RECURSOS_BI } from "@/domain/bi";
import { aguardarHidratacao, escolherDataNoPeriodo } from "../helpers/pagina";
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
      frequenciaId: "c",
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
async function preparar(page: Page, dados = massa) {
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
            linhas: recurso === "acesso" ? [] : (dados[recurso] ?? []),
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
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toContainText("20%");
}
async function aba(page: Page, nome: string) {
  const navegacao = page.getByRole("navigation", { name: "Seções do FrequenciBI" });
  const seletor = page.getByRole("combobox", { name: "Seção do FrequenciBI", exact: true });
  await expect(navegacao.or(seletor).first()).toBeVisible();
  if (await navegacao.isVisible().catch(() => false)) {
    await navegacao.getByRole("button", { name: nome, exact: true }).click();
    return;
  }
  await seletor.click();
  await page.getByRole("option", { name: nome, exact: true }).click();
}
async function escolher(page: Page, nome: string, valor: string) {
  await page.getByRole("combobox", { name: nome, exact: true }).click();
  await page.getByRole("option", { name: valor, exact: true }).click();
}

/** Executa uma ação do cabeçalho, abrindo Mais ações no celular. */
async function acaoDoBi(page: Page, nome: string) {
  const direto = page.getByRole("button", { name: nome, exact: true });
  if (await direto.isVisible().catch(() => false)) {
    await direto.click();
    return;
  }
  await page.getByRole("button", { name: "Mais ações da análise", exact: true }).click();
  await page.getByRole("button", { name: nome, exact: true }).click();
}
test("portão recusa chave inválida e consulta sem cookie, com taxas consistentes e sem excesso horizontal", async ({
  page,
}) => {
  await preparar(page);
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toHaveCount(0);
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

test("reconexão repete falha temporária antes de aceitar o cache e encerra chave revogada", async ({
  page,
}) => {
  await abrir(page);
  let conferencias = 0;
  let limitar = true;
  await page.route("**/api/bi?recurso=acesso", async (rota) => {
    conferencias++;
    if (limitar) {
      await rota.fulfill({ status: 429, json: { error: "Muitas consultas. Aguarde um minuto." } });
      return;
    }
    await rota.fulfill({
      status: conferencias === 1 ? 503 : 401,
      json: {
        error: conferencias === 1 ? "Conexão temporariamente indisponível." : "Chave revogada.",
      },
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("alert").filter({ hasText: "Aguarde um minuto" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toBeVisible();
  expect(conferencias).toBe(1);
  limitar = false;
  conferencias = 0;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "Testar e entrar", exact: true })).toBeVisible();
  expect(conferencias).toBe(2);
  expect(await page.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
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
  await acaoDoBi(page, "Compartilhar filtros");
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

test("personaliza modelo, preserva filtros do painel e aplica link sem alterar o painel salvo", async ({
  page,
}) => {
  await abrir(page);
  await page.getByRole("button", { name: "Personalizar este painel", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nome do painel", exact: true })).toHaveValue(
    "Visão geral",
  );
  await escolherDataNoPeriodo(page, "Início da análise", "2026-09-01");
  await escolherDataNoPeriodo(page, "Fim da análise", "2026-09-30");
  await page.getByRole("button", { name: "Aplicar período", exact: true }).click();
  await aba(page, "Explorador");
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Adicional");
  await escolher(page, "Turma", "QA A");
  await page.getByRole("button", { name: "Adicionar ao painel", exact: true }).click();
  await aba(page, "Meus painéis");
  await expect(page.getByRole("button", { name: /^Início da análise:/ })).toContainText(
    "01/09/2026",
  );
  await expect(page.locator("[data-painel-item]")).toHaveCount(5);
  await page.goto("/bi?inicio=2026-10-01&fim=2026-10-31");
  await expect(page.getByRole("region", { name: "Indicadores gerais" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Início da análise:/ })).toContainText(
    "01/10/2026",
  );
  await expect(page.getByRole("combobox", { name: "Turma", exact: true })).toHaveText("Todos");
  await aba(page, "Meus painéis");
  await expect(page.getByRole("button", { name: /^Início da análise:/ })).toContainText(
    "01/09/2026",
  );
});

test("atualiza visão sem duplicar e recupera aparência e análise após recarga", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await abrir(page);
  await aba(page, "Explorador");
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Personalizado");
  await escolher(page, "Visualização", "Rosca");
  await page.getByText("Aparência e tamanho", { exact: true }).click();
  await escolher(page, "Paleta de cores", "Azul");
  await page.getByRole("switch", { name: "Mostrar valores", exact: true }).check();
  await page.getByRole("switch", { name: "Mostrar legenda", exact: true }).uncheck();
  await page.getByRole("slider", { name: /Altura do gráfico/ }).press("End");
  await page.getByRole("button", { name: "Salvar visão", exact: true }).click();
  await page.getByRole("textbox", { name: "Título da análise" }).fill("QA Revisado");
  await page.getByRole("button", { name: "Atualizar visão", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const p = JSON.parse(localStorage.getItem("frequencibi:personalizacao") ?? "{}");
        return [p.visoes.length, p.visoes[0].titulo, p.preferencias.explorador.paleta];
      }),
    )
    .toEqual([1, "QA Revisado", "azul"]);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Título da análise" })).toHaveValue("QA Revisado");
  await page.getByText("Aparência e tamanho", { exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Paleta de cores" })).toContainText("Azul");
  await expect(page.getByRole("switch", { name: "Mostrar valores" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Mostrar legenda" })).not.toBeChecked();
  await expect(page.getByRole("slider", { name: /Altura do gráfico/ })).toHaveValue("900");
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await test.info().attach("frequencibi-personalizacao", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("recorte por aluno calcula a presença histórica e atualizar renova também a comparação", async ({
  page,
}) => {
  await abrir(page);
  await page.getByText("Mais filtros", { exact: true }).click();
  await escolher(page, "Aluno", "QA Aluna");
  const indicador = page
    .getByRole("region", { name: "Indicadores gerais" })
    .getByRole("article")
    .filter({ has: page.getByText("Infrequência", { exact: true }) });
  await expect(indicador).toContainText("0%");
  await page.getByRole("button", { name: "Limpar recortes", exact: true }).click();
  await escolher(page, "Comparar infrequência", "Período anterior");
  let comparacoes = 0;
  await page.route("**/api/bi?*", async (rota) => {
    const url = new URL(rota.request().url());
    if (
      url.searchParams.get("recurso") !== "chamadas" ||
      url.searchParams.get("inicio") === filtros.inicio
    )
      return rota.fallback();
    comparacoes++;
    await rota.fulfill({
      json: {
        recurso: "chamadas",
        linhas: [{ ...massa.chamadas?.[0], dia: "2026-09-15", ausencias: 5 }],
        pagina: 1,
        proximaPagina: null,
        consultadoEm: `${dia}T12:00:00Z`,
        escopo: {},
        recursos: RECURSOS_BI,
      },
    });
  });
  await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
  await expect.poll(() => comparacoes).toBeGreaterThan(0);
  await expect(page.getByText(/Variação: -30 pontos percentuais/)).toBeVisible();
});

test("mapa de calor mantém células depois do centésimo grupo e tabela ajusta a página ao recorte", async ({
  page,
}) => {
  const faltas = Array.from({ length: 120 }, (_, i) => ({
    id: `f${i}`,
    dia: `2026-10-${String(Math.floor(i / 6) + 1).padStart(2, "0")}`,
    turma: `QA Turma ${(i % 6) + 1}`,
    turmaId: `t${i % 6}`,
    serieId: "s",
    alunoId: `a${i}`,
    aluno: `QA Aluno ${i}`,
    tipo: "F",
    aula: 1,
  }));
  const turmas = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`,
    turmaId: `t${i}`,
    nome: `QA Turma ${i + 1}`,
    turma: `QA Turma ${i + 1}`,
    serieId: "s",
    serie: "QA Série",
  }));
  await preparar(page, { ...massa, faltas, turmas });
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_FALSA);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await aba(page, "Faltas");
  const mapa = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Mapa por turma", exact: true }) });
  await mapa.scrollIntoViewIfNeeded();
  const celula = mapa.getByRole("button", { name: "2026-10-20 | QA Turma 6: 1", exact: true });
  await celula.scrollIntoViewIfNeeded();
  await expect(celula).toBeVisible();
  const caixa = await celula.boundingBox();
  expect(caixa?.height).toBeGreaterThanOrEqual(44);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);
  await test
    .info()
    .attach("frequencibi-mapa", { body: await mapa.screenshot(), contentType: "image/png" });
  const tabela = page
    .getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "Faltas por aluno", exact: true }) });
  await tabela.scrollIntoViewIfNeeded();
  await tabela.getByRole("button", { name: "Próxima", exact: true }).click();
  await tabela.getByRole("button", { name: "Próxima", exact: true }).click();
  await expect(tabela).toContainText("3/3");
  await page.emulateMedia({ media: "print" });
  await expect(tabela.getByRole("region", { name: "Tabela de Faltas por aluno" })).toHaveCSS(
    "max-height",
    "none",
  );
  await expect(tabela).toContainText("Exibidos 20 de 120 registros.");
  await expect
    .poll(() =>
      mapa.locator("svg[data-grafico]").evaluate((svg) => {
        const largura = svg.parentElement?.getBoundingClientRect().width;
        return largura !== undefined && svg.getBoundingClientRect().width <= largura + 1;
      }),
    )
    .toBe(true);
  await page.emulateMedia({ media: "screen" });
  await escolher(page, "Turma", "QA Turma 6");
  await expect(tabela).toContainText("1/1");
  await celula.press("Enter");
  await expect(page.getByRole("button", { name: /^Início da análise:/ })).toContainText(
    "20/10/2026",
  );
  await tabela.scrollIntoViewIfNeeded();
  await expect(tabela).toContainText("1/1");
  await expect(
    tabela.getByRole("button", { name: "Filtrar: QA Aluno 119", exact: true }),
  ).toBeVisible();
});

test("impressão prepara gráficos fora da tela e editor informa título inválido", async ({
  page,
}) => {
  await abrir(page);
  await page.evaluate(() => {
    window.print = () => {
      localStorage.setItem(
        "QA:impressao",
        JSON.stringify({
          cartoes: document.querySelectorAll("article[data-grafico-id]").length,
          pendentes: document.querySelectorAll(
            'article[data-bi-carregando="true"], article[data-grafico-id] [data-bi-modulo-carregando]',
          ).length,
        }),
      );
    };
  });
  await acaoDoBi(page, "Imprimir");
  await expect
    .poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("QA:impressao") ?? "null")))
    .toEqual({ cartoes: 4, pendentes: 0 });
  await page.getByRole("button", { name: "Personalizar este painel", exact: true }).click();
  await page
    .locator("[data-painel-item]")
    .first()
    .getByRole("button", { name: "Editar", exact: true })
    .click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Título da análise", { exact: true }).fill("");
  await dialogo.getByRole("button", { name: "Salvar análise", exact: true }).click();
  await expect(dialogo.getByRole("alert").filter({ hasText: "Confira o título" })).toBeVisible();
  await dialogo.getByLabel("Título da análise", { exact: true }).fill("QA Modelo editado");
  await dialogo.getByRole("button", { name: "Salvar análise", exact: true }).click();
  await expect(dialogo).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "QA Modelo editado", exact: true })).toBeVisible();
});
