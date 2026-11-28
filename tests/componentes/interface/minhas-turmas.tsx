// Monta o shell real do Diretor sem sessão, roteador do servidor ou banco.
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import AplicacaoDiretor from "@/components/diretor/aplicacao-diretor";
import { ProvedorAvisos } from "@/components/ui/mui/avisos";
import { ProvedorTema } from "@/theme/provedor-tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
const parametros = new URLSearchParams(location.search);
const inicio = "2026-11-03";
const semNavegacao = () => {
  throw new Error("Navegação inesperada na fixture");
};
createRoot(raiz).render(
  <ProvedorTema>
    {parametros.has("controle-legenda") ? (
      <TabelaPadrao caption="Legenda padrão da fixture">
        <tbody>
          <tr>
            <td>Valor da fixture</td>
          </tr>
        </tbody>
      </TabelaPadrao>
    ) : (
      <AppRouterContext.Provider
        value={{
          bfcacheId: "fixture-diretor",
          back: semNavegacao,
          forward: semNavegacao,
          push: semNavegacao,
          replace: semNavegacao,
          prefetch: semNavegacao,
          refresh: () => {
            document.documentElement.dataset.rotaAtualizada = "true";
          },
        }}
      >
        <AplicacaoDiretor
          usuario={{
            id: "diretor-qa",
            nome: parametros.has("longo") ? "Acompanhamento".repeat(6) : "Diretor QA",
            email: "diretor-qa",
            papel: "DIRETOR_TURMA",
            ativo: true,
          }}
          fuso="America/Fortaleza"
          diaCorrente="2026-11-23"
          contexto={{
            trocaObrigatoria: parametros.has("obrigatoria"),
            turmas: parametros.has("sem-turmas")
              ? []
              : [
                  { turmaId: "a", turma: "Ano QA A", inicio, fim: null },
                  { turmaId: "b", turma: "Ano QA B", inicio, fim: null },
                ],
            categorias: ["faltas"],
            limiteRiscoPercentual: 60,
            diaCorrente: "2026-11-23",
          }}
        />
      </AppRouterContext.Provider>
    )}
    <ProvedorAvisos />
  </ProvedorTema>,
);
