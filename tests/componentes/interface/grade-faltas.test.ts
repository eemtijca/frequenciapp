// Grade: totais do período, proporção da célula S e detalhe expansível.
import { chromium, expect as esperar, type Browser, type Page } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let navegador: Browser;
let servidor: ServidorFixture;

beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/ajustes-grade-historico.html");
  navegador = await chromium.launch();
});
afterAll(async () => {
  try {
    await navegador?.close();
  } finally {
    await servidor?.fechar();
  }
});

async function abrir(testar: (pagina: Page) => Promise<void>) {
  const pagina = await navegador.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
    timezoneId: "America/Fortaleza",
  });
  const erros: string[] = [];
  const origem = new URL(servidor.url).origin;
  pagina.on("pageerror", (erro) => erros.push(erro.message));
  await pagina.route("**/*", async (rota) => {
    const pedido = rota.request();
    const url = new URL(pedido.url());
    if (
      url.origin === origem &&
      pedido.method() === "GET" &&
      url.pathname === "/api/planilha/estado"
    ) {
      return rota.fulfill({ json: { estado: { ativa: false, podeEnviar: false } } });
    }
    if (url.origin === origem && !url.pathname.startsWith("/api/")) return rota.continue();
    erros.push(`requisição fora da fixture: ${pedido.method()} ${url.pathname}`);
    return rota.abort();
  });
  try {
    await pagina.goto(`${servidor.url}?vista=faltas`);
    await testar(pagina);
    expect(erros).toEqual([]);
  } finally {
    await pagina.close();
  }
}

it("mostra os totais do período, a proporção e o detalhe das faltas", async () => {
  await abrir(async (pagina) => {
    const grade = pagina.getByRole("region", { name: "Grade de frequência" });
    await esperar(grade.getByRole("columnheader", { name: "Faltas no período" })).toBeVisible();
    await esperar(
      grade.getByRole("columnheader", { name: "Faltas justificadas no período" }),
    ).toBeVisible();
    await esperar(
      grade.getByRole("columnheader", { name: "Presenças parciais no período" }),
    ).toBeVisible();
    const historico = grade.getByRole("columnheader", { name: "Faltas de todo o histórico" });
    await historico.scrollIntoViewIfNeeded();
    await esperar(historico).toBeVisible();
    const linha = grade.getByRole("row", { name: /Ana Proporção/ });
    await esperar(linha.getByText("2/5", { exact: true })).toBeVisible();
    await esperar(
      grade.getByRole("img", {
        name: "Ana Proporção presente em parte das aulas em 2026-11-02, 2 de 5 aulas",
      }),
    ).toBeVisible();
    await esperar(linha.getByRole("cell", { name: "1", exact: true })).toHaveCount(3);
    await esperar(linha.getByRole("cell", { name: "7", exact: true })).toBeVisible();
    await grade.getByRole("button", { name: "Ver faltas de Ana Proporção" }).click();
    const detalhe = grade.locator("#faltas-parcial");
    await esperar(detalhe).toContainText("02/11/2026");
    await esperar(detalhe).toContainText("2/5");
    await esperar(detalhe).toContainText("1ª aula");
    await esperar(detalhe).toContainText("Matemática");
    await esperar(detalhe).toContainText("Consulta Médica");
    await esperar(detalhe).toContainText("03/11/2026");
    await esperar(detalhe).toContainText("Sem justificativa");
    await esperar(detalhe).toContainText("04/11/2026");
    await esperar(detalhe).toContainText("Doente");
    await esperar(grade.getByRole("button", { name: "Baixar relatório (PDF)" })).toBeEnabled();
    await esperar(grade.getByRole("button", { name: "Baixar planilha (CSV)" })).toBeEnabled();
  });
});
