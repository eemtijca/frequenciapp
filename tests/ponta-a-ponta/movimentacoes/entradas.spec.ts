// Entradas atrasadas na interface, persistência e prévia com Sheets API falsa.
import { test, expect, type Page } from "@playwright/test";
import { criarMassaE2E, criarLiberadoresE2E, limparMassaE2E } from "../helpers/banco";
import { diaCorrente } from "../helpers/dia";
import {
  abrirAbaMovimentacao,
  abrirNavegacao,
  aguardarHidratacao,
  escolherHorario,
  registrarEntrada,
  trocarVisao,
} from "../helpers/pagina";
// O worker encaminha fetch fora do page.route; a suíte PWA o testa separadamente.
test.use({ serviceWorkers: "block", locale: "en-US" });
test.beforeAll(async () => {
  await criarMassaE2E();
  await criarLiberadoresE2E();
});
test.afterAll(limparMassaE2E);

async function escolherDiaDeTeste(page: Page) {
  await page.locator("#entrada-dia").click();
  const calendario = page.getByRole("dialog", { name: "Data da entrada", exact: true });
  // Junho de 2026 é a massa fixa; a seleção usa o calendário real, sem campo nativo.
  for (let tentativa = 0; tentativa < 48; tentativa++) {
    if (await calendario.getByRole("button", { name: /^15 de junho de 2026/ }).isVisible()) break;
    await calendario.getByRole("button", { name: "Mês anterior", exact: true }).click();
  }
  await calendario.getByRole("button", { name: /^15 de junho de 2026/ }).click();
  await expect(page.locator("#entrada-dia")).toContainText("15/06/2026");
}

/** Simula a planilha de saídas indisponível para isolar a prévia das entradas. */
async function mockSaidasBloqueadas(page: Page) {
  await page.route("**/api/planilha-saidas/estado", (route) =>
    route.fulfill({
      json: {
        estado: {
          ativa: true,
          modo: "conservador",
          modoCompletoAte: null,
          podeEnviar: true,
          configurada: true,
        },
      },
    }),
  );
  await page.route("**/api/planilha-saidas/simular", (route) =>
    route.fulfill({
      json: {
        modalidade: "conservador",
        planoHash: "saidas-qa",
        aba: "Saídas",
        bloqueado: true,
        resumo: {
          criar: 0,
          preencher: 0,
          substituir: 0,
          remover: 0,
          puladasOcupadas: 0,
          puladasFormula: 0,
          ambiguidades: 0,
        },
        avisos: [],
        criar: [],
        preencher: [],
        substituir: [],
        candidatosRemocao: [],
      },
    }),
  );
}

