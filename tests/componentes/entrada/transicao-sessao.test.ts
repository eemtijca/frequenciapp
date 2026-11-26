// Exercita as transições da UI com HTTP e entrega da rota retidos separadamente.
import path from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { chromium, expect, type Browser, type Page, type Route } from "@playwright/test";
import { afterAll, beforeAll, it } from "vitest";

const requerer = createRequire(import.meta.url);
const caminho = requerer.resolve("vite", {
  paths: [path.dirname(requerer.resolve("vitest/package.json"))],
});
const { createServer } = await import(pathToFileURL(caminho).href);
const cache = mkdtempSync(path.join(tmpdir(), "vite-transicao-sessao-"));
let servidor: Awaited<ReturnType<typeof createServer>>;
let navegador: Browser;
let url: string;
const esperar = expect.configure({ timeout: 2500 });

beforeAll(async () => {
  servidor = await createServer({
    configFile: false,
    cacheDir: cache,
    esbuild: { jsx: "automatic" },
    define: { "process.env": "{}" },
    resolve: { alias: { "@": path.resolve("src") } },
    server: { host: "127.0.0.1", port: 0, hmr: false, watch: { ignored: ["**/*"] } },
  });
  await servidor.listen();
  const endereco = servidor.httpServer?.address();
  if (!endereco || typeof endereco === "string" || endereco.address !== "127.0.0.1") {
    throw new Error("Fixture indisponível em loopback");
  }
  url = `http://127.0.0.1:${endereco.port}/tests/componentes/entrada/transicao-sessao.html`;
  navegador = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await navegador?.close();
  await servidor?.close();
  rmSync(cache, { recursive: true, force: true });
});

async function comPagina(
  executar: (pagina: Page, atualizacoes: () => number) => Promise<void>,
  opcoes: Parameters<Browser["newPage"]>[0] = {},
) {
  const pagina = await navegador.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    ...opcoes,
  });
  const erros: string[] = [];
  pagina.on("pageerror", (erro) => erros.push(erro.message));
  pagina.setDefaultTimeout(10_000);
  const origem = new URL(url).origin;
  let atualizacoes = 0;
  await pagina.exposeBinding("contarRefresh", () => ++atualizacoes);
  await pagina.addInitScript(() => {
    const fixture = window as Window & { contarRefresh?: () => Promise<number> };
    window.addEventListener("fixture-refresh", () => void fixture.contarRefresh?.());
  });
  await pagina.route("**/*", (rota) => {
    const endereco = new URL(rota.request().url());
    if (endereco.origin !== origem) return rota.abort();
    if (endereco.pathname.startsWith("/api/")) return rota.fulfill({ status: 503, json: {} });
    return rota.continue();
  });
  try {
    await executar(pagina, () => atualizacoes);
    expect(erros).toEqual([]);
  } finally {
    await pagina.close();
  }
}

async function autenticar(pagina: Page) {
  await pagina.getByLabel("E-mail ou identificador").fill("diretor-teste");
  await pagina.getByLabel("Senha", { exact: true }).fill("valor-exclusivo-da-fixture");
  await pagina.getByRole("button", { name: "Entrar", exact: true }).click({ clickCount: 2 });
}

async function reterPost(
  pagina: Page,
  operacao: "entrar" | "sair",
  resposta: Parameters<Route["fulfill"]>[0],
) {
  let pedidos = 0;
  const liberacao = Promise.withResolvers<void>();
  await pagina.route(`**/api/auth/${operacao}`, async (rota) => {
    expect(rota.request().method()).toBe("POST");
    pedidos += 1;
    await liberacao.promise;
    await rota.fulfill(resposta);
  });
  return { pedidos: () => pedidos, liberar: () => liberacao.resolve() };
}

