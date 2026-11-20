// Layout raiz com a tipografia Inter, o tema Material UI e os avisos compartilhados.
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter } from "next/font/google";
import InitColorSchemeScript from "@mui/material/InitColorSchemeScript";
import { ProvedorAvisos } from "@/components/ui/mui/avisos";
import { ProvedorTema } from "@/theme/provedor-tema";

const fonteMaterial = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FrequenciApp",
    template: "%s | FrequenciApp",
  },
  description:
    "Chamada diária, saídas antecipadas e indicadores da escola para a direção e a coordenação.",
  applicationName: "FrequenciApp",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FrequenciApp",
  },
  formatDetection: {
    telephone: false,
  },
  alternates: {
    types: { "text/markdown": "/llms.txt" },
  },
  // Fora do índice de busca, mas com os links da página seguidos: a raiz
  // anônima aponta o índice para agentes de IA.
  robots: { index: false, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f6" },
    { media: "(prefers-color-scheme: dark)", color: "#1c1b19" },
  ],
};

export default async function LayoutRaiz({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // O nonce da CSP libera o script de tema; sem ele o tema escuro pisca.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={fonteMaterial.variable}>
        <InitColorSchemeScript
          attribute="data-mui-color-scheme"
          defaultMode="system"
          modeStorageKey="theme"
          nonce={nonce}
        />
        <ProvedorTema nonce={nonce}>
          {children}
          <ProvedorAvisos />
        </ProvedorTema>
      </body>
    </html>
  );
}
