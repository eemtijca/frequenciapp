// Exercita o formulário, a revisão e o histórico de movimentações em Chromium sem banco.
import { chromium, expect, type Browser, type Locator, type Page } from "@playwright/test";
import { afterAll, beforeAll, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";
import { DIA, ENTRADAS, NOME, RESPONSAVEL, SAIDAS, TURMA } from "./movimentacoes-dados";

let navegador: Browser;
let servidor: ServidorFixture;
type Aba = "saidas" | "entradas";
type Tema = "light" | "dark";

function moldura(campo: Locator, classe = "MuiOutlinedInput-root") {
  return campo.locator(
    `xpath=ancestor::*[contains(concat(' ', normalize-space(@class), ' '), ' ${classe} ')][1]`,
  );
}

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/movimentacoes.html");
  navegador = await chromium.launch();
});

afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function comVista(
  aba: Aba,
  largura: number,
  tema: Tema,
  conferir: (page: Page, escritas: string[]) => Promise<void>,
  parametros: Record<string, string> = {},
  aguardarLeitura?: Promise<void>,
  responder?: (alvo: URL) => Promise<{ json: unknown; status?: number } | undefined>,
) {
  const url = new URL(servidor.url);
  url.searchParams.set("aba", aba);
  for (const [chave, valor] of Object.entries(parametros)) url.searchParams.set(chave, valor);
  const page = await navegador.newPage({
    viewport: { width: largura, height: 844 },
    locale: "pt-BR",
    timezoneId: "America/Fortaleza",
    colorScheme: tema,
    serviceWorkers: "block",
    isMobile: largura < 600,
    hasTouch: largura < 600,
  });
  const erros: string[] = [];
  const escritas: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  try {
    await page.route("**/*", async (route) => {
      const pedido = route.request();
      const alvo = new URL(pedido.url());
      if (alvo.origin === url.origin && pedido.method() === "GET") {
        if (alvo.pathname === "/api/planilha-saidas/estado") {
          return route.fulfill({ json: { estado: { podeEnviar: false } } });
        }
        if (alvo.pathname === "/api/entradas" || alvo.pathname === "/api/saidas") {
          const resposta = await responder?.(alvo);
          if (resposta) return route.fulfill(resposta);
          const entradas = alvo.pathname.endsWith("entradas");
          const doDia = alvo.searchParams.get(entradas ? "de" : "dia") === DIA;
          if (doDia) await aguardarLeitura;
          if (doDia && parametros.falha)
            return route.fulfill({
              status: 503,
              json: { error: "Leitura sintética indisponível." },
            });
          return route.fulfill({
            json: entradas
              ? {
                  entradas:
                    doDia && !parametros.vazio && !alvo.searchParams.has("turmaId") ? ENTRADAS : [],
                }
              : { saidas: doDia && !parametros.vazio ? SAIDAS : [] },
          });
        }
        if (!alvo.pathname.startsWith("/api/")) return route.continue();
      }
      if (pedido.method() !== "GET") escritas.push(`${pedido.method()} ${alvo.pathname}`);
      else erros.push(`Leitura inesperada: ${alvo.pathname}`);
      return route.abort();
    });
    await page.clock.setFixedTime(new Date("2026-11-19T15:00:00Z"));
    if (parametros.atualizar) {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "onLine", { get: () => true }),
      );
    }
    await page.goto(url.href);
    await expect(
      page.getByRole("tab", { name: aba === "saidas" ? "Saídas" : "Entradas" }),
    ).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => document.fonts.ready);
    await conferir(page, escritas);
  } finally {
    await page.close();
    expect(erros).toEqual([]);
  }
}

async function preencher(page: Page, fluxo: "saída" | "entrada") {
  await page.getByRole("combobox", { name: "Aluno", exact: true }).fill("Atividades");
  await page.getByRole("option", { name: new RegExp(`^${NOME}`) }).click();
  await page.getByRole("combobox", { name: new RegExp(`^Momento da ${fluxo}`) }).click();
  await page.getByRole("option", { name: "2ª aula", exact: true }).click();
  await page.getByRole("combobox", { name: /^Responsável (pela liberação|pelo registro)/ }).click();
  await page.getByRole("option", { name: RESPONSAVEL, exact: true }).click();
  await page.getByRole("radio", { name: "Escrever", exact: true }).click();
  await page
    .getByRole("textbox", { name: /Texto da justificativa/ })
    .fill("Justificativa sintética para revisão");
}

