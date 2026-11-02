// Monta as telas reais sem servidor de aplicação nem banco de dados.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import TelaLogin from "@/components/entrada/tela-login";
import VistaBi from "@/components/bi/vista-bi";
import "@/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    {location.search.includes("bi") ? (
      <VistaBi fuso="UTC" />
    ) : (
      <TelaLogin urlIndiceAgentes="/llms.txt" />
    )}
  </ThemeProvider>,
);
