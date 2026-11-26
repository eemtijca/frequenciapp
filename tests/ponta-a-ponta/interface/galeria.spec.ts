// Galeria versionada: prepara cada área com a semente e grava as capturas da matriz visual.
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import type { PaginaBi, RecursoBi } from "@/domain/bi";
import { RECURSOS_BI } from "@/domain/bi";
import { personalizacaoVaziaBi } from "@/domain/bi-personalizacao";
import { massaDeDemonstracaoPresente } from "../helpers/banco";
import {
  abrirConfiguracoesDaGestao,
  fecharNavegacaoMovel,
  selecionarCadastroGestao,
  selecionarCategoriaConfiguracoes,
} from "../../helpers/categorias-configuracoes";
import {
  exporRelatorios,
  selecionarRelatorio,
  type Relatorio,
  aguardarHidratacao,
  trocarVisao,
} from "../helpers/pagina";
import {
  capturarTela,
  iniciarGaleria,
  type Captura,
  type TemaCaptura,
  type ViewportCaptura,
} from "../helpers/capturas";

test.describe.configure({ mode: "serial" });
test.use({ serviceWorkers: "block" });

const CAPTURAS_ATIVAS = process.env.CAPTURAS === "1";
const DESKTOP: ViewportCaptura = { nome: "desktop", largura: 1440, altura: 900 };
const MOBILE: ViewportCaptura = { nome: "mobile", largura: 390, altura: 844 };
const TEMAS: readonly TemaCaptura[] = ["claro", "escuro"];
const CHAVE_BI = `fbi_${"q".repeat(43)}`;
const DIA_BI = "2026-10-09";

const DADOS_BI: Partial<Record<RecursoBi, PaginaBi["linhas"]>> = {
  series: [{ id: "serie-exemplo", nome: "Série de exemplo" }],
  turmas: [
    {
      id: "turma-exemplo",
      nome: "Turma de exemplo",
      turma: "Turma de exemplo",
      serie: "Série de exemplo",
      serieId: "serie-exemplo",
      turmaId: "turma-exemplo",
    },
  ],
  alunos: [
    {
      id: "aluno-exemplo",
      alunoId: "aluno-exemplo",
      nome: "Aluno de exemplo",
      aluno: "Aluno de exemplo",
      turmaId: "turma-exemplo",
      serieId: "serie-exemplo",
      ativo: true,
      desistenteEm: null,
    },
  ],
  chamadas: [
    {
      id: "chamada-exemplo",
      dia: DIA_BI,
      turma: "Turma de exemplo",
      turmaId: "turma-exemplo",
      serie: "Série de exemplo",
      serieId: "serie-exemplo",
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
      id: "falta-exemplo",
      dia: DIA_BI,
      alunoId: "aluno-exemplo",
      aluno: "Aluno de exemplo",
      turma: "Turma de exemplo",
      turmaId: "turma-exemplo",
      serie: "Série de exemplo",
      serieId: "serie-exemplo",
      aula: 1,
      aulas: 1,
      disciplina: "Matemática",
      justificativa: "Transporte",
      tipo: "FJ",
      observacao: "Registro de exemplo",
    },
  ],
  lista: [
    {
      id: "lista-exemplo",
      frequenciaId: "chamada-exemplo",
      dia: DIA_BI,
      alunoId: "aluno-exemplo",
      aluno: "Aluno de exemplo",
      turma: "Turma de exemplo",
      turmaId: "turma-exemplo",
      serieId: "serie-exemplo",
      tipo: "P",
      registradoSeduc: false,
    },
  ],
  parciais: [
    {
      id: "parcial-exemplo",
      dia: DIA_BI,
      alunoId: "aluno-exemplo",
      aluno: "Aluno de exemplo",
      turma: "Turma de exemplo",
      turmaId: "turma-exemplo",
      serieId: "serie-exemplo",
      tipo: "AULAS",
      aulas: [1, 2],
      registradoSeduc: false,
    },
  ],
  saidas: [],
  entradas: [],
  feriados: [],
};

