import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import ProvedorAnimacoes from "@/components/ui/provedor-animacoes";
import CorDoTema from "@/components/pwa/cor-do-tema";
import { SCRIPT_ANIMACOES } from "@/lib/animacoes";
import "./globals.css";

const fonteInterface = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const fonteNumeros = Geist_Mono({
  variable: "--font-geist-mono",
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
  robots: { index: false, follow: false },
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
        className={`${fonteInterface.variable} ${fonteNumeros.variable} bg-background text-foreground antialiased`}
      >
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT_ANIMACOES }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          <ProvedorAnimacoes>{children}</ProvedorAnimacoes>
          <CorDoTema />
          <Toaster position="top-center" richColors closeButton={false} />
        </ThemeProvider>
      </body>
    </html>
  );
}
