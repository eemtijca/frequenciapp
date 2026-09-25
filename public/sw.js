// Service worker do Chamada: casca offline mínima e respeitosa.
// Regras:
// - Dados da API nunca são cacheados (frequência é dado vivo).
// - Navegação tenta a rede; sem rede, entrega a página offline.
// - Arquivos estáticos (ícones, manifesto) usam cache com revalidação.
const VERSAO = "chamada-3";
const CACHE = `${VERSAO}-estatico`;
const ATIVOS = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-mascara-192.png",
  "/icon-mascara-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ATIVOS);
    })(),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((nome) => nome !== CACHE).map((nome) => caches.delete(nome)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (evento) => {
  if (evento.data && evento.data.tipo === "pular-espera") {
    void self.skipWaiting();
  }
});

function ehImutavel(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/icon-") ||
      url.pathname === "/manifest.webmanifest" ||
      url.pathname === "/favicon.ico" ||
      url.pathname === "/apple-touch-icon.png")
  );
}

function ehDoBuild(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || url.pathname.endsWith(".woff2"))
  );
}

self.addEventListener("fetch", (evento) => {
  const requisicao = evento.request;
  if (requisicao.method !== "GET") return;

  const url = new URL(requisicao.url);
  if (url.origin !== self.location.origin) return;

  // Dados vivos: sempre rede, com resposta amigável quando falta internet.
  if (url.pathname.startsWith("/api/")) {
    evento.respondWith(
      fetch(requisicao).catch(
        () =>
          new Response(
            JSON.stringify({
              error: "Sem conexão com o servidor. Verifique a internet e tente de novo.",
            }),
            {
              status: 503,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            },
          ),
      ),
    );
    return;
  }

  // Navegação: rede primeiro, página offline como rede de proteção.
  if (requisicao.mode === "navigate") {
    evento.respondWith(
      fetch(requisicao).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match("/offline.html")) ?? Response.error();
      }),
    );
    return;
  }

  // Conteúdo imutável por convenção (ícones, manifesto): cache primeiro.
  if (ehImutavel(url)) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const guardado = await cache.match(requisicao);
        if (guardado) return guardado;
        const resposta = await fetch(requisicao);
        if (resposta.ok) cache.put(requisicao, resposta.clone());
        return resposta;
      })(),
    );
    return;
  }

  // Arquivos do build (chunks, fontes): rede primeiro com cópia no cache
  // para offline. Os nomes mudam entre builds em desenvolvimento, então o
  // cache nunca pode ter a última palavra aqui.
  if (ehDoBuild(url)) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const resposta = await fetch(requisicao);
          if (resposta.ok) cache.put(requisicao, resposta.clone());
          return resposta;
        } catch {
          const guardado = await cache.match(requisicao);
          return guardado ?? Response.error();
        }
      })(),
    );
  }
});
