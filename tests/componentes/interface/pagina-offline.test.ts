// Exercita a página sem conexão real sem JavaScript, service worker ou aplicativo.
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { expect, test } from "vitest";
import { verificarAlvoOffline, verificarFocoOffline } from "../../apoio/alvo-foco-offline";
import { abrirChromium } from "../../apoio/navegador";

function contraste(primeira: string, segunda: string): number {
  const luminancia = (cor: string) => {
    expect(cor).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    return cor
      .slice(4, -1)
      .split(", ")
      .map((canal) => Number(canal) / 255)
      .map((canal) => (canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4))
      .reduce((soma, canal, i) => soma + canal * ([0.2126, 0.7152, 0.0722][i] ?? 0), 0);
  };
  const a = luminancia(primeira);
  const b = luminancia(segunda);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test("ação sem conexão tem alvo de toque, foco visível e tenta a mesma URL por Enter", async () => {
  const bytes = await readFile(new URL("../../../public/offline.html", import.meta.url));
  const servidor = createServer((req, res) => {
    if (req.method !== "GET" || req.url !== "/offline.html") {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(bytes);
  });
  try {
    servidor.listen(0, "127.0.0.1");
    await once(servidor, "listening");
    const endereco = servidor.address();
    if (!endereco || typeof endereco === "string")
      throw new Error("Endereço de teste indisponível.");
    const url = `http://127.0.0.1:${endereco.port}/offline.html`;
    const navegador = await abrirChromium();
    try {
      const pagina = await navegador.newPage({
        viewport: { width: 320, height: 844 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
        colorScheme: "dark",
        reducedMotion: "reduce",
        javaScriptEnabled: false,
        serviceWorkers: "block",
      });
      expect((await pagina.goto(url))?.status()).toBe(200);
      const tentar = pagina.getByRole("link", { name: "Tentar de novo", exact: true });
      expect(await tentar.getAttribute("href")).toBe("");
      await pagina.keyboard.press("Tab");
      const medidas = await tentar.evaluate((link) => {
        const { x, y, width, height } = link.getBoundingClientRect();
        const cx = x + width / 2;
        const cy = y + height / 2;
        const estilo = getComputedStyle(link);
        const sondas: [number, number][] = [
          [cx, cy],
          [cx, cy - 23.5],
          [cx, cy + 23.5],
          [cx - 23.5, cy],
          [cx + 23.5, cy],
        ];
        const cartao = link.closest("main");
        if (!cartao) throw new Error("Cartão da página sem conexão ausente.");
        const caixa = cartao.getBoundingClientRect();
        const borda = parseFloat(estilo.outlineWidth) + parseFloat(estilo.outlineOffset);
        const raiz = document.documentElement;
        const semCorte =
          raiz.scrollWidth === raiz.clientWidth &&
          raiz.scrollHeight === raiz.clientHeight &&
          x - borda >= caixa.left &&
          x + width + borda <= caixa.right &&
          y - borda >= caixa.top &&
          y + height + borda <= caixa.bottom &&
          getComputedStyle(cartao).overflow === "visible";
        return {
          width,
          height,
          sondas: sondas.map(([px, py]) => link.contains(document.elementFromPoint(px, py))),
          ativo: document.activeElement === link,
          semCorte,
          cores: {
            texto: estilo.color,
            fundo: estilo.backgroundColor,
            foco: estilo.outlineColor,
            cartao: getComputedStyle(cartao).backgroundColor,
            corpo: getComputedStyle(document.body).backgroundColor,
          },
          visivel: link.matches(":focus-visible"),
          estilo: estilo.outlineStyle,
          espessura: parseFloat(estilo.outlineWidth),
        };
      });
      verificarAlvoOffline(medidas.width, medidas.height, medidas.sondas);
      verificarFocoOffline(medidas.ativo, medidas.visivel, medidas.estilo, medidas.espessura);
      expect(medidas.semCorte).toBe(true);
      expect(contraste(medidas.cores.texto, medidas.cores.fundo)).toBeGreaterThanOrEqual(4.5);
      expect(contraste(medidas.cores.foco, medidas.cores.cartao)).toBeGreaterThanOrEqual(3);
      expect(medidas.cores.corpo).toBe("rgb(20, 20, 19)");
      expect(medidas.cores.fundo).toBe("rgb(129, 207, 179)");
      const [resposta] = await Promise.all([
        pagina.waitForNavigation({ url, waitUntil: "load" }),
        pagina.keyboard.press("Enter"),
      ]);
      if (!resposta) throw new Error("Enter não carregou um novo documento.");
      expect(resposta.status()).toBe(200);
      expect(await resposta.body()).toEqual(bytes);
      expect(pagina.url()).toBe(url);
      const clara = await navegador.newPage({
        viewport: { width: 320, height: 844 },
        deviceScaleFactor: 1,
        colorScheme: "light",
        javaScriptEnabled: false,
        serviceWorkers: "block",
      });
      expect((await clara.goto(url))?.status()).toBe(200);
      const coresClaras = await clara.evaluate(() => {
        const link = document.querySelector("a.tentar");
        if (!link) throw new Error("Ação sem conexão ausente no tema claro.");
        return {
          corpo: getComputedStyle(document.body).backgroundColor,
          fundo: getComputedStyle(link).backgroundColor,
        };
      });
      expect(coresClaras).toEqual({
        corpo: "rgb(246, 246, 246)",
        fundo: "rgb(29, 114, 83)",
      });
    } finally {
      await navegador.close();
    }
  } finally {
    servidor.close();
    servidor.closeAllConnections();
  }
});
