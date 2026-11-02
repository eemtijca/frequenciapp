// Componentes de produção com dados sintéticos; não há servidor de aplicação nem banco.
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import TelaLogin from "@/components/entrada/tela-login";
import VistaFrequencia from "@/components/chamada/vista-frequencia";
import { CONFIGURACOES_PADRAO } from "@/domain/frequencia";
import "@/app/globals.css";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz ausente");
const data = "2026-11-02";
createRoot(raiz).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    {location.search.includes("chamada") ? (
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
  </ThemeProvider>,
);
