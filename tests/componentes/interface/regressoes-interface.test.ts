// Confere datas, avisos, Sobre e marcações nas superfícies reais, sem banco.
import { expect as verificar, type Browser, type Locator } from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import { abrirChromium } from "../../apoio/navegador";
import { criarServidorFixture, type ServidorFixture } from "../../apoio/vite";

let servidor: ServidorFixture;
let navegador: Browser;
beforeAll(async () => {
  servidor = await criarServidorFixture("tests/componentes/interface/navegacao-data.html");
  navegador = await abrirChromium();
});
afterAll(async () => {
  await navegador?.close();
  await servidor?.fechar();
});

const pagina = (width = 390, colorScheme: "light" | "dark" = "light") =>
  navegador.newPage({
    viewport: { width, height: 844 },
    colorScheme,
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });

it.each([
  ["Um dia", "light", 320],
  ["Uma semana de aula", "dark", 390],
  ["Período personalizado", "light", 390],
  ["Período personalizado", "dark", 600],
] as const)("a Grade mantém as datas utilizáveis em %s, %s, %i px", async (modo, tema, width) => {
  const page = await pagina(width, tema);
  try {
    await page.goto(`${servidor.url}?tela=grade&tema=${tema}`);
    const seletor = page.getByRole("combobox", { name: "Período da consulta" });
    await seletor.tap();
    await page.getByRole("option", { name: modo, exact: true }).tap();
    await verificar(page.getByRole("listbox", { includeHidden: true })).not.toBeAttached();
    const inicial = page.getByRole("button", { name: /^Data inicial da consulta:/ });
    const final = page.getByRole("button", { name: /^Data final da consulta:/ });
    const controles = modo === "Período personalizado" ? [inicial, final] : [inicial];
    const campo = await seletor.boundingBox();
    if (!campo) throw new Error("Campo de consulta ausente");
    for (const controle of controles) {
      const medida = await controle.boundingBox();
      expect(medida?.width).toBeGreaterThanOrEqual(width < 600 ? campo.width - 1 : 180);
      expect(medida?.height).toBeGreaterThanOrEqual(44);
      expect(medida?.height).toBeLessThanOrEqual(60);
      await controle.tap();
      const painel = page.getByRole("dialog", { name: /Data (inicial|final) da consulta/ });
      await verificar(painel.getByRole("button", { name: /^1 de novembro/ })).toBeFocused();
      await page.keyboard.press("Escape");
      await verificar(painel).not.toBeAttached();
      await verificar(controle).toBeFocused();
    }
    await inicial.tap();
    const painel = page.getByRole("dialog", { name: "Data inicial da consulta" });
    await painel.getByRole("button", { name: "Mês anterior" }).tap();
    await painel.getByRole("button", { name: /^31 de outubro/ }).tap();
    await verificar(inicial).toHaveAccessibleName(/31\/10/);
  } finally {
    await page.close();
  }
});

it("o calendário limitado abre no primeiro dia permitido e respeita os limites", async () => {
  const page = await pagina();
  try {
    await page.goto(`${servidor.url}?tela=calendario-limitado`);
    const gatilho = page.getByRole("button", { name: /^Data limitada:/ });
    await gatilho.press("Enter");
    const calendario = page.getByRole("dialog", { name: "Data limitada" });
    await verificar(calendario.getByRole("button", { name: /^2 de novembro/ })).toBeFocused({
      timeout: 1800,
    });
    for (const nome of ["Mês anterior", "Mês seguinte", "Hoje"]) {
      await verificar(calendario.getByRole("button", { name: nome, exact: true })).toBeDisabled();
    }
    await page.keyboard.press("PageUp");
    await verificar(calendario.getByRole("button", { name: /^2 de novembro/ })).toBeFocused();
    await page.keyboard.press("PageDown");
    await verificar(calendario.getByRole("button", { name: /^25 de novembro/ })).toBeFocused();
    await page.keyboard.press("Escape");
    await verificar(gatilho).toBeFocused();
  } finally {
    await page.close();
  }
});