interface AreaGaleria {
  area: string;
  tela: string;
  preparar: (page: Page) => Promise<void>;
  rota?: string;
  /** Conta da captura; o padrão é a administração. */
  conta?: "coordenacao";
  desktop?: readonly TemaCaptura[];
  mobile?: readonly TemaCaptura[];
}

let massaVerificada: boolean | null = null;

async function massaPresente(): Promise<boolean> {
  if (massaVerificada === null) massaVerificada = await massaDeDemonstracaoPresente();
  return massaVerificada;
}

function projetoDoViewport(viewport: ViewportCaptura): string {
  return viewport.nome === "desktop" ? "chromium" : "mobile-chrome";
}

function exigirProjeto(testInfo: TestInfo, viewport: ViewportCaptura): void {
  const projeto = projetoDoViewport(viewport);
  test.skip(
    testInfo.project.name !== projeto,
    `A captura ${viewport.nome} roda apenas no projeto ${projeto}.`,
  );
}

async function prepararPainel(page: Page): Promise<void> {
  await trocarVisao(page, "Painel", "painel");
  const secao = page.getByRole("region", { name: "Painel de frequência", exact: true });
  await expect(secao).toBeVisible();
  await expect(secao).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
  // Feriado e dia sem chamada não representam a rotina do Painel na galeria.
  const dia = secao.locator("#dia-painel");
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const feriado = await secao.locator("[data-feriado]").count();
    const semChamada = await secao.getByText("Nenhuma chamada salva neste dia").count();
    if (feriado === 0 && semChamada === 0) return;
    const rotuloAnterior = await dia.getAttribute("aria-label");
    await secao.getByRole("button", { name: "Dia anterior", exact: true }).click();
    await expect.poll(async () => dia.getAttribute("aria-label")).not.toBe(rotuloAnterior);
    await expect(secao.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
  }
  throw new Error("A semente não tem dia letivo com chamada para o Painel.");
}

