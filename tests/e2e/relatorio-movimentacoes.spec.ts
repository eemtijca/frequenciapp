// Relatório de saídas e entradas: turmas, períodos civis, recuperação de rede e navegação móvel.
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { Turma } from "@/domain/frequencia";
import type {
  MovimentacaoRelatorio,
  RelatorioMovimentacoes,
} from "@/domain/relatorio-movimentacoes";
import { comBanco, criarMassaE2E, limparMassaE2E } from "./helpers/banco";
import { aguardarHidratacao, trocarVisao } from "./helpers/pagina";

test.use({ serviceWorkers: "block" });
test.beforeAll(async () => {
  await criarMassaE2E();
  await comBanco((cliente) =>
    cliente.query(
      "insert into turmas (serie_id, nome) select id, 'B' from series where nome = 'E2E Ano'",
    ),
  );
});
test.afterAll(limparMassaE2E);

const ENDERECO = "**/api/relatorios/movimentacoes?**";

async function turmasDoTeste(page: Page) {
  const { turmas } = (await (await page.request.get("/api/turmas")).json()) as {
    turmas: Turma[];
  };
  const turmaA = turmas.find((turma) => turma.rotulo === "E2E Ano A");
  const turmaB = turmas.find((turma) => turma.rotulo === "E2E Ano B");
  if (!turmaA || !turmaB) throw new Error("Turmas do relatório não encontradas.");
  return [turmaA, turmaB];
}

function resultado(url: string, turmas: Turma[]): RelatorioMovimentacoes {
  const parametros = new URL(url).searchParams;
  const de = parametros.get("de") ?? "";
  const ate = parametros.get("ate") ?? "";
  const filtro = parametros.get("turmaId");
  const grupos = turmas.map((turma, indice) => {
    const movimentacoes: MovimentacaoRelatorio[] = [
      {
        id: `e2e-saida-${indice}`,
        tipo: "SAIDA",
        alunoId: `e2e-aluno-${indice}`,
        alunoNome: `E2E Estudante da turma ${turma.nome}`,
        dia: de,
        horario: "10:15",
        momento: "aula_3",
        motivo: "Consulta de acompanhamento",
        responsavel: "E2E Coordenação",
      },
    ];
    if (indice === 0)
      movimentacoes.push({
        id: "e2e-entrada-a",
        tipo: "ENTRADA",
        alunoId: "e2e-outro-aluno",
        alunoNome: "E2E Estudante com nome completo para conferir a largura no celular",
        dia: ate,
        horario: "08:05",
        momento: "aula_2",
        motivo: "Atraso do transporte escolar",
        responsavel: "E2E Secretaria",
      });
    return {
      turmaId: turma.id,
      turmaRotulo: turma.rotulo,
      saidas: 1,
      entradas: indice === 0 ? 1 : 0,
      total: movimentacoes.length,
      movimentacoes,
    };
  });
  const selecionadas = grupos.filter((grupo) => !filtro || grupo.turmaId === filtro);
  return {
    de,
    ate,
    totais: selecionadas.reduce(
      (total, grupo) => ({
        saidas: total.saidas + grupo.saidas,
        entradas: total.entradas + grupo.entradas,
        total: total.total + grupo.total,
      }),
      { saidas: 0, entradas: 0, total: 0 },
    ),
    turmas: selecionadas,
  };
}

async function abrir(page: Page) {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Relatórios", "relatorios");
  await page.getByRole("tab", { name: "Saídas e entradas", exact: true }).click();
  return page.getByRole("region", { name: "Relatório de saídas e entradas", exact: true });
}

function totais(painel: Locator) {
  return painel.locator("dl").first().locator("dd");
}

async function escolherDia(page: Page, painel: Locator, rotulo: string, dia: string) {
  await painel.getByRole("button", { name: new RegExp(`^${rotulo}:`) }).click();
  const calendario = page.getByRole("dialog", { name: rotulo, exact: true });
  const data = new Date(`${dia}T12:00:00Z`);
  const mes = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  const mesCompleto = `${mes.charAt(0).toUpperCase()}${mes.slice(1)}`;
  for (let indice = 0; indice < 60; indice += 1) {
    if (await calendario.getByRole("group", { name: `Dias de ${mesCompleto}` }).count()) break;
    const grade = calendario.getByRole("group", { name: /^Dias de / });
    const anterior = await grade.getAttribute("aria-label");
    await calendario.getByRole("button", { name: "Mês anterior", exact: true }).click();
    await expect(grade).not.toHaveAttribute("aria-label", anterior ?? "");
  }
  const dataCompleta = new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(data);
  await calendario.getByRole("button", { name: new RegExp(`^${dataCompleta}(,|$)`) }).click();
  await expect(calendario).toHaveCount(0);
}