it.each([
  { largura: 320, tema: "light", strict: false },
  { largura: 390, tema: "dark", strict: false },
  { largura: 1280, tema: "dark", strict: true },
] as const)(
  "confirma a entrada uma vez no destino ($largura px, $tema)",
  async ({ largura, tema, strict }) => {
    await comPagina(
      async (pagina, atualizacoes) => {
        const post = await reterPost(pagina, "entrar", {
          json: { usuario: { id: "diretor-teste" } },
        });
        try {
          await pagina.goto(strict ? `${url}?strict` : url);
          await pagina.evaluate(() => {
            document.addEventListener(
              "submit",
              () => {
                requestAnimationFrame(() => {
                  const regioes = ["Navegação em carregamento", "Conteúdo em carregamento"];
                  const elementos = regioes.map((rotulo) =>
                    document.querySelector(`[aria-label="${rotulo}"]`),
                  );
                  const navegacao = elementos[0]?.getBoundingClientRect();
                  const conteudo = elementos[1]?.getBoundingClientRect();
                  const alinhadas =
                    navegacao &&
                    conteudo &&
                    (innerWidth < 905
                      ? navegacao.width === innerWidth && navegacao.bottom === conteudo.top
                      : navegacao.width === 256 && navegacao.right === conteudo.left);
                  const preenchidas = elementos.every(
                    (regiao) =>
                      regiao?.getBoundingClientRect().width &&
                      Array.from(regiao.querySelectorAll("span")).some((forma) => {
                        const { width, height } = forma.getBoundingClientRect();
                        return (
                          width > 0 &&
                          height > 0 &&
                          getComputedStyle(forma).animationName === "none"
                        );
                      }),
                  );
                  document.documentElement.dataset.primeiroQuadro =
                    preenchidas && alinhadas ? "completo" : "incompleto";
                  elementos[0]
                    ?.closest('[aria-busy="true"]')
                    ?.setAttribute("data-primeiro-esqueleto", "");
                });
              },
              { capture: true, once: true },
            );
          });
          await autenticar(pagina);
          const toast = pagina.getByText("Entrada confirmada.", { exact: true });
          await esperar.poll(post.pedidos).toBe(1);
          await esperar(pagina.locator("html")).toHaveAttribute("data-primeiro-quadro", "completo");
          const esqueleto = pagina.locator("[data-primeiro-esqueleto]");
          await esperar(esqueleto).toBeVisible();
          await esperar(pagina.getByLabel("Senha", { exact: true })).toBeHidden();
          await esperar(pagina.getByRole("button", { name: "Sair da conta" })).toHaveCount(0);
          await esperar(toast).toHaveCount(0);
          expect(atualizacoes()).toBe(0);
          post.liberar();
          await esperar.poll(atualizacoes).toBe(1);
          await esperar(toast).toHaveCount(0);
          await esperar(pagina.getByLabel("Senha", { exact: true })).toHaveCount(0);
          await esperar(
            pagina.getByRole("status").filter({ hasText: "Abrindo o aplicativo..." }),
          ).toBeVisible();
          await esperar(esqueleto).toBeVisible();
          await esperar(pagina.getByRole("dialog")).toHaveCount(0);
          await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-painel")));
          await esperar(pagina.getByRole("button", { name: "Sair da conta" })).toBeVisible();
          await esperar(toast).toHaveCount(1);
          await esperar(esqueleto).toHaveCount(0);
          expect(post.pedidos()).toBe(1);
        } finally {
          post.liberar();
        }
      },
      { viewport: { width: largura, height: 844 }, colorScheme: tema },
    );
  },
);

it("saída retira o painel após o POST, mesmo com o BI e a entrada retidos", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", { json: { ok: true } });
    await pagina.addInitScript(() => {
      localStorage.setItem("frequencibi:chave", "chave-sintetica-sem-acesso");
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (...args) => {
        document.documentElement.dataset.expurgo = "iniciado";
        await new Promise<void>((resolver) => {
          window.addEventListener("fixture-liberar-bi", () => resolver(), { once: true });
        });
        return digest(...args);
      };
    });
    try {
      await pagina.goto(`${url}?autenticada`);
      const sair = pagina.getByRole("button", { name: "Sair da conta", exact: true });
      const painel = pagina.getByRole("heading", { name: "Minhas turmas", exact: true });
      const toast = pagina.getByText("Sessão encerrada.", { exact: true });
      await sair.click({ clickCount: 2 });
      await esperar.poll(post.pedidos).toBe(1);
      await esperar(painel).toBeVisible();
      await esperar(pagina.getByRole("status").filter({ hasText: "Saindo..." })).toBeVisible();
      await esperar(toast).toHaveCount(0);
      post.liberar();
      await esperar(pagina.locator("html")).toHaveAttribute("data-expurgo", "iniciado");
      await esperar(painel).toHaveCount(0);
      await esperar(sair).toHaveCount(0);
      await esperar(
        pagina.getByRole("status").filter({ hasText: "Abrindo a entrada..." }),
      ).toBeVisible();
      await esperar(toast).toHaveCount(0);
      expect(atualizacoes()).toBe(0);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-liberar-bi")));
      await esperar.poll(atualizacoes).toBe(1);
      await esperar(sair).toHaveCount(0);
      await esperar(toast).toHaveCount(0);
      expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
      await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
      await esperar(toast).toHaveCount(1);
      expect(post.pedidos()).toBe(1);
    } finally {
      post.liberar();
    }
  });
});

