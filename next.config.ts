import type { NextConfig } from "next";

// Cabeçalhos de segurança aplicados a toda resposta.
// O CSP com nonce vive em src/proxy.ts, na borda da requisição.
// Fora da Vercel, a saída standalone alimenta a imagem Docker.
const cabecalhosSeguranca = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS no caminho self-hosted; a Vercel já adiciona o cabeçalho próprio.
  ...(process.env.NODE_ENV === "production" && !process.env.VERCEL
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  output: process.env.VERCEL ? undefined : "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: cabecalhosSeguranca }];
  },
};

export default nextConfig;
