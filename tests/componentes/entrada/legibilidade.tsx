// Componentes de produção com dados sintéticos; não há servidor de aplicação nem banco.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { ptBR } from "@mui/x-date-pickers/locales";
import { ThemeProvider as ProvedorNextThemes } from "next-themes";
import "dayjs/locale/pt-br";
import TelaLogin from "@/components/entrada/tela-login";
import VistaFrequencia from "@/components/chamada/vista-frequencia";
import { SincronizarTema } from "@/components/ui/mui/sincronizar-tema";
import { tema } from "@/theme/tema";
import { CONFIGURACOES_PADRAO } from "@/domain/frequencia";
import "@/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
const data = "2026-11-02";
const naChamada = location.search.includes("chamada");
createRoot(raiz).render(
  <ThemeProvider theme={tema} defaultMode="system" modeStorageKey="theme" disableTransitionOnChange>
    {naChamada ? null : <CssBaseline enableColorScheme />}
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
        {naChamada ? (
          <main className="p-4">
            <VistaFrequencia
              diaCorrente={data}
              fuso="America/Sao_Paulo"
              turmas={[
                {
                  id: "turma",
                  serieId: "serie",
                  nome: "A",
                  rotulo: "1º ano A",
                  serieNome: "1º ano",
                  horarios: [],
                },
              ]}
              alunos={[]}
              usuario={{
                id: "teste",
                nome: "Teste",
                email: "teste@example.org",
                papel: "ADMIN",
                ativo: true,
              }}
              ativo
              alvo={null}
              configuracoes={CONFIGURACOES_PADRAO}
              catalogoJustificativas={[]}
              versaoFrequencias={0}
              onFrequenciasMudaram={async () => {}}
              onPendencia={() => {}}
            />
          </main>
        ) : (
          <TelaLogin urlIndiceAgentes="/llms.txt" />
        )}
      </ProvedorNextThemes>
    </LocalizationProvider>
  </ThemeProvider>,
);
