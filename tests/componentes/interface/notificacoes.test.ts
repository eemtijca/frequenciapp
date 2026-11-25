// Prova a rolagem nativa, alvo de toque, descrições e foco no diálogo real.
import { createHash } from "node:crypto";
import { appendFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  chromium,
  expect as verificar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";

const importar = createRequire(import.meta.url);
const importarVite = createRequire(importar.resolve("vitest/package.json"));
const base = "http://127.0.0.1:36616";
const api = "/api/notificacoes/assinatura";
const fonte = process.env.QA_NOTIFICACOES_FONTE;
const provas = process.env.QA_NOTIFICACOES_PROVAS;
const entrada = process.env.QA_NOTIFICACOES_ENTRADA;
const sha = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const assets = new Map<string, { body: string | Buffer; contentType: string }>();
let navegador: Browser;

beforeAll(async () => {
  const { build } = await import(pathToFileURL(importarVite.resolve("vite")).href);
  const resultado = await build({
    configFile: false,
    envFile: false,
    publicDir: false,
    logLevel: "silent",
    define: { "process.env": '{"NODE_ENV":"production"}' },
    resolve: { alias: { "@": resolve("src") } },
    oxc: { jsx: { runtime: "automatic" } },
    build: {
      write: false,
      minify: false,
      target: "chrome120",
      modulePreload: false,
      reportCompressedSize: false,
      rollupOptions: {
        input: resolve("tests/componentes/interface/notificacoes.tsx"),
        output: { entryFileNames: "assets/entrada.js" },
      },
    },
  });
  for (const pacote of Array.isArray(resultado) ? resultado : [resultado]) {
    for (const arquivo of pacote.output) {
      const body = arquivo.type === "chunk" ? arquivo.code : arquivo.source;
      if (typeof body !== "string" || !/^assets\/[\w.-]+\.(?:js|css)$/.test(arquivo.fileName)) {
        throw new Error("Artefato fora da fixture de Notificações");
      }
      const contentType = arquivo.fileName.endsWith(".js") ? "text/javascript" : "text/css";
      assets.set(`/${arquivo.fileName}`, { body, contentType });
    }
  }
  expect(assets.has("/assets/entrada.js")).toBe(true);
  if (fonte) {
    const body = await readFile(fonte);
    expect(sha(body)).toBe("cd8db90cd950e26bc8761f65d323588bd5cd112d326d6d322bc7c8ea86771215");
    assets.set("/jakarta.woff2", { body, contentType: "font/woff2" });
  }
  navegador = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await navegador?.close();
});

const horarioPendencias = "A partir das 17:00 (horário da escola).";
const horarioResumo = "A partir das 16:30 (horário da escola).";
const bloqueado = "Este aviso está desligado pela Gestão.";
const pendencias = {
  tipo: "chamadasPendentes",
  nome: "Chamadas pendentes",
  descricao: horarioPendencias,
  checked: true,
  disponivel: true,
};
const resumo = {
  tipo: "resumoDiario",
  nome: "Resumo diário",
  descricao: horarioResumo,
  checked: true,
  disponivel: true,
};
const novas = {
  tipo: "novasChamadas",
  nome: "Novas chamadas",
  descricao: bloqueado,
  checked: false,
  disponivel: false,
};
const cenarios = [
  {
    id: "CONTA320",
    entrada: "/equipe",
    width: 320,
    tema: "light",
    permissao: "denied",
    linhas: [pendencias],
  },
  {
    id: "MOUSE320",
    entrada: "/equipe",
    width: 320,
    tema: "light",
    permissao: "denied",
    linhas: [pendencias, novas],
    modalidade: "mouse",
  },
  {
    id: "TOQUE320",
    entrada: "/equipe",
    width: 320,
    tema: "light",
    permissao: "denied",
    linhas: [pendencias, novas],
    modalidade: "touch",
  },
  {
    id: "DIRETOR390",
    entrada: "/diretor",
    width: 390,
    tema: "dark",
    permissao: "denied",
    linhas: [resumo, novas],
  },
  {
    id: "ATIVAR390",
    entrada: "/diretor",
    width: 390,
    tema: "dark",
    permissao: "default",
    linhas: [resumo, { ...novas, descricao: null, disponivel: true }],
  },
] as const;

function html() {
  const css = [...assets.keys()].filter((url) => url.endsWith(".css"));
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Conta e avisos | QA offline</title><link rel="icon" href="data:,">${css.map((url) => `<link rel="stylesheet" href="${url}">`).join("")}<style>@font-face{font-family:QaJakarta;src:url('/jakarta.woff2') format('woff2');font-weight:200 800;font-display:block}html{--font-jakarta:${fonte ? "QaJakarta" : "Arial"}}</style><script>globalThis.process={env:{NODE_ENV:'production'}};</script></head><body><div id="root"></div><script type="module" src="/assets/entrada.js"></script></body></html>`;
}

function prepararPush(permissao: NotificationPermission) {
  const contagem = { registro: 0, leitura: 0, permissao: 0, assinatura: 0 };
  Object.defineProperty(window, "qaNotificacoes", { value: contagem });
  const registro = {
    pushManager: {
      getSubscription: async () => {
        contagem.leitura++;
        return null;
      },
      subscribe: () => {
        contagem.assinatura++;
        throw new Error("Assinatura fora da fixture");
      },
    },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      ready: Promise.resolve(registro),
      register: async (url: string, opcoes: { scope: string }) => {
        if (url !== "/sw.js" || opcoes.scope !== "/") throw new Error("Registro fora da fixture");
        contagem.registro++;
        return registro;
      },
    },
  });
  Object.defineProperty(Notification, "permission", { value: permissao });
  Object.defineProperty(Notification, "requestPermission", {
    value: () => {
      contagem.permissao++;
      throw new Error("Permissão fora da fixture");
    },
  });
}

async function medir(conteudo: Locator) {
  return conteudo.evaluate((elemento) => {
    const caixa = elemento.getBoundingClientRect();
    const papel = elemento.closest(".MuiDialog-paper");
    const esquerda = caixa.left + elemento.clientLeft;
    const direita = esquerda + elemento.clientWidth;
    const topo = caixa.top + elemento.clientTop;
    let corte = 0;
    for (const texto of elemento.querySelectorAll("p:not(.MuiDialogContentText-root), button")) {
      const intervalo = document.createRange();
      intervalo.selectNodeContents(texto);
      for (const linha of intervalo.getClientRects()) {
        if (linha.bottom > topo && linha.top < topo + elemento.clientHeight) {
          corte = Math.max(corte, esquerda - linha.left, linha.right - direita);
        }
      }
    }
    const alvos = Array.from(
      elemento.querySelectorAll<HTMLInputElement>('input[role="switch"]'),
      (input) => {
        const base = input.closest(".MuiSwitch-switchBase")?.getBoundingClientRect();
        if (!base || !base.width || !base.height) throw new Error("Alvo sem caixa");
        const pontos = [
          [0.5, 0.5],
          [0.12, 0.5],
          [0.88, 0.5],
          [0.5, 0.12],
          [0.5, 0.88],
        ] as const;
        return {
          largura: base.width,
          altura: base.height,
          acerta:
            !input.disabled &&
            pontos.every(
              ([x, y]) =>
                document.elementFromPoint(
                  base.left + base.width * x,
                  base.top + base.height * y,
                ) === input,
            ),
          larguraInput: input.getBoundingClientRect().width,
        };
      },
    );
    const cta = elemento.querySelector("button")?.getBoundingClientRect();
    if (!papel || !cta) throw new Error("Diálogo incompleto");
    const caixas = Array.from(
      papel.querySelectorAll(
        "h2, button, li, .MuiSwitch-root, .MuiSwitch-switchBase, .MuiSwitch-track, .MuiSwitch-thumb",
      ),
      (e) => {
        const { x, y, width, height } = e.getBoundingClientRect();
        return [x, y, width, height];
      },
    );
    return {
      corte,
      alvos,
      caixas,
      alcance: elemento.scrollWidth - elemento.clientWidth,
      local: elemento.scrollLeft,
      vertical: elemento.scrollTop,
      documento: [
        window.scrollX,
        window.scrollY,
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ],
      papel: papel.scrollWidth - papel.clientWidth,
      cta: cta.left,
      overflow: [getComputedStyle(elemento).overflowX, getComputedStyle(elemento).overflowY],
      ponto: [caixa.left + caixa.width / 2, caixa.top + caixa.height / 2] as const,
    };
  });
}

async function rodaHorizontal(
  page: Page,
  conteudo: Locator,
  antes: Awaited<ReturnType<typeof medir>>,
) {
  await conteudo.evaluate((e: HTMLElement) => {
    e.addEventListener(
      "wheel",
      (evento) => {
        if (evento.isTrusted && evento.deltaX === 900 && evento.deltaY === 0)
          e.setAttribute("data-qa-roda", "recebida");
      },
      { once: true, passive: true },
    );
  });
  await page.mouse.move(...antes.ponto);
  await page.mouse.wheel(900, 0);
  await verificar(conteudo).toHaveAttribute("data-qa-roda", "recebida");
  if (antes.alcance > 0) {
    await verificar.poll(() => conteudo.evaluate((e) => e.scrollLeft)).toBe(antes.alcance);
  }
  await page.mouse.move(0, 0);
  await page.evaluate(
    () =>
      new Promise<void>((fim) => requestAnimationFrame(() => requestAnimationFrame(() => fim()))),
  );
  return medir(conteudo);
}

type PontoDoSwitch = "esquerda" | "centro" | "direita" | "base-esquerda" | "base-direita";

async function acionarSwitch(
  page: Page,
  controle: Locator,
  modalidade: "mouse" | "touch",
  nome: PontoDoSwitch,
  pedidos: boolean[],
  gravar: (dados: object) => Promise<void>,
  alternativa = false,
) {
  const antes = await controle.evaluate((input: HTMLInputElement, ponto) => {
    const raiz = input.closest(".MuiSwitch-root");
    const trilho = raiz?.querySelector(".MuiSwitch-track")?.getBoundingClientRect();
    const base = input.closest(".MuiSwitch-switchBase")?.getBoundingClientRect();
    if (!trilho?.width || !base?.width) throw new Error("Switch sem trilho ou área de toque");
    const caixa = ponto.startsWith("base-") ? base : trilho;
    const x = Math.round(
      ponto.endsWith("esquerda")
        ? caixa.left + 2
        : ponto.endsWith("direita")
          ? caixa.right - 2
          : caixa.left + caixa.width / 2,
    );
    const y = Math.round(trilho.top + trilho.height / 2);
    const caixaDe = (r: DOMRect) => [r.x, r.y, r.width, r.height];
    const observar = Reflect.get(window, "qaEntrada");
    return {
      x,
      y,
      checked: input.checked,
      disabled: input.disabled,
      base: caixaDe(base),
      trilho: caixaDe(trilho),
      input: caixaDe(input.getBoundingClientRect()),
      hit: observar?.(input, x, y),
    };
  }, nome);
  const inicio = pedidos.length;
  if (modalidade === "mouse") await page.mouse.click(antes.x, antes.y);
  else await page.touchscreen.tap(antes.x, antes.y);
  // Uma preferência só é considerada salva após o PATCH e a resposta da fixture.
  if (!antes.disabled) {
    await verificar
      .poll(() => pedidos.length, { timeout: 1200 })
      .toBeGreaterThan(inicio)
      .catch(() => {});
    if (pedidos.length > inicio) {
      await verificar(controle).toBeChecked({ checked: !antes.checked, timeout: 3000 });
      await verificar(controle).toBeEnabled({ timeout: 3000 });
    }
  }
  const depois = await controle.evaluate((input: HTMLInputElement) => ({
    checked: input.checked,
    disabled: input.disabled,
    entrada: Reflect.get(window, "qaEntrada")?.(),
  }));
  const patches = pedidos.slice(inicio);
  await gravar({ nome, alternativa, antes, depois, patches });
  expect(depois.disabled).toBe(antes.disabled);
  if (depois.checked === antes.checked && patches.length === 0) return false;
  expect(depois.checked).toBe(!antes.checked);
  expect(patches).toEqual([depois.checked]);
  return true;
}

async function provarGestos(
  dialogo: Locator,
  page: Page,
  modalidade: "mouse" | "touch",
  pedidos: boolean[],
  gravar: (dados: object) => Promise<void>,
) {
  const switchAtivo = dialogo.getByRole("switch", { name: "Chamadas pendentes", exact: true });
  const pontos = [
    "esquerda",
    "direita",
    "centro",
    "esquerda",
    "direita",
    "centro",
    "base-direita",
    "base-esquerda",
  ] as const;
  const falhas: PontoDoSwitch[] = [];
  for (const [indice, ponto] of pontos.entries()) {
    await verificar(switchAtivo).toBeEnabled();
    await verificar(switchAtivo).toBeChecked({ checked: indice % 2 === 0 });
    if (await acionarSwitch(page, switchAtivo, modalidade, ponto, pedidos, gravar)) continue;
    expect(ponto === "esquerda" || ponto === "direita").toBe(true);
    falhas.push(ponto);
    // O centro é o controle positivo e prepara o estado do ponto seguinte.
    expect(
      await acionarSwitch(page, switchAtivo, modalidade, "centro", pedidos, gravar, true),
    ).toBe(true);
  }
  const desabilitado = dialogo.getByRole("switch", { name: "Novas chamadas", exact: true });
  await verificar(desabilitado).toBeDisabled();
  expect(await acionarSwitch(page, desabilitado, modalidade, "centro", pedidos, gravar)).toBe(
    false,
  );
  await verificar(desabilitado).not.toBeChecked();
  await verificar(switchAtivo).toBeChecked();
  expect(pedidos).toEqual([false, true, false, true, false, true, false, true]);
  expect.soft(falhas, "TRILHO_ALTERNA_PREFERENCIA").toEqual([]);
}

it.each(cenarios)("$id: Notificações sem corte e com contexto individual", async (cenario) => {
  const modalidade = "modalidade" in cenario ? cenario.modalidade : undefined;
  const mouse = modalidade === "mouse";
  const contexto = await navegador.newContext({
    viewport: { width: cenario.width, height: 844 },
    colorScheme: cenario.tema,
    hasTouch: !mouse,
    isMobile: !mouse,
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    timezoneId: "America/Fortaleza",
    serviceWorkers: "block",
    acceptDownloads: false,
  });
  const registro = { id: cenario.id, etapa: "ABERTURA" };
  const gravar = async (extra: object = {}) => {
    if (provas)
      await appendFile(
        resolve(provas, "observacoes.jsonl"),
        JSON.stringify({ ...registro, ...extra }) + "\n",
        { mode: 0o600 },
      );
  };
  try {
    const page = await contexto.newPage();
    page.setDefaultTimeout(5000);
    const trafego = { leitura: 0, bloqueadas: 0, escritas: 0, errosPagina: 0 };
    page.on("pageerror", () => {
      trafego.errosPagina++;
    });
    if (entrada && modalidade) await contexto.addInitScript({ path: entrada });
    await contexto.addInitScript(prepararPush, cenario.permissao);
    const pedidos: boolean[] = [];
    await page.route("**/*", async (rota) => {
      const pedido = rota.request();
      const url = new URL(pedido.url());
      if (pedido.method() === "GET" && url.origin === base && !url.search && !url.hash) {
        if (url.pathname === cenario.entrada)
          return rota.fulfill({ body: html(), contentType: "text/html" });
        const arquivo = assets.get(url.pathname);
        if (arquivo) return rota.fulfill(arquivo);
        if (url.pathname === api) {
          trafego.leitura++;
          return rota.fulfill({
            json: {
              configurada: true,
              chavePublica: "AQ",
              ativa: false,
              horarioResumo: "16:30",
              horarioPendencias: "17:00",
              preferencias: { resumoDiario: true, novasChamadas: false, chamadasPendentes: true },
              tipos: cenario.linhas.map(({ tipo, disponivel }) => ({ tipo, disponivel })),
            },
          });
        }
      }
      if (
        modalidade &&
        pedido.method() === "PATCH" &&
        url.href === base + "/api/notificacoes/preferencias" &&
        pedido.headers()["content-type"] === "application/json"
      ) {
        const proximo = pedidos.length % 2 !== 0;
        if (
          pedidos.length < 8 &&
          pedido.postData() === JSON.stringify({ chamadasPendentes: proximo })
        ) {
          pedidos.push(proximo);
          return rota.fulfill({
            json: {
              preferencias: {
                resumoDiario: true,
                novasChamadas: false,
                chamadasPendentes: proximo,
              },
            },
          });
        }
      }
      trafego.bloqueadas++;
      if (pedido.method() !== "GET") trafego.escritas++;
      return rota.abort();
    });
    const [, entregue] = await Promise.all([
      page.goto(base + cenario.entrada),
      page.waitForResponse(base + "/assets/entrada.js"),
    ]);
    const js = sha(await entregue.body());
    expect(js).toBe(sha(assets.get("/assets/entrada.js")?.body ?? ""));
    if (fonte) {
      expect(
        await page.evaluate(async () => {
          const [face] = await document.fonts.load("600 14px QaJakarta");
          await document.fonts.ready;
          return (
            face?.status === "loaded" &&
            getComputedStyle(document.body).fontFamily.includes("QaJakarta")
          );
        }),
      ).toBe(true);
    }
    const conta = cenario.entrada === "/equipe";
    const gatilho = page.getByRole("button", {
      name: conta ? "Conta de Pessoa sintética" : "Configurar notificações",
      exact: true,
    });
    const abrir = (alvo: Locator) => (mouse ? alvo.click() : alvo.tap());
    await abrir(gatilho);
    if (conta)
      await abrir(
        page.getByRole("menu", { name: "Conta" }).getByRole("menuitem", { name: "Notificações" }),
      );
    const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
    const fechar = dialogo.getByRole("button", { name: "Fechar", exact: true });
    const ativar = dialogo.getByRole("button", { name: "Ativar notificações", exact: true });
    await verificar(ativar).toBeVisible();
    const habilitado = cenario.permissao === "default";
    if (habilitado) await verificar(ativar).toBeEnabled();
    else await verificar(ativar).toBeDisabled();
    await verificar(dialogo.getByText(/As notificações estão bloqueadas/)).toHaveCount(
      habilitado ? 0 : 1,
    );
    await verificar(dialogo.getByRole("switch")).toHaveCount(cenario.linhas.length);
    await verificar(page.locator("html")).toHaveAttribute("data-mui-color-scheme", cenario.tema);
    expect(
      await page.evaluate(() => [
        innerWidth,
        innerHeight,
        devicePixelRatio,
        visualViewport?.scale,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      ]),
    ).toEqual([cenario.width, 844, 1, 1, "America/Fortaleza"]);
    expect(await dialogo.evaluate((e) => e.contains(document.activeElement))).toBe(true);

    registro.etapa = "ACESSIBILIDADE";
    await gravar();
    const cdp = await contexto.newCDPSession(page);
    const { nodes } = await cdp.send("Accessibility.getFullAXTree");
    const desc: boolean[] = [];
    const navegaveis: Locator[] = [fechar];
    for (const linha of cenario.linhas) {
      const sw = dialogo.getByRole("switch", { name: linha.nome, exact: true });
      await verificar(sw).toBeVisible();
      if (linha.disponivel) {
        await verificar(sw).toBeEnabled();
        navegaveis.push(sw);
      } else await verificar(sw).toBeDisabled();
      await verificar(sw).toBeChecked({ checked: linha.checked });
      const [no, duplicado] = nodes.filter(
        (n) => !n.ignored && n.role?.value === "switch" && n.name?.value === linha.nome,
      );
      expect(Boolean(no) && !duplicado).toBe(true);
      expect(no?.properties?.find((p) => p.name === "checked")?.value.value).toBe(
        String(linha.checked),
      );
      expect(no?.properties?.some((p) => p.name === "disabled" && p.value.value === true)).toBe(
        !linha.disponivel,
      );
      if (linha.descricao !== null)
        await verificar(dialogo.getByText(linha.descricao, { exact: true })).toBeVisible();
      else expect(await sw.getAttribute("aria-describedby")).toBeNull();
      desc.push((no?.description?.value ?? null) === linha.descricao);
    }
    await cdp.detach();
    const conteudo = dialogo.locator(".MuiDialogContent-root");
    await verificar(conteudo).toBeVisible();
    await page.mouse.move(0, 0);

    registro.etapa = "RODA";
    const antes = await medir(conteudo);
    const depois = await rodaHorizontal(page, conteudo, antes);
    await gravar({ antes, depois, desc, js, chromium: navegador.version() });
    expect(antes.local).toBe(0);
    expect(antes.corte).toBeLessThan(0.51);
    expect(antes.documento).toEqual([0, 0, 0]);
    expect(depois.documento).toEqual(antes.documento);
    expect([antes.papel, depois.papel]).toEqual([0, 0]);
    expect(depois.vertical).toBe(antes.vertical);
    expect(antes.overflow).toEqual(["auto", "auto"]);
    expect(depois.overflow).toEqual(antes.overflow);
    expect(antes.alvos.map(({ largura, altura, acerta }) => [largura, altura, acerta])).toEqual(
      cenario.linhas.map(({ disponivel }) => [48, 48, disponivel]),
    );
    const captura =
      process.env.QA_NOTIFICACOES_SEM_CAPTURA !== "1" &&
      provas &&
      fonte &&
      cenario.id === "CONTA320";
    if (captura)
      await page.screenshot({ path: resolve(provas, "CONTA320.png"), animations: "disabled" });

    registro.etapa = "FOCO";
    await gravar();
    if (habilitado) navegaveis.push(ativar);
    await conteudo.evaluate((e) => {
      e.scrollLeft = 0;
    });
    for (const alvo of [...navegaveis, fechar]) {
      await page.keyboard.press("Tab");
      await verificar(alvo).toBeFocused();
      expect(await alvo.evaluate((e) => e.matches(":focus-visible"))).toBe(true);
      expect(await conteudo.evaluate((e) => e.scrollLeft)).toBe(0);
    }
    if (modalidade) {
      const capacidade = await page.evaluate(() => navigator.maxTouchPoints);
      expect(capacidade > 0).toBe(!mouse);
      registro.etapa = "GESTO";
      await provarGestos(dialogo, page, modalidade, pedidos, gravar);
      await page.mouse.move(0, 0);
      const final = await medir(conteudo);
      registro.etapa = "DEPOIS_DOS_GESTOS";
      await gravar({ capacidade, final });
      expect([final.alcance, final.local, final.corte]).toEqual([0, 0, 0]);
      expect(final.caixas).toEqual(antes.caixas);
    }
    if (conta) await abrir(fechar);
    else await page.keyboard.press("Escape");
    await verificar(page.locator(".MuiDialog-paper")).toHaveCount(0);
    await verificar(gatilho).toBeVisible();
    await verificar(gatilho).toBeFocused();
    const push = await page.evaluate(() => Reflect.get(window, "qaNotificacoes"));
    expect(push).toEqual({ registro: 1, leitura: 1, permissao: 0, assinatura: 0 });
    expect(trafego).toEqual({ leitura: 1, bloqueadas: 0, escritas: 0, errosPagina: 0 });

    registro.etapa = "CONTRATO";
    await gravar({
      push,
      trafego,
      ativarHabilitado: habilitado,
      focoRetornou: true,
      captura: Boolean(captura),
    });
    expect.soft([antes.alcance, depois.local], "SEM_DESLOCAMENTO_HORIZONTAL").toEqual([0, 0]);
    expect.soft(depois.corte, "TEXTO_INTEIRO_APOS_RODA").toBeLessThan(0.51);
    expect.soft(desc, "DESCRICOES_INDIVIDUAIS").toEqual(cenario.linhas.map(() => true));
  } finally {
    await contexto.close();
  }
});