it.each([
  ["saidas", "light"],
  ["entradas", "dark"],
] as const)("usa a largura do diálogo de revisão sem gravar em %s (%s)", async (aba, tema) => {
  const fluxo = aba === "saidas" ? "saída" : "entrada";
  await comVista(aba, 320, tema, async (page, escritas) => {
    await preencher(page, fluxo);
    const registrar = page.getByRole("button", { name: `Registrar ${fluxo}`, exact: true });
    await registrar.click();
    const dialogo = page.getByRole("alertdialog", { name: `Registrar ${fluxo}?`, exact: true });
    const revisar = dialogo.getByRole("button", { name: "Revisar", exact: true });
    await expect(revisar).toBeFocused();
    const valor = dialogo.getByText(NOME, { exact: true });
    await expect(valor).toBeVisible();
    for (const largura of [320, 390, 599, 600, 1440]) {
      await page.setViewportSize({ width: largura, height: 844 });
      const medidas = await valor.evaluate((el) => {
        const rotulo = el.previousElementSibling;
        const lista = el.closest("dl");
        if (el.tagName !== "DD" || rotulo?.tagName !== "DT" || !lista)
          throw new Error("Resumo sem lista de definições");
        const termo = rotulo.getBoundingClientRect();
        const caixa = el.getBoundingClientRect();
        const texto = document.createRange();
        texto.selectNodeContents(el);
        return {
          empilhado: caixa.top >= termo.bottom && Math.abs(caixa.left - termo.left) < 1,
          usaLargura: Math.abs(caixa.width - lista.getBoundingClientRect().width) < 1,
          cabe: Array.from(texto.getClientRects()).every(
            ({ left, right }) => left >= caixa.left - 1 && right <= caixa.right + 1,
          ),
        };
      });
      expect.soft(medidas.empilhado, `rótulo junto do valor a ${largura} px`).toBe(largura < 600);
      expect.soft(medidas.usaLargura, `largura do valor a ${largura} px`).toBe(largura < 600);
      expect(medidas.cabe).toBe(true);
      await expect(
        dialogo.getByRole("button", { name: `Registrar ${fluxo}`, exact: true }),
      ).toBeInViewport();
    }
    await revisar.press("Escape");
    await expect(dialogo).toBeHidden();
    await expect(registrar).toBeFocused();
    await expect(page.getByRole("textbox", { name: /Texto da justificativa/ })).toHaveValue(
      "Justificativa sintética para revisão",
    );
    expect(escritas).toEqual([]);
  });
});

