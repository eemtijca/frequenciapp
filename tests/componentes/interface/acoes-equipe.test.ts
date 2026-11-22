// Verifica a apresentação e a confirmação das ações da equipe no navegador.
import { chromium, type Browser } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { conferirRegistrosEmpilhados } from "../../apoio/linhas-cadastros";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let browser: Browser;
beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/acoes-equipe.html");
  browser = await chromium.launch({ headless: true });
}, 120000);
afterAll(async () => {
  try {
    await browser?.close();
  } finally {
    await servidor?.fechar();
  }
});

it.each([320, 390])("Revisão 5C: registros consecutivos da Equipe a %i px", async (width) => {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const usuarios = [
    {
      id: "coord",
      nome: "Coordenadora".repeat(7),
      email: `${"equipe".repeat(9)}@escola.exemplo`,
      papel: "COORDENACAO",
      ativo: true,
    },
    { id: "admin", nome: "Direção", email: "direcao@escola.exemplo", papel: "ADMIN", ativo: true },
  ];
  try {
    await page.route("**/api/usuarios", (rota) =>
      rota.request().method() === "GET" ? rota.fulfill({ json: { usuarios } }) : rota.abort(),
    );
    await page.goto(servidor.url);
    const registros = usuarios.map(({ nome, email }) => {
      const linha = page.getByRole("row").filter({ hasText: email });
      return {
        linha,
        editar: linha.getByRole("button", { name: `Editar conta de ${nome}`, exact: true }),
      };
    });
    for (const { editar } of registros) await editar.waitFor();
    await conferirRegistrosEmpilhados(registros);
  } finally {
    await page.close();
  }
});

it("5C: a 320 px a conta longa e suas ações cabem e cancelar não grava", async () => {
  const page = await browser.newPage({ viewport: { width: 320, height: 760 } });
  const nome = "Coordenadora".repeat(7);
  const email = `${"frequencia".repeat(6)}@escola.exemplo`;
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const pedido = route.request();
      const chamada = `${pedido.method()} ${new URL(pedido.url()).pathname}`;
      chamadas.push(chamada);
      if (chamada !== "GET /api/usuarios") {
        await route.abort();
        return;
      }
      await route.fulfill({
        json: {
          usuarios: [
            { id: "coord", nome, email, papel: "COORDENACAO", ativo: false },
            {
              id: "admin",
              nome: "Direção",
              email: "direcao@escola.exemplo",
              papel: "ADMIN",
              ativo: true,
            },
          ],
        },
      });
    });
    await page.goto(servidor.url);
    const editar = page.getByRole("button", { name: `Editar conta de ${nome}`, exact: true });
    await editar.waitFor();
    const painel = page.getByRole("main");
    const conta = page.getByRole("row").filter({ hasText: email });
    expect(await conta.getByText("Coordenação", { exact: true }).isVisible()).toBe(true);
    expect(await conta.getByText("desativada", { exact: true }).isVisible()).toBe(true);
    expect(await page.getByText("Você", { exact: true }).isVisible()).toBe(true);
    expect(
      await page.getByRole("button", { name: /(?:Desativar|Excluir) conta de Direção/ }).count(),
    ).toBe(0);
    for (const texto of [nome, email]) {
      const leitura = await conta.getByText(texto, { exact: true }).evaluate((el) => {
        const faixa = document.createRange();
        faixa.selectNodeContents(el);
        const quadro = faixa.getBoundingClientRect();
        const caixa = el.getBoundingClientRect();
        return (
          quadro.left >= 0 &&
          quadro.right <= document.documentElement.clientWidth &&
          quadro.right <= caixa.right + 1 &&
          el.scrollWidth <= el.clientWidth + 1
        );
      });
      expect(leitura, "texto integral sem rolagem").toBe(true);
    }
    const tabela = painel.getByRole("table");
    expect(
      await tabela.evaluate((el) => {
        const area = el.parentElement;
        return area !== null && area.scrollWidth === area.clientWidth;
      }),
    ).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    for (const botao of [
      editar,
      ...(await conta.getByRole("button", { name: /^(Reativar|Excluir) conta/ }).all()),
    ]) {
      const caixa = await botao.boundingBox();
      expect(caixa?.width).toBeGreaterThanOrEqual(48);
      expect(caixa?.height).toBeGreaterThanOrEqual(48);
      expect(caixa && caixa.x >= 0 && caixa.x + caixa.width <= 320).toBe(true);
    }
    await editar.focus();
    expect(await editar.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    await page.keyboard.press("Enter");
    const dialogo = page.getByRole("dialog", { name: `Editar ${nome}` });
    const campo = dialogo.getByLabel("E-mail de acesso");
    expect(await campo.inputValue()).toBe(email);
    await campo.fill("mudanca@escola.exemplo");
    await page.keyboard.press("Escape");
    await expect.poll(() => editar.evaluate((el) => document.activeElement === el)).toBe(true);
    expect(chamadas).toEqual(["GET /api/usuarios"]);
  } finally {
    await page.close();
  }
});
for (const tema of ["light", "dark"] as const) {
  it(`ações de contas sem fundos repetidos em ${tema}`, async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      let alteracoes = 0;
      await page.route("**/api/usuarios**", async (route) => {
        if (route.request().method() !== "GET") alteracoes += 1;
        await route.fulfill({
          json: {
            usuarios: [
              {
                id: "admin",
                nome: "Direção",
                email: "direcao@escola.exemplo",
                papel: "ADMIN",
                ativo: true,
              },
              {
                id: "coord",
                nome: "Demo",
                email: "demo@escola.exemplo",
                papel: "COORDENACAO",
                ativo: true,
              },
            ],
          },
        });
      });
      await page.goto(servidor.url);
      await page.evaluate(
        (valor) => document.documentElement.setAttribute("data-mui-color-scheme", valor),
        tema,
      );
      const excluir = page.getByRole("button", { name: "Excluir conta de Demo" });
      await excluir.waitFor({ timeout: 90000 });
      await page.mouse.move(0, 0);
      const acoes = [
        page.getByRole("button", { name: "Editar conta de Demo" }),
        page.getByRole("button", { name: "Desativar conta de Demo" }),
        excluir,
      ];
      for (const botao of acoes) {
        expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
          "rgba(0, 0, 0, 0)",
        );
        const caixa = await botao.boundingBox();
        expect(caixa?.width).toBeGreaterThanOrEqual(44);
        expect(caixa?.height).toBeGreaterThanOrEqual(44);
      }
      const principal = page.getByRole("button", { name: "Nova conta" });
      expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
      await excluir.focus();
      expect(await excluir.evaluate((el) => document.activeElement === el)).toBe(true);
      await page.keyboard.press("Enter");
      const dialogo = page.getByRole("alertdialog");
      await dialogo.getByRole("button", { name: "Cancelar" }).click();
      expect(alteracoes).toBe(0);
      await expect.poll(() => excluir.isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  }, 120000);
}
