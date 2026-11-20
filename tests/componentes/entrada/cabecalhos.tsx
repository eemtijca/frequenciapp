// Monta as telas reais sem servidor de aplicação nem banco de dados.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import { ThemeProvider as ProvedorNextThemes } from "next-themes";
import "dayjs/locale/pt-br";
import TelaLogin from "@/components/entrada/tela-login";
import VistaBi from "@/components/bi/vista-bi";
import { SincronizarTema } from "@/components/ui/mui/sincronizar-tema";
import { tema } from "@/theme/tema";
import "@/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Elemento raiz ausente");
createRoot(raiz).render(
  <ThemeProvider theme={tema} defaultMode="system" modeStorageKey="theme" disableTransitionOnChange>
    <CssBaseline enableColorScheme />
    <LocalizationProvider
      dateAdapter={AdapterDayjs}
      adapterLocale="pt-br"
      localeText={ptBR.components.MuiLocalizationProvider.defaultProps.localeText}
    >
      <ProvedorNextThemes
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <SincronizarTema />
        {location.search.includes("bi") ? (
          <VistaBi fuso="UTC" />
        ) : (
          <TelaLogin urlIndiceAgentes="/llms.txt" />
        )}
      </ProvedorNextThemes>
    </LocalizationProvider>
  </ThemeProvider>,
);
