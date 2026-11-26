// Navegação de data das telas reais, executada em Chromium sem banco.
import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  chromium,
  expect as esperar,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";
import { afterAll, beforeAll, expect, it } from "vitest";
import type { Frequencia } from "../../../src/domain/frequencia";
import { TOKENS_LAYOUT } from "../../../src/theme/layout";

const requireVitest = createRequire(import.meta.url);
const caminho = requireVitest.resolve("vite", {
  paths: [path.dirname(requireVitest.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
let servidor: Awaited<ReturnType<typeof createServer>>;
let browser: Browser;
let url: string;
const cache = mkdtempSync(path.join(tmpdir(), "periodos-vite-"));
beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    plugins: process.env.TESTAR_SEM_CONTORNO
      ? [
          {
            name: "teste-red-sem-contorno",
            transform(code: string, id: string) {
              if (
                /src\/components\/(relatorios\/(por-aluno|vista-resumo-relatorios|historico\/vista-historico)|diretor\/vista-minhas-turmas)\.tsx$/.test(
                  id,
                )
              )
                return code.replace("navegacao-dia ", "");
            },
          },
        ]
      : [],
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("Servidor indisponível");
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/interface/navegacao-data.html`;
  browser = await chromium.launch({ headless: true });
});
afterAll(async () => {
  await browser?.close();
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

// Retém o corpo já recebido, mesmo se o transporte implementar cancelamento.
async function reterPrimeiraRespostaDeGravacao(page: Page) {
  await page.addInitScript(() => {
    const ler = Response.prototype.json;
    Response.prototype.json = async function () {
      const dados = await ler.call(this);
      if (
        (this.ok && dados?.frequencia?.atualizadoPorNome === "Resposta anterior") ||
        dados?.error === "Gravação anterior recusada."
      ) {
        document.documentElement.dataset.gravacao = "retida";
        await new Promise<void>((resolver) => {
          window.addEventListener("liberar-gravacao-teste", () => resolver(), { once: true });
        });
        requestAnimationFrame(() => {
          requestAnimationFrame(() => (document.documentElement.dataset.gravacao = "entregue"));
        });
      }
      return dados;
    };
  });
  const estado = page.locator("html");
  return {
    aguardar: () => esperar(estado).toHaveAttribute("data-gravacao", "retida"),
    liberar: async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("liberar-gravacao-teste")));
      await esperar(estado).toHaveAttribute("data-gravacao", "entregue");
    },
  };
}

it("só exibe a confirmação da Chamada na sessão que iniciou o salvamento", async () => {
  const page = await browser.newPage({ serviceWorkers: "block" });
  const anterior = await reterPrimeiraRespostaDeGravacao(page);
  let salvamentos = 0;
  try {
    await page.route("**/*", (rota) => {
      const endereco = new URL(rota.request().url());
      if (endereco.origin !== new URL(url).origin) return rota.abort();
      if (endereco.pathname.startsWith("/api/")) return rota.fulfill({ status: 503, json: {} });
      return rota.continue();
    });
    await page.route(
      (u) => u.origin === new URL(url).origin && u.pathname === "/api/frequencias",
      async (rota) => {
        if (rota.request().method() === "GET") return rota.fulfill({ json: { frequencias: [] } });
        expect(rota.request().method()).toBe("POST");
        salvamentos++;
        await rota.fulfill({
          json: {
            frequencia: {
              dia: "2026-11-25",
              turmaId: "turma",
              revisao: 1,
              atualizadoEm: "2026-11-25T12:00:00Z",
              atualizadoPorNome: salvamentos === 1 ? "Resposta anterior" : "Conta sintética",
              faltas: [],
              alunos: ["aluno"],
            },
          },
        });
      },
    );
    const salvar = async () => {
      await page.getByRole("button", { name: "Salvar", exact: true }).click();
      await page
        .getByRole("alertdialog", { name: "Salvar chamada?", exact: true })
        .getByRole("button", { name: "Salvar", exact: true })
        .click();
    };
    await page.goto(`${url}?tela=chamada-avisos`);
    await salvar();
    await anterior.aguardar();
    await page.getByRole("button", { name: "Iniciar outra sessão da mesma conta" }).click();
    await esperar(page.getByLabel("Sessão da fixture")).toHaveText("2");
    await esperar(page.getByRole("button", { name: "Salvar", exact: true })).toBeEnabled();
    await anterior.liberar();
    const concluidos = page.getByLabel("Salvamentos concluídos");
    await esperar(concluidos).toHaveText("0");
    const confirmacao = page.getByText("Chamada salva. Todos presentes.", { exact: true });
    await esperar(confirmacao).toHaveCount(0);

    await salvar();
    await esperar(concluidos).toHaveText("1");
    await esperar(confirmacao).toBeVisible();
    expect(salvamentos).toBe(2);
  } finally {
    await page.close();
  }
});

it.each([
  { caso: "troca de visão sem gravação prévia", sessao: false, gravacaoPrevia: false },
  { caso: "mesma sessão sem gravação prévia", sessao: true, gravacaoPrevia: false },
  { caso: "mesma sessão com gravação prévia", sessao: true, gravacaoPrevia: true },
])("preserva o rascunho e a revisão ao retomar: $caso", async ({ sessao, gravacaoPrevia }) => {
  const page = await browser.newPage({ reducedMotion: "reduce", serviceWorkers: "block" });
  const anterior = await reterPrimeiraRespostaDeGravacao(page);
  const responderSaida = Promise.withResolvers<void>();
  const confirmarSessao = Promise.withResolvers<void>();
  const responderSegundoEnvio = Promise.withResolvers<void>();
  const envios: { revisao: number; faltas: Frequencia["faltas"] }[] = [];
  const respostas: number[] = [];
  const errosDaPagina: string[] = [];
  page.on("pageerror", (erro) => errosDaPagina.push(erro.message));
  let vigente: Frequencia | null = null;
  let leiturasDaChamada = 0;
  let saidas = 0;
  let consultasDeSessao = 0;
  try {
    await page.route("**/api/**", async (rota) => {
      const pedido = rota.request();
      const endereco = new URL(pedido.url());
      if (endereco.pathname === "/api/auth/sair" && pedido.method() === "POST") {
        saidas++;
        await responderSaida.promise;
        return rota.fulfill({ status: 503, json: { error: "Saída não confirmada." } });
      }
      if (endereco.pathname === "/api/auth/sessao" && pedido.method() === "GET") {
        expect(await pedido.headerValue("X-Frequenciapp-Referencia-Sessao")).toBe("1");
        consultasDeSessao++;
        await confirmarSessao.promise;
        return rota.fulfill({
          status: 200,
          json: { usuario: { id: "teste" }, referenciaSessao: "R".repeat(43) },
        });
      }
      if (pedido.method() === "GET") {
        if (endereco.pathname === "/api/frequencias" && endereco.searchParams.has("dia")) {
          expect(endereco.searchParams.get("dia")).toBe("2026-11-25");
          leiturasDaChamada++;
        }
        return rota.fulfill({
          json: { frequencias: vigente ? [vigente] : [], alertas: [], resumo: null },
        });
      }
      expect([endereco.pathname, pedido.method()]).toEqual(["/api/frequencias", "POST"]);
      const envio = pedido.postDataJSON();
      expect(envio).toMatchObject({ dia: "2026-11-25", turmaId: "turma" });
      envios.push(envio);
      const primeira = envios.length === 1;
      const responder = (status: number, json: object) => {
        respostas.push(status);
        return rota.fulfill({ status, json });
      };
      if (primeira && !gravacaoPrevia) {
        return responder(503, { error: "Gravação anterior recusada." });
      }
      if (!primeira) await responderSegundoEnvio.promise;
      // A resposta anterior pode estar retida no cliente depois de a revisão já ter mudado.
      if (envio.revisao !== (vigente?.revisao ?? 0)) {
        return responder(409, {
          error: "Esta frequência foi atualizada por outra pessoa.",
          conflito: true,
          frequencia: vigente,
        });
      }
      vigente = {
        dia: "2026-11-25",
        turmaId: "turma",
        revisao: (vigente?.revisao ?? 0) + 1,
        alunos: ["aluno"],
        atualizadoEm: "2026-11-25T12:00:00Z",
        atualizadoPorNome: primeira ? "Resposta anterior" : "Conta sintética",
        faltas: envio.faltas,
      };
      return responder(200, { frequencia: vigente });
    });
    const barra = page.locator('footer[aria-label="Barra de salvamento"]');
    const botaoSalvar = barra.getByRole("button", { name: "Salvar", exact: true });
    const salvar = async () => {
      await botaoSalvar.click({ timeout: 5000 });
      const confirmar = page
        .getByRole("alertdialog", { name: "Salvar chamada?" })
        .getByRole("button", { name: "Salvar", exact: true });
      await esperar(confirmar).toBeEnabled();
      // As duas ativações chegam no mesmo turno, antes que o DOM passe a desabilitar o botão.
      await confirmar.evaluate((botao: HTMLButtonElement) => {
        botao.click();
        botao.click();
      });
    };
    const tela = sessao ? "chamada-retomada-sessao" : "chamada-troca-atividade";
    await page.goto(`${url}?tela=${tela}`);
    const marca = page.getByRole("button", { name: /^Aluno teste:/ });
    await marca.click();
    await esperar(marca).toHaveAttribute("aria-pressed", "true");
    await salvar();
    await anterior.aguardar();
    expect(envios).toHaveLength(1);
    expect(envios[0]).toMatchObject({ revisao: 0, faltas: [{ alunoId: "aluno" }] });
    const saida = page.getByRole("button", { name: "Sair da conta" });
    if (sessao) {
      await saida.click();
      await esperar.poll(() => saidas).toBe(1);
      await esperar(marca).toBeVisible();
      expect(consultasDeSessao).toBe(0);
      responderSaida.resolve();
      await esperar.poll(() => consultasDeSessao).toBe(1);
      await esperar(
        page.getByRole("status").filter({ hasText: "Verificando se a sessão" }),
      ).toBeVisible();
      const marcaNoDom = page.locator('button[aria-label^="Aluno teste:"]');
      await esperar(marcaNoDom).toHaveCount(1);
      await esperar(marcaNoDom).toBeHidden();
      expect(envios).toHaveLength(1);
      confirmarSessao.resolve();
      await esperar(saida).toBeEnabled();
    } else {
      await page.getByRole("button", { name: "Sair da Chamada" }).click();
      await page.getByRole("button", { name: "Voltar à Chamada" }).click();
    }
    await esperar(marca).toBeEnabled({ timeout: 3000 });
    await esperar(marca).toHaveAttribute("aria-pressed", "true");
    await esperar(botaoSalvar).toBeEnabled();
    expect(leiturasDaChamada).toBe(1);
    expect(envios).toHaveLength(1);
    await marca.click();
    await esperar(marca).toHaveAttribute("aria-pressed", "false");
    await salvar();
    await esperar.poll(() => envios.length).toBe(2);
    expect(envios[1]).toMatchObject({ revisao: 0, faltas: [] });
    await anterior.liberar();
    await esperar(barra.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    await esperar(marca).toHaveAttribute("aria-pressed", "false");
    await esperar(page.getByText("Chamada salva com 1 falta.")).toHaveCount(0);
    await esperar(page.getByText("Gravação anterior recusada.", { exact: true })).toHaveCount(0);
    const lerRascunho = () =>
      page.evaluate(() =>
        Object.entries(sessionStorage)
          .filter(([chave]) => chave.startsWith("frequencia:rascunho:"))
          .map(([, valor]) => JSON.parse(valor).faltas),
      );
    expect(await lerRascunho()).toEqual([[]]);
    responderSegundoEnvio.resolve();
    if (gravacaoPrevia) {
      await esperar(page.getByText("A chamada foi salva em outro aparelho")).toBeVisible();
      await esperar(botaoSalvar).toBeDisabled();
      await esperar(marca).toHaveAttribute("aria-pressed", "false");
      expect(await lerRascunho()).toEqual([[]]);
      await page.getByRole("button", { name: "Recarregar versão salva" }).click();
      await esperar(marca).toHaveAttribute("aria-pressed", "true");
      expect(leiturasDaChamada).toBe(2);
    } else {
      await esperar(page.getByRole("button", { name: /^Desbloquear chamada/ })).toBeVisible();
    }
    expect(await lerRascunho()).toEqual([]);
    expect(respostas).toEqual(gravacaoPrevia ? [200, 409] : [503, 200]);
    expect(vigente).toMatchObject({
      revisao: 1,
      faltas: gravacaoPrevia ? [{ alunoId: "aluno" }] : [],
    });
    expect(envios).toHaveLength(2);
    expect([saidas, consultasDeSessao]).toEqual(sessao ? [1, 1] : [0, 0]);
    expect(errosDaPagina).toEqual([]);
  } finally {
    responderSaida.resolve();
    confirmarSessao.resolve();
    responderSegundoEnvio.resolve();
    await page.close();
  }
});

it("verifica antes de gravar, mantém o rascunho ao cancelar e confirma sem motivo", async () => {
  const page = await browser.newPage({
    viewport: { width: 320, height: 800 },
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  const liberar = Promise.withResolvers<void>();
  const gravar = Promise.withResolvers<void>();
  const envios: unknown[] = [];
  let verificacoes = 0;
  try {
    await page.route("**/api/**", async (rota) => {
      const pedido = rota.request();
      const endereco = new URL(pedido.url());
      if (endereco.pathname === "/api/frequencias" && pedido.method() === "POST") {
        envios.push(pedido.postDataJSON());
        await gravar.promise;
        return rota.fulfill({
          json: {
            frequencia: {
              dia: "2026-11-24",
              turmaId: "turma",
              revisao: 1,
              alunos: ["aluno"],
              atualizadoEm: "2026-11-25T12:00:00Z",
              faltas: [{ alunoId: "aluno", horarios: [] }],
            },
          },
        });
      }
      if (endereco.searchParams.get("verificarHistorico") === "true") {
        expect(pedido.method()).toBe("GET");
        expect(endereco.searchParams.get("dia")).toBe("2026-11-24");
        expect(endereco.searchParams.get("turmaId")).toBe("turma");
        verificacoes++;
        await liberar.promise;
        return rota.fulfill({ json: { requerConfirmacaoHistorica: true } });
      }
      return rota.fulfill({ json: { frequencias: [], alertas: [], resumo: null } });
    });
    await page.goto(`${url}?tela=chamada-historica`);
    const marca = page.getByRole("button", { name: /^Aluno teste:/ });
    await marca.click();
    await esperar(marca).toHaveAttribute("aria-pressed", "true");
    const barra = page.locator('footer[aria-label="Barra de salvamento"]');
    const salvar = barra.getByRole("button", { name: "Salvar", exact: true });
    const revisao = page.getByRole("alertdialog", { name: "Salvar chamada?" });
    const historica = page.getByRole("dialog", { name: "Confirmar chamada histórica?" });
    const iniciar = async () => {
      await salvar.click({ timeout: 5000 });
      const continuar = revisao.getByRole("button", { name: "Continuar revisando" });
      await esperar(continuar).toBeFocused();
      const geometria = await continuar.evaluate((botao) => {
        const range = document.createRange();
        range.selectNodeContents(botao);
        const limites = botao.getBoundingClientRect();
        const dialogo = botao.closest(".MuiDialog-paper")?.getBoundingClientRect();
        if (!dialogo) throw new Error("Revisão ausente");
        const caixas = Array.from(range.getClientRects());
        return {
          linhas: new Set(caixas.map((caixa) => caixa.top)).size,
          cabe:
            caixas.every((caixa) => caixa.left >= limites.left && caixa.right <= limites.right) &&
            limites.left >= dialogo.left &&
            limites.right <= dialogo.right,
        };
      });
      expect(geometria).toEqual({ linhas: 1, cabe: true });
      await revisao.getByRole("button", { name: "Salvar", exact: true }).click({ timeout: 2000 });
    };
    await iniciar();
    await esperar.poll(() => verificacoes).toBe(1);
    await esperar(revisao.getByRole("button", { name: "Verificando chamada..." })).toBeDisabled();
    await esperar(page.getByText("Salvando...", { exact: true })).toHaveCount(0);
    expect(envios).toEqual([]);
    liberar.resolve();
    for (const cancelar of [
      () => historica.getByRole("button", { name: "Cancelar", exact: true }).click(),
      () => page.keyboard.press("Escape"),
      () => historica.getByRole("button", { name: "Fechar", exact: true }).click(),
    ]) {
      await esperar(historica).toBeVisible();
      expect(envios).toEqual([]);
      await cancelar();
      await esperar(salvar).toBeFocused();
      await esperar(marca).toHaveAttribute("aria-pressed", "true");
      await iniciar();
    }
    await esperar(historica).toBeVisible();
    expect(verificacoes).toBe(4);
    expect(envios).toEqual([]);
    await historica.getByLabel("Motivo (opcional)").fill("  ");
    await historica.getByRole("button", { name: "Confirmar e salvar" }).click();
    await esperar.poll(() => envios.length).toBe(1);
    await esperar(barra.getByRole("button", { name: "Salvando..." })).toBeDisabled();
    expect(envios[0]).toMatchObject({
      confirmarHistorico: true,
      listaRevisada: ["aluno"],
      faltas: [{ alunoId: "aluno" }],
    });
    expect(envios[0]).not.toHaveProperty("motivo");
    gravar.resolve();
    await esperar(page.getByRole("button", { name: /^Desbloquear chamada/ })).toBeVisible();
    expect(envios).toHaveLength(1);
  } finally {
    liberar.resolve();
    gravar.resolve();
    await page.close();
  }
});

/** Espera o esquema do MUI e a pintura real do body antes de medir contrastes. */
async function aguardarTema(page: Page, tema: "light" | "dark") {
  await page.waitForFunction((valor) => {
    const raiz = document.documentElement;
    if (raiz.getAttribute("data-mui-color-scheme") !== valor) return false;
    if (!getComputedStyle(raiz).getPropertyValue("--template-palette-background-default").trim())
      return false;
    const corpo = getComputedStyle(document.body).backgroundColor;
    if (corpo === "rgba(0, 0, 0, 0)") return false;
    const contexto = document.createElement("canvas").getContext("2d");
    if (!contexto) return false;
    contexto.clearRect(0, 0, 1, 1);
    contexto.fillStyle = corpo;
    contexto.fillRect(0, 0, 1, 1);
    const r = contexto.getImageData(0, 0, 1, 1).data[0] ?? 0;
    return valor === "dark" ? r < 80 : r > 180;
  }, tema);
  // A troca de tema anima cor e fundo dos controles por 100 ms.
  await page.waitForTimeout(150);
}

interface MedidaControle {
  x: number;
  y: number;
  width: number;
  height: number;
  alvoLargura: number;
  alvoAltura: number;
  raio: string;
  bordas: string[];
  corBorda: string;
  fundo: string;
}

/** Mede a caixa visível e o alvo de toque real, que o MUI expande com ::after. */
async function medirControle(botao: Locator): Promise<MedidaControle> {
  return botao.evaluate((el) => {
    const caixa = el.getBoundingClientRect();
    const estilo = getComputedStyle(el);
    const alvo = getComputedStyle(el, "::after");
    const larguraAlvo = Number.parseFloat(alvo.width);
    const alturaAlvo = Number.parseFloat(alvo.height);
    return {
      x: caixa.x,
      y: caixa.y,
      width: caixa.width,
      height: caixa.height,
      alvoLargura: Math.max(caixa.width, Number.isFinite(larguraAlvo) ? larguraAlvo : 0),
      alvoAltura: Math.max(caixa.height, Number.isFinite(alturaAlvo) ? alturaAlvo : 0),
      raio: estilo.borderTopLeftRadius,
      bordas: [
        estilo.borderTopWidth,
        estilo.borderRightWidth,
        estilo.borderBottomWidth,
        estilo.borderLeftWidth,
      ],
      corBorda: estilo.borderTopColor,
      fundo: estilo.backgroundColor,
    };
  });
}

/**
 * Confere o desenho MUI atual: alvo de 48 dp quando o MUI o expande com ::after,
 * raio de 8 px e fio de 1 px. O gatilho do seletor de período é um campo e fica
 * com a altura visível do próprio controle.
 */
function conferirMedidaControle(medida: MedidaControle) {
  const alvoExpandido =
    medida.alvoLargura > medida.width + 0.01 || medida.alvoAltura > medida.height + 0.01;
  if (alvoExpandido) {
    expect(medida.alvoLargura).toBeGreaterThanOrEqual(TOKENS_LAYOUT.alvoToque - 0.01);
    expect(medida.alvoAltura).toBeGreaterThanOrEqual(TOKENS_LAYOUT.alvoToque - 0.01);
  }
  expect(medida.width).toBeGreaterThanOrEqual(TOKENS_LAYOUT.botao.pequeno - 0.01);
  expect(medida.height).toBeGreaterThanOrEqual(TOKENS_LAYOUT.botao.pequeno - 0.01);
  expect(medida.raio).toBe(`${TOKENS_LAYOUT.campo.raio}px`);
  for (const borda of medida.bordas) expect(borda).toBe("1px");
  expect(medida.corBorda).not.toBe("rgba(0, 0, 0, 0)");
}

async function conferirDesenhoControle(botao: Locator) {
  await botao.waitFor({ state: "visible" });
  conferirMedidaControle(await medirControle(botao));
}

/** Mantém o texto e os ícones do gatilho com contraste AA contra a superfície efetiva. */
async function conferirContrasteDoControle(controle: Locator) {
  const contrastes = await controle.evaluate((el) => {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) throw new Error("Canvas indisponível");
    const rgb = (cor: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = cor;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const lum = (cor: number[]) =>
      cor
        .map((v) => v / 255)
        .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
        .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
    const fundoDe = (no: Element) => {
      for (let atual: Element | null = no; atual; atual = atual.parentElement) {
        const fundo = getComputedStyle(atual).backgroundColor;
        if (fundo !== "rgba(0, 0, 0, 0)") return fundo;
      }
      return (
        getComputedStyle(document.documentElement)
          .getPropertyValue("--template-palette-background-default")
          .trim() ||
        (document.documentElement.getAttribute("data-mui-color-scheme") === "dark"
          ? "hsl(220, 35%, 3%)"
          : "hsl(0, 0%, 99%)")
      );
    };
    return Array.from(el.querySelectorAll("span"))
      .filter((no) => no.textContent?.trim())
      .filter((no) => getComputedStyle(no).display !== "none")
      .map((no) => {
        const l = lum(rgb(fundoDe(no)));
        const c = lum(rgb(getComputedStyle(no).color));
        return (Math.max(c, l) + 0.05) / (Math.min(c, l) + 0.05);
      });
  });
  expect(contrastes.length).toBeGreaterThan(0);
  expect(Math.min(...contrastes)).toBeGreaterThanOrEqual(4.5);
}

it("no painel claro a navegação usa o desenho MUI com fio sutil", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel&tema=light`);
    await aguardarTema(page, "light");
    const anterior = page.getByRole("button", { name: "Dia anterior", exact: true });
    const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
    const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
    for (const botao of [anterior, periodo, seguinte]) await conferirDesenhoControle(botao);
    await conferirContrasteDoControle(periodo);
  } finally {
    await page.close();
  }
});