it("expiração da sessão do diretor volta à entrada sem simular saída voluntária", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    let leituras = 0;
    let saidas = 0;
    const liberar = Promise.withResolvers<void>();
    await pagina.route("**/api/diretor/estatisticas?*", async (rota) => {
      await liberar.promise;
      await rota.fulfill({ status: 401, json: { error: "Sua sessão expirou. Entre novamente." } });
    });
    await pagina.route("**/api/auth/sessao", async (rota) => {
      leituras += 1;
      await rota.fulfill({ json: { usuario: null } });
    });
    await pagina.route("**/api/auth/sair", async (rota) => {
      saidas += 1;
      await rota.fulfill({ json: { ok: true } });
    });
    try {
      await pagina.goto(`${url}?autenticada&com-turma`);
      const sair = pagina.getByRole("button", { name: "Sair da conta" });
      await esperar(sair).toBeVisible();
      const rede = pagina.waitForResponse((resposta) =>
        resposta.url().includes("/api/diretor/estatisticas"),
      );
      liberar.resolve();
      expect((await rede).status()).toBe(401);
      await esperar.poll(atualizacoes).toBe(1);
      await esperar(sair).toHaveCount(0);
      await esperar(pagina.getByText("Sessão expirada", { exact: true })).toHaveCount(0);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
      await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toBeVisible();
      await esperar(pagina.getByText("Sessão expirada", { exact: true })).toHaveCount(1);
      await esperar(pagina.getByText("Sessão encerrada.", { exact: true })).toHaveCount(0);
      expect(leituras).toBe(1);
      expect(saidas).toBe(0);
    } finally {
      liberar.resolve();
    }
  });
});

it.each([
  [401, "E-mail, identificador ou senha incorretos.", null],
  [403, "Esta conta está desativada.", "Conta desativada"],
  [429, "Aguarde antes de tentar novamente.", "Muitas tentativas"],
  [0, "Não foi possível entrar. Tente novamente.", null],
] as const)(
  "recusa entrada (%i) sem confirmar nem atualizar a rota",
  async (status, error, titulo) => {
    await comPagina(async (pagina, atualizacoes) => {
      await pagina.route("**/api/auth/entrar", (rota) =>
        status ? rota.fulfill({ status, json: { error } }) : rota.abort(),
      );
      await pagina.goto(url);
      await autenticar(pagina);
      await esperar(pagina.getByText(error, { exact: true })).toBeVisible();
      if (titulo) await esperar(pagina.getByText(titulo, { exact: true })).toBeVisible();
      await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
      await esperar(pagina.getByLabel("Senha", { exact: true })).toBeFocused();
      await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(0);
      await esperar(pagina.getByText("Sessão expirada", { exact: true })).toHaveCount(0);
      expect(atualizacoes()).toBe(0);
    });
  },
);

it("recupera entrada não reconhecida pelo refresh sem repetir autenticação", async () => {
  await comPagina(
    async (pagina, atualizacoes) => {
      const post = await reterPost(pagina, "entrar", {
        json: { usuario: { id: "diretor-teste" } },
      });
      post.liberar();
      await pagina.goto(url);
      await pagina.clock.install();
      await autenticar(pagina);
      await esperar.poll(atualizacoes).toBe(1);
      // A rota continua devolvendo o formulário: não é prova da identidade do POST.
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
      await pagina.clock.fastForward(11_000);
      const tentar = pagina.getByRole("button", { name: "Tentar novamente" });
      await esperar(tentar).toBeVisible();
      await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toHaveCount(0);
      await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(0);
      await tentar.click({ clickCount: 2 });
      await esperar.poll(atualizacoes).toBe(2);
      expect(post.pedidos()).toBe(1);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-painel")));
      await esperar(pagina.getByRole("heading", { name: "Minhas turmas" })).toBeVisible();
      await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(1);
    },
    { colorScheme: "dark", viewport: { width: 1280, height: 800 } },
  );
});

