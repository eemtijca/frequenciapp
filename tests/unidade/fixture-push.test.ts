// Testa apenas a fixture em contextos JS isolados; não inicia navegador nem app.
import assert from "node:assert/strict";
import { createContext, runInContext, type Context } from "node:vm";
import { test } from "vitest";
import { instalarPushSimulado } from "../ponta-a-ponta/pwa/fixture-push";

const dados = { endpoint: "https://exemplo.invalid/push", keys: { p256dh: "p", auth: "a" } };

function contexto(comNotification: boolean) {
  const contexto = createContext({});
  runInContext(
    `globalThis.window = globalThis;
     globalThis.ServiceWorkerRegistration = class {};
     ${comNotification ? "globalThis.Notification = class Notification {};" : ""}`,
    contexto,
  );
  return contexto;
}

function instalar(
  ctx: Context,
  permissaoInicial: NotificationPermission = "default",
  resultado: NotificationPermission = "granted",
) {
  ctx.argumentos = { dados, permissaoInicial, resultado };
  runInContext(`(${instalarPushSimulado.toString()})(argumentos)`, ctx);
}

test("instala simulação completa quando Notification não existe", async () => {
  const ctx = contexto(false);
  instalar(ctx);
  assert.equal(runInContext("typeof Notification", ctx), "function");
  assert.equal(runInContext("Notification.permission", ctx), "default");
  assert.equal(await runInContext("Notification.requestPermission()", ctx), "granted");
  assert.equal(runInContext("Notification.permission", ctx), "granted");
  assert.equal(runInContext("contagensPush().pedidos", ctx), 1);
  assert.equal(runInContext("typeof PushManager", ctx), "function");
  assert.equal(
    runInContext("typeof new ServiceWorkerRegistration().pushManager.subscribe", ctx),
    "function",
  );
});

for (const comNotification of [false, true]) {
  for (const [inicial, resultado] of [
    ["default", "default"],
    ["default", "denied"],
    ["granted", "granted"],
    ["denied", "denied"],
  ] as const) {
    test(`permissões ${inicial} para ${resultado}; API preexistente: ${comNotification}`, async () => {
      const ctx = contexto(comNotification);
      const original = runInContext("globalThis.Notification", ctx);
      instalar(ctx, inicial, resultado);
      if (comNotification) assert.equal(runInContext("Notification", ctx), original);
      assert.equal(runInContext("Notification.permission", ctx), inicial);
      assert.equal(await runInContext("Notification.requestPermission()", ctx), resultado);
      assert.equal(runInContext("Notification.permission", ctx), resultado);
      assert.equal(runInContext("contagensPush().pedidos", ctx), 1);
    });
  }
}

test("simula assinatura, consulta e cancelamento, com contagens", async () => {
  const ctx = contexto(false);
  instalar(ctx);
  assert.equal(
    await runInContext("new ServiceWorkerRegistration().pushManager.getSubscription()", ctx),
    null,
  );
  const assinatura = await runInContext(
    "new ServiceWorkerRegistration().pushManager.subscribe()",
    ctx,
  );
  assert.equal(assinatura.endpoint, dados.endpoint);
  assert.equal(assinatura.toJSON(), dados);
  assert.equal(
    await runInContext("new ServiceWorkerRegistration().pushManager.getSubscription()", ctx),
    assinatura,
  );
  assert.equal(await assinatura.unsubscribe(), true);
  assert.equal(
    await runInContext("new ServiceWorkerRegistration().pushManager.getSubscription()", ctx),
    null,
  );
  assert.deepEqual(JSON.parse(runInContext("JSON.stringify(contagensPush())", ctx)), {
    pedidos: 0,
    inscricoes: 1,
    cancelamentos: 1,
  });
});

// O mesmo código é serializado por addInitScript, inclusive sem globals nativos.
for (const workerNativo of [false, true]) {
  test(`worker isolado instala API compartilhada; nativo preexistente: ${workerNativo}`, async () => {
    const ctx = contexto(false);
    runInContext(
      `globalThis.navigator = {};
       ${workerNativo ? "navigator.serviceWorker = { real: true };" : "delete globalThis.ServiceWorkerRegistration;"}`,
      ctx,
    );
    ctx.argumentos = {
      dados,
      permissaoInicial: "granted",
      resultado: "granted",
      workerSimulado: true,
    };
    runInContext(`(${instalarPushSimulado.toString()})(argumentos)`, ctx);
    assert.equal(runInContext("pushSimulado && workerSimulado", ctx), true);
    assert.equal(runInContext("typeof navigator.serviceWorker.addEventListener", ctx), "function");
    assert.equal(
      runInContext("typeof navigator.serviceWorker.removeEventListener", ctx),
      "function",
    );
    assert.equal(runInContext("navigator.serviceWorker.controller", ctx), null);
    const registro = await runInContext(
      'navigator.serviceWorker.register("/sw.js", { scope: "/" })',
      ctx,
    );
    assert.equal(await runInContext("navigator.serviceWorker.ready", ctx), registro);
    assert.equal(typeof registro.addEventListener, "function");
    assert.equal(registro.installing, null);
    assert.equal(await registro.pushManager.getSubscription(), null);
    const assinatura = await registro.pushManager.subscribe();
    const novamente = await runInContext(
      'navigator.serviceWorker.register("/sw.js", { scope: "/" })',
      ctx,
    );
    assert.equal(registro.pushManager, novamente.pushManager);
    assert.equal(await novamente.pushManager.getSubscription(), assinatura);
    assert.equal(await assinatura.unsubscribe(), true);
    assert.equal(await registro.pushManager.getSubscription(), null);
    const reativada = await novamente.pushManager.subscribe();
    assert.notEqual(reativada, assinatura);
    assert.equal(await registro.pushManager.getSubscription(), reativada);
    assert.deepEqual(JSON.parse(runInContext("JSON.stringify(contagensPush())", ctx)), {
      pedidos: 0,
      inscricoes: 2,
      cancelamentos: 1,
    });
  });
}
