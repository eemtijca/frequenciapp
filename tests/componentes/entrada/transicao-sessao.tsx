// Monta as telas reais; o adaptador de rota separa refresh e entrega do destino.
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DestinoSessao, ProvedorTransicaoSessao } from "@/components/entrada/transicao-sessao";
import TelaLogin from "@/components/entrada/tela-login";
import AplicacaoDiretor from "@/components/diretor/aplicacao-diretor";
import SecaoFilaPlanilha from "@/components/gestao/planilhas/secao-fila-planilha";
import RegistroPwa from "@/components/pwa/registro-pwa";
import { ProvedorAvisos } from "@/components/ui/mui/avisos";
import { useAvisosDaSessao } from "@/lib/avisos";
import { ProvedorTema } from "@/theme/provedor-tema";

const raiz = document.getElementById("root");
if (!raiz) throw new Error("Raiz da fixture ausente");
const parametros = new URLSearchParams(location.search);
const diretor = {
  id: "diretor-teste",
  nome: "Diretor de teste",
  email: "diretor-teste",
  papel: "DIRETOR_TURMA",
  ativo: true,
} as const;

function AvisoPrivadoDaFixture() {
  const { publicarAviso } = useAvisosDaSessao();
  useEffect(() => {
    const aviso = () =>
      publicarAviso({
        severidade: "error",
        titulo: "Aviso privado sintético.",
        tentarDeNovo: () => {
          document.documentElement.dataset.acaoPrivada = "executada";
        },
      });
    window.addEventListener("fixture-aviso-privado", aviso);
    return () => window.removeEventListener("fixture-aviso-privado", aviso);
  }, [publicarAviso]);
  return null;
}

function RotaControlada() {
  const [autenticada, setAutenticada] = useState(parametros.has("autenticada"));
  useEffect(() => {
    const entrada = () => setAutenticada(false);
    const painel = () => setAutenticada(true);
    window.addEventListener("fixture-entrada", entrada);
    window.addEventListener("fixture-painel", painel);
    return () => {
      window.removeEventListener("fixture-entrada", entrada);
      window.removeEventListener("fixture-painel", painel);
    };
  }, []);
  return autenticada ? (
    <DestinoSessao usuarioId={diretor.id}>
      <AvisoPrivadoDaFixture />
      <AplicacaoDiretor
        usuario={diretor}
        fuso="America/Fortaleza"
        contexto={{
          trocaObrigatoria: false,
          turmas: parametros.has("com-turma")
            ? [{ turmaId: "qa", turma: "Turma sintética", inicio: "2026-11-01", fim: null }]
            : [],
          categorias: ["faltas"],
          limiteRiscoPercentual: 60,
          diaCorrente: "2026-11-23",
        }}
      />
      {parametros.has("com-fila") && <SecaoFilaPlanilha />}
    </DestinoSessao>
  ) : (
    <DestinoSessao>
      <TelaLogin urlIndiceAgentes="/llms.txt" />
    </DestinoSessao>
  );
}

const semNavegacao = () => {
  throw new Error("Navegação inesperada na fixture");
};
const arvore = (
  <ProvedorTema>
    <AppRouterContext.Provider
      value={{
        bfcacheId: "fixture-sessao",
        back: semNavegacao,
        forward: semNavegacao,
        push: semNavegacao,
        replace: semNavegacao,
        prefetch: semNavegacao,
        refresh: () => window.dispatchEvent(new Event("fixture-refresh")),
      }}
    >
      <ProvedorTransicaoSessao>
        <RotaControlada />
      </ProvedorTransicaoSessao>
      <ProvedorAvisos />
      {parametros.has("com-fila") && <RegistroPwa />}
    </AppRouterContext.Provider>
  </ProvedorTema>
);
createRoot(raiz).render(parametros.has("strict") ? <StrictMode>{arvore}</StrictMode> : arvore);
