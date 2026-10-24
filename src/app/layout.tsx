// Layout raiz com a tipografia dos seletores, tema e avisos compartilhados.
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import CorDoTema from "@/components/pwa/cor-do-tema";
import "./globals.css";

const fonteInterface = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const fonteNumeros = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
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
    { media: "(prefers-color-scheme: light)", color: "#f9f7f2" },
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
      <body
        className={`${fonteInterface.variable} ${fonteNumeros.variable} bg-background text-foreground font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <CorDoTema />
          <Toaster
            position="bottom-right"
            offset={20}
            mobileOffset={84}
            richColors
            closeButton={false}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
