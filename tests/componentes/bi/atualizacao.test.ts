// Exercita o horário do FrequenciBI no Chromium com dados e acesso sintéticos.
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Page } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";
import { RECURSOS_BI } from "../../../src/domain/bi";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://localhost:${endereco.port}/tests/componentes/bi/atualizacao.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});
async function abrir(paginado = false, timezoneId = "UTC"): Promise<Page> {
  const page = await browser.newPage({ serviceWorkers: "block", timezoneId });
  await page.route("**/api/bi?*", async (rota) => {
    const parametros = new URL(rota.request().url()).searchParams;
    const recurso = parametros.get("recurso");
    const primeira = recurso === "chamadas" && parametros.get("pagina") === "1";
    const consultadoEm = paginado && !primeira ? "2026-10-10T12:00:00Z" : "2026-10-09T12:00:00Z";
    await rota.fulfill({
      json: {
        recurso,
        linhas: [],
        pagina: Number(parametros.get("pagina") ?? "1"),
        proximaPagina: paginado && primeira ? 2 : null,
        consultadoEm,
        escopo: {},
        recursos: RECURSOS_BI,
      },
    });
  });
  await page.goto(url);
  await page.getByLabel("Chave de acesso", { exact: true }).fill(`fbi_${"z".repeat(43)}`);
  await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
  return page;
}
it("o horário corresponde ao retrato recebido, não ao relógio da abertura", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 3000 },
      )
      .toBe(1);
  } finally {
    await page.close();
  }
});

it("mostra o retrato no fuso da escola mesmo com navegador em outro fuso", async () => {
  const page = await abrir(false, "America/Sao_Paulo");
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        {
          timeout: 30000,
        },
      )
      .toBe(1);
    await expect
      .poll(async () =>
        page.getByRole("status").filter({ hasText: "Retrato consultado" }).textContent(),
      )
      .toContain("09/10/2026, 12:00");
  } finally {
    await page.close();
  }
});

it("usa a página mais antiga quando um recurso precisa de paginação", async () => {
  const page = await abrir(true);
  try {
    await expect
      .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
      .toBeGreaterThan(0);
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 3000 },
      )
      .toBe(1);
  } finally {
    await page.close();
  }
});

it("não carimba a visão quando a leitura comparativa falha", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    await page.route("**/api/bi?*", (rota) =>
      rota.fulfill({ status: 500, json: { error: "Indisponível" } }),
    );
    await page.getByRole("combobox", { name: "Comparar infrequência" }).click();
    await page.getByRole("option", { name: "Período anterior" }).click();
    await expect
      .poll(
        async () => page.getByText("Comparação indisponível. Tente atualizar os dados.").count(),
        { timeout: 10000 },
      )
      .toBe(1);
    expect(await page.getByText("Ainda não atualizado", { exact: true }).count()).toBe(1);
  } finally {
    await page.close();
  }
});

it("considera a data da comparação enquanto ela estiver visível", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-08T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("combobox", { name: "Comparar infrequência" }).click();
    await page.getByRole("option", { name: "Período anterior" }).click();
    await expect
      .poll(
        async () => page.getByText("Atualizado em 08/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 10000 },
      )
      .toBe(1);
    await page.getByRole("combobox", { name: "Comparar infrequência" }).click();
    await page.getByRole("option", { name: "Sem comparação" }).click();
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 10000 },
      )
      .toBe(1);
  } finally {
    await page.close();
  }
});

it("não atribui horário confiável a cache antigo sem datas de todas as páginas", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    await page.evaluate(
      () =>
        new Promise<void>((resolve, reject) => {
          const pedido = indexedDB.open("frequencibi-dados-v1", 1);
          pedido.onerror = () => reject(pedido.error);
          pedido.onsuccess = () => {
            const banco = pedido.result;
            const tx = banco.transaction("retratos", "readwrite");
            const cursor = tx.objectStore("retratos").openCursor();
            cursor.onsuccess = () => {
              const atual = cursor.result;
              if (!atual) return;
              if (atual.value.completo) {
                delete atual.value.datasCompletas;
                atual.update(atual.value);
              }
              atual.continue();
            };
            tx.oncomplete = () => {
              banco.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
    );
    await page.reload();
    await expect
      .poll(
        async () => page.getByRole("button", { name: "Atualizar dados", exact: true }).isEnabled(),
        { timeout: 30000 },
      )
      .toBe(true);
    expect(await page.getByText("Ainda não atualizado", { exact: true }).count()).toBe(1);
  } finally {
    await page.close();
  }
});

it("não reutiliza o retrato da sessão encerrada ao abrir novamente a mesma chave", async () => {
  const page = await abrir();
  let liberar: (() => void) | undefined;
  const bloqueio = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let iniciou: (() => void) | undefined;
  const chamadaIniciada = new Promise<void>((resolve) => {
    iniciou = resolve;
  });
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 1;
    });
    await page.getByRole("button", { name: "Esquecer chave", exact: true }).click();
    await page.getByLabel("Chave de acesso", { exact: true }).fill(`fbi_${"z".repeat(43)}`);
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              new Promise<number>((resolve, reject) => {
                const pedido = indexedDB.open("frequencibi-dados-v1", 1);
                pedido.onerror = () => reject(pedido.error);
                pedido.onsuccess = () => {
                  const banco = pedido.result;
                  const tx = banco.transaction("retratos", "readonly");
                  const contagem = tx.objectStore("retratos").count();
                  contagem.onsuccess = () => resolve(contagem.result);
                  tx.oncomplete = () => banco.close();
                };
              }),
          ),
        { timeout: 10000 },
      )
      .toBe(0);
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      if (recurso === "chamadas") {
        iniciou?.();
        await bloqueio;
      }
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-10T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
    await chamadaIniciada;
    expect(await page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count()).toBe(
      0,
    );
    expect(await page.getByText("Ainda não atualizado", { exact: true }).count()).toBe(1);
    liberar?.();
    await expect
      .poll(
        async () => page.getByText("Atualizado em 10/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 10000 },
      )
      .toBe(1);
  } finally {
    liberar?.();
    await page.close();
  }
});