it("só recupera e protege o rascunho da Chamada na sessão que o criou", async () => {
  await comPagina(async (pagina) => {
    const painel = `${url}?autenticada&com-chamada`;
    const marca = pagina.getByRole("button", { name: /^Aluno sintético:/ });
    const bloqueiaSaida = () =>
      pagina.evaluate(() => !window.dispatchEvent(new Event("beforeunload", { cancelable: true })));
    const abrirPainel = async (sufixo: string) => {
      await pagina.goto(`${painel}${sufixo}`);
      await esperar(pagina.getByRole("group", { name: "Painel", exact: true })).toBeVisible();
      await esperar(marca).toHaveCount(0);
    };
    await pagina.route("**/api/frequencias?*", (rota) =>
      rota.fulfill({ json: { frequencias: [] } }),
    );
    await pagina.goto(`${painel}&visao=chamada`);
    await marca.click();
    await esperar(marca).toHaveAttribute("aria-pressed", "true");
    await esperar.poll(bloqueiaSaida).toBe(true);
    await pagina.reload();
    await esperar(marca).toHaveAttribute("aria-pressed", "true");

    await abrirPainel("");
    await esperar.poll(bloqueiaSaida).toBe(true);
    for (const sufixo of ["&outra-conta", "&nova-sessao", "&sem-referencia"]) {
      await abrirPainel(sufixo);
      expect(await bloqueiaSaida()).toBe(false);
      await pagina.goto(`${painel}${sufixo}&visao=chamada`);
      await esperar(marca).toBeEnabled();
      await esperar(marca).toHaveAttribute("aria-pressed", "false");
    }

    await pagina.evaluate(() => {
      sessionStorage.setItem(
        "frequencia:rascunho:conta-chamada:2026-11-23:turma",
        JSON.stringify({ versao: 3, revisao: 0, faltas: [{ alunoId: "aluno", horarios: [] }] }),
      );
    });
    await abrirPainel("&nova-sessao");
    expect(await bloqueiaSaida()).toBe(false);
    await pagina.goto(`${painel}&nova-sessao&visao=chamada`);
    await esperar(marca).toBeEnabled();
    await esperar(marca).toHaveAttribute("aria-pressed", "false");
    await marca.click();
    await esperar.poll(bloqueiaSaida).toBe(true);
    await pagina.reload();
    await esperar(marca).toHaveAttribute("aria-pressed", "true");
  });
});

it("espera o destino de outra sessão da mesma conta depois de expurgar o BI", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", {
      status: 503,
      json: { error: "Falha ao sair." },
    });
    await pagina.route("**/api/auth/sessao", (rota) =>
      rota.fulfill({
        json: { usuario: { id: "diretor-teste" }, referenciaSessao: "N".repeat(43) },
      }),
    );
    try {
      await pagina.goto(`${url}?autenticada`);
      await pagina.evaluate(() => localStorage.setItem("frequencibi:chave", "chave-sintetica"));
      const sair = pagina.getByRole("button", { name: "Sair da conta" });
      await sair.click();
      post.liberar();
      await esperar(
        pagina.getByRole("status").filter({ hasText: /^Abrindo o aplicativo\.\.\.$/ }),
      ).toBeVisible();
      await esperar.poll(atualizacoes).toBe(1);
      expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
      await esperar(sair).toHaveCount(0);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-painel")));
      await esperar(sair).toHaveCount(0);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-outro-painel")));
      await esperar(pagina.getByText("Painel da nova sessão sintética")).toBeVisible();
      await esperar(sair).toBeEnabled();
      await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(0);
      await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(0);
      expect(post.pedidos()).toBe(1);
    } finally {
      post.liberar();
    }
  });
});