// As demais visões usam o mesmo padrão, mas cada uma monta a sua própria navegação.
it.each(["chamada", "parcial", "entradas", "saidas"])(
  "aplica o desenho MUI com fio sutil à navegação da tela %s",
  async (tela) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.route("**/api/**", (route) =>
        route.fulfill({
          json: {
            frequencias: [],
            saidas: [],
            entradas: [],
            feriados: [],
            alertas: [],
            registros: [],
          },
        }),
      );
      await page.goto(`${url}?tela=${tela}&tema=light`);
      await aguardarTema(page, "light");
      const anterior = page.getByRole("button", { name: /^Dia anterior/ }).first();
      const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
      const seguinte = page.getByRole("button", { name: /^Dia seguinte/ }).first();
      for (const botao of [anterior, periodo, seguinte]) await conferirDesenhoControle(botao);
      await conferirContrasteDoControle(periodo);
    } finally {
      await page.close();
    }
  },
);

it("foco de teclado no seletor claro tem contorno com contraste contra a superfície", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel&tema=light`);
    await aguardarTema(page, "light");
    const botao = page.getByRole("button", { name: "Dia anterior", exact: true });
    await page.keyboard.press("Tab");
    await botao.focus();
    const foco = await botao.evaluate((el) => {
      const estilo = getComputedStyle(el);
      const tela = getComputedStyle(document.body).backgroundColor;
      const ctx = document.createElement("canvas").getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      const rgb = (cor: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = cor;
        ctx.fillRect(0, 0, 1, 1);
        return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
      };
      const lum = (cor: number[]) =>
        cor
          .map((v) => v / 255)
          .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
          .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
      const a = lum(rgb(estilo.outlineColor));
      const b = lum(rgb(tela));
      return {
        visible: el.matches(":focus-visible"),
        width: parseFloat(estilo.outlineWidth),
        style: estilo.outlineStyle,
        contrast: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      };
    });
    expect(foco.visible).toBe(true);
    expect(foco.style).toBe("solid");
    expect(foco.width).toBe(TOKENS_LAYOUT.campo.foco);
    expect(foco.contrast).toBeGreaterThanOrEqual(3);
  } finally {
    await page.close();
  }
});

for (const largura of [320, 390, 1280]) {
  for (const tema of ["light", "dark"] as const) {
    it(`navegação responsiva e acessível nas cinco visões: ${largura}px ${tema}`, async () => {
      for (const tela of ["painel", "chamada", "parcial", "entradas", "saidas"]) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await page.route("**/api/**", (route) =>
            route.fulfill({
              json: {
                frequencias: [],
                saidas: [],
                entradas: [],
                feriados: [],
                alertas: [],
                registros: [],
                porAluno: [],
                diasLetivos: 0,
                primeiroDia: null,
              },
            }),
          );
          await page.goto(`${url}?tela=${tela}&tema=${tema}`);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", { name: /^Dia anterior/ }).first();
          const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
          const seguinte = page.getByRole("button", { name: /^Dia seguinte/ }).first();
          await anterior.waitFor();
          await periodo.waitFor();
          expect(await seguinte.isDisabled()).toBe(tela !== "parcial");
          const medidas = await Promise.all(
            [anterior, periodo, seguinte].map((el) => medirControle(el)),
          );
          for (const medida of medidas) {
            conferirMedidaControle(medida);
            expect(medida.x).toBeGreaterThanOrEqual(0);
            expect(medida.x + medida.width).toBeLessThanOrEqual(largura + 0.01);
          }
          const [a, b, c] = medidas;
          if (!a || !b || !c) throw new Error("Navegação sem dimensões");
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          // Texto, legenda e ícones ativos contra sua superfície efetiva; desabilitados são isentos.
          await conferirContrasteDoControle(periodo);
          if (tela === "painel" || tela === "chamada") {
            await page
              .locator('section[aria-label="Resumo da semana"][aria-busy="false"]')
              .waitFor();
            expect(await page.getByText("Serviço indisponível").count()).toBe(0);
          }
          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          const semHover = await anterior.evaluate((el) => getComputedStyle(el).backgroundColor);
          await anterior.hover();
          await expect
            .poll(() => anterior.evaluate((el) => getComputedStyle(el).backgroundColor))
            .not.toBe(semHover);
          await page.keyboard.press("Tab");
          await anterior.focus();
          expect(await anterior.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
          const foco = await anterior.evaluate((el) => {
            const s = getComputedStyle(el);
            return { outline: s.outlineStyle, shadow: s.boxShadow };
          });
          expect(foco.outline !== "none" || foco.shadow !== "none").toBe(true);
          await anterior.press("Space");
          await expect.poll(() => seguinte.isEnabled()).toBe(true);
          const depois = await page
            .locator("[aria-haspopup=dialog]")
            .first()
            .getAttribute("aria-label");
          await seguinte.focus();
          await seguinte.press("Enter");
          expect(
            await page.locator("[aria-haspopup=dialog]").first().getAttribute("aria-label"),
          ).not.toBe(depois);
          const gatilho = page.locator("[aria-haspopup=dialog]").first();
          await gatilho.focus();
          await gatilho.press("Enter");
          expect(await gatilho.getAttribute("aria-expanded")).toBe("true");
          const grupo = page.getByRole("group", { name: /^Dias de / });
          await grupo.waitFor();
          await page.keyboard.press("ArrowLeft");
          expect(await page.evaluate(() => document.activeElement?.hasAttribute("data-dia"))).toBe(
            true,
          );
          await page.keyboard.press("Escape");
          expect(await gatilho.getAttribute("aria-expanded")).toBe("false");
        } finally {
          await page.close();
        }
      }
    }, 120000);
  }
}

it("outros controles mantêm suas superfícies e o seletor mensal usa fio sutil", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}?tela=outros&tema=light`);
    await aguardarTema(page, "light");
    const mensal = page.getByRole("button", { name: "Mês do relatório: Outubro" });
    await conferirDesenhoControle(mensal);
    for (const nome of ["Filtro selecionado", "Outro controle"]) {
      const botao = page.getByRole("button", { name: nome });
      expect(await botao.evaluate((el) => getComputedStyle(el).backgroundColor)).not.toBe(
        "rgba(0, 0, 0, 0)",
      );
    }
    expect(
      await page.getByRole("button", { name: "Filtro selecionado" }).getAttribute("aria-pressed"),
    ).toBe("true");
  } finally {
    await page.close();
  }
});

