import type { NextConfig } from "next";
import { booleanoDeAmbiente } from "./src/infra/booleano";
import { REDIRECIONAMENTO_PRIVACIDADE } from "./src/lib/rotas-publicas";

// Cabeçalhos de segurança aplicados a toda resposta.
// O CSP com nonce vive em src/proxy.ts, na borda da requisição.
// Fora da Vercel, a saída standalone alimenta a imagem Docker.
// HSTS só entra quando o tráfego é TLS: em produção self-hosted sem
// PERMITIR_HTTP e fora da Vercel, que já envia o cabeçalho.
const usarHsts =
  process.env.NODE_ENV === "production" &&
  !process.env.VERCEL &&
  !booleanoDeAmbiente(process.env.PERMITIR_HTTP, false);

const cabecalhosSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(usarHsts
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  agentRules: false,
  devIndicators: false,
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // Importa apenas os módulos usados pelos pacotes MUI e evita puxar o barrel inteiro.
    optimizePackageImports: [
      "@mui/material",
      "@mui/icons-material",
      "@mui/x-charts",
      "@mui/x-date-pickers",
    ],
  },
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ["@prometheus-io/client"],
  // A versão em Markdown da referência é lida do disco na rota /api/docs/api.md;
  // o arquivo precisa acompanhar a função no standalone e na Vercel.
  outputFileTracingIncludes: {
    "/api/docs/api.md": ["./docs/api.md"],
  },
  async redirects() {
    return [REDIRECIONAMENTO_PRIVACIDADE];
  },
  async headers() {
    return [
      {
        // Descoberta do índice para agentes de IA na raiz.
        source: "/",
        headers: [{ key: "Link", value: '</llms.txt>; rel="alternate"; type="text/markdown"' }],
      },
      { source: "/:path*", headers: cabecalhosSeguranca },
    ];
  },
};

export default nextConfig;