it("falha na revogação mantém o diretor operável e não inicia o expurgo", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const mensagem = "Não foi possível encerrar a sessão agora.";
    const post = await reterPost(pagina, "sair", { status: 500, json: { error: mensagem } });
    let leituras = 0;
    await pagina.route("**/api/auth/sessao", (rota) => {
      leituras += 1;
      return rota.fulfill({
        json: { usuario: { id: "diretor-teste" }, referenciaSessao: "O".repeat(43) },
      });
    });
    try {
      await pagina.goto(`${url}?autenticada`);
      await pagina.evaluate(() => localStorage.setItem("frequencibi:chave", "chave-sintetica"));
      const sair = pagina.getByRole("button", { name: "Sair da conta" });
      await sair.click();
      await esperar(pagina.getByText("Saindo...", { exact: true })).toBeVisible();
      post.liberar();
      await esperar(pagina.getByText(mensagem, { exact: true })).toBeVisible();
      await esperar(sair).toBeEnabled();
      expect(leituras).toBe(1);
      await esperar(pagina.getByRole("heading", { name: "Minhas turmas" })).toBeVisible();
      await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(0);
      expect(atualizacoes()).toBe(0);
      expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBe(
        "chave-sintetica",
      );
    } finally {
      post.liberar();
    }
  });
});

it.each([null, "diretor-teste"])("reconcilia saída incerta em modal (sessão: %s)", async (id) => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", {
      status: 503,
      json: { error: "Falha ao sair." },
    });
    let leituras = 0;
    const repetir = Promise.withResolvers<void>();
    await pagina.route("**/api/auth/sessao", async (rota) => {
      expect(rota.request().method()).toBe("GET");
      if (++leituras === 1) return rota.abort();
      if (leituras === 2) {
        await repetir.promise;
        // A conta pode estar presente sem que a sessão seja comprovada.
        return rota.fulfill({
          json: {
            usuario: { id: "diretor-teste" },
            ...(id ? { referenciaSessao: "malformada" } : {}),
          },
        });
      }
      return rota.fulfill({
        json: id ? { usuario: { id }, referenciaSessao: "O".repeat(43) } : { usuario: null },
      });
    });
    try {
      await pagina.goto(`${url}?autenticada`);
      await pagina.evaluate(() => localStorage.setItem("frequencibi:chave", "chave-sintetica"));
      const painel = pagina.getByText("Minhas turmas", { exact: true });
      const sair = pagina.getByRole("button", { name: "Sair da conta" });
      const toast = pagina.getByText("Sessão encerrada.", { exact: true });
      const modal = pagina.getByRole("dialog", {
        name: "Não foi possível confirmar o encerramento",
      });
      const tentar = modal.getByRole("button", { name: "Tentar novamente" });
      await sair.click();
      post.liberar();
      await esperar(modal).toBeVisible();
      await esperar(tentar).toBeFocused();
      await esperar(modal.getByRole("button", { name: "Fechar" })).toBeDisabled();
      await pagina.keyboard.press("Tab");
      await esperar(tentar).toBeFocused();
      await pagina.keyboard.press("Escape");
      await pagina.touchscreen.tap(5, 5);
      await esperar(modal).toBeVisible();
      await esperar(pagina.getByRole("button", { name: "Reabrir página" })).toHaveCount(0);
      await esperar(painel).toBeHidden();
      await esperar(toast).toHaveCount(0);
      expect(leituras).toBe(1);
      expect(atualizacoes()).toBe(0);

      await tentar.press("Enter");
      await esperar.poll(() => leituras).toBe(2);
      await esperar(tentar).toBeDisabled();
      await tentar.press("Enter");
      await esperar(modal.getByRole("status")).toHaveText(
        "Verificando se a sessão foi encerrada...",
      );
      await esperar(painel).toBeHidden();
      repetir.resolve();
      await esperar(tentar).toBeEnabled();
      await esperar(tentar).toBeFocused();
      await esperar(painel).toBeHidden();
      expect(leituras).toBe(2);
      await tentar.tap();

      if (id) {
        await esperar(pagina.getByText("Falha ao sair.", { exact: true })).toBeVisible();
        await esperar(painel).toBeVisible();
        await esperar(sair).toBeEnabled();
        expect(atualizacoes()).toBe(0);
        expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBe(
          "chave-sintetica",
        );
      } else {
        await esperar.poll(atualizacoes).toBe(1);
        await esperar(painel).toBeHidden();
        expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
        await esperar(toast).toHaveCount(0);
        await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
        await esperar(toast).toHaveCount(1);
      }
      await esperar(modal).toHaveCount(0);
      expect(leituras).toBe(3);
      expect(post.pedidos()).toBe(1);
    } finally {
      post.liberar();
      repetir.resolve();
    }
  });
});