it("o controle desabilitado é ignorado pelo teclado e as cores forçadas mantêm o foco", async () => {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    forcedColors: "active",
  });
  try {
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: {
          frequencias: [],
          saidas: [],
          entradas: [],
          feriados: [],
          alertas: [],
          registros: [],
        },
      }),
    );
    await page.goto(`${url}?tela=painel&tema=light`);
    await aguardarTema(page, "light");
    const periodo = page.getByRole("button", { name: /^Resumo da semana:/ });
    const seguinte = page.getByRole("button", { name: "Dia seguinte", exact: true });
    expect(await seguinte.isDisabled()).toBe(true);
    await page.keyboard.press("Tab");
    await periodo.focus();
    expect(
      await periodo.evaluate((el) => ({
        focus: el.matches(":focus-visible"),
        outline: getComputedStyle(el).outlineStyle,
      })),
    ).toEqual({ focus: true, outline: "solid" });
    await page.keyboard.press("Tab");
    expect(await seguinte.evaluate((el) => document.activeElement === el)).toBe(false);
    expect(await seguinte.isDisabled()).toBe(true);
    await page.locator('section[aria-label="Resumo da semana"][aria-busy="false"]').waitFor();
    expect(await page.getByText("Serviço indisponível").count()).toBe(0);
    if (process.env.CAPTURA_DATA) {
      await periodo.focus();
      await page.screenshot({
        path: `${process.env.CAPTURA_DATA}/painel-light-390-cores-forcadas-foco.png`,
      });
    }
  } finally {
    await page.close();
  }
});