it.each([
  ["saidas", "dark"],
  ["entradas", "light"],
] as const)(
  "aproxima o contexto do formulário sem apertar campos em %s (%s)",
  async (aba, tema) => {
    const fluxo = aba === "saidas" ? "saída" : "entrada";
    await comVista(aba, 320, tema, async (page) => {
      const data = page.getByRole("button", { name: new RegExp(`^Data da ${fluxo}:`) });
      const atualizado = page.getByText(/^Atualizado em /);
      const registrar = page.getByRole("button", { name: `Registrar ${fluxo}`, exact: true });
      const turma = page.getByRole("combobox", { name: /^Turma/ });
      const aluno = page.getByRole("combobox", { name: "Aluno", exact: true });
      const momento = page.getByRole("combobox", { name: `Momento da ${fluxo}` });
      const hora = page.getByRole("group", {
        name: `Horário da ${fluxo === "saída" ? "saída" : "chegada"}`,
      });
      const campoHorario = moldura(
        page.locator(aba === "saidas" ? "#saida-horario" : "#entrada-horario"),
        "MuiPickersInputBase-root",
      );
      const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
      const planilha = page.getByRole("button", {
        name: "Enviar saídas e entradas para a planilha",
      });
      const medir = async (alvo: typeof data) => {
        const caixa = await alvo.boundingBox({ timeout: 2500 });
        if (!caixa) throw new Error(`Controle não renderizado: ${alvo}`);
        return caixa;
      };
      for (const largura of [320, 390, 904, 905, 1440]) {
        await page.setViewportSize({ width: largura, height: 844 });
        const [d, a, t, l, m, h, s, p, r] = await Promise.all([
          medir(data),
          medir(atualizado),
          medir(moldura(turma)),
          medir(moldura(aluno)),
          medir(moldura(momento)),
          medir(campoHorario),
          medir(seguinte),
          medir(planilha),
          medir(registrar),
        ]);
        expect.soft(a.y - d.y - d.height, `folga após a data a ${largura} px`).toBeCloseTo(8, 0);
        expect(s.x + s.width).toBeCloseTo(p.x + p.width, 0);
        expect(a.x + a.width).toBeCloseTo(p.x + p.width, 0);
        expect(largura < 905 ? l.y > t.y && h.y > m.y : l.y === t.y && h.y === m.y).toBe(true);
        for (const [nome, campo] of [
          ["Turma", t],
          ["Aluno", l],
          ["Momento", m],
          ["Horário", h],
        ] as const) {
          expect(campo.height, `altura de ${nome} a ${largura} px`).toBeGreaterThanOrEqual(48);
        }
        if (largura < 600) {
          // A observação do catálogo em Entradas acrescenta um campo no estado inicial.
          const limite = aba === "saidas" ? 860 : 940;
          expect(r.y - d.y, `distância entre data e registro a ${largura} px`).toBeLessThan(limite);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(largura);
      }
      await turma.focus();
      await page.keyboard.press("Tab");
      await expect(aluno).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(momento).toBeFocused();
      await page.keyboard.press("Tab");
      expect(await hora.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    });
    await comVista(
      aba,
      1440,
      tema,
      async (page) => {
        const turma = page.getByRole("combobox", { name: /^Turma/ });
        const aluno = page.getByRole("combobox", { name: "Aluno", exact: true });
        const antes = await moldura(turma).boundingBox();
        const depois = await moldura(aluno).boundingBox();
        expect(
          antes && depois && depois.y > antes.y && Math.abs(antes.width - depois.width) < 1,
        ).toBe(true);
        await turma.click();
        const opcao = page.getByRole("option", { name: TURMA, exact: true });
        await expect(opcao).toBeVisible();
        await opcao.click();
        await expect(turma).toBeFocused();
      },
      { estreito: "1" },
    );
  },
);

it.each(["saidas", "entradas"] as const)(
  "distingue histórico vazio, carregando e com erro em %s",
  async (aba) => {
    const nome = aba === "saidas" ? /^Saídas de / : "Entradas registradas";
    const vazio =
      aba === "saidas"
        ? "Nenhuma saída registrada neste dia."
        : "Nenhuma entrada registrada neste recorte.";
    const leitura = Promise.withResolvers<void>();
    await comVista(
      aba,
      390,
      "light",
      async (page, escritas) => {
        const historico = page.getByRole("region", { name: nome });
        try {
          await expect(historico.getByRole("status").getByText(/^Carregando/)).toBeVisible();
          await expect(historico.getByText(vazio, { exact: true })).toHaveCount(0);
          await expect(historico.getByRole("heading", { name: /\(0\)/ })).toHaveCount(0);
        } finally {
          leitura.resolve();
        }
        await expect(historico.getByText(vazio, { exact: true })).toBeVisible({ timeout: 3000 });
        await expect(historico.getByRole("heading", { name: /\(0\)/ })).toBeVisible();
        await expect(historico.getByRole("button", { name: /Remover|Desbloquear/ })).toHaveCount(0);
        expect(escritas).toEqual([]);
      },
      { remoto: "1", vazio: "1" },
      leitura.promise,
    );
    await comVista(
      aba,
      390,
      "dark",
      async (page, escritas) => {
        const historico = page.getByRole("region", { name: nome });
        await expect(
          historico.getByText("Leitura sintética indisponível.", { exact: true }),
        ).toBeVisible();
        await expect(historico.getByText(vazio, { exact: true })).toHaveCount(0);
        await expect(historico.getByRole("heading", { name: /\(0\)/ })).toHaveCount(0);
        expect(escritas).toEqual([]);
      },
      { remoto: "1", falha: "1" },
    );
  },
);

it.each(["saidas", "entradas"] as const)(
  "preserva escopo, remoção e acesso até a última linha do histórico de %s",
  async (aba) => {
    const saida = aba === "saidas";
    await comVista(aba, 320, "dark", async (page, escritas) => {
      const historico = page.getByRole("region", {
        name: saida ? /^Saídas de / : "Entradas registradas",
      });
      await expect(historico.getByRole("heading", { name: /\(12\)/ })).toBeVisible({
        timeout: 3000,
      });
      const lista = historico.getByRole("list");
      const linhas = lista.getByRole("listitem");
      await expect(linhas).toHaveCount(12);
      await expect(linhas.first().getByText(NOME, { exact: true })).toBeVisible();
      await expect(
        linhas
          .first()
          .getByText(saida ? "Turma histórica sintética" : "Turma registrada na entrada", {
            exact: true,
          }),
      ).toBeVisible();
      await expect(linhas.last().getByText("Aluno de histórico 11", { exact: true })).toBeVisible();
      if (saida) {
        await expect(lista.getByRole("button", { name: /^Remover saída/ })).toHaveCount(0);
        await historico.getByRole("button", { name: /^Desbloquear remoção/ }).click();
      }
      const remover = linhas.last().getByRole("button", { name: /^Remover (saída|entrada)/ });
      await remover.scrollIntoViewIfNeeded();
      await remover.focus();
      await expect(remover).toBeInViewport();
      await remover.press("Enter");
      const dialogo = page.getByRole("alertdialog", { name: /^Remover esta (saída|entrada)\?/ });
      await expect(dialogo).toContainText("Aluno de histórico 11");
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      await expect(remover).toBeFocused();
      await expect(linhas).toHaveCount(12);
      const turma = page.getByRole("combobox", { name: /^Turma/ });
      await turma.click();
      await page.getByRole("option", { name: TURMA, exact: true }).click();
      if (saida) {
        await expect(linhas).toHaveCount(12);
        await expect(
          linhas.nth(1).getByText("Turma histórica desconhecida", { exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          historico.getByText("Nenhuma entrada registrada neste recorte."),
        ).toBeVisible();
        await expect(linhas).toHaveCount(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
      expect(escritas).toEqual([]);
    });
  },
);

it.each(["saidas", "entradas"] as const)(
  "anuncia o resultado vazio do histórico de %s em uma região persistente",
  async (aba) => {
    const leitura = Promise.withResolvers<void>();
    await comVista(
      aba,
      390,
      "light",
      async (page, escritas) => {
        const historico = page.getByRole("region", {
          name: aba === "saidas" ? /^Saídas de / : "Entradas registradas",
        });
        const estado = historico.locator('[role="status"][aria-live="polite"]');
        let no;
        try {
          await expect(estado).toHaveText(/^Carregando/, { timeout: 1500 });
          no = await estado.elementHandle();
        } finally {
          leitura.resolve();
        }
        await expect(estado).toHaveText(/0 registros/);
        expect(await estado.evaluate((atual, anterior) => atual === anterior, no)).toBe(true);
        await expect(historico.getByRole("heading", { name: "Nenhum registro" })).toBeVisible();
        expect(escritas).toEqual([]);
      },
      { remoto: "1", vazio: "1" },
      leitura.promise,
    );
  },
);

it("não apresenta o mês desatualizado e tenta novamente só o dia de Saídas", async () => {
  const mensal = Promise.withResolvers<void>();
  const diaria = Promise.withResolvers<void>();
  const consultas: string[] = [];
  await comVista(
    "saidas",
    390,
    "dark",
    async (page, escritas) => {
      const historico = page.getByRole("region", { name: /^Saídas de / });
      await expect(historico.getByRole("listitem")).toHaveCount(12);
      await historico.getByRole("button", { name: /^Desbloquear remoção/ }).click();
      try {
        await page.getByRole("button", { name: "Atualizar tela" }).click();
        await expect.poll(() => consultas).toEqual(["mês"]);
        await expect.soft(historico.getByRole("listitem")).toHaveCount(0, { timeout: 1000 });
        await expect
          .soft(historico.getByRole("button", { name: /Remover|Bloquear/ }))
          .toHaveCount(0, { timeout: 1000 });
        mensal.resolve();
        await expect(historico.getByText("Leitura mensal indisponível.")).toBeVisible({
          timeout: 1500,
        });
        await historico.getByRole("button", { name: "Tentar novamente" }).press("Enter");
        await expect.poll(() => consultas).toEqual(["mês", DIA]);
        await expect(historico.getByRole("listitem")).toHaveCount(0);
        diaria.resolve();
        await expect(historico.getByRole("listitem")).toHaveCount(1);
        await expect(historico.getByRole("status")).toHaveText(/1 registro/);
        expect(escritas).toEqual([]);
      } finally {
        mensal.resolve();
        diaria.resolve();
      }
    },
    { atualizar: "1" },
    undefined,
    async (alvo) => {
      if (alvo.searchParams.get("de") === "2026-11-01") {
        consultas.push("mês");
        await mensal.promise;
        return { status: 503, json: { error: "Leitura mensal indisponível." } };
      }
      if (alvo.searchParams.get("dia") === DIA) {
        consultas.push(DIA);
        await diaria.promise;
        return { json: { saidas: SAIDAS.slice(0, 1) } };
      }
    },
  );
});

it("tenta novamente apenas a data e a turma selecionadas em Entradas", async () => {
  const pedidosFiltrados: string[] = [];
  await comVista(
    "entradas",
    390,
    "light",
    async (page, escritas) => {
      const historico = page.getByRole("region", { name: "Entradas registradas" });
      await expect(historico.getByRole("listitem")).toHaveCount(12);
      await page.getByRole("combobox", { name: /^Turma/ }).click();
      await page.getByRole("option", { name: TURMA, exact: true }).click();
      await expect(historico.getByText("Leitura filtrada indisponível.")).toBeVisible();
      await expect(historico.getByRole("listitem")).toHaveCount(0);
      await historico.getByRole("button", { name: "Tentar novamente" }).click({ timeout: 1500 });
      await expect(historico.getByRole("listitem")).toHaveCount(1);
      expect(pedidosFiltrados).toEqual([
        `de=${DIA}&ate=${DIA}&turmaId=turma-b`,
        `de=${DIA}&ate=${DIA}&turmaId=turma-b`,
      ]);
      expect(escritas).toEqual([]);
    },
    {},
    undefined,
    async (alvo) => {
      if (!alvo.searchParams.has("turmaId")) return;
      pedidosFiltrados.push(alvo.searchParams.toString());
      return pedidosFiltrados.length === 1
        ? { status: 503, json: { error: "Leitura filtrada indisponível." } }
        : { json: { entradas: ENTRADAS.slice(0, 1) } };
    },
  );
});

it.each(["saidas", "entradas"] as const)(
  "descarta gerações antigas ao voltar rapidamente ao mesmo recorte em %s",
  async (aba) => {
    const meio = Promise.withResolvers<void>();
    const final = Promise.withResolvers<void>();
    const pedidos: string[] = [];
    const saida = aba === "saidas";
    await comVista(
      aba,
      390,
      "dark",
      async (page, escritas) => {
        const historico = page.getByRole("region", {
          name: saida ? /^Saídas de / : "Entradas registradas",
        });
        const linhas = historico.getByRole("listitem");
        try {
          await expect(linhas).toHaveCount(12);
          if (!saida) {
            await page.getByRole("combobox", { name: /^Turma/ }).click();
            await page.getByRole("option", { name: TURMA, exact: true }).click();
          } else {
            await page.getByRole("button", { name: "Dia anterior", exact: true }).click();
          }
          await expect.poll(() => pedidos).toEqual(["A", "B"]);
          await expect(linhas).toHaveCount(0);
          if (!saida) {
            await page.getByRole("combobox", { name: /^Turma/ }).click();
            await page.getByRole("option", { name: "Todas as turmas", exact: true }).click();
          } else {
            await page.getByRole("button", { name: "Dia seguinte", exact: true }).click();
          }
          await expect.poll(() => pedidos).toEqual(["A", "B", "A"]);
          await expect.soft(linhas).toHaveCount(0, { timeout: 1000 });
          await expect
            .soft(historico.getByRole("button", { name: /Remover|Desbloquear/ }))
            .toHaveCount(0, { timeout: 1000 });
          const obsoleta = page.waitForResponse((resposta) => {
            const alvo = new URL(resposta.url());
            return saida
              ? alvo.searchParams.get("dia") === "2026-11-18"
              : alvo.searchParams.get("turmaId") === "turma-b";
          });
          meio.resolve();
          await (await obsoleta).finished();
          await expect
            .soft(historico.getByRole("status"))
            .toHaveText(/^Carregando/, { timeout: 1000 });
          final.resolve();
          await expect(linhas).toHaveCount(1);
          await expect(linhas.getByText("Aluno de histórico 11", { exact: true })).toBeVisible();
          expect(escritas).toEqual([]);
        } finally {
          meio.resolve();
          final.resolve();
        }
      },
      { remoto: "1" },
      undefined,
      async (alvo) => {
        if (alvo.pathname !== `/api/${aba}`) return;
        const intermediario = saida
          ? alvo.searchParams.get("dia") !== DIA
          : alvo.searchParams.has("turmaId");
        pedidos.push(intermediario ? "B" : "A");
        if (intermediario) {
          await meio.promise;
          return { status: 503, json: { error: "Falha do recorte anterior." } };
        }
        const dados = saida ? SAIDAS : ENTRADAS;
        if (pedidos.length > 1) await final.promise;
        return { json: { [aba]: pedidos.length === 1 ? dados : dados.slice(-1) } };
      },
    );
  },
);