it("reabrir após entrada não reconhecida carrega novo documento anônimo sem outro POST", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "entrar", { json: { usuario: { id: "diretor-teste" } } });
    post.liberar();
    await pagina.goto(url);
    await pagina.clock.install();
    await autenticar(pagina);
    await esperar.poll(atualizacoes).toBe(1);
    await pagina.clock.fastForward(11_000);
    const reabrir = pagina.getByText("Reabrir página", { exact: true });
    await esperar(reabrir).toBeVisible();
    await pagina.evaluate(() => (document.documentElement.dataset.documentoAnterior = "sim"));
    const documento = pagina.waitForResponse(
      (resposta) => resposta.request().isNavigationRequest(),
      {
        timeout: 3500,
      },
    );
    await Promise.all([documento, reabrir.click()]);
    await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
    await esperar(pagina.locator("html[data-documento-anterior]")).toHaveCount(0);
    await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(0);
    expect(post.pedidos()).toBe(1);
  });
});

it("retira avisos privados e suas ações na saída sem retirar o aviso público da PWA", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", { json: { ok: true } });
    post.liberar();
    await pagina.goto(`${url}?autenticada&com-fila`);
    await pagina.getByRole("button", { name: "Sair da conta" }).waitFor();
    await pagina.evaluate(() => {
      window.dispatchEvent(new Event("online"));
      window.dispatchEvent(new Event("fixture-aviso-privado"));
    });
    const publico = pagina.getByText("Conexão de volta.", { exact: true });
    const privado = pagina.getByText("Aviso privado sintético.", { exact: true });
    await esperar(publico).toBeVisible();
    await esperar(privado).toBeVisible();
    await esperar(pagina.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await pagina.getByRole("button", { name: "Sair da conta" }).click();
    await esperar.poll(atualizacoes).toBe(1);
    await esperar(privado).toHaveCount(0);
    await esperar(pagina.getByRole("button", { name: "Tentar novamente" })).toHaveCount(0);
    await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(1);
    await esperar(publico).toBeVisible();
  });
});

it("descarta aviso de fila atrasado mesmo depois de entrar novamente na mesma conta", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const liberar = Promise.withResolvers<void>();
    let pedidos = 0;
    await pagina.route("**/api/planilha/fila", (rota) =>
      rota.fulfill({ json: { contagens: {}, conferenciasPendentes: 0, itens: [] } }),
    );
    await pagina.route("**/api/planilha/fila/processar", async (rota) => {
      if (++pedidos === 1) {
        await liberar.promise;
        await rota.fulfill({ status: 503, json: { error: "Resultado da sessão anterior." } });
      } else await rota.fulfill({ json: { processados: 1 } });
    });
    await pagina.route("**/api/auth/sair", (rota) => rota.fulfill({ json: { ok: true } }));
    await pagina.route("**/api/auth/entrar", (rota) =>
      rota.fulfill({ json: { usuario: { id: "diretor-teste" } } }),
    );
    await pagina.goto(`${url}?autenticada&com-fila`);
    const abrirFila = () =>
      pagina.getByRole("button", { name: /Fila de envios automáticos/ }).click();
    const processar = pagina.getByRole("button", { name: "Processar agora" });
    try {
      await abrirFila();
      await processar.click();
      await esperar.poll(() => pedidos).toBe(1);
      await pagina.getByRole("button", { name: "Sair da conta" }).click();
      await esperar.poll(atualizacoes).toBe(1);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
      await autenticar(pagina);
      await esperar.poll(atualizacoes).toBe(2);
      await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-painel")));
      await esperar(pagina.getByText("Entrada confirmada.")).toHaveCount(1);
      const resposta = pagina.waitForResponse((r) => r.url().endsWith("/fila/processar"));
      liberar.resolve();
      await (await resposta).finished();
      await abrirFila();
      await processar.click();
      await esperar(pagina.getByText("Fila processada.")).toBeVisible();
      await esperar(pagina.getByText("Resultado da sessão anterior.")).toHaveCount(0);
      expect(pedidos).toBe(2);
    } finally {
      liberar.resolve();
    }
  });
});

