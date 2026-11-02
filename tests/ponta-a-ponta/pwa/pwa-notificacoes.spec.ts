// Push contra a PWA real: conta sintética, preferência por dispositivo e
// evento simulado no worker de produção. Assinatura e transporte simulados.
import { createECDH, randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { hashearSenha } from "../../../src/infra/auth/hash";
import { limparIndependentemente } from "../../helpers/limpeza-independente";
import { ADMIN_E2E, comBanco } from "../helpers/banco";
import { abrirNotificacoes, aguardarHidratacao } from "../helpers/pagina";
import { instalarPushSimulado } from "./fixture-push";
import { classificarRedePush, correspondeRespostaPush, validarBasePush } from "./validar-rede-push";

// Exige app e banco sintéticos exclusivos. Setup global e processos paralelos
// podem alterar dados; esta fixture não comprova que app e conexão usam a mesma base.
let loginDiretor = "";
let idDiretor = "";
let loginCoord = "";
let idCoord = "";
let loginsTentados: string[] = [];
let redeAtual: { inesperadas: number } | undefined;
let basePush: URL;
// Traces incluem corpos HTTP (senha e chaves efêmeras).
test.use({ trace: "off" });

test.beforeEach(async ({ request, page, baseURL }) => {
  loginDiretor = `p-${randomUUID()}`;
  idDiretor = "";
  loginCoord = "";
  idCoord = "";
  loginsTentados = [];
  redeAtual = undefined;
  // Fixture baseURL é a configuração efetiva deste teste, inclusive overrides.
  basePush = validarBasePush(baseURL);
  expect(
    (
      await request.post("/api/auth/entrar", {
        data: { login: ADMIN_E2E.email, senha: ADMIN_E2E.senha },
      })
    ).ok(),
  ).toBe(true);
  const criado = await request.post("/api/diretores", {
    data: { nome: "E2E Push Diretor", identificador: loginDiretor, turmaIds: [] },
  });
  expect(criado.ok()).toBe(true);
  idDiretor = ((await criado.json()) as { diretor: { id: string } }).diretor.id;
  const emitida = await request.post(`/api/diretores/${idDiretor}/palavra-chave`, { data: {} });
  expect(emitida.ok()).toBe(true);
  const palavra = ((await emitida.json()) as { palavraChave: string }).palavraChave;
  loginsTentados.push(loginDiretor);
  expect(
    (
      await page.request.post("/api/auth/entrar", { data: { login: loginDiretor, senha: palavra } })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/conta/senha", {
        data: { senhaAtual: palavra, senhaNova: "PushDiretorE2E2026" },
      })
    ).ok(),
  ).toBe(true);
});

test.afterEach(async () => {
  await limparIndependentemente([
    async () => {
      if (redeAtual) expect(redeAtual.inesperadas).toBe(0);
    },
    ...[idDiretor, idCoord].filter(Boolean).map((id) => async () => {
      await comBanco((cliente) => cliente.query("delete from usuarios where id = $1", [id]));
    }),
    ...loginsTentados.map((login) => async () => {
      await comBanco(async (cliente) => {
        // A origem pode ser reescrita pelo proxy; só as chaves exatas do login
        // aleatório são coletadas e excluídas, nunca as de contas compartilhadas.
        const chaves = await cliente.query<{ chave: string }>(
          `select chave from tentativas_entrada where chave = $1
             or (starts_with(chave, 'entrada:ip:') and right(chave, length($2)) = $2)`,
          [`entrada:email:${login}`, `:${login}`],
        );
        for (const { chave } of chaves.rows)
          await cliente.query("delete from tentativas_entrada where chave = $1", [chave]);
      });
    }),
    async () => {
      if (!idDiretor) return;
      await comBanco(async (cliente) => {
        await cliente.query("delete from tentativas_entrada where chave = $1", [
          `conta:senha:${idDiretor}`,
        ]);
      });
    },
  ]);
});