it.each(["relatorio", "grade"])(
  "navegação de período da tela %s preserva responsividade e interação",
  async (tela) => {
    for (const largura of [320, 390, 1280])
      for (const tema of ["light", "dark"] as const) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await page.goto(`${url}?tela=${tela}&tema=${tema}`);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", {
            name: tela === "grade" ? "Mês anterior" : "Dia anterior do relatório",
            exact: true,
          });
          const periodo = page.getByRole("button", {
            name: tela === "grade" ? /^Mês da consulta:/ : /^Data do relatório:/,
          });
          const seguinte = page.getByRole("button", {
            name: tela === "grade" ? "Mês seguinte" : "Próximo dia do relatório",
            exact: true,
          });
          const botoes = [anterior, periodo, seguinte];
          const medidas = await Promise.all(botoes.map((b) => medirControle(b)));
          const [a, b, c] = medidas;
          if (!a || !b || !c) throw new Error("Controles não montados");
          for (const medida of medidas) {
            conferirMedidaControle(medida);
            expect(medida.x).toBeGreaterThanOrEqual(0);
            expect(medida.x + medida.width).toBeLessThanOrEqual(largura + 0.01);
          }
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          expect(await seguinte.isDisabled()).toBe(true);
          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          const fundo = await anterior.evaluate((el) => getComputedStyle(el).backgroundColor);
          await anterior.hover();
          await expect
            .poll(() => anterior.evaluate((el) => getComputedStyle(el).backgroundColor))
            .not.toBe(fundo);
          await page.keyboard.press("Tab");
          await anterior.focus();
          expect(await anterior.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
          expect(
            await anterior.evaluate((el) => {
              const s = getComputedStyle(el);
              return s.outlineStyle !== "none" || s.boxShadow !== "none";
            }),
          ).toBe(true);
          const antes = await periodo.getAttribute("aria-label");
          await anterior.press("Space");
          expect(await periodo.getAttribute("aria-label")).not.toBe(antes);
          expect(await seguinte.isEnabled()).toBe(true);
          await seguinte.focus();
          await seguinte.press("Enter");
          expect(await periodo.getAttribute("aria-label")).toBe(antes);
          await periodo.focus();
          await periodo.press("Enter");
          expect(await periodo.getAttribute("aria-expanded")).toBe("true");
          await page.keyboard.press("Escape");
          expect(await periodo.getAttribute("aria-expanded")).toBe("false");
          if (tela === "relatorio") {
            await page.getByRole("button", { name: "Semana", exact: true }).click();
            const semana = page.getByRole("button", { name: "Semana anterior do relatório" });
            await page.mouse.move(0, 0);
            await expect
              .poll(() =>
                semana.evaluate(
                  (el) => getComputedStyle(el).backgroundColor !== "rgba(0, 0, 0, 0)",
                ),
              )
              .toBe(true);
          }
        } finally {
          await page.close();
        }
      }
  },
  120000,
);