async function conferirAvisoComAcao(aviso: Locator, nome: string) {
  await verificar(aviso).toBeVisible();
  const fechar = aviso.getByRole("button", { name: "Fechar aviso" });
  const acao = aviso.getByRole("button", { name: nome, exact: true });
  for (const botao of [fechar, acao]) {
    const caixa = await botao.boundingBox();
    expect(caixa?.height).toBeGreaterThanOrEqual(48);
    expect(caixa?.width).toBeGreaterThanOrEqual(48);
  }
  expect(
    await aviso.evaluate(
      (el) => el.querySelectorAll("[aria-live], [role=alert], [role=status]").length,
    ),
  ).toBe(0);
  const geometria = await aviso.evaluate((el) => {
    const mensagem = el.querySelector(".MuiAlert-message");
    const icone = el.querySelector(".MuiAlert-icon svg")?.getBoundingClientRect();
    const fechar = el.querySelector('button[aria-label="Fechar aviso"]')?.getBoundingClientRect();
    const acao = mensagem?.querySelector("button")?.getBoundingClientRect();
    if (!mensagem || !icone || !fechar || !acao) throw new Error("Partes do aviso ausentes");
    const texto = document.createTreeWalker(mensagem, NodeFilter.SHOW_TEXT);
    const linhas: DOMRect[] = [];
    while (texto.nextNode()) {
      if (
        !texto.currentNode.textContent?.trim() ||
        texto.currentNode.parentElement?.closest("button")
      )
        continue;
      const trecho = document.createRange();
      trecho.selectNodeContents(texto.currentNode);
      linhas.push(...trecho.getClientRects());
    }
    if (linhas.length === 0) throw new Error("Texto do aviso ausente");
    const topo = Math.min(...linhas.map(({ top }) => top));
    const base = Math.max(...linhas.map(({ bottom }) => bottom));
    const centro = (topo + base) / 2;
    return {
      desvio: Math.max(
        Math.abs(icone.y + icone.height / 2 - centro),
        Math.abs(fechar.y + fechar.height / 2 - centro),
      ),
      acaoAbaixo: acao.top >= base,
    };
  });
  expect(geometria.acaoAbaixo).toBe(true);
  expect(geometria.desvio).toBeLessThanOrEqual(2);
}

it.each(["light", "dark"] as const)("toast alinha ícone, texto e ações em %s", async (tema) => {
  const page = await pagina(320, tema);
  try {
    await page.goto(`${servidor.url}?tela=avisos-sobre&tema=${tema}`);
    await page.getByRole("button", { name: "Mostrar aviso" }).click();
    const aviso = page.getByRole("status").filter({ hasText: "Entrada confirmada." });
    await verificar(aviso).toBeVisible();
    const deslocamentos = await aviso.evaluate((el) => {
      const centro = (seletor: string) => {
        const caixa = el.querySelector(seletor)?.getBoundingClientRect();
        if (!caixa?.height) throw new Error(`Elemento do aviso ausente: ${seletor}`);
        return caixa.y + caixa.height / 2;
      };
      const texto = centro(".MuiAlertTitle-root");
      return [Math.abs(centro(".MuiAlert-icon svg") - texto), Math.abs(centro("button") - texto)];
    });
    expect(Math.max(...deslocamentos)).toBeLessThanOrEqual(1);
    await aviso.getByRole("button", { name: "Fechar aviso" }).click();
    await verificar(aviso).not.toBeAttached();
    await page.getByRole("button", { name: "Mostrar erro" }).click();
    const erro = page.getByRole("alert");
    await verificar(erro).toHaveCount(1);
    await verificar(erro).toHaveAttribute("aria-live", "assertive");
    await conferirAvisoComAcao(erro, "Tentar novamente");
    await erro.getByRole("button", { name: "Tentar novamente" }).tap();
    await verificar(erro).not.toBeAttached();
    await verificar(page.getByRole("status").filter({ hasText: "Carregado." })).toBeVisible();
  } finally {
    await page.close();
  }
});

it.each([
  [390, "light"],
  [1280, "dark"],
] as const)("Sobre mantém folga e links sem fios a %i px (%s)", async (width, tema) => {
  const page = await pagina(width, tema);
  try {
    await page.goto(`${servidor.url}?tela=avisos-sobre&tema=${tema}`);
    const gatilho = page.getByRole("button", { name: "Sobre", exact: true });
    await gatilho.press("Enter");
    const dialogo = page.getByRole("dialog", { name: "Sobre o FrequenciApp" });
    await expect
      .poll(
        () =>
          dialogo.evaluate((el) => {
            const cabecalho = el.querySelector(".MuiDialogTitle-root")?.getBoundingClientRect();
            const primeiro = el.querySelector("section")?.getBoundingClientRect();
            if (!cabecalho || !primeiro) throw new Error("Cabeçalho ou cartão ausente");
            return primeiro.top - cabecalho.bottom;
          }),
        { timeout: 1500 },
      )
      .toBeGreaterThanOrEqual(width < 600 ? 16 : 24);
    const links = dialogo.getByRole("link");
    await verificar(links).toHaveCount(5);
    expect(
      await links.evaluateAll((elementos) =>
        elementos.map((el) => getComputedStyle(el, "::before").content),
      ),
    ).toEqual(Array(5).fill("none"));
    const politica = dialogo.getByRole("link", { name: "Como os dados são tratados" });
    await verificar(politica).toHaveAttribute("href", "/privacidade");
    await politica.press("Tab");
    await verificar(dialogo.getByRole("link", { name: "Repositório no GitHub" })).toBeFocused();
    await page.keyboard.press("Escape");
    await verificar(gatilho).toBeFocused();
  } finally {
    await page.close();
  }
});