async function simularDispositivo(
  page: import("@playwright/test").Page,
  permissaoInicial: NotificationPermission = "default",
  resultado: NotificationPermission = "granted",
  workerSimulado = false,
  endpoint = `https://fcm.googleapis.com/fcm/send/e2e-push-${randomUUID()}`,
) {
  const par = createECDH("prime256v1");
  par.generateKeys();
  const dados = {
    endpoint,
    keys: {
      p256dh: par.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  await page.addInitScript(instalarPushSimulado, {
    dados,
    permissaoInicial,
    resultado,
    workerSimulado,
  });
  return dados;
}

// Verifica que o script de simulação rodou antes de interpretar o resultado da UI.
async function verificarSimulacao(page: import("@playwright/test").Page, workerSimulado = false) {
  expect(
    await page.evaluate(() => ({
      instalada: (window as Window & { pushSimulado?: boolean }).pushSimulado,
      notification: typeof window.Notification,
      permissao: typeof window.Notification?.permission,
      pedido: typeof window.Notification?.requestPermission,
      push: typeof window.PushManager,
      contagens: typeof (window as Window & { contagensPush?: unknown }).contagensPush,
      gerenciador: typeof Object.getOwnPropertyDescriptor(
        ServiceWorkerRegistration.prototype,
        "pushManager",
      )?.get,
    })),
  ).toEqual({
    instalada: true,
    notification: "function",
    permissao: "string",
    pedido: "function",
    push: "function",
    contagens: "function",
    gerenciador: "function",
  });
  if (workerSimulado) {
    expect(
      await page.evaluate(async () => {
        const worker = navigator.serviceWorker;
        const registro = await worker.register("/sw.js", { scope: "/" });
        return {
          instalado: (window as Window & { workerSimulado?: boolean }).workerSimulado,
          controller: worker.controller,
          compartilhado: registro === (await worker.ready),
          consultar: typeof registro.pushManager.getSubscription,
          registrar: typeof registro.addEventListener,
          ouvir: typeof worker.addEventListener,
          remover: typeof worker.removeEventListener,
        };
      }),
    ).toEqual({
      instalado: true,
      controller: null,
      compartilhado: true,
      consultar: "function",
      registrar: "function",
      ouvir: "function",
      remover: "function",
    });
  }
}

async function contagens(page: import("@playwright/test").Page) {
  return page.evaluate(() =>
    (
      window as Window & {
        contagensPush: () => { pedidos: number; inscricoes: number; cancelamentos: number };
      }
    ).contagensPush(),
  );
}

async function assinaturaAtual(page: import("@playwright/test").Page) {
  return page.evaluate(async () => {
    const registro = await navigator.serviceWorker.ready;
    return (await registro.pushManager.getSubscription())?.endpoint ?? null;
  });
}

// Intercepta requisições roteáveis da página, mas não é um firewall geral:
// tráfego fora do namespace usa fallback; workers e outros clientes não são cobertos.
async function simularRede(
  page: import("@playwright/test").Page,
  dados: Awaited<ReturnType<typeof simularDispositivo>>,
  opcoes: { configurada?: boolean; statusAtivacao?: number; statusTeste?: number } = {},
) {
  const contagem = { get: 0, post: 0, delete: 0, teste: 0, inesperadas: 0 };
  redeAtual = contagem;
  let ativa = false;
  await page.route("**/*", async (rota) => {
    const pedido = rota.request();
    const acao = classificarRedePush(
      pedido.url(),
      pedido.method(),
      pedido.postData(),
      dados,
      basePush,
    );
    if (acao === "fallback") return rota.fallback();
    if (acao === "bloquear") {
      contagem.inesperadas++;
      await rota.abort("blockedbyclient");
      return;
    }
    if (acao === "get") {
      contagem.get++;
      return rota.fulfill({
        status: 200,
        json: {
          configurada: opcoes.configurada ?? true,
          chavePublica: opcoes.configurada === false ? null : "AQ",
          ativa,
          preferencias: { resumoDiario: true, novasChamadas: false, chamadasPendentes: false },
          tipos: [
            { tipo: "resumoDiario", disponivel: true },
            { tipo: "novasChamadas", disponivel: true },
          ],
          horarioResumo: "17:00",
          horarioPendencias: "17:00",
          fuso: "America/Fortaleza",
        },
      });
    }
    if (acao === "post") {
      contagem.post++;
      const status = opcoes.statusAtivacao ?? 200;
      if (status === 200) ativa = true;
      return rota.fulfill({
        status,
        json: status === 200 ? { ok: true } : { error: "Envio temporariamente indisponível." },
      });
    }
    if (acao === "delete") {
      contagem.delete++;
      ativa = false;
      return rota.fulfill({ status: 200, json: { ok: true } });
    }
    if (acao === "teste") {
      contagem.teste++;
      const status = opcoes.statusTeste ?? 200;
      if (status === 410) ativa = false;
      return rota.fulfill({
        status,
        json:
          status === 200 ? { ok: true } : { error: "As notificações expiraram neste dispositivo." },
      });
    }
    contagem.inesperadas++;
    return rota.abort("blockedbyclient");
  });
  return contagem;
}

function resposta(
  page: import("@playwright/test").Page,
  metodo: string,
  endpoint: "assinatura" | "teste",
) {
  return page.waitForResponse((resposta) =>
    correspondeRespostaPush(
      resposta.url(),
      resposta.request().method(),
      basePush,
      metodo,
      endpoint,
    ),
  );
}

test.describe("notificações da PWA", () => {
  test("diretor escolhe tipos para a conta sem pedir permissão ao navegador", async ({ page }) => {
    await simularDispositivo(page);
    await page.goto("/");
    await verificarSimulacao(page);
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
    await expect(
      dialogo.getByRole("switch", { name: "Novas chamadas", exact: true }),
    ).toHaveAttribute("aria-checked", "false");
    await dialogo.getByRole("switch", { name: "Novas chamadas", exact: true }).click();
    await expect(
      dialogo.getByRole("switch", { name: "Novas chamadas", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    expect(await contagens(page)).toEqual({ pedidos: 0, inscricoes: 0, cancelamentos: 0 });
    await page.reload();
    await verificarSimulacao(page);
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    await expect(
      dialogo.getByRole("switch", { name: "Novas chamadas", exact: true }),
    ).toHaveAttribute("aria-checked", "true");
    await expect(
      dialogo.getByRole("switch", { name: "Chamadas pendentes", exact: true }),
    ).toHaveCount(0);
  });
  test("coordenação ativa o dispositivo para receber avisos de pendências", async ({ page }) => {
    loginCoord = `p-${randomUUID()}@escola.exemplo`;
    const senha = `Pwa${randomBytes(24).toString("hex")}1!`;
    const senhaHash = await hashearSenha(senha);
    await comBanco(async (cliente) => {
      const criada = await cliente.query<{ id: string }>(
        `insert into usuarios (email, senha_hash, nome, papel, ativo, criado_em, atualizado_em)
         values ($1, $2, 'E2E Push Coordenação', 'COORDENACAO', true, now(), now()) returning id`,
        [loginCoord, senhaHash],
      );
      idCoord = criada.rows[0]?.id ?? "";
      if (!idCoord) throw new Error("Criação da coordenação não retornou ID.");
    });
    await simularDispositivo(page);
    loginsTentados.push(loginCoord);
    expect(
      (
        await page.request.post("/api/auth/entrar", {
          data: { login: loginCoord, senha },
        })
      ).ok(),
    ).toBe(true);
    await page.goto("/");
    await verificarSimulacao(page);
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
    await expect(
      dialogo.getByRole("switch", { name: "Chamadas pendentes", exact: true }),
    ).toBeVisible();
    await dialogo.getByRole("button", { name: "Ativar notificações", exact: true }).click();
    await expect(
      dialogo.getByRole("button", { name: "Desativar notificações", exact: true }),
    ).toBeEnabled();
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 0 });
    await dialogo.getByRole("button", { name: "Desativar notificações", exact: true }).click();
    await expect(
      dialogo.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeEnabled();
  });

  test("permite recusar o pedido sem criar assinatura", async ({ page }) => {
    await simularDispositivo(page, "default", "default");
    await page.goto("/");
    await verificarSimulacao(page);
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("A permissão não foi concedida");
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 0, cancelamentos: 0 });
  });
  test("orienta o desbloqueio e não repete uma permissão negada", async ({ page }) => {
    await simularDispositivo(page, "denied");
    await page.goto("/");
    await verificarSimulacao(page);
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    await expect(page.getByText(/As notificações estão bloqueadas/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeDisabled();
    expect(await contagens(page)).toEqual({ pedidos: 0, inscricoes: 0, cancelamentos: 0 });
  });

  // Worker e endpoints simulados em todos os projetos: nenhum destes casos
  // demonstra permissão, entrega ou service worker nativos (inclusive WebKit).
  test.describe("rede e worker simulados", () => {
    test.use({ serviceWorkers: "block" });
    test("ativa apenas após o toque, testa e desativa neste dispositivo", async ({ page }) => {
      const dados = await simularDispositivo(page, "default", "granted", true);
      const rede = await simularRede(page, dados);
      await page.goto("/");
      await verificarSimulacao(page, true);
      await aguardarHidratacao(page);
      const consulta = resposta(page, "GET", "assinatura");
      await abrirNotificacoes(page);
      expect((await consulta).status()).toBe(200);
      const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
      await expect(
        dialogo.getByRole("button", { name: "Ativar notificações", exact: true }),
      ).toBeEnabled();
      expect(await contagens(page)).toEqual({ pedidos: 0, inscricoes: 0, cancelamentos: 0 });
      const ativacao = resposta(page, "POST", "assinatura");
      await dialogo.getByRole("button", { name: "Ativar notificações", exact: true }).click();
      expect((await ativacao).status()).toBe(200);
      await expect(
        dialogo.getByRole("button", { name: "Desativar notificações", exact: true }),
      ).toBeEnabled();
      expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 0 });
      expect(await assinaturaAtual(page)).toBe(dados.endpoint);
      const teste = resposta(page, "POST", "teste");
      await dialogo.getByRole("button", { name: "Enviar notificação de teste" }).click();
      expect((await teste).status()).toBe(200);
      await expect(
        page.getByText("Teste enviado. Confira as notificações do dispositivo."),
      ).toBeVisible();
      const desativacao = resposta(page, "DELETE", "assinatura");
      await dialogo.getByRole("button", { name: "Desativar notificações", exact: true }).click();
      expect((await desativacao).status()).toBe(200);
      await expect(
        dialogo.getByRole("button", { name: "Ativar notificações", exact: true }),
      ).toBeEnabled();
      expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 1 });
      expect(await assinaturaAtual(page)).toBeNull();
      expect(rede.get).toBeGreaterThan(0);
      expect(rede).toMatchObject({ post: 1, delete: 1, teste: 1, inesperadas: 0 });
    });
    test("desfaz a assinatura quando o servidor recusa a ativação", async ({ page }) => {
      const dados = await simularDispositivo(page, "default", "granted", true);
      const rede = await simularRede(page, dados, { statusAtivacao: 503 });
      await page.goto("/");
      await verificarSimulacao(page, true);
      await aguardarHidratacao(page);
      const consulta = resposta(page, "GET", "assinatura");
      await abrirNotificacoes(page);
      expect((await consulta).status()).toBe(200);
      const ativacao = resposta(page, "POST", "assinatura");
      await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
      expect((await ativacao).status()).toBe(503);
      await expect(page.getByRole("alert")).toContainText("Envio temporariamente indisponível");
      expect(rede.get).toBeGreaterThan(0);
      expect(rede).toMatchObject({ post: 1, delete: 0, teste: 0, inesperadas: 0 });
      expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 1 });
      expect(await assinaturaAtual(page)).toBeNull();
      await expect(
        page.getByRole("button", { name: "Ativar notificações", exact: true }),
      ).toBeEnabled();
    });
    test("retira a assinatura expirada antes de permitir nova ativação", async ({ page }) => {
      const dados = await simularDispositivo(page, "granted", "granted", true);
      const rede = await simularRede(page, dados, { statusTeste: 410 });
      await page.goto("/");
      await verificarSimulacao(page, true);
      await aguardarHidratacao(page);
      const consulta = resposta(page, "GET", "assinatura");
      await abrirNotificacoes(page);
      expect((await consulta).status()).toBe(200);
      const ativacao = resposta(page, "POST", "assinatura");
      await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
      expect((await ativacao).status()).toBe(200);
      const teste = resposta(page, "POST", "teste");
      await page.getByRole("button", { name: "Enviar notificação de teste" }).click();
      expect((await teste).status()).toBe(410);
      await expect(page.getByRole("alert")).toContainText("As notificações expiraram");
      await expect(
        page.getByRole("button", { name: "Ativar notificações", exact: true }),
      ).toBeEnabled();
      expect((await contagens(page)).cancelamentos).toBe(1);
      expect(await assinaturaAtual(page)).toBeNull();
      const reativacao = resposta(page, "POST", "assinatura");
      await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
      expect((await reativacao).status()).toBe(200);
      await expect(
        page.getByRole("button", { name: "Desativar notificações", exact: true }),
      ).toBeEnabled();
      expect((await contagens(page)).inscricoes).toBe(2);
      expect(await assinaturaAtual(page)).toBe(dados.endpoint);
      expect(rede.get).toBeGreaterThan(0);
      expect(rede).toMatchObject({ post: 2, delete: 0, teste: 1, inesperadas: 0 });
    });
    test("mantém a consulta disponível sem configuração de push", async ({ page }) => {
      const dados = await simularDispositivo(page, "default", "granted", true);
      const rede = await simularRede(page, dados, { configurada: false });
      await page.goto("/");
      await verificarSimulacao(page, true);
      await aguardarHidratacao(page);
      await expect(page.getByRole("heading", { name: "Minhas turmas" })).toBeVisible();
      const consulta = resposta(page, "GET", "assinatura");
      await abrirNotificacoes(page);
      expect((await consulta).status()).toBe(200);
      expect(rede.get).toBeGreaterThan(0);
      expect(rede).toMatchObject({ post: 0, delete: 0, teste: 0, inesperadas: 0 });
      await expect(
        page.getByText("As notificações ainda não foram configuradas pela administração."),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Ativar notificações", exact: true }),
      ).toHaveCount(0);
      expect((await contagens(page)).pedidos).toBe(0);
    });
  });
  // Integração com API e banco reais; somente PushManager/permission são simulados.
  // Exige app e banco descartáveis, exclusivos e configurados com VAPID sintético.
  test.describe("persistência real (Chromium; push simulado)", () => {
    test.skip(
      ({ browserName }) => browserName !== "chromium",
      "Integração não verificada em WebKit.",
    );
    test("inscrição e exclusão", async ({ page, context }) => {
      const endpoint = `https://fcm.googleapis.com/fcm/send/e2e-push-${randomUUID()}`;
      await simularDispositivo(page, "default", "granted", false, endpoint);
      await page.goto("/");
      await verificarSimulacao(page);
      await aguardarHidratacao(page);
      await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
      expect(context.serviceWorkers().some((worker) => worker.url().endsWith("/sw.js"))).toBe(true);
      const total = () =>
        comBanco(async (cliente) => {
          const resultado = await cliente.query(
            `select count(*)::int as total from assinaturas_push
           where endpoint = $1 and usuario_id = $2`,
            [endpoint, idDiretor],
          );
          return resultado.rows[0].total as number;
        });
      expect(await total()).toBe(0);
      await abrirNotificacoes(page);
      const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
      const ativacao = resposta(page, "POST", "assinatura");
      await dialogo.getByRole("button", { name: "Ativar notificações", exact: true }).click();
      expect((await ativacao).status()).toBe(200);
      await expect(dialogo.getByRole("button", { name: "Desativar notificações" })).toBeEnabled();
      expect(await total()).toBe(1);
      const desativacao = resposta(page, "DELETE", "assinatura");
      await dialogo.getByRole("button", { name: "Desativar notificações" }).click();
      expect((await desativacao).status()).toBe(200);
      await expect(dialogo.getByRole("button", { name: "Ativar notificações" })).toBeEnabled();
      expect(await total()).toBe(0);
    });
  });
  test("informa quando o navegador não oferece suporte nativo a push", async ({ page }) => {
    await page.goto("/");
    const suporteNativo = await page.evaluate(
      () =>
        window.isSecureContext &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window,
    );
    test.skip(
      suporteNativo,
      "Este navegador oferece as APIs nativas; a detecção sem suporte é exercida somente onde faltam.",
    );
    await aguardarHidratacao(page);
    await abrirNotificacoes(page);
    await expect(page.getByText(/Este navegador não oferece notificações push/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toHaveCount(0);
  });
  test("o worker de produção interpreta um evento push simulado", async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(
      browserName !== "chromium",
      "A introspecção de context.serviceWorkers() no Playwright é suportada apenas em Chromium; não indica ausência de worker no navegador.",
    );
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    const worker = context.serviceWorkers().find((item) => item.url().endsWith("/sw.js"));
    if (!worker) throw new Error("Worker do aplicativo não encontrado.");
    await worker.evaluate(() => {
      const escopo = self as unknown as {
        registration: ServiceWorkerRegistration;
        avisosRecebidos: { titulo: string; corpo: string; etiqueta: string }[];
      };
      escopo.avisosRecebidos = [];
      escopo.registration.showNotification = async (titulo, opcoes) => {
        escopo.avisosRecebidos.push({
          titulo,
          corpo: opcoes?.body ?? "",
          etiqueta: opcoes?.tag ?? "",
        });
      };
    });
    // O worker e o parser de PushEvent são reais. A exibição do aviso é
    // simulada, pois o Chromium sem interface não autoriza notificações nativas.
    await worker.evaluate(async () => {
      const evento = new PushEvent("push", {
        data: JSON.stringify({
          corpo: "Acompanhamento sintético disponível.",
          etiqueta: "resumo-frequencia-e2e",
        }),
      });
      const esperas: Promise<unknown>[] = [];
      Object.defineProperty(evento, "waitUntil", {
        value: (promessa: Promise<unknown>) => esperas.push(promessa),
      });
      self.dispatchEvent(evento);
      await Promise.all(esperas);
    });
    await expect
      .poll(() =>
        worker.evaluate(
          () =>
            (
              self as unknown as {
                avisosRecebidos: { titulo: string; corpo: string; etiqueta: string }[];
              }
            ).avisosRecebidos,
        ),
      )
      .toContainEqual({
        titulo: "FrequenciApp",
        corpo: "Acompanhamento sintético disponível.",
        etiqueta: "resumo-frequencia-e2e",
      });
    await page.evaluate(async () => {
      const registro = await navigator.serviceWorker.ready;
      for (const aviso of await registro.getNotifications()) aviso.close();
    });
  });
});
