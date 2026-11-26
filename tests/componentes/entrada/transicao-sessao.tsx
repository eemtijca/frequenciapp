// Monta as telas reais; o adaptador de rota separa refresh e entrega do destino.
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { DestinoSessao, ProvedorTransicaoSessao } from "@/components/entrada/transicao-sessao";
import TelaLogin from "@/components/entrada/tela-login";
import AplicacaoDiretor from "@/components/diretor/aplicacao-diretor";
import SecaoFilaPlanilha from "@/components/gestao/planilhas/secao-fila-planilha";
import RegistroPwa from "@/components/pwa/registro-pwa";
import { ProvedorAvisos } from "@/components/ui/mui/avisos";
import { useAvisosDaSessao } from "@/lib/avisos";
import { CONFIGURACOES_PADRAO } from "@/domain/frequencia";
import { ProvedorTema } from "@/theme/provedor-tema";

// Somente a entrada de teste com Chamada precisa carregar o shell completo.
const Aplicacao = lazy(() => import("@/components/aplicacao"));

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
  const [geracao, setGeracao] = useState(
    parametros.has("autenticada")
      ? parametros.has("nova-sessao")
        ? "nova"
        : "original"
      : "entrada",
  );
  useEffect(() => {
    const entrada = () => setGeracao("entrada");
    const painel = () => setGeracao("original");
    const outroPainel = () => setGeracao("nova");
    window.addEventListener("fixture-entrada", entrada);
    window.addEventListener("fixture-painel", painel);
    window.addEventListener("fixture-outro-painel", outroPainel);
    return () => {
      window.removeEventListener("fixture-entrada", entrada);
      window.removeEventListener("fixture-painel", painel);
      window.removeEventListener("fixture-outro-painel", outroPainel);
    };
  }, []);
  if (geracao !== "entrada" && parametros.has("com-chamada")) {
    const usuario = {
      ...diretor,
      papel: "ADMIN" as const,
      id: parametros.has("outra-conta") ? "outra-conta" : "conta-chamada",
    };
    return (
      <DestinoSessao
        usuarioId={usuario.id}
        referenciaSessao={
          parametros.has("sem-referencia") ? undefined : (geracao === "nova" ? "N" : "O").repeat(43)
        }
      >
        <Aplicacao
          usuario={usuario}
          carregadoEm="2026-11-23T12:00:00Z"
          diaCorrente="2026-11-23"
          fuso="America/Fortaleza"
          visaoInicial={parametros.get("visao") ?? undefined}
          seriesIniciais={[{ id: "serie", nome: "1º ano", ordem: 1 }]}
          turmasIniciais={[
            {
              id: "turma",
              nome: "A",
              rotulo: "1º ano A",
              serieId: "serie",
              serieNome: "1º ano",
              horarios: [],
            },
          ]}
          alunosIniciais={[
            {
              id: "aluno",
              nome: "Aluno sintético",
              turmaId: "turma",
              turmaOriginalId: "turma",
              ordem: 1,
              ativo: true,
            },
          ]}
          frequenciasIniciais={[]}
          saidasIniciais={[]}
          justificativasIniciais={[]}
          liberadoresIniciais={[]}
          configuracoesIniciais={CONFIGURACOES_PADRAO}
          resumoInicial={null}
        />
      </DestinoSessao>
    );
  }
  return geracao !== "entrada" ? (
    <DestinoSessao
      usuarioId={diretor.id}
      referenciaSessao={(geracao === "nova" ? "N" : "O").repeat(43)}
    >
      {geracao === "nova" && <p>Painel da nova sessão sintética</p>}
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
        <Suspense fallback={null}>
          <RotaControlada />
        </Suspense>
      </ProvedorTransicaoSessao>
      <ProvedorAvisos />
      {parametros.has("com-fila") && <RegistroPwa />}
    </AppRouterContext.Provider>
  </ProvedorTema>
);
createRoot(raiz).render(parametros.has("strict") ? <StrictMode>{arvore}</StrictMode> : arvore);