test("agrupa duas turmas, filtra os registros e mantém as cinco abas legíveis no celular", async ({
  page,
}, info) => {
  const turmas = await turmasDoTeste(page);
  await page.route(ENDERECO, (rota) =>
    rota.fulfill({ json: resultado(rota.request().url(), turmas) }),
  );
  const painel = await abrir(page);
  await expect(totais(painel)).toHaveText(["2", "1"]);
  const grupoA = painel.getByRole("region", { name: "Turma E2E Ano A", exact: true });
  const grupoB = painel.getByRole("region", { name: "Turma E2E Ano B", exact: true });
  await expect(grupoA.getByRole("listitem")).toHaveCount(2);
  await expect(grupoB.getByRole("listitem")).toHaveCount(1);
  await expect(grupoA).toContainText("Atraso do transporte escolar");
  await expect(grupoA).toContainText("E2E Secretaria");

  const aba = page.getByRole("tab", { name: "Saídas e entradas", exact: true });
  for (const largura of [360, 320]) {
    await page.setViewportSize({ width: largura, height: 780 });
    await expect(aba).toBeVisible();
    expect(await aba.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(
      true,
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const seletor = painel.getByRole("button", { name: /^Data do relatório:/ });
    expect(
      await seletor.locator(".numerais-tabulares").evaluate((elemento) => {
        const botao = elemento.closest("button")?.getBoundingClientRect();
        const caixa = elemento.getBoundingClientRect();
        return Boolean(botao && caixa.left >= botao.left && caixa.right <= botao.right);
      }),
    ).toBe(true);
  }
  await aba.focus();
  await aba.press("ArrowLeft");
  await expect(aba).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("ArrowRight");
  await expect(aba).toHaveAttribute("aria-selected", "true");
  await expect(aba).toBeFocused();

  await painel.getByRole("combobox", { name: "Turma do relatório de movimentações" }).click();
  await page.getByRole("option", { name: "E2E Ano B", exact: true }).click();
  await expect(totais(painel)).toHaveText(["1", "0"]);
  await expect(grupoA).toHaveCount(0);
  await expect(grupoB).toBeVisible();
  await page.screenshot({
    path: `docs/imagens/locais/relatorio-movimentacoes-${info.project.name}.png`,
  });
});

test("consulta dia, semana completa entre meses e período personalizado com fins de semana", async ({
  page,
}) => {
  const turmas = await turmasDoTeste(page);
  const consultas: { de: string; ate: string }[] = [];
  await page.route(ENDERECO, (rota) => {
    const dados = resultado(rota.request().url(), turmas);
    consultas.push({ de: dados.de, ate: dados.ate });
    if (dados.de !== dados.ate) {
      const grupo = dados.turmas[0];
      const saida = grupo?.movimentacoes[0];
      if (saida) {
        const sabado = new Date(`${dados.ate}T12:00:00Z`);
        sabado.setUTCDate(sabado.getUTCDate() - 1);
        saida.dia = sabado.toISOString().slice(0, 10);
        saida.motivo = "E2E Saída de sábado";
      }
      const entrada = grupo?.movimentacoes[1];
      if (entrada) entrada.motivo = "E2E Entrada de domingo";
    }
    return rota.fulfill({ json: dados });
  });
  const painel = await abrir(page);
  await expect(totais(painel)).toHaveText(["2", "1"]);
  const hoje = consultas[0]?.de;
  if (!hoje) throw new Error("Consulta inicial do relatório não recebida.");
  expect(consultas[0]?.ate).toBe(hoje);
  await expect(painel.getByRole("button", { name: "Dia", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await painel.getByRole("button", { name: "Semana", exact: true }).click();
  const segundaAtual = new Date(`${hoje}T12:00:00Z`);
  segundaAtual.setUTCDate(segundaAtual.getUTCDate() - ((segundaAtual.getUTCDay() + 6) % 7));
  await expect
    .poll(() => consultas.at(-1))
    .toEqual({ de: segundaAtual.toISOString().slice(0, 10), ate: hoje });
  await expect(
    painel.getByRole("button", { name: "Próxima semana do relatório", exact: true }),
  ).toBeDisabled();

  const fronteira = new Date(Date.UTC(Number(hoje.slice(0, 4)) - 1, 8, 1, 12));
  if (fronteira.getUTCDay() === 1) fronteira.setUTCMonth(9);
  const inicio = new Date(fronteira);
  inicio.setUTCDate(inicio.getUTCDate() - ((inicio.getUTCDay() + 6) % 7));
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 6);
  const de = inicio.toISOString().slice(0, 10);
  const ate = fim.toISOString().slice(0, 10);
  expect(de.slice(0, 7)).not.toBe(ate.slice(0, 7));
  await escolherDia(page, painel, "Data do relatório", fronteira.toISOString().slice(0, 10));
  await expect.poll(() => consultas.at(-1)).toEqual({ de, ate });
  await expect(painel.getByText("E2E Saída de sábado", { exact: true })).toBeVisible();
  await expect(painel.getByText("E2E Entrada de domingo", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Período personalizado", exact: true }).click();
  await escolherDia(page, painel, "Data inicial do relatório", de);
  await escolherDia(page, painel, "Data final do relatório", ate);
  await expect.poll(() => consultas.at(-1)).toEqual({ de, ate });
  await expect(painel.getByText("E2E Entrada de domingo", { exact: true })).toBeVisible();
});

test("oculta dados antigos na falha, permite tentar novamente e distingue o período vazio", async ({
  page,
}) => {
  const turmas = await turmasDoTeste(page);
  let estado: "dados" | "erro" | "vazio" = "dados";
  await page.route(ENDERECO, (rota) => {
    if (estado === "erro")
      return rota.fulfill({ status: 503, json: { error: "E2E Falha temporária do relatório." } });
    const dados = resultado(rota.request().url(), estado === "vazio" ? [] : turmas);
    return rota.fulfill({ json: dados });
  });
  const painel = await abrir(page);
  await expect(totais(painel)).toHaveText(["2", "1"]);
  estado = "erro";
  await painel.getByRole("button", { name: "Dia anterior do relatório", exact: true }).click();
  await expect(painel.getByRole("status")).toContainText("E2E Falha temporária do relatório.");
  await expect(totais(painel)).toHaveCount(0);
  await expect(painel.getByRole("region", { name: /^Turma / })).toHaveCount(0);
  estado = "dados";
  await painel.getByRole("button", { name: "Atualizar saídas e entradas", exact: true }).click();
  await expect(totais(painel)).toHaveText(["2", "1"]);
  await expect(painel.getByText("E2E Falha temporária do relatório.", { exact: true })).toHaveCount(
    0,
  );
  estado = "vazio";
  await painel.getByRole("button", { name: "Dia anterior do relatório", exact: true }).click();
  await expect(totais(painel)).toHaveText(["0", "0"]);
  await expect(painel.getByText(/Nenhuma saída ou entrada/)).toBeVisible();
  await expect(painel.getByText("E2E Falha temporária do relatório.", { exact: true })).toHaveCount(
    0,
  );
});

test("uma resposta atrasada não substitui o dia escolhido depois", async ({ page }) => {
  const turmas = await turmasDoTeste(page);
  let atrasar = false;
  let urlAntiga = "";
  let liberar: () => void = () => undefined;
  let concluir: () => void = () => undefined;
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const respostaEntregue = new Promise<void>((resolver) => {
    concluir = resolver;
  });
  await page.route(ENDERECO, async (rota) => {
    const dados = resultado(rota.request().url(), turmas);
    const antiga = atrasar && !urlAntiga;
    if (antiga) {
      urlAntiga = rota.request().url();
      await espera;
    }
    for (const grupo of dados.turmas)
      for (const item of grupo.movimentacoes)
        item.motivo = antiga ? "E2E Resposta antiga" : "E2E Resposta vigente";
    try {
      await rota.fulfill({ json: dados });
    } finally {
      if (antiga) concluir();
    }
  });
  try {
    const painel = await abrir(page);
    await expect(totais(painel)).toHaveText(["2", "1"]);
    atrasar = true;
    await painel.getByRole("button", { name: "Dia anterior do relatório", exact: true }).click();
    await expect.poll(() => urlAntiga).not.toBe("");
    await expect(totais(painel)).toHaveCount(0);
    await painel.getByRole("button", { name: "Dia anterior do relatório", exact: true }).click();
    await expect(painel.getByText("E2E Resposta vigente", { exact: true })).toHaveCount(3);
    liberar();
    await respostaEntregue;
    await page.evaluate(
      () =>
        new Promise<void>((resolver) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolver())),
        ),
    );
    await expect(painel.getByText("E2E Resposta antiga", { exact: true })).toHaveCount(0);
    await expect(painel.getByText("E2E Resposta vigente", { exact: true })).toHaveCount(3);
  } finally {
    liberar();
  }
});

test("ao voltar à aba, aguarda dados novos sem exibir os totais da visita anterior", async ({
  page,
}) => {
  const turmas = await turmasDoTeste(page);
  let consultas = 0;
  let liberar: () => void = () => undefined;
  const espera = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  await page.route(ENDERECO, async (rota) => {
    consultas += 1;
    const dados = resultado(rota.request().url(), turmas);
    if (consultas > 1) {
      await espera;
      dados.turmas = dados.turmas.filter((grupo) => grupo.turmaRotulo === "E2E Ano B");
      dados.totais = { saidas: 1, entradas: 0, total: 1 };
    }
    await rota.fulfill({ json: dados });
  });
  try {
    const painel = await abrir(page);
    await expect(totais(painel)).toHaveText(["2", "1"]);
    await expect(painel).toHaveAttribute("aria-busy", "false");
    expect(consultas).toBe(1);
    await page.getByRole("tab", { name: "Histórico", exact: true }).click();
    await expect(painel).toBeHidden();
    await page.evaluate(
      () =>
        new Promise<void>((resolver) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolver())),
        ),
    );
    expect(consultas).toBe(1);
    await page.getByRole("tab", { name: "Saídas e entradas", exact: true }).click();
    await expect.poll(() => consultas).toBe(2);
    await expect(painel).toHaveAttribute("aria-busy", "true");
    await expect(totais(painel)).toHaveCount(0);
    await expect(painel.getByRole("region", { name: /^Turma / })).toHaveCount(0);
    liberar();
    await expect(totais(painel)).toHaveText(["1", "0"]);
    await expect(painel).toHaveAttribute("aria-busy", "false");
    await expect(
      painel.getByRole("region", { name: "Turma E2E Ano B", exact: true }),
    ).toBeVisible();
  } finally {
    liberar();
  }
});

test("agrupa por aluno com saídas e entradas, busca por nome e filtra duas ou mais", async ({
  page,
}) => {
  const turmas = await turmasDoTeste(page);
  const registro = (extra: Partial<MovimentacaoRelatorio>): MovimentacaoRelatorio => ({
    id: "e2e-m",
    tipo: "SAIDA",
    alunoId: "e2e-ana",
    alunoNome: "E2E Ana Souza",
    dia: "2026-10-05",
    horario: "09:00",
    momento: "aula_3",
    motivo: "Consulta de acompanhamento",
    responsavel: "E2E Coordenação",
    ...extra,
  });
  const movimentosA = [
    registro({ id: "e2e-m1" }),
    registro({ id: "e2e-m2", tipo: "ENTRADA", dia: "2026-10-06", motivo: "Atraso do ônibus" }),
    registro({ id: "e2e-m3", alunoId: "e2e-bruno", alunoNome: "E2E Bruno Lima" }),
  ];
  await page.route(ENDERECO, (rota) =>
    rota.fulfill({
      json: {
        de: "2026-10-05",
        ate: "2026-10-06",
        totais: { saidas: 2, entradas: 1, total: 3 },
        turmas: [
          {
            turmaId: turmas[0]?.id ?? "",
            turmaRotulo: "E2E Ano A",
            saidas: 2,
            entradas: 1,
            total: 3,
            movimentacoes: movimentosA,
          },
        ],
      } satisfies RelatorioMovimentacoes,
    }),
  );
  const painel = await abrir(page);
  await expect(painel.getByRole("region", { name: "Turma E2E Ano A", exact: true })).toBeVisible();

  const porAluno = painel.getByRole("button", { name: "Por aluno", exact: true });
  await porAluno.click();
  await expect(porAluno).toHaveAttribute("aria-pressed", "true");
  const ana = painel.getByRole("region", { name: "Aluno E2E Ana Souza", exact: true });
  const bruno = painel.getByRole("region", { name: "Aluno E2E Bruno Lima", exact: true });
  await expect(painel.getByRole("region", { name: /^Turma / })).toHaveCount(0);
  await expect(ana.getByText("1 saída", { exact: true })).toBeVisible();
  await expect(ana.getByText("1 entrada", { exact: true })).toBeVisible();
  await expect(ana.getByRole("listitem")).toHaveCount(2);
  await expect(ana).toContainText("Atraso do ônibus");
  await expect(bruno.getByText("1 saída", { exact: true })).toBeVisible();
  await expect(bruno.getByText("0 entradas", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);

  await painel.getByRole("searchbox", { name: "Buscar aluno no relatório" }).fill("bruno");
  await expect(ana).toHaveCount(0);
  await expect(bruno).toBeVisible();
  await painel.getByRole("searchbox", { name: "Buscar aluno no relatório" }).fill("");

  await painel.getByRole("combobox", { name: "Filtro de alunos do relatório" }).click();
  await page.getByRole("option", { name: "Duas ou mais no período", exact: true }).click();
  await expect(ana).toBeVisible();
  await expect(bruno).toHaveCount(0);

  await painel.getByRole("button", { name: "Por turma", exact: true }).click();
  await expect(painel.getByRole("region", { name: "Turma E2E Ano A", exact: true })).toBeVisible();
  await expect(painel.getByRole("region", { name: /^Aluno / })).toHaveCount(0);
});
