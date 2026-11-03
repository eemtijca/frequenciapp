// Verifica ações contextuais dos cadastros nos componentes reais e nos dois temas.
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, type Browser, type Locator } from "@playwright/test";
import tailwind from "@tailwindcss/postcss";
import { afterAll, beforeAll, expect, it } from "vitest";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const diretores = [
  {
    id: "diretor-1",
    nome: "Dora Teste",
    identificador: "dora.teste",
    ativo: true,
    estado: "em_uso",
    emitidaEm: null,
    expiraEm: null,
    primeiroUsoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    turmas: [],
  },
  {
    id: "diretor-2",
    nome: "Eva Teste",
    identificador: "eva.teste",
    ativo: false,
    estado: "revogada",
    emitidaEm: null,
    expiraEm: null,
    primeiroUsoEm: null,
    revogadaEm: null,
    motivoRevogacao: null,
    turmas: [],
  },
];

beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: path.join(tmpdir(), "vite-acoes-cadastros"),
    define: { "process.env": "{}" },
    css: { postcss: { plugins: [tailwind()] } },
    esbuild: { jsx: "automatic" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/gestao/acoes-cadastros.html`;
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  await servidor?.close();
});

async function conferirAcao(botao: Locator) {
  await botao.waitFor({ state: "visible" });
  const estado = await botao.evaluate((el) => {
    const retangulo = el.getBoundingClientRect();
    return {
      fundo: getComputedStyle(el).backgroundColor,
      largura: retangulo.width,
      altura: retangulo.height,
    };
  });
  expect(estado.fundo).toBe("rgba(0, 0, 0, 0)");
  expect(estado.largura).toBeGreaterThanOrEqual(44);
  expect(estado.altura).toBeGreaterThanOrEqual(44);
}

async function conferirPerigo(botao: Locator) {
  await expect
    .poll(() =>
      botao.evaluate((el) => {
        const amostra = document.createElement("span");
        amostra.style.color = "var(--falta-texto)";
        el.appendChild(amostra);
        const resultado = getComputedStyle(el).color === getComputedStyle(amostra).color;
        amostra.remove();
        return resultado;
      }),
    )
    .toBe(true);
}

async function conferirTema(botao: Locator, tema: "light" | "dark") {
  await botao.waitFor({ state: "visible" });
  const fundo = await botao.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--background").trim(),
  );
  expect(fundo).toBe(tema === "dark" ? "oklch(0.19 0.004 90)" : "#f6f6f6");
}

for (const tema of ["light", "dark"] as const) {
  for (const largura of [390, 1280]) {
    it(`ações de diretores sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.route("**/api/diretores", (route) => route.fulfill({ json: { diretores } }));
        await page.goto(`${url}?aba=diretores`);
        await page.evaluate(
          (classe) => document.documentElement.classList.toggle("dark", classe === "dark"),
          tema,
        );
        for (const nome of [
          "Editar Dora Teste",
          "Desativar Dora Teste",
          "Revogar a palavra-chave de Dora Teste",
          "Editar Eva Teste",
          "Reativar Eva Teste",
        ]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar Dora Teste" }), tema);
        await conferirPerigo(
          page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }),
        );
        expect(
          await page.getByRole("button", { name: "Revogar a palavra-chave de Eva Teste" }).count(),
        ).toBe(0);
        expect(await page.getByRole("button", { name: "Gerar nova" }).last().isDisabled()).toBe(
          true,
        );
        const principal = page.getByRole("button", { name: "Novo diretor" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
        expect(
          await page
            .getByRole("button", { name: "Gerar nova" })
            .first()
            .getAttribute("data-variant"),
        ).toBe("outline");
      } finally {
        await page.close();
      }
    });
    it(`ações de alunos sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.goto(`${url}?aba=alunos`);
        await page.evaluate(
          (classe) => document.documentElement.classList.toggle("dark", classe === "dark"),
          tema,
        );
        for (const nome of [
          "Editar Ana Teste",
          "Desativar Ana Teste",
          "Excluir Ana Teste",
          "Editar Bia Teste",
          "Reativar Bia Teste",
          "Excluir Bia Teste",
          "Reativar Caio Teste",
        ]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar Ana Teste" }), tema);
        await conferirPerigo(page.getByRole("button", { name: "Excluir Ana Teste" }));
        expect(await page.getByRole("button", { name: "Reativar Caio Teste" }).isDisabled()).toBe(
          true,
        );
        const principal = page.getByRole("button", { name: "Novo aluno" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      } finally {
        await page.close();
      }
    });
    it(`ações de séries sem fundo em ${tema} e ${largura}px`, async () => {
      const page = await browser.newPage({ viewport: { width: largura, height: 900 } });
      try {
        await page.goto(url);
        await page.evaluate(
          (classe) => document.documentElement.classList.toggle("dark", classe === "dark"),
          tema,
        );
        for (const nome of ["Editar série 1º ano", "Excluir série 1º ano"]) {
          await conferirAcao(page.getByRole("button", { name: nome, exact: true }));
        }
        await conferirTema(page.getByRole("button", { name: "Editar série 1º ano" }), tema);
        await conferirPerigo(page.getByRole("button", { name: "Excluir série 1º ano" }));
        const principal = page.getByRole("button", { name: "Nova série" });
        expect(await principal.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
          "rgba(0, 0, 0, 0)",
        );
      } finally {
        await page.close();
      }
    });
  }
}

it("edição, teclado e confirmação de exclusão de série são preservados", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: string[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      chamadas.push(`${route.request().method()} ${new URL(route.request().url()).pathname}`);
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(url);
    const editar = page.getByRole("button", { name: "Editar série 1º ano" });
    await editar.focus();
    expect(await editar.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
    expect(
      await editar.evaluate((el) => {
        const estilo = getComputedStyle(el);
        return estilo.outlineStyle !== "none" || estilo.boxShadow !== "none";
      }),
    ).toBe(true);
    await page.keyboard.press("Enter");
    expect(await page.getByRole("dialog", { name: "Editar série" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Excluir série 1º ano" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Excluir série 1º ano" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => chamadas).toEqual(["DELETE /api/series/serie-1"]);
  } finally {
    await page.close();
  }
});

it("alunos mantêm edição, seleção e confirmações antes de alterar ou excluir", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      chamadas.push({
        metodo: request.method(),
        caminho: new URL(request.url()).pathname,
        corpo: request.postDataJSON(),
      });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${url}?aba=alunos`);
    await page.getByRole("button", { name: "Editar Ana Teste" }).click();
    expect(await page.getByRole("dialog", { name: "Editar Ana Teste" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Desativar Ana Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Desativar Ana Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Desativar", exact: true })
      .click();
    await expect
      .poll(() => chamadas)
      .toEqual([{ metodo: "PATCH", caminho: "/api/alunos/aluno-1", corpo: { ativo: false } }]);
    await page.getByRole("button", { name: "Excluir Ana Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toHaveLength(1);
    await page.getByRole("button", { name: "Excluir Ana Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect.poll(() => chamadas.length).toBe(2);
    expect(chamadas[1]).toMatchObject({ metodo: "DELETE", caminho: "/api/alunos/aluno-1" });
    await page.getByRole("button", { name: "Reativar Bia Teste" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toHaveLength(2);
    await page.getByRole("button", { name: "Reativar Bia Teste" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Reativar", exact: true })
      .click();
    await expect.poll(() => chamadas.length).toBe(3);
    expect(chamadas[2]).toEqual({
      metodo: "PATCH",
      caminho: "/api/alunos/aluno-2",
      corpo: { ativo: true },
    });
    await page.getByRole("button", { name: "Definir origem" }).click();
    expect(await page.getByRole("button", { name: "Editar Ana Teste" }).count()).toBe(0);
    await page.getByRole("button", { name: "Selecionar Ana Teste" }).click();
    expect(
      await page.getByRole("button", { name: "Selecionar Ana Teste" }).getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await page.close();
  }
});

it("diretores mantêm acesso contextual e confirmação de revogação com motivo", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 900 },
    reducedMotion: "reduce",
  });
  const chamadas: { metodo: string; caminho: string; corpo: unknown }[] = [];
  try {
    await page.route("**/api/**", async (route) => {
      const request = route.request();
      if (request.method() === "GET") {
        await route.fulfill({ json: { diretores } });
        return;
      }
      chamadas.push({
        metodo: request.method(),
        caminho: new URL(request.url()).pathname,
        corpo: request.postDataJSON(),
      });
      await route.fulfill({ json: { ok: true } });
    });
    await page.goto(`${url}?aba=diretores`);
    await page.getByRole("button", { name: "Editar Dora Teste" }).click();
    expect(await page.getByRole("dialog", { name: "Editar Dora Teste" }).isVisible()).toBe(true);
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
    await page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }).click();
    const dialogo = page.getByRole("alertdialog");
    expect(await dialogo.getByRole("button", { name: "Revogar", exact: true }).isDisabled()).toBe(
      true,
    );
    await dialogo.getByLabel("Motivo").fill("Teste");
    await dialogo.getByRole("button", { name: "Cancelar" }).click();
    expect(chamadas).toEqual([]);
    await page.getByRole("button", { name: "Revogar a palavra-chave de Dora Teste" }).click();
    expect(await dialogo.getByLabel("Motivo").inputValue()).toBe("");
    await dialogo.getByLabel("Motivo").fill("Teste de revogação");
    await dialogo.getByRole("button", { name: "Revogar", exact: true }).click();
    await expect
      .poll(() => chamadas)
      .toEqual([
        {
          metodo: "POST",
          caminho: "/api/diretores/diretor-1/revogar",
          corpo: { motivo: "Teste de revogação" },
        },
      ]);
    await expect.poll(() => dialogo.isVisible()).toBe(false);
    await page.getByRole("button", { name: "Desativar Dora Teste" }).click();
    await expect.poll(() => chamadas.length).toBe(2);
    expect(chamadas[1]).toEqual({
      metodo: "PATCH",
      caminho: "/api/diretores/diretor-1",
      corpo: { ativo: false },
    });
  } finally {
    await page.close();
  }
});