it("expurgo pendente oferece recuperação e não abre IndexedDB ao terminar tarde", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", { json: { ok: true } });
    post.liberar();
    await pagina.goto(`${url}?autenticada`);
    await pagina.clock.install();
    await pagina.evaluate(() => {
      localStorage.setItem("frequencibi:chave", "chave-sintetica-sem-acesso");
      const abrir = indexedDB.open.bind(indexedDB);
      indexedDB.open = (...args) => {
        document.documentElement.dataset.abriuBi = "sim";
        return abrir(...args);
      };
      const digest = crypto.subtle.digest.bind(crypto.subtle);
      crypto.subtle.digest = async (...args) => {
        document.documentElement.dataset.expurgo = "iniciado";
        await new Promise<void>((resolver) =>
          window.addEventListener("fixture-liberar-bi", () => resolver(), { once: true }),
        );
        const hash = await digest(...args);
        document.documentElement.dataset.expurgo = "liberado";
        return hash;
      };
    });
    const sair = pagina.getByRole("button", { name: "Sair da conta" });
    await sair.click();
    await esperar(pagina.locator("html")).toHaveAttribute("data-expurgo", "iniciado");
    await pagina.clock.fastForward(11_000);
    await esperar(pagina.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await esperar(sair).toHaveCount(0);
    await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-liberar-bi")));
    await esperar(pagina.locator("html")).toHaveAttribute("data-expurgo", "liberado");
    await esperar(pagina.locator("html[data-abriu-bi]")).toHaveCount(0);
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(0);
    expect(atualizacoes()).toBe(0);
    expect(post.pedidos()).toBe(1);
  });
});

it("recupera falha no expurgo original sem repetir o POST nem expor o painel", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", { json: { ok: true } });
    post.liberar();
    await pagina.goto(`${url}?autenticada`);
    const chave = "chave-sintetica-sem-acesso";
    const retrato = `${createHash("sha256").update(chave).digest("hex")}:retrato`;
    await pagina.evaluate(
      async ({ chave, retrato }) => {
        localStorage.setItem("frequencibi:chave", chave);
        await new Promise<void>((resolver, rejeitar) => {
          const abrir = indexedDB.open("frequencibi-dados-v1", 1);
          abrir.onupgradeneeded = () => abrir.result.createObjectStore("retratos");
          abrir.onerror = () => rejeitar(abrir.error);
          abrir.onsuccess = () => {
            const db = abrir.result;
            const tx = db.transaction("retratos", "readwrite");
            const store = tx.objectStore("retratos");
            store.put("dado sintético", retrato);
            store.put("dado de outra chave", "outro:retrato");
            tx.oncomplete = () => {
              db.close();
              resolver();
            };
            tx.onerror = () => {
              db.close();
              rejeitar(tx.error);
            };
          };
        });
        const digest = crypto.subtle.digest.bind(crypto.subtle);
        let tentativas = 0;
        crypto.subtle.digest = (...args) =>
          ++tentativas <= 2
            ? Promise.reject(new Error("Falha controlada antes do acesso ao IndexedDB"))
            : digest(...args);
      },
      { chave, retrato },
    );
    const lerRetratos = () =>
      pagina.evaluate(
        () =>
          new Promise<string[]>((resolver, rejeitar) => {
            const abrir = indexedDB.open("frequencibi-dados-v1", 1);
            abrir.onerror = () => rejeitar(abrir.error);
            abrir.onsuccess = () => {
              const db = abrir.result;
              const pedido = db.transaction("retratos").objectStore("retratos").getAllKeys();
              pedido.onsuccess = () => {
                db.close();
                resolver(pedido.result.map(String).sort());
              };
              pedido.onerror = () => {
                db.close();
                rejeitar(pedido.error);
              };
            };
          }),
      );
    const sair = pagina.getByRole("button", { name: "Sair da conta" });
    await sair.click();
    await esperar(sair).toHaveCount(0);
    await esperar(
      pagina.getByText(/Não foi possível remover todos os dados locais do BI/),
    ).toBeVisible();
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(0);
    expect(await lerRetratos()).toEqual(["outro:retrato", retrato].sort());
    expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBeNull();
    expect(atualizacoes()).toBe(0);
    await esperar(pagina.getByRole("button", { name: "Entrar", exact: true })).toHaveCount(0);
    const tentar = pagina.getByRole("button", { name: "Tentar novamente" });
    await tentar.click();
    await esperar(tentar).toBeVisible();
    await esperar(sair).toHaveCount(0);
    expect(await lerRetratos()).toEqual(["outro:retrato", retrato].sort());
    expect(atualizacoes()).toBe(0);
    await tentar.click();
    await esperar.poll(atualizacoes).toBe(1);
    expect(await lerRetratos()).toEqual(["outro:retrato"]);
    expect(post.pedidos()).toBe(1);
    await esperar(sair).toHaveCount(0);
    await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(1);
  });
});

