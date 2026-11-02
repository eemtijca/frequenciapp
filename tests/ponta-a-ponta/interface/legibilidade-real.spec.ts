// Layout e fontes do aplicativo Next real. Executar somente em ambiente descartável.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { diaDaSemanaIso, diaSeguinte } from "@/domain/frequencia";
import {
  expectativaDoSeletor,
  nomeDoDialogoDaChamada,
  primeiraNavegacao,
} from "../helpers/legibilidade";
import { varianteDoDiaLegivel, type MedidaTexto } from "../helpers/visibilidade-dia";
import { criarMassaE2E, limparMassaE2E } from "../helpers/banco";
import { diaCorrente } from "../helpers/dia";
import { navegarCalendario } from "../helpers/calendario-historico";
import { aguardarHidratacao, trocarVisao } from "../helpers/pagina";

// Impede ações acidentais de escrita pela página, não as alterações do globalSetup
// ou do helper de massa. O banco e o servidor devem ser exclusivamente sintéticos.
test.use({ serviceWorkers: "block", reducedMotion: "reduce" });

async function somenteLeitura(page: Page) {
  await page.route("**/*", async (route) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(route.request().method())) {
      await route.abort();
    } else {
      await route.continue();
    }
  });
}

async function fonteReal(page: Page, alvo: Locator, placeholder = false) {
  await page.evaluate(() => document.fonts.ready);
  const resultado = await alvo.evaluate((el, pseudo) => {
    const css = getComputedStyle(el, pseudo ? "::placeholder" : null);
    const primeira = (css.fontFamily.split(",")[0] ?? "").trim().replace(/^[\'\"]|[\'\"]$/g, "");
    const faces = [...document.fonts].filter(
      (face) => face.family.replace(/^[\'\"]|[\'\"]$/g, "") === primeira,
    );
    const texto = pseudo ? (el as HTMLInputElement).placeholder : (el as HTMLElement).innerText;
    const consulta = `${css.fontStyle} ${css.fontWeight} ${css.fontSize} "${primeira}"`;
    return {
      familia: css.fontFamily,
      primeira,
      estilo: css.fontStyle,
      peso: css.fontWeight,
      tamanho: css.fontSize,
      consulta,
      texto,
      faces: faces.map((face) => ({
        family: face.family,
        status: face.status,
        weight: face.weight,
        style: face.style,
      })),
      carregada: document.fonts.check(consulta, texto),
    };
  }, placeholder);
  // A fallback gerada pelo Next também contém Jakarta no nome; não aceitá-la.
  expect(resultado.primeira, JSON.stringify(resultado)).toMatch(/jakarta/i);
  expect(resultado.primeira, JSON.stringify(resultado)).not.toMatch(/fallback/i);
  expect(resultado.texto.trim(), JSON.stringify(resultado)).not.toBe("");
  expect(resultado.carregada, JSON.stringify(resultado)).toBe(true);
  expect(
    resultado.faces.some((face) => face.status === "loaded"),
    JSON.stringify(resultado),
  ).toBe(true);
}

async function tema(page: Page, valor: "light" | "dark") {
  await page.emulateMedia({ colorScheme: valor });
  await page.addInitScript((nome) => localStorage.setItem("theme", nome), valor);
}

const casos = ([320, 390, 1280] as const).flatMap((largura) =>
  (["light", "dark"] as const).map((cor) => ({ largura, cor })),
);

test.describe("login real sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  for (const { largura, cor } of casos) {
    test(`@anon placeholder e fonte em ${largura}px ${cor}`, async ({ page }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await tema(page, cor);
      await somenteLeitura(page);
      await page.goto("/");
      await aguardarHidratacao(page);
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${cor}\\b`));
      const campo = page.getByLabel("E-mail ou identificador");
      await expect(campo).toBeVisible();
      await expect(campo).toHaveValue("");
      await fonteReal(page, campo, true);
      const m = await campo.evaluate((input: HTMLInputElement) => {
        const css = getComputedStyle(input);
        const placeholder = getComputedStyle(input, "::placeholder");
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) throw new Error("Canvas indisponível");
        ctx.font = `${placeholder.fontStyle} ${placeholder.fontWeight} ${placeholder.fontSize} ${placeholder.fontFamily}`;
        const texto =
          ctx.measureText(input.placeholder).width +
          Math.max(0, [...input.placeholder].length - 1) *
            (parseFloat(placeholder.letterSpacing) || 0);
        const rect = input.getBoundingClientRect();
        return {
          placeholder: input.placeholder,
          texto,
          largura: rect.width,
          padding: parseFloat(css.paddingLeft) + parseFloat(css.paddingRight),
          bordas: parseFloat(css.borderLeftWidth) + parseFloat(css.borderRightWidth),
          altura: rect.height,
          esquerda: rect.left,
          direita: rect.right,
        };
      });
      expect(m.placeholder).toMatch(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
      expect(m.placeholder).toMatch(/\b\d+[a-z]-[a-z]+\b/i);
      expect(m.altura).toBeGreaterThanOrEqual(43.95);
      expect(m.esquerda).toBeGreaterThanOrEqual(-0.05);
      expect(m.direita).toBeLessThanOrEqual(largura + 0.05);
      // O bounding rect preserva frações, ao contrário de clientWidth arredondado.
      expect(m.texto + m.padding + m.bordas, JSON.stringify(m)).toBeLessThanOrEqual(
        m.largura + 0.05,
      );
      await info.attach(`login-${largura}-${cor}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    });
  }
});

// Fixtures negativas não dependem do aplicativo e não substituem o teste real.
test.describe("autochecagem das medições", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@anon detecta recorte em neto e aceita o texto inteiro", async ({ page }) => {
    await page.setContent(
      `<button style="width:240px;display:flex;justify-content:center"><span style="display:block;width:100px"><span id="texto" style="display:block;width:35px;overflow:hidden;white-space:nowrap">segunda-feira</span></span></button>`,
    );
    const botao = page.locator("button");
    await expect(conferirConteudo(botao)).rejects.toThrow();
    await page.locator("#texto").evaluate((el) => {
      (el as HTMLElement).style.width = "100px";
    });
    await conferirConteudo(botao);
  });

  test("@anon aceita linhas centradas e rejeita sobreposição ou desalinhamento", async ({
    page,
  }) => {
    await page.setContent(
      '<button style="width:120px;display:flex;flex-wrap:wrap;justify-content:center"><span style="width:70px">Data</span><span id="dia" style="width:70px">Dia</span></button>',
    );
    const botao = page.locator("button");
    await conferirConteudo(botao);
    const dia = page.locator("#dia");
    await dia.evaluate((el) => {
      el.style.marginTop = "-15px";
    });
    await expect(conferirConteudo(botao)).rejects.toThrow();
    await dia.evaluate((el) => {
      el.style.marginTop = "0";
      el.style.transform = "translateX(10px)";
    });
    await expect(conferirConteudo(botao)).rejects.toThrow();
  });

  test("@anon rejeita fonte fallback na medição real", async ({ page }) => {
    await page.setContent('<input placeholder="ana@escola.br" style="font-family: sans-serif">');
    await expect(fonteReal(page, page.locator("input"), true)).rejects.toThrow();
  });

  test("@anon rejeita data oculta, sem área ou recortada mesmo com outro texto visível", async ({
    page,
  }) => {
    const esperado = expectativaDoSeletor("2026-11-01", "2026-11-01");
    await page.setContent(
      `<button aria-label="${esperado.aria}"><span id="data" style="display:none">${esperado.rotulo}</span><span class="text-muted-foreground">semana</span></button>`,
    );
    const botao = page.locator("button");
    const data = page.locator("#data");
    await expect(conferirData(botao, "2026-11-01", "2026-11-01")).rejects.toThrow();
    await data.evaluate((el) => {
      el.style.cssText = "display:inline-block;font-size:0";
    });
    await expect(conferirData(botao, "2026-11-01", "2026-11-01")).rejects.toThrow();
    await data.evaluate((el) => {
      el.style.cssText = "display:inline-block;width:5px;overflow:hidden;white-space:nowrap";
    });
    await expect(conferirData(botao, "2026-11-01", "2026-11-01")).rejects.toThrow();
    await data.evaluate((el) => {
      el.style.cssText = "display:inline-block";
    });
    await conferirData(botao, "2026-11-01", "2026-11-01");
  });

  test("@anon exige ao menos uma variante visível do dia reconhecido", async ({ page }) => {
    const esperado = expectativaDoSeletor("2026-11-02", "2026-11-03");
    await page.setContent(
      `<button aria-label="${esperado.aria}" style="color:black"><span>${esperado.rotulo}</span><span class="text-muted-foreground"><span style="display:none">${esperado.sigla}</span><span style="display:none">${esperado.detalhe}</span></span></button>`,
    );
    const botao = page.locator("button");
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await botao
      .locator(".text-muted-foreground > span")
      .first()
      .evaluate((el) => {
        el.style.display = "inline";
      });
    await conferirData(botao, "2026-11-02", "2026-11-03");
  });

  test("@anon rejeita a única variante transparente e ancestrais ocultos", async ({ page }) => {
    const esperado = expectativaDoSeletor("2026-11-02", "2026-11-03");
    await page.setContent(
      `<button aria-label="${esperado.aria}" style="color:black"><span>${esperado.rotulo}</span><span class="text-muted-foreground"><span id="unica" style="opacity:0">${esperado.sigla}</span><span style="display:none">${esperado.detalhe}</span></span></button>`,
    );
    const botao = page.locator("button");
    const unica = page.locator("#unica");
    const ancestral = botao.locator(":scope > .text-muted-foreground");
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await unica.evaluate((el) => (el.style.opacity = "1"));
    await ancestral.evaluate((el) => (el.style.opacity = "0"));
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await ancestral.evaluate((el) => (el.style.opacity = "1"));
    await unica.evaluate((el) => (el.style.display = "none"));
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await unica.evaluate((el) => (el.style.display = "inline"));
    await conferirData(botao, "2026-11-02", "2026-11-03");
  });

  test("@anon rejeita cor transparente e opacidade cumulativa quase nula", async ({ page }) => {
    const esperado = expectativaDoSeletor("2026-11-02", "2026-11-03");
    await page.setContent(
      `<button aria-label="${esperado.aria}"><span>${esperado.rotulo}</span><span class="text-muted-foreground"><span id="unica" style="color:transparent">${esperado.sigla}</span><span style="display:none">${esperado.detalhe}</span></span></button>`,
    );
    const botao = page.locator("button");
    const unica = page.locator("#unica");
    const ancestral = botao.locator(":scope > .text-muted-foreground");
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await unica.evaluate((el) => (el.style.color = "rgba(0, 0, 0, 0.2)"));
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await unica.evaluate((el) => {
      el.style.color = "black";
      el.style.opacity = "0.01";
    });
    await ancestral.evaluate((el) => (el.style.opacity = "0.001"));
    await expect(conferirData(botao, "2026-11-02", "2026-11-03")).rejects.toThrow();
    await unica.evaluate((el) => (el.style.opacity = "1"));
    await ancestral.evaluate((el) => (el.style.opacity = "1"));
    await conferirData(botao, "2026-11-02", "2026-11-03");
  });

  test("@anon detecta interseção nos dois eixos dos controles", async ({ page }) => {
    await page.setContent(`<button style="position:absolute;left:20px;top:20px;width:50px;height:50px">A</button>
      <button id="meio" style="position:absolute;left:45px;top:80px;width:50px;height:50px">B</button>
      <button style="position:absolute;left:120px;top:20px;width:50px;height:50px">C</button>`);
    const controles = [
      page.getByText("A", { exact: true }),
      page.locator("#meio"),
      page.getByText("C", { exact: true }),
    ];
    await conferirNavegacaoMobile(page, controles);
    await page.locator("#meio").evaluate((el) => {
      el.style.top = "45px";
    });
    await expect(conferirNavegacaoMobile(page, controles)).rejects.toThrow();
  });
});

