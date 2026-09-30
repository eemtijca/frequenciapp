// Push contra a PWA real: conta sintética, preferência por dispositivo e
// evento entregue pelo Chromium. Assinatura do navegador e transporte simulados.
import { createECDH, randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { comBanco } from "./helpers/banco";
import { aguardarHidratacao } from "./helpers/pagina";

const LOGIN = "e2e-push-diretor";

test.beforeEach(async ({ request, page }) => {
  await comBanco(async (cliente) => {
    await cliente.query("delete from usuarios where email = $1", [LOGIN]);
    await cliente.query("delete from tentativas_entrada where chave like '%e2e-push-diretor%'");
  });
  expect(
    (
      await request.post("/api/auth/entrar", {
        data: { login: "direcao@escola.exemplo", senha: "DirecaoFrequencia2026" },
      })
    ).ok(),
  ).toBe(true);
  const criado = await request.post("/api/diretores", {
    data: { nome: "E2E Push Diretor", identificador: LOGIN, turmaIds: [] },
  });
  const id = ((await criado.json()) as { diretor: { id: string } }).diretor.id;
  const emitida = await request.post(`/api/diretores/${id}/palavra-chave`, { data: {} });
  const palavra = ((await emitida.json()) as { palavraChave: string }).palavraChave;
  expect(
    (await page.request.post("/api/auth/entrar", { data: { login: LOGIN, senha: palavra } })).ok(),
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
  await comBanco(async (cliente) => {
    await cliente.query("delete from usuarios where email = $1", [LOGIN]);
    await cliente.query("delete from tentativas_entrada where chave like '%e2e-push-diretor%'");
  });
});

async function simularDispositivo(
  page: import("@playwright/test").Page,
  permissaoInicial: NotificationPermission = "default",
  resultado: NotificationPermission = "granted",
) {
  const par = createECDH("prime256v1");
  par.generateKeys();
  const dados = {
    endpoint: "https://fcm.googleapis.com/fcm/send/e2e-push-sintetico",
    keys: {
      p256dh: par.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
    },
  };
  await page.addInitScript(
    ({ dados, permissaoInicial, resultado }) => {
      let permissao = permissaoInicial;
      let pedidos = 0;
      let inscricoes = 0;
      let cancelamentos = 0;
      let atual: object | null = null;
      Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
      Object.defineProperty(Notification, "permission", {
        configurable: true,
        get: () => permissao,
      });
      Object.defineProperty(Notification, "requestPermission", {
        configurable: true,
        value: async () => {
          pedidos += 1;
          permissao = resultado;
          return resultado;
        },
      });
      Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
        configurable: true,
        get: () => ({
          getSubscription: async () => atual,
          subscribe: async () => {
            inscricoes += 1;
            atual = {
              endpoint: dados.endpoint,
              options: {},
              toJSON: () => dados,
              unsubscribe: async () => {
                cancelamentos += 1;
                atual = null;
                return true;
              },
            };
            return atual;
          },
        }),
      });
      Object.defineProperty(window, "contagensPush", {
        value: () => ({ pedidos, inscricoes, cancelamentos }),
      });
    },
    { dados, permissaoInicial, resultado },
  );
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

test.describe("notificações da PWA", () => {
  test("ativa apenas após o toque, testa e desativa neste dispositivo", async ({ page }) => {
    await simularDispositivo(page);
    await page.route("**/api/notificacoes/teste", (rota) => rota.fulfill({ json: { ok: true } }));
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: "Configurar notificações" }).click();
    const dialogo = page.getByRole("dialog", { name: "Notificações", exact: true });
    await expect(
      dialogo.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeEnabled();
    expect(await contagens(page)).toEqual({ pedidos: 0, inscricoes: 0, cancelamentos: 0 });
    await dialogo.getByRole("button", { name: "Ativar notificações", exact: true }).click();
    await expect(
      dialogo.getByRole("button", { name: "Desativar notificações", exact: true }),
    ).toBeEnabled();
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 0 });
    await dialogo.getByRole("button", { name: "Enviar notificação de teste" }).click();
    await expect(
      page.getByText("Teste enviado. Confira as notificações do dispositivo."),
    ).toBeVisible();
    await dialogo.getByRole("button", { name: "Desativar notificações", exact: true }).click();
    await expect(
      dialogo.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeEnabled();
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 1 });
    const total = await comBanco(
      async (cliente) =>
        (
          await cliente.query(
            "select id from assinaturas_push where endpoint like '%e2e-push-sintetico'",
          )
        ).rowCount,
    );
    expect(total).toBe(0);
  });
  test("permite recusar o pedido sem criar assinatura", async ({ page }) => {
    await simularDispositivo(page, "default", "default");
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: "Configurar notificações" }).click();
    await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("A permissão não foi concedida");
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 0, cancelamentos: 0 });
  });
  test("orienta o desbloqueio e não repete uma permissão negada", async ({ page }) => {
    await simularDispositivo(page, "denied");
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: "Configurar notificações" }).click();
    await expect(page.getByText(/As notificações estão bloqueadas/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeDisabled();
    expect(await contagens(page)).toEqual({ pedidos: 0, inscricoes: 0, cancelamentos: 0 });
  });
  test("desfaz a assinatura quando o servidor recusa a ativação", async ({ page }) => {
    await simularDispositivo(page);
    await page.route("**/api/notificacoes/assinatura", (rota) =>
      rota.request().method() === "POST"
        ? rota.fulfill({ status: 503, json: { error: "Envio temporariamente indisponível." } })
        : rota.continue(),
    );
    await page.goto("/");
    await aguardarHidratacao(page);
    await page.getByRole("button", { name: "Configurar notificações" }).click();
    await page.getByRole("button", { name: "Ativar notificações", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Envio temporariamente indisponível");
    expect(await contagens(page)).toEqual({ pedidos: 1, inscricoes: 1, cancelamentos: 1 });
    await expect(
      page.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toBeEnabled();
  });
  test("mantém a consulta disponível sem configuração de push", async ({ page, context }) => {
    await simularDispositivo(page);
    await context.route("**/api/notificacoes/assinatura*", (rota) =>
      rota.fulfill({ json: { configurada: false, chavePublica: null, ativa: false } }),
    );
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect(page.getByRole("heading", { name: "Minhas turmas" })).toBeVisible();
    await page.getByRole("button", { name: "Configurar notificações" }).click();
    await expect(
      page.getByText("As notificações ainda não foram configuradas pela administração."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Ativar notificações", exact: true }),
    ).toHaveCount(0);
    expect((await contagens(page)).pedidos).toBe(0);
  });
  test("o worker real mostra um push entregue pelo Chromium", async ({ page, context }) => {
    await context.grantPermissions(["notifications"]);
    const cdp = await context.newCDPSession(page);
    let registroId = "";
    cdp.on(
      "ServiceWorker.workerRegistrationUpdated",
      ({ registrations }: { registrations: { registrationId: string; scopeURL: string }[] }) => {
        const registro = registrations.find(
          (item) =>
            item.scopeURL === `${test.info().project.use.baseURL ?? "http://localhost:3000"}/`,
        );
        if (registro) registroId = registro.registrationId;
      },
    );
    await cdp.send("ServiceWorker.enable");
    await page.goto("/");
    await aguardarHidratacao(page);
    await expect.poll(() => registroId).not.toBe("");
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await cdp.send("ServiceWorker.deliverPushMessage", {
      origin: test.info().project.use.baseURL ?? "http://localhost:3000",
      registrationId: registroId,
      data: Buffer.from(
        JSON.stringify({
          corpo: "Acompanhamento sintético disponível.",
          etiqueta: "resumo-frequencia-e2e",
        }),
      ).toString("base64"),
    });
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registro = await navigator.serviceWorker.ready;
          const avisos = await registro.getNotifications();
          return avisos.map((aviso) => ({
            titulo: aviso.title,
            corpo: aviso.body,
            etiqueta: aviso.tag,
          }));
        }),
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
