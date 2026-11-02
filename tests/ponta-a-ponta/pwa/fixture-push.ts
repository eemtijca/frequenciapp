// Script serializável pelo Playwright: simula Push, não entrega nativa.
export function instalarPushSimulado({
  dados,
  permissaoInicial,
  resultado,
  workerSimulado = false,
}: {
  dados: { endpoint: string; keys: { p256dh: string; auth: string } };
  permissaoInicial: NotificationPermission;
  resultado: NotificationPermission;
  workerSimulado?: boolean;
}) {
  let permissao = permissaoInicial;
  let pedidos = 0;
  let inscricoes = 0;
  let cancelamentos = 0;
  let atual: object | null = null;
  Object.defineProperty(window, "PushManager", { configurable: true, value: class {} });
  // Em WebKit a API pode estar ausente. Isto é uma simulação, não suporte nativo.
  if (typeof window.Notification !== "function") {
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: class Notification {},
    });
  }
  Object.defineProperty(window, "pushSimulado", { value: true });
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
  // Somente nos cenários de rede isolada: não há worker real interferindo.
  if (workerSimulado) {
    class RegistroSimulado {
      installing = null;
      addEventListener() {}
      removeEventListener() {}
    }
    Object.defineProperty(window, "ServiceWorkerRegistration", {
      configurable: true,
      value: RegistroSimulado,
    });
    const registro = new RegistroSimulado();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        controller: null,
        register: async () => registro,
        ready: Promise.resolve(registro),
        addEventListener() {},
        removeEventListener() {},
      },
    });
    Object.defineProperty(window, "workerSimulado", { value: true });
  }
  const gerenciador = {
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
  };
  Object.defineProperty(ServiceWorkerRegistration.prototype, "pushManager", {
    configurable: true,
    get: () => gerenciador,
  });
  Object.defineProperty(window, "contagensPush", {
    value: () => ({ pedidos, inscricoes, cancelamentos }),
  });
}