test.describe("seletor real com massa sintética", () => {
  test.beforeAll(async () => {
    await criarMassaE2E();
  });
  test.afterAll(async () => {
    await limparMassaE2E();
  });

  for (const { largura, cor } of casos) {
    test(`seletor na chamada ${largura}px ${cor}`, async ({ page }, info) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await tema(page, cor);
      await somenteLeitura(page);
      await page.goto("/");
      await aguardarHidratacao(page);
      await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${cor}\\b`));
      const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
      const gatilho = secao.locator("#dia-frequencia");
      await expect(gatilho).toBeEnabled();
      await fonteReal(page, gatilho.locator(":scope > span").first());
      const anterior = secao.getByRole("button", { name: "Dia anterior", exact: true });
      const seguinte = secao.getByRole("button", { name: "Dia seguinte", exact: true });
      const [a, g, s, parent] = await Promise.all([
        anterior.boundingBox(),
        gatilho.boundingBox(),
        seguinte.boundingBox(),
        gatilho.locator("..").boundingBox(),
      ]);
      if (!a || !g || !s || !parent) throw new Error("Navegação invisível");
      for (const caixa of [a, g, s]) {
        expect(caixa.height).toBeGreaterThanOrEqual(43.95);
        expect(caixa.width).toBeGreaterThanOrEqual(43.95);
        expect(Math.abs(caixa.y + caixa.height / 2 - (g.y + g.height / 2))).toBeLessThan(1);
      }
      expect(Math.abs(parent.width - g.width)).toBeLessThan(0.1);
      expect(a.x + a.width).toBeLessThanOrEqual(g.x + 0.05);
      expect(g.x + g.width).toBeLessThanOrEqual(s.x + 0.05);
      expect(a.x).toBeGreaterThanOrEqual(-0.05);
      expect(s.x + s.width).toBeLessThanOrEqual(largura + 0.05);
      await conferirConteudo(gatilho);
      await info.attach(`chamada-${largura}-${cor}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
      // Tab real a partir da posição atual, sem foco programático.
      for (
        let i = 0;
        i < 100 && !(await gatilho.evaluate((el) => el === document.activeElement));
        i++
      ) {
        await page.keyboard.press("Tab");
      }
      await expect(gatilho).toBeFocused();
      expect(await gatilho.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
      const hoje = diaCorrente();
      const percurso = primeiraNavegacao(hoje);
      await conferirData(gatilho, percurso.inicial, hoje);
      for (const tecla of ["Enter", "Space"]) {
        await page.keyboard.press(tecla);
        const dialogo = page.getByRole("dialog", {
          name: nomeDoDialogoDaChamada(percurso.inicial),
          exact: true,
        });
        await expect(dialogo).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(dialogo).toBeHidden();
        await expect(gatilho).toBeFocused();
      }
      if (diaDaSemanaIso(hoje) === 7) {
        await anterior.click();
        await conferirData(gatilho, percurso.aposSair, hoje);
      }
      await anterior.click();
      await conferirData(gatilho, percurso.anterior, hoje);
      await seguinte.click();
      await conferirData(gatilho, percurso.aposSair, hoje);
    });
  }

  for (const cor of ["light", "dark"] as const) {
    test(`texto ampliado no seletor e setas em 320px ${cor}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 320, height: 900 });
      await tema(page, cor);
      await somenteLeitura(page);
      await page.goto("/");
      await aguardarHidratacao(page);
      await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${cor}\\b`));
      const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
      const gatilho = secao.locator("#dia-frequencia");
      const anterior = secao.getByRole("button", { name: "Dia anterior", exact: true });
      const seguinte = secao.getByRole("button", { name: "Dia seguinte", exact: true });
      await expect(gatilho).toBeEnabled();
      await gatilho.evaluate((el) => {
        el.style.fontSize = "18px";
      });
      const hoje = diaCorrente();
      const conferir = async (dia: string) => {
        await gatilho.scrollIntoViewIfNeeded();
        await expect(gatilho).toHaveCSS("font-size", "18px");
        await expect(gatilho.locator(":scope > span").first()).toHaveCSS("font-size", "18px");
        await conferirData(gatilho, dia, hoje);
        await fonteReal(page, gatilho.locator(":scope > span").first());
        await conferirConteudo(gatilho);
        await conferirNavegacaoMobile(page, [anterior, gatilho, seguinte]);
        for (const seta of [anterior, seguinte]) {
          const icone = seta.locator("svg");
          await expect(icone).toBeVisible();
          const [botao, desenho] = await Promise.all([seta.boundingBox(), icone.boundingBox()]);
          if (!botao || !desenho) throw new Error("Seta invisível");
          expect(desenho.x).toBeGreaterThanOrEqual(botao.x - 0.05);
          expect(desenho.y).toBeGreaterThanOrEqual(botao.y - 0.05);
          expect(desenho.x + desenho.width).toBeLessThanOrEqual(botao.x + botao.width + 0.05);
          expect(desenho.y + desenho.height).toBeLessThanOrEqual(botao.y + botao.height + 0.05);
        }
      };
      await conferir(hoje);
      let segunda = diaSeguinte(hoje, -8);
      while (diaDaSemanaIso(segunda) !== 1) segunda = diaSeguinte(segunda, -1);
      await gatilho.click();
      const dialogo = page.getByRole("dialog", {
        name: nomeDoDialogoDaChamada(hoje),
        exact: true,
      });
      await navegarCalendario(dialogo, segunda.slice(0, 7));
      await dialogo.locator(`button[data-dia="${segunda}"]:not([data-fora-do-mes])`).click();
      await conferir(segunda);
      await anterior.click();
      await conferir(diaSeguinte(segunda, -1));
      await anterior.click();
      await conferir(diaSeguinte(segunda, -2));
      await seguinte.click();
      await conferir(diaSeguinte(segunda, -1));
      await seguinte.click();
      await conferir(segunda);
      await info.attach(`chamada-320-fonte-18-${cor}`, {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    });

    test(`limiares reais do contêiner e texto ampliado ${cor}`, async ({ page }, info) => {
      await page.setViewportSize({ width: 900, height: 900 });
      await tema(page, cor);
      await somenteLeitura(page);
      await page.goto("/");
      await aguardarHidratacao(page);
      await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${cor}\\b`));
      const gatilho = page.locator("#dia-frequencia");
      await expect(gatilho).toBeEnabled();
      const hoje = diaCorrente();
      await conferirData(gatilho, hoje, hoje);
      // O selo, quando existente, também precisa caber com texto ampliado.
      await gatilho.evaluate((el) => {
        const wrapper = el.parentElement;
        if (!wrapper) throw new Error("Invólucro ausente");
        const css = getComputedStyle(el);
        const extras =
          parseFloat(css.paddingLeft) +
          parseFloat(css.paddingRight) +
          parseFloat(css.borderLeftWidth) +
          parseFloat(css.borderRightWidth);
        wrapper.style.flex = `0 0 ${14.01 * parseFloat(getComputedStyle(document.documentElement).fontSize) + extras}px`;
        (el as HTMLElement).style.fontSize = "18px";
      });
      if (diaDaSemanaIso(hoje) !== 7) {
        await expect(gatilho.getByText("Hoje", { exact: true })).toBeVisible();
      }
      await conferirData(gatilho, hoje, hoje);
      await conferirConteudo(gatilho);
      await gatilho.evaluate((el) => {
        if (el.parentElement) el.parentElement.style.flex = "";
        (el as HTMLElement).style.fontSize = "";
      });
      let segunda = diaSeguinte(hoje, -8);
      while (diaDaSemanaIso(segunda) !== 1) segunda = diaSeguinte(segunda, -1);
      await gatilho.click();
      const dialogo = page.getByRole("dialog", {
        name: nomeDoDialogoDaChamada(hoje),
        exact: true,
      });
      await navegarCalendario(dialogo, segunda.slice(0, 7));
      await dialogo.locator(`button[data-dia="${segunda}"]:not([data-fora-do-mes])`).click();
      await conferirData(gatilho, segunda, diaCorrente());
      await fonteReal(page, gatilho.locator(":scope > span").first());
      // Estresse controlado apenas no invólucro real, sem trocar o DOM da aplicação.
      // A consulta @container observa content-box, não a largura da viewport.
      for (const [rem, fonte] of [
        [13.99, 16],
        [14.01, 16],
        [14.01, 18],
        [18, 18],
      ] as const) {
        const medidas = await gatilho.evaluate(
          (el, { rem, fonte }) => {
            const raiz = parseFloat(getComputedStyle(document.documentElement).fontSize);
            const css = getComputedStyle(el);
            const extras =
              parseFloat(css.paddingLeft) +
              parseFloat(css.paddingRight) +
              parseFloat(css.borderLeftWidth) +
              parseFloat(css.borderRightWidth);
            const wrapper = el.parentElement;
            if (!wrapper) throw new Error("Invólucro ausente");
            wrapper.style.flex = `0 0 ${rem * raiz + extras}px`;
            (el as HTMLElement).style.fontSize = `${fonte}px`;
            return { alvo: rem * raiz, extras };
          },
          { rem, fonte },
        );
        const larguraConteudo = () =>
          gatilho.evaluate((el) => {
            const css = getComputedStyle(el);
            return (
              el.getBoundingClientRect().width -
              parseFloat(css.paddingLeft) -
              parseFloat(css.paddingRight) -
              parseFloat(css.borderLeftWidth) -
              parseFloat(css.borderRightWidth)
            );
          });
        await expect
          .poll(async () => Math.abs((await larguraConteudo()) - medidas.alvo), {
            message: `A largura de conteúdo deve atingir ${medidas.alvo}px`,
          })
          .toBeLessThan(0.1);
        await expect(gatilho.locator("svg")).toBeVisible();
        const detalhe = gatilho.locator(":scope > span.text-muted-foreground");
        const partes = detalhe.locator(":scope > span");
        await expect(partes.nth(rem < 14 ? 0 : 1)).toBeVisible();
        await expect(partes.nth(rem < 14 ? 1 : 0)).toBeHidden();
        const esperado = expectativaDoSeletor(segunda, diaCorrente());
        if (!esperado.sigla) throw new Error("Dia útil sem sigla");
        await expect(partes.nth(rem < 14 ? 0 : 1)).toHaveText(
          rem < 14 ? esperado.sigla : esperado.detalhe,
        );
        await conferirData(gatilho, segunda, diaCorrente());
        await fonteReal(page, gatilho.locator(":scope > span").first());
        await conferirConteudo(gatilho);
        expect(Math.abs((await larguraConteudo()) - medidas.alvo)).toBeLessThan(0.1);
        await info.attach(`contêiner-${rem}rem-fonte-${fonte}-${cor}`, {
          body: await gatilho.screenshot(),
          contentType: "image/png",
        });
      }
    });
  }

  test("ao trocar de visão sem manter resumo, domingo abre no sábado", async ({ page }) => {
    const hoje = diaCorrente();
    test.skip(diaDaSemanaIso(hoje) !== 7, "Exercita o comportamento específico de domingo");
    await somenteLeitura(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada", { manterResumo: true });
    const gatilho = page
      .getByRole("region", { name: "Fazer chamada", exact: true })
      .locator("#dia-frequencia");
    await conferirData(gatilho, hoje, hoje);
    await gatilho.click();
    const resumo = page.getByRole("dialog", { name: "Resumo da semana", exact: true });
    await expect(resumo).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(resumo).toBeHidden();
    await trocarVisao(page, "Chamada", "chamada");
    await conferirData(gatilho, diaSeguinte(hoje, -1), hoje);
    await gatilho.click();
    const diaria = page.getByRole("dialog", { name: "Data da chamada", exact: true });
    await expect(diaria).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(diaria).toBeHidden();
  });

  test("escolha de data e navegação pelo domingo anterior", async ({ page }) => {
    await somenteLeitura(page);
    await page.goto("/");
    await aguardarHidratacao(page);
    await trocarVisao(page, "Chamada", "chamada");
    const secao = page.getByRole("region", { name: "Fazer chamada", exact: true });
    const gatilho = secao.locator("#dia-frequencia");
    await expect(gatilho).toBeEnabled();
    // Uma segunda histórica permite percorrer sábado, domingo e segunda seguinte
    // sem depender do dia de execução ou ultrapassar o máximo do calendário.
    let segunda = diaSeguinte(diaCorrente(), -8);
    while (diaDaSemanaIso(segunda) !== 1) segunda = diaSeguinte(segunda, -1);
    const sabado = diaSeguinte(segunda, 5);
    const domingo = diaSeguinte(segunda, 6);
    const segundaSeguinte = diaSeguinte(segunda, 7);
    await gatilho.click();
    const dialogo = page.getByRole("dialog", { name: "Data da chamada", exact: true });
    await navegarCalendario(dialogo, sabado.slice(0, 7));
    await dialogo.locator(`button[data-dia="${sabado}"]:not([data-fora-do-mes])`).click();
    const hoje = diaCorrente();
    await conferirData(gatilho, sabado, hoje);
    const seguinte = secao.getByRole("button", { name: "Dia seguinte", exact: true });
    const anterior = secao.getByRole("button", { name: "Dia anterior", exact: true });
    await seguinte.click();
    await conferirData(gatilho, domingo, hoje);
    await seguinte.click();
    await conferirData(gatilho, segundaSeguinte, hoje);
    await anterior.click();
    await conferirData(gatilho, domingo, hoje);
    await anterior.click();
    await conferirData(gatilho, sabado, hoje);
    expect(diaDaSemanaIso(domingo)).toBe(7);
  });
});

// Mede os próprios nós de texto e todos os ancestrais, inclusive fora do botão.
async function medirVariante(variante: Locator): Promise<MedidaTexto[]> {
  return variante.evaluate((el) => {
    const trechos: MedidaTexto[] = [];
    // A cor fica no browser; cor não suportada pelo Canvas falha fechada.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const no = walker.currentNode;
      if (!no.textContent?.trim()) continue;
      let alfaTexto: number | null = null;
      if (ctx && no.parentElement) {
        const cor = getComputedStyle(no.parentElement).color;
        // O sentinela branco detecta cor não suportada: nesse caso o Canvas
        // mantém o valor anterior e a comparação abaixo falha fechada.
        ctx.fillStyle = cor;
        const primeira = ctx.fillStyle;
        ctx.fillStyle = "#ffffff";
        ctx.fillStyle = cor;
        if (ctx.fillStyle === primeira) {
          try {
            ctx.clearRect(0, 0, 1, 1);
            ctx.fillRect(0, 0, 1, 1);
            const alfa = ctx.getImageData(0, 0, 1, 1).data[3];
            // Pixels são quantizados em 8 bits: usa limite inferior conservador.
            if (alfa !== undefined) alfaTexto = Math.max(0, (alfa - 0.5) / 255);
          } catch {
            // Sem leitura confiável, não aceitar a variante.
          }
        }
      }
      const estilos: MedidaTexto["estilos"] = [];
      for (let pai = no.parentElement; pai; pai = pai.parentElement) {
        const css = getComputedStyle(pai);
        estilos.push({
          display: css.display,
          visibility: css.visibility,
          opacity: Number(css.opacity),
        });
      }
      const range = document.createRange();
      range.selectNodeContents(no);
      const caixas = [...range.getClientRects()].map((caixa) => {
        let left = Math.max(caixa.left, 0),
          right = Math.min(caixa.right, innerWidth),
          top = Math.max(caixa.top, 0),
          bottom = Math.min(caixa.bottom, innerHeight);
        for (let pai = no.parentElement; pai; pai = pai.parentElement) {
          const css = getComputedStyle(pai);
          const borda = pai.getBoundingClientRect();
          if (/(hidden|clip|scroll|auto)/.test(css.overflowX)) {
            left = Math.max(left, borda.left + parseFloat(css.borderLeftWidth));
            right = Math.min(right, borda.right - parseFloat(css.borderRightWidth));
          }
          if (/(hidden|clip|scroll|auto)/.test(css.overflowY)) {
            top = Math.max(top, borda.top + parseFloat(css.borderTopWidth));
            bottom = Math.min(bottom, borda.bottom - parseFloat(css.borderBottomWidth));
          }
        }
        return {
          largura: caixa.width,
          altura: caixa.height,
          corte: Math.max(
            left - caixa.left,
            caixa.right - right,
            top - caixa.top,
            caixa.bottom - bottom,
          ),
        };
      });
      trechos.push({ texto: no.textContent, alfaTexto, estilos, caixas });
    }
    return trechos;
  });
}

async function conferirData(gatilho: Locator, dia: string, hoje: string) {
  const esperado = expectativaDoSeletor(dia, hoje);
  await expect(gatilho).toHaveAttribute("aria-label", esperado.aria);
  await expect(gatilho).toHaveAccessibleName(esperado.aria);
  const data = gatilho.locator(":scope > span").first();
  await expect(data).toHaveText(esperado.rotulo);
  await expect(data).toBeVisible();
  // Durante a leitura inicial o gatilho pode ficar desabilitado; a medição de
  // legibilidade só vale depois que ele e seus ancestrais voltam à opacidade plena.
  await expect
    .poll(() =>
      gatilho.evaluate((el) => {
        for (let pai: Element | null = el; pai; pai = pai.parentElement) {
          if (Number(getComputedStyle(pai).opacity) !== 1) return false;
        }
        return el.isConnected;
      }),
    )
    .toBe(true);
  const medida = await data.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()].map((caixa) => {
      let left = Math.max(caixa.left, 0),
        right = Math.min(caixa.right, window.innerWidth),
        top = Math.max(caixa.top, 0),
        bottom = Math.min(caixa.bottom, window.innerHeight);
      let opaca = true;
      for (let pai: Element | null = el; pai; pai = pai.parentElement) {
        const css = getComputedStyle(pai);
        if (Number(css.opacity) === 0 || css.visibility !== "visible" || css.display === "none") {
          opaca = false;
        }
        const borda = pai.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(css.overflowX)) {
          left = Math.max(left, borda.left + parseFloat(css.borderLeftWidth));
          right = Math.min(right, borda.right - parseFloat(css.borderRightWidth));
        }
        if (/(hidden|clip|scroll|auto)/.test(css.overflowY)) {
          top = Math.max(top, borda.top + parseFloat(css.borderTopWidth));
          bottom = Math.min(bottom, borda.bottom - parseFloat(css.borderBottomWidth));
        }
      }
      return {
        largura: caixa.width,
        altura: caixa.height,
        opaca,
        corte: Math.max(
          left - caixa.left,
          caixa.right - right,
          top - caixa.top,
          caixa.bottom - bottom,
        ),
      };
    });
  });
  expect(medida.length).toBeGreaterThan(0);
  for (const caixa of medida) {
    expect(caixa.opaca, JSON.stringify(medida)).toBe(true);
    expect(caixa.largura, JSON.stringify(medida)).toBeGreaterThan(0);
    expect(caixa.altura, JSON.stringify(medida)).toBeGreaterThan(0);
    expect(caixa.corte, JSON.stringify(medida)).toBeLessThanOrEqual(0.5);
  }
  const detalhe = gatilho.locator(":scope > span.text-muted-foreground");
  if (esperado.sigla) {
    const partes = detalhe.locator(":scope > span");
    await expect(partes.nth(0)).toHaveText(esperado.sigla);
    await expect(partes.nth(1)).toHaveText(esperado.detalhe);
    const textosEsperados = [esperado.sigla, esperado.detalhe];
    const medicoes = await Promise.all([
      medirVariante(partes.nth(0)),
      medirVariante(partes.nth(1)),
    ]);
    expect(
      medicoes.some((medida, indice) =>
        varianteDoDiaLegivel(medida, textosEsperados[indice] ?? ""),
      ),
      JSON.stringify(medicoes),
    ).toBe(true);
    await expect(detalhe).toBeVisible();
  } else {
    await expect(detalhe).toHaveText("semana");
    await expect(detalhe).toBeVisible();
  }
  const selo = gatilho.getByText("Hoje", { exact: true });
  if (dia === hoje && diaDaSemanaIso(dia) !== 7) {
    await expect(selo).toHaveCount(1);
    await expect(selo).toBeVisible();
  } else {
    await expect(selo).toHaveCount(0);
  }
}

// Retângulos completos contra viewport e ancestrais recortantes, sem alterar o layout.
async function conferirNavegacaoMobile(page: Page, controles: Locator[]) {
  const caixas = [];
  for (const controle of controles) {
    await expect(controle).toBeVisible();
    const medida = await controle.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      let left = 0,
        top = 0,
        right = innerWidth,
        bottom = innerHeight;
      for (let pai = el.parentElement; pai; pai = pai.parentElement) {
        const css = getComputedStyle(pai);
        const borda = pai.getBoundingClientRect();
        if (/(hidden|clip|scroll|auto)/.test(css.overflowX)) {
          left = Math.max(left, borda.left + parseFloat(css.borderLeftWidth));
          right = Math.min(right, borda.right - parseFloat(css.borderRightWidth));
        }
        if (/(hidden|clip|scroll|auto)/.test(css.overflowY)) {
          top = Math.max(top, borda.top + parseFloat(css.borderTopWidth));
          bottom = Math.min(bottom, borda.bottom - parseFloat(css.borderBottomWidth));
        }
      }
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        corte: Math.max(left - rect.left, rect.right - right, top - rect.top, rect.bottom - bottom),
      };
    });
    expect(medida.width, JSON.stringify(medida)).toBeGreaterThanOrEqual(43.95);
    expect(medida.height, JSON.stringify(medida)).toBeGreaterThanOrEqual(43.95);
    expect(medida.corte, JSON.stringify(medida)).toBeLessThanOrEqual(0.5);
    caixas.push(medida);
  }
  for (let i = 0; i < caixas.length; i++) {
    for (let j = i + 1; j < caixas.length; j++) {
      const a = caixas[i];
      const b = caixas[j];
      if (!a || !b) throw new Error("Retângulo ausente");
      const intersecaoX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const intersecaoY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(intersecaoX <= 0.05 || intersecaoY <= 0.05, JSON.stringify({ a, b })).toBe(true);
    }
  }
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
  ).toBeLessThanOrEqual(1);
}

async function conferirConteudo(gatilho: Locator) {
  const resultado = await gatilho.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const filhos = [...el.children]
      .filter((filho) => {
        const css = getComputedStyle(filho);
        return css.display !== "none" && css.visibility !== "hidden";
      })
      .map((filho) => {
        const caixa = filho.getBoundingClientRect();
        return {
          nome: filho.tagName,
          texto: (filho as HTMLElement).innerText,
          left: caixa.left,
          right: caixa.right,
          top: caixa.top,
          bottom: caixa.bottom,
          largura: (filho as HTMLElement).clientWidth,
          total: (filho as HTMLElement).scrollWidth,
        };
      });
    const textos: { texto: string; corte: number }[] = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const no = walker.currentNode;
      if (!no.textContent?.trim()) continue;
      let visivel = true;
      for (let pai = no.parentElement; pai; pai = pai.parentElement) {
        const css = getComputedStyle(pai);
        if (css.display === "none" || css.visibility !== "visible" || Number(css.opacity) === 0) {
          visivel = false;
          break;
        }
      }
      if (!visivel) continue;
      const range = document.createRange();
      range.selectNodeContents(no);
      for (const caixa of range.getClientRects()) {
        let left = caixa.left,
          right = caixa.right,
          top = caixa.top,
          bottom = caixa.bottom;
        for (let pai = no.parentElement; pai; pai = pai.parentElement) {
          const css = getComputedStyle(pai);
          const borda = pai.getBoundingClientRect();
          if (/(hidden|clip|scroll|auto)/.test(css.overflowX)) {
            left = Math.max(left, borda.left + parseFloat(css.borderLeftWidth));
            right = Math.min(right, borda.right - parseFloat(css.borderRightWidth));
          }
          if (/(hidden|clip|scroll|auto)/.test(css.overflowY)) {
            top = Math.max(top, borda.top + parseFloat(css.borderTopWidth));
            bottom = Math.min(bottom, borda.bottom - parseFloat(css.borderBottomWidth));
          }
        }
        left = Math.max(left, 0);
        top = Math.max(top, 0);
        right = Math.min(right, window.innerWidth);
        bottom = Math.min(bottom, window.innerHeight);
        const corte = Math.max(
          left - caixa.left,
          caixa.right - right,
          top - caixa.top,
          caixa.bottom - bottom,
        );
        textos.push({ texto: no.textContent ?? "", corte });
      }
    }
    return {
      left: rect.left,
      right: rect.right,
      top: rect.top,
      bottom: rect.bottom,
      filhos,
      textos,
    };
  });
  expect(resultado.filhos.length).toBeGreaterThan(0);
  expect(resultado.textos.length).toBeGreaterThan(0);
  for (const texto of resultado.textos) {
    expect(texto.corte, JSON.stringify(resultado)).toBeLessThanOrEqual(0.5);
  }
  const linhas: (typeof resultado.filhos)[] = [];
  for (const filho of resultado.filhos) {
    expect(filho.left, JSON.stringify(resultado)).toBeGreaterThanOrEqual(resultado.left - 0.05);
    expect(filho.right, JSON.stringify(resultado)).toBeLessThanOrEqual(resultado.right + 0.05);
    expect(filho.top, JSON.stringify(resultado)).toBeGreaterThanOrEqual(resultado.top - 0.05);
    expect(filho.bottom, JSON.stringify(resultado)).toBeLessThanOrEqual(resultado.bottom + 0.05);
    expect(filho.total, JSON.stringify(resultado)).toBeLessThanOrEqual(filho.largura + 1);
    const linha = linhas.find((grupo) =>
      grupo.some((outro) => filho.top < outro.bottom - 0.05 && outro.top < filho.bottom - 0.05),
    );
    if (linha) linha.push(filho);
    else linhas.push([filho]);
  }
  for (const linha of linhas) {
    for (let i = 1; i < linha.length; i++) {
      const anterior = linha[i - 1];
      const atual = linha[i];
      if (!anterior || !atual) throw new Error("Linha incompleta");
      expect(anterior.right, JSON.stringify(resultado)).toBeLessThanOrEqual(atual.left + 0.05);
    }
    const esquerda = Math.min(...linha.map((filho) => filho.left));
    const direita = Math.max(...linha.map((filho) => filho.right));
    expect(
      Math.abs(esquerda + direita - resultado.left - resultado.right),
      JSON.stringify(resultado),
    ).toBeLessThan(2);
  }
}
