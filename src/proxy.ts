// Proxy da aplicação (middleware do Next 16): bloqueio de mutações
// cross-site (CSRF) e cabeçalhos de segurança com CSP por nonce.

import { NextResponse, type NextRequest } from "next/server";

function hostProprio(req: NextRequest): string {
  const hostPublico =
    req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    req.headers.get("host")?.trim() ??
    new URL(req.url).host;
  return hostPublico.toLowerCase();
}

/** Nega mutação cross-site (CSRF). GET/HEAD/OPTIONS passam. */
function negarCsrf(req: NextRequest): boolean {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  const sitio = req.headers.get("sec-fetch-site");
  if (sitio === "same-origin" || sitio === "none") return false;
  if (sitio === "cross-site" || sitio === "same-site") return true;
  const origem = req.headers.get("origin") ?? req.headers.get("referer") ?? "";
  if (!origem) return false;
  try {
    return new URL(origem).host.toLowerCase() !== hostProprio(req);
  } catch {
    return true;
  }
}

export function proxy(request: NextRequest) {
  if (negarCsrf(request)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Origem não confiável." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    return new NextResponse("Origem não confiável.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  // Nonce por requisição libera apenas os scripts marcados pelo layout.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const ehDev = process.env.NODE_ENV === "development";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' ${ehDev ? "'unsafe-inline' 'unsafe-eval'" : `'nonce-${nonce}' 'strict-dynamic'`}`,
    "style-src 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline'",
    "style-src-attr 'unsafe-inline'",
    "worker-src 'self' blob:",
    "child-src blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "img-src 'self' data: blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(ehDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");

  const cabecalhosRequisicao = new Headers(request.headers);
  cabecalhosRequisicao.set("x-nonce", nonce);
  // O Next extrai o nonce do CSP da requisição para os próprios scripts.
  cabecalhosRequisicao.set("Content-Security-Policy", csp);

  const resposta = NextResponse.next({ request: { headers: cabecalhosRequisicao } });
  resposta.headers.set("Content-Security-Policy", csp);
  return resposta;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)",
  ],
};