it("ignora uma leitura atrasada após a troca de seção", async () => {
  const page = await abrir();
  let liberar: (() => void) | undefined;
  const bloqueio = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let iniciou: (() => void) | undefined;
  const chamadaIniciada = new Promise<void>((resolve) => {
    iniciou = resolve;
  });
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      if (recurso === "chamadas") {
        iniciou?.();
        await bloqueio;
      }
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: recurso === "chamadas" ? "2026-10-11T12:00:00Z" : "2026-10-10T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
    await chamadaIniciada;
    await page
      .getByRole("navigation", { name: "Seções do FrequenciBI" })
      .getByRole("button", { name: "Faltas", exact: true })
      .click();
    await expect
      .poll(
        async () => page.getByText("Atualizado em 10/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 10000 },
      )
      .toBe(1);
    const resposta = page.waitForResponse((r) => r.url().includes("recurso=chamadas"));
    liberar?.();
    await resposta;
    await expect
      .poll(async () =>
        page.getByText("Atualizado em 10/10/2026 às 12:00", { exact: true }).count(),
      )
      .toBe(1);
  } finally {
    liberar?.();
    await page.close();
  }
});

it("preserva a falha da comparação após terminar a leitura principal", async () => {
  const page = await abrir();
  let liberarPrincipal: () => void = () => {};
  const principalPendente = new Promise<void>((resolve) => {
    liberarPrincipal = resolve;
  });
  try {
    await expect
      .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
      .toBe(1);
    let inicioComparacao = "";
    const capturarComparacao = (requisicao: import("@playwright/test").Request) => {
      const url = new URL(requisicao.url());
      if (url.pathname === "/api/bi" && url.searchParams.get("recurso") === "chamadas")
        inicioComparacao = url.searchParams.get("inicio") ?? "";
    };
    page.on("request", capturarComparacao);
    await page.getByRole("combobox", { name: "Comparar infrequência" }).click();
    await page.getByRole("option", { name: "Período anterior" }).click();
    await expect.poll(() => inicioComparacao).not.toBe("");
    page.off("request", capturarComparacao);
    await expect.poll(async () => page.getByText(/Atualizado em/).count()).toBe(1);
    let falhou = false;
    await page.route("**/api/bi?*", async (rota) => {
      const parametros = new URL(rota.request().url()).searchParams;
      const recurso = parametros.get("recurso");
      if (recurso === "chamadas" && parametros.get("inicio") === inicioComparacao) {
        falhou = true;
        await rota.fulfill({ status: 503, json: { error: "Indisponível" } });
        return;
      }
      if (recurso === "alunos") await principalPendente;
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-10T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
    await expect.poll(() => falhou, { timeout: 10000 }).toBe(true);
    await expect.poll(async () => page.getByText(/Consulta offline/).count()).toBeGreaterThan(0);
    await page.waitForTimeout(400);
    const respostaPrincipal = page.waitForResponse((resposta) =>
      resposta.url().includes("recurso=alunos"),
    );
    liberarPrincipal();
    await respostaPrincipal;
    await page.waitForTimeout(800);
    expect(await page.getByText("Ainda não atualizado", { exact: true }).count()).toBe(1);
  } finally {
    liberarPrincipal();
    await page.close();
  }
});

it("não apresenta horário completo quando um recurso falha sem fallback", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
      .toBe(1);
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      if (recurso === "chamadas") {
        await rota.fulfill({ status: 500, json: { error: "Falha sintética" } });
        return;
      }
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-10T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
    await expect
      .poll(async () => page.getByRole("alert").count(), { timeout: 15000 })
      .toBeGreaterThan(0);
    await expect
      .poll(async () => page.getByText("Ainda não atualizado", { exact: true }).count())
      .toBe(1);
  } finally {
    await page.close();
  }
});

it("não mostra uma atualização completa quando uma consulta retorna ao cache após falha", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(
        async () => page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 30000 },
      )
      .toBe(1);
    let falhar = true;
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      if (recurso === "chamadas" && falhar)
        return rota.fulfill({ status: 503, json: { error: "Indisponível" } });
      await rota.fulfill({
        json: {
          recurso,
          linhas: [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-10T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
    await expect
      .poll(
        async () => page.getByRole("button", { name: "Atualizar dados", exact: true }).isEnabled(),
        { timeout: 10000 },
      )
      .toBe(true);
    await expect
      .poll(async () => page.getByText("Ainda não atualizado", { exact: true }).count(), {
        timeout: 5000,
      })
      .toBe(1);
    await page
      .getByRole("navigation", { name: "Seções do FrequenciBI" })
      .getByRole("button", { name: "Faltas", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Seções do FrequenciBI" })
      .getByRole("button", { name: "Visão geral", exact: true })
      .click();
    await expect
      .poll(async () => page.getByText("Ainda não atualizado", { exact: true }).count())
      .toBe(1);
    falhar = false;
    await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
    await expect
      .poll(
        async () => page.getByText("Atualizado em 10/10/2026 às 12:00", { exact: true }).count(),
        { timeout: 10000 },
      )
      .toBe(1);
  } finally {
    await page.close();
  }
});