async function prepararChamada(page: Page): Promise<void> {
  await trocarVisao(page, "Chamada", "chamada");
  const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
  await expect(secao).toBeVisible();
  await expect(secao.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
  const dia = secao.locator("#dia-frequencia");
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const lista = secao.getByRole("list", { name: "Alunos da chamada", exact: true });
    const feriado = await secao.getByText(/^Feriado ·/).count();
    const sabado = await secao
      .getByRole("button", { name: "Desbloquear sábado letivo", exact: true })
      .count();
    const semChamada = await secao.getByText("Nova chamada", { exact: true }).count();
    if (
      (await lista.isVisible().catch(() => false)) &&
      feriado === 0 &&
      sabado === 0 &&
      semChamada === 0
    ) {
      // Chamada salva abre bloqueada: a captura mostra o estado editável.
      const desbloquear = secao.getByRole("button", { name: /^Desbloquear chamada de / });
      if ((await desbloquear.count()) > 0) {
        await desbloquear.click();
        const dialogo = page.getByRole("alertdialog", {
          name: "Desbloquear chamada?",
          exact: true,
        });
        await expect(dialogo).toBeVisible();
        await dialogo.getByRole("button", { name: "Desbloquear", exact: true }).click();
        await expect(dialogo).toBeHidden({ timeout: 15_000 });
        await expect(page.getByRole("alertdialog", { name: /^Desbloquear chamada\?/ })).toHaveCount(
          0,
        );
      }
      return;
    }
    const rotuloAnterior = await dia.getAttribute("aria-label");
    await secao.getByRole("button", { name: "Dia anterior", exact: true }).click();
    await expect.poll(async () => dia.getAttribute("aria-label")).not.toBe(rotuloAnterior);
    await expect(secao.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
  }
  throw new Error("A semente não tem dia letivo com chamada para a galeria.");
}

async function prepararChamadaParcial(page: Page): Promise<void> {
  await trocarVisao(page, "Chamada Parcial", "chamada-parcial");
  const secao = page.getByRole("region", { name: "Chamada Parcial", exact: true });
  await expect(secao).toBeVisible();
  await expect(secao).toHaveAttribute("aria-busy", "false", { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Chamada parcial", exact: true })).toBeVisible();
  const dia = secao.getByRole("button", { name: /^Data da chamada parcial:/ });
  // Feriado, fim de semana ou dia sem chamada não representam a rotina da tela.
  for (let tentativa = 0; tentativa < 8; tentativa += 1) {
    const feriado = await secao.getByText(/^Feriado ·/).count();
    const registros = await secao.getByText(/^(Presente|Falta|Justificada)$/).count();
    if (feriado === 0 && registros > 0) return;
    const anterior = await dia.getAttribute("aria-label");
    await secao
      .getByRole("button", { name: "Dia anterior da chamada parcial", exact: true })
      .click();
    await expect.poll(async () => dia.getAttribute("aria-label")).not.toBe(anterior);
    await expect(secao.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
  }
  throw new Error("A semente não tem dia com registros para a Chamada Parcial.");
}

async function escolherDiaDaSemana(page: Page, dia: string): Promise<void> {
  const seletor = page.getByRole("combobox", { name: "Dia da semana", exact: true }).first();
  await seletor.click();
  await page.getByRole("option", { name: dia, exact: true }).click();
  await expect(seletor).toContainText(dia);
}

async function prepararHorarios(page: Page): Promise<void> {
  await trocarVisao(page, "Horários", "horarios");
  await expect(
    page.getByRole("region", { name: /Horários semanais|Edição de horários/ }).first(),
  ).toBeVisible();
  // O dia corrente pode cair no fim de semana e esconder a grade letiva.
  await escolherDiaDaSemana(page, "Segunda-feira");
}

async function prepararHorariosDia(page: Page): Promise<void> {
  await prepararHorarios(page);
}

async function voltarParaDiaLetivo(page: Page, rotulo: RegExp, anterior: string): Promise<void> {
  const data = page.getByRole("button", { name: rotulo }).first();
  for (let tentativa = 0; tentativa < 7; tentativa += 1) {
    const nome = await data.getAttribute("aria-label");
    if (!/sábado|domingo/i.test(nome ?? "")) return;
    await page.getByRole("button", { name: anterior, exact: true }).click();
    await expect.poll(async () => data.getAttribute("aria-label")).not.toBe(nome);
  }
}

async function prepararSaidas(page: Page): Promise<void> {
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await page.getByRole("tab", { name: "Saídas", exact: true }).click();
  await expect(page.getByRole("region", { name: "Saídas antecipadas", exact: true })).toBeVisible();
  await voltarParaDiaLetivo(page, /^Data da saída:/, "Dia anterior");
}

async function prepararEntradas(page: Page): Promise<void> {
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await page.getByRole("tab", { name: "Entradas", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Entradas registradas", exact: true }),
  ).toBeVisible();
  await voltarParaDiaLetivo(page, /^Data da entrada:/, "Dia anterior");
}

async function prepararRelatorios(page: Page, destino: Relatorio): Promise<void> {
  await selecionarRelatorio(page, destino);
  const nav = await exporRelatorios(page);
  await expect(nav.getByRole("button", { name: destino, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await fecharNavegacaoMovel(page);
  await expect(page.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
  if (destino === "Saídas e Entradas") {
    const vazio = page.getByText("Nenhuma saída ou entrada neste período.", { exact: true });
    for (let tentativa = 0; tentativa < 4; tentativa += 1) {
      if ((await vazio.count()) === 0) break;
      const data = page.getByRole("button", { name: /^Data do relatório:/ });
      const anterior = await data.getAttribute("aria-label");
      await page.getByRole("button", { name: "Dia anterior do relatório", exact: true }).click();
      await expect.poll(async () => data.getAttribute("aria-label")).not.toBe(anterior);
      await expect(page.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
    }
  }
}

async function prepararAlunos(page: Page, agrupamento?: "Turma atual" | "Turma de origem") {
  await trocarVisao(page, "Alunos", "alunos");
  const secao = page.getByRole("region", { name: "Lista de alunos", exact: true });
  await expect(secao).toBeVisible();
  if (!agrupamento) return;
  const botao = secao
    .getByRole("group", { name: "Agrupamento da lista", exact: true })
    .getByRole("button", { name: agrupamento, exact: true });
  await botao.click();
  await expect(botao).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(/^Carregando configurações/)).toBeHidden({ timeout: 15_000 });
}

async function prepararGestao(page: Page, aba: string): Promise<void> {
  await trocarVisao(page, "Gestão", "gestao");
  if (aba === "Configurações") {
    await abrirConfiguracoesDaGestao(page);
  } else {
    await selecionarCadastroGestao(page, aba);
  }
  await expect(page.getByText(/^Carregando /).first()).toBeHidden({ timeout: 15_000 });
}

async function prepararConfiguracoes(page: Page, categoria: string): Promise<void> {
  await prepararGestao(page, "Configurações");
  await selecionarCategoriaConfiguracoes(page, categoria);
  if (categoria === "Horários") await escolherDiaDaSemana(page, "Segunda-feira");
}

async function prepararEntrada(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "FrequenciApp", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByLabel(/E-mail ou identificador/)).toBeVisible();
}

async function entrarComoDiretor(page: Page): Promise<void> {
  const senha = process.env.SEED_SENHA_DIRETOR ?? "DiretorFrequencia2026";
  await page.goto("/");
  await aguardarHidratacao(page);
  await page.getByLabel(/E-mail ou identificador/).fill("diretor.1a");
  await page.getByLabel("Senha", { exact: true }).fill(senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator('[data-visao="diretor"]')).toBeVisible({ timeout: 15_000 });
  const entrada = page.getByText("Entrada confirmada.", { exact: true });
  await expect(entrada)
    .toBeVisible({ timeout: 5_000 })
    .catch(() => undefined);
  await expect(entrada).toBeHidden({ timeout: 10_000 });
}

async function prepararMinhasTurmas(page: Page): Promise<void> {
  await expect(page.getByRole("region", { name: "Minhas turmas", exact: true })).toBeVisible();
  const resumo = page.getByLabel("Resumo do período", { exact: true });
  await expect(resumo).toBeVisible();
  await expect(resumo).toHaveAttribute("aria-busy", "false");
  const areaGrafico = page.locator("[data-grafico-sob-demanda]").first();
  await areaGrafico.scrollIntoViewIfNeeded();
  const grafico = page.getByRole("img", { name: /^Ausência por aluno/ });
  await expect(grafico).toBeVisible({ timeout: 15_000 });
  await page.evaluate(() => {
    document.querySelector("main")?.scrollTo({ top: 0 });
    document.scrollingElement?.scrollTo({ top: 0 });
    window.scrollTo({ top: 0 });
  });
  await page.waitForTimeout(200);
}

async function prepararBiPortao(page: Page): Promise<void> {
  await expect(page.getByLabel("Chave de acesso", { exact: true })).toBeEnabled();
}

async function prepararApiBi(page: Page): Promise<void> {
  const personalizacao = personalizacaoVaziaBi();
  personalizacao.preferencias.filtros.inicio = DIA_BI;
  personalizacao.preferencias.filtros.fim = DIA_BI;
  await page.addInitScript((valor) => {
    if (!localStorage.getItem("frequencibi:personalizacao")) {
      localStorage.setItem("frequencibi:personalizacao", JSON.stringify(valor));
    }
  }, personalizacao);
  await page.route("**/api/bi?*", async (rota) => {
    const url = new URL(rota.request().url());
    const recurso = url.searchParams.get("recurso");
    const autorizada = rota.request().headers().authorization === `Bearer ${CHAVE_BI}`;
    if (!autorizada) {
      await rota.fulfill({ status: 401, json: { error: "Chave inválida." } });
      return;
    }
    const linhas = recurso && recurso !== "acesso" ? (DADOS_BI[recurso as RecursoBi] ?? []) : [];
    await rota.fulfill({
      status: 200,
      json: {
        recurso,
        linhas,
        pagina: 1,
        proximaPagina: null,
        consultadoEm: `${DIA_BI}T12:00:00Z`,
        escopo: {},
        recursos: RECURSOS_BI,
      },
    });
  });
}

async function prepararBiPainel(page: Page): Promise<void> {
  const indicadores = page.getByRole("region", { name: "Indicadores gerais", exact: true });
  if (await indicadores.isVisible().catch(() => false)) return;
  await page.getByLabel("Chave de acesso", { exact: true }).fill(CHAVE_BI);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  await expect(indicadores).toBeVisible({ timeout: 15_000 });
}

async function preparar404(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "Página não encontrada", exact: true }),
  ).toBeVisible();
}

async function prepararOffline(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Sem conexão", exact: true })).toBeVisible();
}

async function capturarViewport(
  page: Page,
  area: string,
  tela: string,
  viewport: ViewportCaptura,
  temas: readonly TemaCaptura[],
  preparar: (page: Page) => Promise<void>,
  rota = "/",
): Promise<void> {
  for (const tema of temas) {
    const captura: Captura = {
      nome: `${tela}-${viewport.nome}-${tema}.png`,
      area,
      viewport,
      tema,
      rota,
      preparar,
    };
    await capturarTela(page, captura);
  }
}

const AREAS: AreaGaleria[] = [
  { area: "Painel", tela: "painel", preparar: prepararPainel },
  { area: "Chamada", tela: "chamada", preparar: prepararChamada },
  { area: "Chamada Parcial", tela: "chamada-parcial", preparar: prepararChamadaParcial },
  {
    area: "Horários",
    tela: "horarios-semana",
    preparar: prepararHorarios,
    mobile: [],
  },
  {
    area: "Horários",
    tela: "horarios-dia",
    preparar: prepararHorariosDia,
    desktop: [],
    mobile: ["claro"],
  },
  {
    area: "Saídas e Entradas",
    tela: "saidas",
    preparar: prepararSaidas,
    mobile: ["claro"],
  },
  {
    area: "Saídas e Entradas",
    tela: "entradas",
    preparar: prepararEntradas,
    mobile: ["claro"],
  },
  {
    area: "Relatórios",
    tela: "relatorios-resumo",
    preparar: (page) => prepararRelatorios(page, "Resumo"),
    mobile: [],
  },
  {
    area: "Relatórios",
    tela: "relatorios-historico",
    preparar: (page) => prepararRelatorios(page, "Histórico"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Relatórios",
    tela: "relatorios-grade",
    preparar: (page) => prepararRelatorios(page, "Grade"),
    mobile: [],
  },
  {
    area: "Relatórios",
    tela: "relatorios-por-aluno",
    preparar: (page) => prepararRelatorios(page, "Por aluno"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Relatórios",
    tela: "relatorios-movimentacoes",
    preparar: (page) => prepararRelatorios(page, "Saídas e Entradas"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Alunos",
    tela: "alunos-atual",
    conta: "coordenacao",
    preparar: (page) => prepararAlunos(page, "Turma atual"),
  },
  {
    area: "Alunos",
    tela: "alunos-origem",
    conta: "coordenacao",
    preparar: (page) => prepararAlunos(page, "Turma de origem"),
  },
  {
    area: "Gestão",
    tela: "gestao-series",
    preparar: (page) => prepararGestao(page, "Séries"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Gestão",
    tela: "gestao-turmas",
    preparar: (page) => prepararGestao(page, "Turmas"),
    mobile: [],
  },
  {
    area: "Gestão",
    tela: "gestao-alunos",
    preparar: (page) => prepararGestao(page, "Alunos"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Gestão",
    tela: "gestao-equipe",
    preparar: (page) => prepararGestao(page, "Equipe"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Gestão",
    tela: "gestao-diretores",
    preparar: (page) => prepararGestao(page, "Diretores"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Gestão",
    tela: "gestao-configuracoes",
    preparar: (page) => prepararGestao(page, "Configurações"),
    mobile: [],
  },
  {
    area: "Configurações",
    tela: "configuracoes-escola",
    preparar: (page) => prepararConfiguracoes(page, "Escola"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Configurações",
    tela: "configuracoes-horarios",
    preparar: (page) => prepararConfiguracoes(page, "Horários"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Configurações",
    tela: "configuracoes-planilhas",
    preparar: (page) => prepararConfiguracoes(page, "Planilhas"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Configurações",
    tela: "configuracoes-acesso",
    preparar: (page) => prepararConfiguracoes(page, "Acesso e avisos"),
    desktop: ["claro"],
    mobile: [],
  },
  {
    area: "Configurações",
    tela: "configuracoes-dados",
    preparar: (page) => prepararConfiguracoes(page, "Dados"),
    desktop: ["claro"],
    mobile: [],
  },
];

test.beforeAll(async ({ browserName }, testInfo) => {
  // A primeira execução do Chromium reinicia o manifesto; o celular apenas acrescenta.
  if (!CAPTURAS_ATIVAS || browserName !== "chromium") return;
  if (testInfo.project.name !== "chromium") return;
  if (!(await massaPresente())) return;
  await iniciarGaleria();
});

test.beforeEach(async () => {
  test.skip(!CAPTURAS_ATIVAS, "Defina CAPTURAS=1 para gerar a galeria.");
  test.skip(!(await massaPresente()), "A galeria exige a massa de demonstração: pnpm run seed");
});

for (const area of AREAS) {
  test.describe(`${area.area}: ${area.tela}`, () => {
    if (area.conta) test.use({ storageState: `tests/ponta-a-ponta/.auth/${area.conta}.json` });
    const variantes = [
      { viewport: DESKTOP, temas: area.desktop ?? TEMAS },
      { viewport: MOBILE, temas: area.mobile ?? TEMAS },
    ].filter(({ temas }) => temas.length > 0);
    for (const { viewport, temas } of variantes) {
      test(`${area.tela} ${viewport.nome}`, async ({ page }, testInfo) => {
        exigirProjeto(testInfo, viewport);
        await capturarViewport(
          page,
          area.area,
          area.tela,
          viewport,
          temas,
          area.preparar,
          area.rota,
        );
      });
    }
  });
}

test.describe("Entrada", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const viewport of [DESKTOP, MOBILE]) {
    test(`entrada ${viewport.nome}`, async ({ page }, testInfo) => {
      exigirProjeto(testInfo, viewport);
      await capturarViewport(page, "Entrada", "entrada", viewport, TEMAS, prepararEntrada);
    });
  }
});

test.describe("Minhas turmas", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const viewport of [DESKTOP, MOBILE]) {
    test(`minhas turmas ${viewport.nome}`, async ({ page }, testInfo) => {
      exigirProjeto(testInfo, viewport);
      await entrarComoDiretor(page);
      await capturarViewport(
        page,
        "Minhas turmas",
        "minhas-turmas",
        viewport,
        TEMAS,
        prepararMinhasTurmas,
      );
    });
  }
});

test.describe("FrequenciBI", () => {
  test("bi portão desktop", async ({ page }, testInfo) => {
    exigirProjeto(testInfo, DESKTOP);
    await capturarViewport(
      page,
      "FrequenciBI",
      "bi-portao",
      DESKTOP,
      TEMAS,
      prepararBiPortao,
      "/bi",
    );
  });

  test("bi portão mobile", async ({ page }, testInfo) => {
    exigirProjeto(testInfo, MOBILE);
    await capturarViewport(
      page,
      "FrequenciBI",
      "bi-portao",
      MOBILE,
      ["claro"],
      prepararBiPortao,
      "/bi",
    );
  });

  test("bi painel desktop", async ({ page }, testInfo) => {
    exigirProjeto(testInfo, DESKTOP);
    await prepararApiBi(page);
    await capturarViewport(
      page,
      "FrequenciBI",
      "bi-painel",
      DESKTOP,
      TEMAS,
      prepararBiPainel,
      "/bi",
    );
  });
});

test.describe("Estados", () => {
  test("estados desktop", async ({ page }, testInfo) => {
    exigirProjeto(testInfo, DESKTOP);
    for (const tema of TEMAS) {
      await capturarTela(page, {
        nome: `estados-404-desktop-${tema}.png`,
        area: "Estados",
        viewport: DESKTOP,
        tema,
        rota: "/pagina-inexistente",
        preparar: preparar404,
      });
      await capturarTela(page, {
        nome: `estados-offline-desktop-${tema}.png`,
        area: "Estados",
        viewport: DESKTOP,
        tema,
        rota: "/offline.html",
        preparar: prepararOffline,
      });
    }
  });
});