// A resposta respeita o contrato real e o recorte até o dia corrente.
async function simularEstatisticasDiretor(page: Page) {
  await page.route("**/api/diretor/estatisticas?**", (route) => {
    const consulta = new URL(route.request().url()).searchParams;
    const de = consulta.get("de") ?? "";
    const ate = [consulta.get("ate") ?? "", "2026-11-01"].sort()[0];
    return route.fulfill({
      json: {
        turmaId: "turma",
        turma: "1º ano A",
        vinculo: { inicio: "2026-01-01", fim: null },
        periodo:
          de <= (ate ?? "") && (ate ?? "") >= "2026-01-01"
            ? { de: de < "2026-01-01" ? "2026-01-01" : de, ate }
            : null,
        estatisticas:
          de <= (ate ?? "") && (ate ?? "") >= "2026-01-01"
            ? {
                alunos: [],
                semanas: [],
                resumo: { alunos: 0, emRisco: 0, ausencias: 0, alunoDias: 0, taxa: 0 },
                limiteRisco: 25,
                categorias: [],
              }
            : null,
      },
    });
  });
}

// Componentes de produção com navegação mensal.
it.each(["por-aluno", "resumo", "historico", "diretor"])(
  "trio mensal de %s usa superfície com fio sutil no tema claro",
  async (tela) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await simularEstatisticasDiretor(page);
      await page.goto(`${url}?tela=${tela}&tema=light`);
      await aguardarTema(page, "light");
      const nomes =
        tela === "resumo"
          ? [/^Mês anterior do resumo$/, /^Mês do resumo:/, /^Mês seguinte do resumo$/]
          : [
              /^Mês anterior$/,
              tela === "historico"
                ? /^Mês do histórico:/
                : tela === "diretor"
                  ? /^Mês das estatísticas:/
                  : /^Mês do relatório:/,
              /^Mês seguinte$/,
            ];
      for (const nome of nomes) {
        await conferirDesenhoControle(page.getByRole("button", { name: nome }));
      }
    } finally {
      await page.close();
    }
  },
);