test("data brasileira e navegação diária seguem a saída mesmo com navegador em inglês", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  const dataSaida = (await page.locator("#dia-saidas").textContent())?.match(
    /\d{2}\/\d{2}\/\d{4}/,
  )?.[0];
  await abrirAbaMovimentacao(page, "Entradas");
  expect(dataSaida).toBeTruthy();
  await expect(page.locator("#entrada-dia")).toContainText(dataSaida ?? "");
  await expect(page.locator('input[type="date"]')).toHaveCount(0);
  const painel = page.locator('[data-pager="principal"] > section:not([hidden])');
  const seguinte = painel.getByRole("button", { name: "Dia seguinte", exact: true });
  const anterior = painel.getByRole("button", { name: "Dia anterior", exact: true });
  const rotuloInicial = await page.locator("#entrada-dia").getAttribute("aria-label");
  if (await seguinte.isDisabled()) {
    await anterior.click();
    await expect(seguinte).toBeEnabled();
    await seguinte.click();
  } else {
    // No domingo, sábado leva ao resumo e a seta anterior volta ao dia.
    await seguinte.click();
    await expect(page.getByRole("region", { name: "Resumo da semana", exact: true })).toBeVisible();
    await anterior.click();
  }
  await expect(page.locator("#entrada-dia")).toHaveAttribute("aria-label", rotuloInicial ?? "");
  await expect(page.locator("#entrada-dia")).toContainText(dataSaida ?? "");
  await expect(page.getByLabel("Momento da entrada", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Responsável pelo registro", { exact: true })).toBeVisible();
});
test("registra chegada, preserva após recarregar e remove para correção", async ({ page }) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await abrirAbaMovimentacao(page, "Entradas");
  await escolherDiaDeTeste(page);
  await page.locator("#entrada-turma").click();
  await page.getByRole("option", { name: "E2E Ano A" }).click();
  await page.locator("#entrada-aluno").click();
  await page.getByRole("option", { name: /E2E Aluno Um/ }).click();
  await escolherHorario(page, "#entrada-horario", "08:15");
  await page.getByLabel("Momento da entrada", { exact: true }).click();
  await page.getByRole("option", { name: "2ª aula", exact: true }).click();
  await page.getByRole("radio", { name: "Escrever", exact: true }).click();
  await page.locator("#entrada-motivo").fill("Transporte atrasou");
  await page.getByLabel("Responsável pelo registro", { exact: true }).click();
  await page.getByRole("option", { name: "Coordenadora E2E", exact: true }).click();
  await registrarEntrada(page);
  await expect(page.getByText("Entrada registrada.", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Entradas registradas" }).getByText("Transporte atrasou"),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Entradas registradas" })).toContainText("2ª aula");
  await expect(page.getByRole("region", { name: "Entradas registradas" })).toContainText(
    "Responsável pelo registro: Coordenadora E2E",
  );
  await page.reload();
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await abrirAbaMovimentacao(page, "Entradas");
  await escolherDiaDeTeste(page);
  await expect(
    page.getByRole("region", { name: "Entradas registradas" }).getByText("Transporte atrasou"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remover entrada de E2E Aluno Um" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("chamada");
  await page.getByRole("button", { name: "Remover entrada", exact: true }).click();
  await expect(page.getByText("Nenhuma entrada registrada neste recorte.")).toBeVisible();
});
test("registra justificativa do catálogo com observação e responsável escolhido", async ({
  page,
}) => {
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await abrirAbaMovimentacao(page, "Entradas");
  await escolherDiaDeTeste(page);
  await page.locator("#entrada-aluno").click();
  await page.getByRole("option", { name: /E2E Aluno Dois/ }).click();
  await page.locator("#entrada-momento").click();
  await page.getByRole("option", { name: "1º intervalo", exact: true }).click();
  await page.locator("#entrada-justificativa").click();
  await page.getByRole("option", { name: "T · Transporte", exact: true }).click();
  await page.locator("#entrada-observacao").fill("Ônibus atrasou");
  await page.locator("#entrada-responsavel").click();
  await page.getByRole("option", { name: "Diretor E2E", exact: true }).click();
  await registrarEntrada(page);
  const lista = page.getByRole("region", { name: "Entradas registradas" });
  await expect(lista.getByText("Transporte", { exact: true })).toBeVisible();
  await expect(lista.getByText("Ônibus atrasou", { exact: true })).toBeVisible();
  await expect(lista).not.toContainText("Transporte ·");
  await expect(lista).toContainText("1º intervalo");
  await expect(lista).toContainText("Responsável pelo registro: Diretor E2E");
  await page
    .getByRole("button", { name: "Remover entrada de E2E Aluno Dois", exact: true })
    .click();
  await page.getByRole("button", { name: "Remover entrada", exact: true }).click();
  await expect(lista).toContainText("Nenhuma entrada registrada neste recorte.");
});

for (const bloqueado of [false, true]) {
  test(`confere entradas sem novidades com plano bloqueado ${bloqueado}`, async ({ page }) => {
    let enviou = 0;
    await page.route("**/api/entradas?**", (route) =>
      route.fulfill({
        json: {
          entradas: [
            {
              id: "qa-conferencia",
              nome: "E2E Aluno",
              turmaRotulo: "E2E Ano A",
              horario: "08:00",
              motivo: "Transporte",
              registradoPorNome: "E2E Direção",
            },
          ],
        },
      }),
    );
    await page.route("**/api/planilha-entradas/**", async (route) => {
      const acao = new URL(route.request().url()).pathname.split("/").at(-1);
      if (acao === "enviar") {
        enviou++;
        expect(route.request().postDataJSON()).toMatchObject({
          planoHash: "previa-conferencia-qa",
        });
      }
      await route.fulfill({
        json:
          acao === "estado"
            ? { podeEnviar: true }
            : acao === "simular"
              ? {
                  planoHash: "previa-conferencia-qa",
                  novas: 0,
                  existentes: 1,
                  bloqueado,
                  avisos: bloqueado ? ["Confira o cabeçalho da aba."] : [],
                  criar: [],
                }
              : { linhasCriadas: 0 },
      });
    });
    await mockSaidasBloqueadas(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Saídas e Entradas", "saidas");
    await abrirAbaMovimentacao(page, "Entradas");
    await page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" }).click();
    const dialogo = page.getByRole("dialog", { name: /^Enviar saídas e entradas/ });
    await expect(dialogo.getByText("Aba Entradas", { exact: true })).toBeVisible();
    const confirmar = dialogo.getByRole("button", { name: "Enviar", exact: true });
    if (bloqueado) {
      await expect(confirmar).toBeDisabled();
      expect(enviou).toBe(0);
    } else {
      await expect(confirmar).toBeEnabled();
      await confirmar.click();
      await expect(page.getByText("Entradas: 0 linhas criadas.", { exact: true })).toBeVisible();
      await expect(dialogo).toBeHidden();
      expect(enviou).toBe(1);
    }
  });
}

test("revê o envio em confirmação própria", async ({ page }) => {
  let enviou = 0;
  const mes = diaCorrente().slice(0, 7);
  await page.route("**/api/planilha-entradas/**", async (route) => {
    const acao = new URL(route.request().url()).pathname.split("/").at(-1);
    if (acao === "enviar") {
      enviou++;
      expect(route.request().postDataJSON()).toMatchObject({
        planoHash: "previa-qa",
        de: `${mes}-01`,
      });
    }
    await route.fulfill({
      json:
        acao === "estado"
          ? { podeEnviar: true, planilhaNome: "QA Planilha" }
          : acao === "simular"
            ? {
                planoHash: "previa-qa",
                novas: 1,
                existentes: 0,
                bloqueado: false,
                avisos: [],
                criar: [{ nome: "E2E Aluno", linha: 2 }],
              }
            : { linhasCriadas: 1 },
    });
  });
  await page.route("**/api/entradas?**", (route) =>
    route.fulfill({
      json: {
        entradas: [
          {
            id: "qa",
            nome: "E2E Aluno",
            turmaRotulo: "E2E Ano A",
            horario: "08:00",
            motivo: "Transporte",
            registradoPorNome: "E2E Direção",
          },
        ],
      },
    }),
  );
  await mockSaidasBloqueadas(page);
  await page.goto("/");
  await aguardarHidratacao(page);
  await trocarVisao(page, "Saídas e Entradas", "saidas");
  await abrirAbaMovimentacao(page, "Entradas");
  await escolherDiaDeTeste(page);
  // O preparo e a organização da aba Entradas ficam em Gestão, Configurações, Planilhas.
  await expect(page.getByRole("button", { name: "Preparar aba Entradas" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Organizar apresentação/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Enviar saídas e entradas para a planilha" }).click();
  const dialogo = page.getByRole("dialog", { name: /Enviar saídas e entradas/ });
  await expect(dialogo.getByText("Aba Entradas", { exact: true })).toBeVisible();
  await expect(dialogo).toContainText("1 linha nova");
  expect(enviou).toBe(0);
  await dialogo.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Entradas: 1 linha criada.", { exact: true })).toBeVisible();
  expect(enviou).toBe(1);
  await expect(page.getByText("Entradas: 1 linha criada.", { exact: true })).not.toBeVisible({
    timeout: 15000,
  });
  await page.screenshot({ path: "test-results/entradas-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 780 });
  const painel = page.locator('[data-pager="principal"] > section:not([hidden])');
  await painel.evaluate((elemento) => {
    elemento.scrollTop = 0;
  });
  await expect(page.getByRole("button", { name: "Abrir menu", exact: true })).toBeVisible();
  const navegacao = await abrirNavegacao(page);
  const botao = navegacao.getByRole("button", { name: "Saídas e Entradas", exact: true });
  await expect(botao).toBeVisible();
  await expect(botao).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Menu do aplicativo" })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: "test-results/entradas-360.png", fullPage: true });
  await page.getByLabel("Responsável pelo registro", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/entradas-360-registro.png", fullPage: true });
  await painel.evaluate((elemento) => {
    elemento.scrollTop = elemento.scrollHeight;
  });
  await page.screenshot({ path: "test-results/entradas-360-lista.png", fullPage: true });
});
