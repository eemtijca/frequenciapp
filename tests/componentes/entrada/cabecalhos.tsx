// Monta as telas reais sem servidor de aplicação nem banco de dados.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import "dayjs/locale/pt-br";
import { DestinoSessao, ProvedorTransicaoSessao } from "@/components/entrada/transicao-sessao";
import TelaLogin from "@/components/entrada/tela-login";
import VistaBi from "@/components/bi/vista-bi";
import { tema } from "@/theme/tema";

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
      {location.search.includes("bi") ? (
        <VistaBi fuso="UTC" />
      ) : (
        <ProvedorTransicaoSessao>
          <DestinoSessao>
            <TelaLogin urlIndiceAgentes="/llms.txt" />
          </DestinoSessao>
        </ProvedorTransicaoSessao>
      )}
    </LocalizationProvider>
  </ThemeProvider>,
);