for (const tela of ["por-aluno", "resumo", "historico", "diretor"]) {
  it(`trio mensal de ${tela}: tamanhos, temas, teclado e retorno`, async () => {
    for (const largura of [320, 390, 1280]) {
      for (const tema of ["light", "dark"] as const) {
        const page = await browser.newPage({
          viewport: { width: largura, height: 844 },
          reducedMotion: "reduce",
        });
        try {
          await simularEstatisticasDiretor(page);
          await page.goto(`${url}?tela=${tela}&tema=${tema}`);
          await aguardarTema(page, tema);
          const anterior = page.getByRole("button", {
            name: tela === "resumo" ? "Mês anterior do resumo" : "Mês anterior",
            exact: true,
          });
          const periodo = page.getByRole("button", {
            name:
              tela === "resumo"
                ? /^Mês do resumo:/
                : tela === "historico"
                  ? /^Mês do histórico:/
                  : tela === "diretor"
                    ? /^Mês das estatísticas:/
                    : /^Mês do relatório:/,
          });
          const seguinte = page.getByRole("button", {
            name: tela === "resumo" ? "Mês seguinte do resumo" : "Mês seguinte",
            exact: true,
          });
          await anterior.waitFor();
          const botoes = [anterior, periodo, seguinte];
          const medidasControle = await Promise.all(botoes.map((b) => medirControle(b)));
          const [a, b, c] = medidasControle;
          if (!a || !b || !c) throw new Error("Trio não renderizado");
          for (const medida of medidasControle) {
            conferirMedidaControle(medida);
            expect(medida.x).toBeGreaterThanOrEqual(0);
            expect(medida.x + medida.width).toBeLessThanOrEqual(largura + 0.01);
          }
          expect(Math.abs(a.y + a.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(Math.abs(c.y + c.height / 2 - (b.y + b.height / 2))).toBeLessThan(1);
          expect(a.x + a.width).toBeLessThanOrEqual(b.x);
          expect(b.x + b.width).toBeLessThanOrEqual(c.x);
          expect(await seguinte.isDisabled()).toBe(true);
          const medida = await periodo.evaluate((el) => {
            if (
              el.matches(":disabled") ||
              el.getAttribute("aria-disabled") === "true" ||
              el.closest(".Mui-disabled, [aria-disabled=true]")
            )
              return null;
            const contexto = document.createElement("canvas").getContext("2d");
            if (!contexto) throw new Error("Canvas indisponível");
            const luminancia = (cor: string) => {
              contexto.clearRect(0, 0, 1, 1);
              contexto.fillStyle = cor;
              contexto.fillRect(0, 0, 1, 1);
              return Array.from(contexto.getImageData(0, 0, 1, 1).data)
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
                .reduce((s, v, i) => s + v * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
            };
            const estilo = getComputedStyle(el);
            let fundo = estilo.backgroundColor;
            for (let no: Element | null = el; no; no = no.parentElement) {
              if (fundo !== "rgba(0, 0, 0, 0)") break;
              fundo = getComputedStyle(no).backgroundColor;
            }
            if (fundo === "rgba(0, 0, 0, 0)")
              fundo =
                getComputedStyle(document.documentElement)
                  .getPropertyValue("--template-palette-background-default")
                  .trim() ||
                (document.documentElement.getAttribute("data-mui-color-scheme") === "dark"
                  ? "hsl(220, 35%, 3%)"
                  : "hsl(0, 0%, 99%)");
            const a = luminancia(estilo.color);
            const b = luminancia(fundo);
            return {
              contraste: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
              cor: estilo.color,
              fundo,
              esquema: document.documentElement.getAttribute("data-mui-color-scheme"),
              htmlVar: getComputedStyle(document.documentElement)
                .getPropertyValue("--template-palette-background-default")
                .trim(),
              bodyVar: getComputedStyle(document.body)
                .getPropertyValue("--template-palette-background-default")
                .trim(),
              body: getComputedStyle(document.body).backgroundColor,
              bodyClasse: document.body.className,
              bodyEstilo: document.body.getAttribute("style"),
            };
          });
          if (medida)
            expect(
              medida.contraste,
              JSON.stringify({ tela, tema, largura, medida }),
            ).toBeGreaterThanOrEqual(4.5);

          if (process.env.CAPTURA_DATA)
            await page.screenshot({
              path: `${process.env.CAPTURA_DATA}/${tela}-${tema}-${largura}.png`,
            });
          await page.keyboard.press("Tab");
          await periodo.focus();
          await page.keyboard.press("Tab");
          expect(await seguinte.evaluate((el) => document.activeElement === el)).toBe(false);
          await anterior.focus();
          const foco = await anterior.evaluate((el) => ({
            visivel: el.matches(":focus-visible"),
            contorno: getComputedStyle(el).outlineStyle,
            sombra: getComputedStyle(el).boxShadow,
          }));
          expect(foco.visivel).toBe(true);
          expect(foco.contorno !== "none" || foco.sombra !== "none").toBe(true);
          const antes = await periodo.getAttribute("aria-label");
          await anterior.press("Space");
          expect(await periodo.getAttribute("aria-label")).not.toBe(antes);
          expect(await seguinte.isEnabled()).toBe(true);
          if (tela === "historico") {
            const reset = page.getByRole("button", { name: "Voltar para este mês" });
            expect(
              await reset.evaluate((el) => Boolean(el.closest('[aria-haspopup="dialog"]'))),
            ).toBe(false);
            await reset.click();
            expect(await periodo.getAttribute("aria-label")).toBe(antes);
            await anterior.press("Space");
          }
          await seguinte.press("Enter");
          expect(await periodo.getAttribute("aria-label")).toBe(antes);
          expect(await seguinte.isDisabled()).toBe(true);
          await periodo.press("Enter");
          expect(await periodo.getAttribute("aria-expanded")).toBe("true");
          const anoAnterior = page.getByRole("button", { name: "Ano anterior", exact: true });
          await anoAnterior.press("Enter");
          expect(await page.getByText("2025", { exact: true }).isVisible()).toBe(true);
          await page.keyboard.press("Escape");
          expect(await periodo.getAttribute("aria-expanded")).toBe("false");
        } finally {
          await page.close();
        }
      }
    }
  }, 120000);
}

it("resumo bloqueado mantém os três controles desabilitados", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${url}?tela=resumo&bloqueado&tema=light`);
    await aguardarTema(page, "light");
    for (const nome of [
      /^Mês anterior do resumo$/,
      /^Mês do resumo:/,
      /^Mês seguinte do resumo$/,
    ]) {
      const botao = page.getByRole("button", { name: nome });
      expect(await botao.isDisabled()).toBe(true);
      await conferirDesenhoControle(botao);
    }
  } finally {
    await page.close();
  }
});