it("recupera a captura inacessível do BI sem apagar uma chave encontrada só depois", async () => {
  await comPagina(async (pagina, atualizacoes) => {
    const post = await reterPost(pagina, "sair", { json: { ok: true } });
    post.liberar();
    await pagina.goto(`${url}?autenticada`);
    const chaveNova = JSON.stringify({ chave: "outra-chave-sintetica", guardadoEm: 1000 });
    const retrato = `${createHash("sha256").update("outra-chave-sintetica").digest("hex")}:acesso`;
    const retratos = (acao: "criar" | "ler" | "limpar") =>
      pagina.evaluate(
        ({ acao, retrato }) =>
          new Promise<string[]>((resolver, rejeitar) => {
            const pedido = indexedDB.open("frequencibi-dados-v1", 1);
            pedido.onupgradeneeded = () => pedido.result.createObjectStore("retratos");
            pedido.onerror = () => rejeitar(pedido.error);
            pedido.onsuccess = () => {
              const db = pedido.result;
              const tx = db.transaction("retratos", acao === "ler" ? "readonly" : "readwrite");
              const store = tx.objectStore("retratos");
              if (acao === "criar") store.put("retrato sintético", retrato);
              if (acao === "limpar") store.clear();
              const chaves = store.getAllKeys();
              tx.oncomplete = () => {
                db.close();
                resolver(chaves.result.map(String));
              };
              tx.onabort = () => {
                db.close();
                rejeitar(tx.error);
              };
            };
          }),
        { acao, retrato },
      );
    expect(await retratos("criar")).toEqual([retrato]);
    await pagina.evaluate(() => {
      const ler = Storage.prototype.getItem;
      Storage.prototype.getItem = function (chave) {
        if (this === localStorage && chave === "frequencibi:chave") {
          throw new DOMException("Armazenamento bloqueado no teste", "SecurityError");
        }
        return ler.call(this, chave);
      };
      window.addEventListener(
        "fixture-restaurar-armazenamento",
        () => {
          Storage.prototype.getItem = ler;
        },
        { once: true },
      );
    });
    const sair = pagina.getByRole("button", { name: "Sair da conta" });
    await sair.click();
    const tentar = pagina.getByRole("button", { name: "Tentar novamente" });
    await esperar(tentar).toBeVisible();
    await esperar(sair).toHaveCount(0);
    await esperar(pagina.getByRole("button", { name: "Reabrir página" })).toHaveCount(0);

    await pagina.evaluate((valor) => {
      localStorage.setItem("frequencibi:chave", valor);
      window.dispatchEvent(new Event("fixture-restaurar-armazenamento"));
    }, chaveNova);
    await tentar.click();
    await esperar(tentar).toBeEnabled();
    expect(await pagina.evaluate(() => localStorage.getItem("frequencibi:chave"))).toBe(chaveNova);
    expect(await retratos("ler")).toEqual([retrato]);
    expect(atualizacoes()).toBe(0);

    await pagina.evaluate(() => localStorage.removeItem("frequencibi:chave"));
    await tentar.click();
    await esperar(tentar).toBeEnabled();
    expect(await retratos("ler")).toEqual([retrato]);
    expect(atualizacoes()).toBe(0);

    // A limpeza manual ocorre fora da aba da transição.
    expect(await retratos("limpar")).toEqual([]);
    await tentar.click();
    await esperar.poll(atualizacoes).toBe(1);
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(0);
    await pagina.evaluate(() => window.dispatchEvent(new Event("fixture-entrada")));
    await esperar(pagina.getByText("Sessão encerrada.")).toHaveCount(1);
    expect(post.pedidos()).toBe(1);
  });
});
