// Exercita o horário do FrequenciBI no Chromium com dados e acesso sintéticos.
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  chromium,
  expect as expectUi,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { observarDobraBi, observarEditorBi, observarPortaoBi } from "../../helpers/bloco-visual-bi";
import { RECURSOS_BI } from "../../../src/domain/bi";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
let cache: string;
beforeAll(async () => {
  cache = await mkdtemp(path.join(tmpdir(), "vite-bi-"));
  servidor = await createServer({
    cacheDir: cache,
    configFile: false,
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
  if (cache) await rm(cache, { recursive: true, force: true });
});
async function abrir(
  paginado = false,
  timezoneId = "UTC",
  opcoes: Pick<BrowserContextOptions, "viewport" | "reducedMotion"> & {
    antesDaNavegacao?: (page: Page) => Promise<void>;
    consulta?: string;
  } = {},
): Promise<Page> {
  const { antesDaNavegacao, consulta = "", ...contexto } = opcoes;
  const page = await browser.newPage({ ...contexto, serviceWorkers: "block", timezoneId });
  await antesDaNavegacao?.(page);
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
  await page.goto(url + consulta);
  await page.getByLabel("Guardar chave e consultas para uso offline neste dispositivo").check();
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
      .getByRole("tablist", { name: "Seções do FrequenciBI" })
      .getByRole("tab", { name: "Faltas", exact: true })
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

it.each([503, 500])(
  "preserva a falha %s da comparação após terminar a leitura principal",
  async (codigo) => {
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
          await rota.fulfill({ status: codigo, json: { error: "Indisponível" } });
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
      if (codigo === 503)
        await expect
          .poll(async () => page.getByText(/Consulta offline/).count())
          .toBeGreaterThan(0);
      await page.waitForTimeout(800);
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
  },
);

it.each([200, 401])(
  "não deixa uma comparação anterior com resposta %s sobrescrever a atualização mais recente no cache",
  async (statusAnterior) => {
    const page = await abrir();
    let liberarAnterior: () => void = () => {};
    const respostaAnterior = new Promise<void>((resolve) => {
      liberarAnterior = resolve;
    });
    try {
      await expect
        .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
        .toBe(1);
      let inicioComparacao = "";
      let comparacoes = 0;
      await page.route("**/api/bi?*", async (rota) => {
        const parametros = new URL(rota.request().url()).searchParams;
        const recurso = parametros.get("recurso");
        if (recurso === "chamadas" && !inicioComparacao)
          inicioComparacao = parametros.get("inicio") ?? "";
        const comparativa = recurso === "chamadas" && parametros.get("inicio") === inicioComparacao;
        if (comparativa) comparacoes += 1;
        const antiga = comparativa && comparacoes === 1;
        if (antiga) await respostaAnterior;
        if (antiga && statusAnterior === 401) {
          await rota.fulfill({ status: 401, json: { error: "Resposta antiga" } });
          return;
        }
        await rota.fulfill({
          json: {
            recurso,
            linhas: [],
            pagina: 1,
            proximaPagina: null,
            consultadoEm: antiga ? "2026-10-08T12:00:00Z" : "2026-10-11T12:00:00Z",
            escopo: {},
            recursos: RECURSOS_BI,
          },
        });
      });
      await page.getByRole("combobox", { name: "Comparar infrequência" }).click();
      await page.getByRole("option", { name: "Período anterior" }).click();
      await expect.poll(() => comparacoes).toBe(1);
      await page.getByRole("button", { name: "Atualizar dados", exact: true }).click();
      await expect.poll(() => comparacoes, { timeout: 10000 }).toBeGreaterThan(1);
      await expect
        .poll(
          async () => page.getByText("Atualizado em 11/10/2026 às 12:00", { exact: true }).count(),
          { timeout: 10000 },
        )
        .toBe(1);
      const redeAntiga = page.waitForResponse((resposta) =>
        resposta.url().includes(`inicio=${inicioComparacao}`),
      );
      liberarAnterior();
      await redeAntiga;
      await page.waitForTimeout(800);
      const dataGuardada = await page.evaluate(
        (inicio) =>
          new Promise<string | undefined>((resolve, reject) => {
            const abertura = indexedDB.open("frequencibi-dados-v1", 1);
            abertura.onerror = () => reject(abertura.error);
            abertura.onsuccess = () => {
              const db = abertura.result;
              const tx = db.transaction("retratos", "readonly");
              const cursor = tx.objectStore("retratos").openCursor();
              let data: string | undefined;
              cursor.onsuccess = () => {
                const item = cursor.result;
                if (!item) return;
                if (String(item.key).includes(`:chamadas:${inicio}:`))
                  data = item.value.consultadoEm;
                item.continue();
              };
              tx.oncomplete = () => {
                db.close();
                resolve(data);
              };
              tx.onerror = () => reject(tx.error);
            };
          }),
        inicioComparacao,
      );
      expect(dataGuardada).toBe("2026-10-11T12:00:00Z");
      expect(
        await page.getByText("Atualizado em 11/10/2026 às 12:00", { exact: true }).count(),
      ).toBe(1);
    } finally {
      liberarAnterior();
      await page.close();
    }
  },
);

it("não apresenta horário completo quando um recurso falha sem fallback", async () => {
  const page = await abrir();
  try {
    await expect
      .poll(async () => page.getByText(/Atualizado em/).count(), { timeout: 30000 })
      .toBe(1);
    let falhar = true;
    await page.route("**/api/bi?*", async (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      if (recurso === "chamadas" && falhar) {
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
      .getByRole("tablist", { name: "Seções do FrequenciBI" })
      .getByRole("tab", { name: "Faltas", exact: true })
      .click();
    await page
      .getByRole("tablist", { name: "Seções do FrequenciBI" })
      .getByRole("tab", { name: "Visão geral", exact: true })
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

it("identifica a ação de revelar a chave sem repetir a instrução de acesso", async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 844 },
    serviceWorkers: "block",
  });
  try {
    await page.goto(url);
    expect(await observarPortaoBi(page)).toEqual({
      rotulo: "Mostrar chave de acesso",
      controlaCampo: true,
      instrucaoGestao: true,
      repeticaoConta: false,
    });
  } finally {
    await page.close();
  }
});

it("mantém o indicador na primeira dobra com os filtros recolhidos", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  try {
    // O processo do navegador pode estar sem rede. Apenas o sinal do documento é simulado.
    await page.addInitScript(() => {
      if (!navigator.onLine) {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
      }
    });
    await page.route("**/api/bi?*", (rota) => {
      const recurso = new URL(rota.request().url()).searchParams.get("recurso");
      return rota.fulfill({
        json: {
          recurso,
          linhas:
            recurso === "chamadas"
              ? [
                  {
                    id: "c",
                    dia: "2026-10-09",
                    registrados: 10,
                    presentes: 8,
                    ausencias: 2,
                    faltas: 2,
                  },
                ]
              : [],
          pagina: 1,
          proximaPagina: null,
          consultadoEm: "2026-10-09T12:00:00Z",
          escopo: {},
          recursos: RECURSOS_BI,
        },
      });
    });
    await page.clock.setFixedTime(new Date("2026-10-09T12:00:00Z"));
    await page.goto(url);
    await page.getByLabel("Chave de acesso", { exact: true }).fill(`fbi_${"z".repeat(43)}`);
    await page.getByRole("button", { name: "Testar e entrar", exact: true }).click();
    await page.getByRole("button", { name: "Filtros da análise", exact: true }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect
      .poll(async () => {
        const { cabeInteiro, scrollY } = await observarDobraBi(page);
        return { cabeInteiro, scrollY };
      })
      .toEqual({ cabeInteiro: true, scrollY: 0 });
    expect(
      await page
        .getByRole("button", { name: "Filtros da análise", exact: true })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  } finally {
    await page.close();
  }
});

it("alinha a borda de Meta ou limiar à de Visualização no explorador", async () => {
  const page = await abrir();
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByRole("tab", { name: "Explorador", exact: true }).click();
    const editor = page.getByRole("region", { name: "Construtor de gráficos", exact: true });
    const medida = await observarEditorBi(editor);
    expect(medida.delta).toBeLessThanOrEqual(1);
    expect(medida.meta.rotuloAcima).toBe(true);
  } finally {
    await page.close();
  }
});

it.each([
  { campo: "Início", original: "01", editado: "02", direcao: "ArrowRight" },
  { campo: "Fim", original: "09", editado: "08", direcao: "ArrowLeft" },
])("fecha o calendário de $campo a 599 px sem perder o rascunho", async (caso) => {
  const page = await abrir(false, "UTC", {
    viewport: { width: 600, height: 900 },
    reducedMotion: "reduce",
    antesDaNavegacao: async (pagina) => {
      await pagina.clock.setFixedTime(new Date("2026-10-09T12:00:00Z"));
      await pagina.route("**/*", async (rota) => {
        const pedido = rota.request();
        if (new URL(pedido.url()).origin === new URL(url).origin && pedido.method() === "GET") {
          await rota.fallback();
        } else {
          await rota.abort();
        }
      });
    },
    consulta: "?inicio=2026-10-01&fim=2026-10-09",
  });
  const nome = `${caso.campo} da análise`;
  const gatilho = page.getByRole("button", { name: new RegExp(`^${nome}:`) });
  const expansor = page.getByRole("button", { name: "Filtros da análise", exact: true });
  const dialogo = page.getByRole("dialog", { name: nome, exact: true });
  // A saída pode ocultar o diálogo da árvore acessível antes de removê-lo do DOM.
  const painel = page.locator(`[role="dialog"][aria-label="${nome}"]`);
  const dia = (numero: string) =>
    dialogo.getByRole("button", { name: new RegExp(`^${Number(numero)} de outubro de 2026(,|$)`) });
  const aplicado = page.getByText(/01\/10\/2026.*09\/10\/2026/).first();
  let leituras = 0;

  try {
    await expectUi(
      page.getByText("Atualizado em 09/10/2026 às 12:00", { exact: true }),
    ).toBeVisible({
      timeout: 30000,
    });
    page.on("request", (pedido) => {
      if (new URL(pedido.url()).pathname === "/api/bi") leituras++;
    });
    await gatilho.press("Enter");
    await expectUi(dia(caso.original)).toBeFocused();
    await page.keyboard.press("Escape");
    await expectUi(painel).toBeHidden();
    await expectUi(gatilho).toBeFocused();

    await page.keyboard.press("Space");
    await expectUi(dia(caso.original)).toBeFocused();
    await page.keyboard.press(caso.direcao);
    await expectUi(dia(caso.editado)).toBeFocused();
    await page.keyboard.press("Enter");
    await expectUi(painel).toBeHidden();
    await expectUi(gatilho).toBeFocused();
    await page.keyboard.press("Enter");
    await expectUi(dia(caso.editado)).toBeFocused();

    await page.setViewportSize({ width: 599, height: 900 });
    await expectUi(expansor).toBeVisible();
    await expectUi(expansor).toHaveAttribute("aria-expanded", "false");
    await expectUi(gatilho).toBeHidden();
    await expectUi(painel, "o calendário sem gatilho fecha ao cruzar o breakpoint").toBeHidden({
      timeout: 2000,
    });
    await expectUi(expansor).toBeFocused();
    await expectUi(aplicado).toBeVisible();

    await page.keyboard.press("Enter");
    await expectUi(expansor).toHaveAttribute("aria-expanded", "true");
    await expectUi(gatilho).toHaveAccessibleName(new RegExp(`${caso.editado}/10/2026`));
    await expectUi(painel).toBeHidden();

    // Atravessar o mesmo limite com os filtros abertos não oculta o gatilho.
    await page.setViewportSize({ width: 600, height: 900 });
    await gatilho.press("Enter");
    await expectUi(dia(caso.editado)).toBeFocused();
    await page.setViewportSize({ width: 599, height: 900 });
    await expectUi(expansor).toHaveAttribute("aria-expanded", "true");
    await expectUi(gatilho).toBeVisible();
    await expectUi(dia(caso.editado)).toBeFocused();
    await page.keyboard.press("Escape");
    await expectUi(painel).toBeHidden();
    await expectUi(gatilho).toBeFocused();

    await page.keyboard.press("Enter");
    const aplicar = page.getByRole("button", { name: "Aplicar período", exact: true });
    await aplicar.focus();
    await expectUi(painel).toBeHidden();
    await expectUi(aplicar).toBeFocused();
    await expectUi(aplicado).toBeVisible();
    expect(leituras).toBe(0);

    await page.keyboard.press("Enter");
    const resumo =
      caso.campo === "Início" ? /02\/10\/2026.*09\/10\/2026/ : /01\/10\/2026.*08\/10\/2026/;
    await expectUi(page.getByText(resumo).first()).toBeVisible();
    await expect.poll(() => leituras).toBeGreaterThan(0);
  } finally {
    await page.close();
  }
});