it.each([
  ["Fechar aviso", "light"],
  ["Atualizar", "dark"],
] as const)("aviso da PWA mantém a ação %s e o alinhamento em %s", async (acao, tema) => {
  const page = await pagina(320, tema);
  try {
    await page.addInitScript(() => {
      const worker = Object.assign(new EventTarget(), {
        state: "installed",
        postMessage: (dado: { tipo: string }) =>
          document.body.setAttribute("data-worker", dado.tipo),
      });
      const registro = Object.assign(new EventTarget(), { installing: worker });
      Object.defineProperty(navigator, "serviceWorker", {
        value: Object.assign(new EventTarget(), {
          controller: worker,
          register: async () => {
            setTimeout(() => {
              registro.dispatchEvent(new Event("updatefound"));
              worker.dispatchEvent(new Event("statechange"));
            }, 0);
            return registro;
          },
        }),
      });
    });
    await page.goto(`${servidor.url}?tela=aviso-pwa&tema=${tema}`);
    const aviso = page.getByRole("status").filter({ hasText: "Versão nova do aplicativo" });
    await verificar(aviso).toHaveCount(1);
    await conferirAvisoComAcao(aviso, "Atualizar");
    await aviso.getByRole("button", { name: acao, exact: true }).tap();
    await verificar(aviso).not.toBeAttached();
    expect(await page.locator("body").getAttribute("data-worker")).toBe(
      acao === "Atualizar" ? "pular-espera" : null,
    );
  } finally {
    await page.close();
  }
});

function medirContraste(marca: Locator) {
  return marca.evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const lum = (...cores: string[]) => {
      ctx.clearRect(0, 0, 1, 1);
      for (const cor of cores) {
        ctx.fillStyle = cor;
        ctx.fillRect(0, 0, 1, 1);
      }
      return Array.from(ctx.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((total, v, i) => total + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    };
    const razao = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const { color, backgroundColor } = getComputedStyle(el);
    const fundos: string[] = [];
    for (let pai = el.parentElement; pai; pai = pai.parentElement) {
      fundos.unshift(getComputedStyle(pai).backgroundColor);
    }
    const fundo = lum(...fundos, backgroundColor);
    return {
      texto: razao(lum(color), fundo),
      superficie: razao(lum(...fundos), fundo),
    };
  });
}

it.each(["light", "dark"] as const)(
  "a Chamada destaca F e FJ com contraste em %s",
  async (tema) => {
    const page = await pagina(390, tema);
    try {
      await page.route("**/api/**", (rota) =>
        rota.fulfill({ json: { frequencias: [], alertas: [], resumo: null } }),
      );
      await page.goto(`${servidor.url}?tela=chamada-marcas&tema=${tema}`);
      await page
        .getByRole("button", { name: /^Aluno teste:.*marcar falta/ })
        .click({ timeout: 3000 });
      const conferirMarca = async (estado: "F" | "FJ") => {
        const marca = page.locator(`[data-estado="${estado}"]`);
        await verificar(marca).toBeVisible();
        const contraste = await medirContraste(marca);
        expect(contraste.texto).toBeGreaterThanOrEqual(4.5);
        expect(contraste.superficie).toBeGreaterThanOrEqual(3);
      };
      await conferirMarca("F");
      await page.getByRole("combobox", { name: "Justificativa da falta de Aluno teste" }).click();
      await page.getByRole("option", { name: "Atestado" }).click();
      await verificar(
        page.getByRole("button", { name: /^Aluno teste: falta justificada/ }),
      ).toHaveAttribute("aria-pressed", "true");
      await conferirMarca("FJ");
    } finally {
      await page.close();
    }
  },
);
