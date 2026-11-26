// Monta o shell e a Gestão reais, com rede interceptada e dados fictícios.
import { Suspense } from "react";
import { createRoot } from "react-dom/client";

import Aplicacao from "../../../src/components/aplicacao";
import {
  DestinoSessao,
  ProvedorTransicaoSessao,
} from "../../../src/components/entrada/transicao-sessao";
import { EscopoAvisosDaSessao, ProvedorAvisos } from "../../../src/components/ui/mui/avisos";
import { CONFIGURACOES_PADRAO, type Turma } from "../../../src/domain/frequencia";
import { ProvedorTema } from "../../../src/theme/provedor-tema";

document.documentElement.setAttribute("data-mui-color-scheme", "light");

const turmas: Turma[] = ["A", "B", "C"].map((nome, i) => ({
  id: `turma-${i}`,
  serieId: "serie-1",
  nome,
  rotulo: `1º ano ${nome}`,
  serieNome: "1º ano",
  horarios: [],
}));
const root = document.getElementById("root");
if (!root) throw new Error("Elemento raiz ausente");
const parametros = new URLSearchParams(location.search);
const tela = (
  <Aplicacao
    usuario={{
      id: "teste",
      nome: "Admin teste",
      email: "teste@example.test",
      papel: parametros.has("coordenacao") ? "COORDENACAO" : "ADMIN",
      ativo: true,
    }}
    carregadoEm="2026-03-10T12:00:00.000Z"
    diaCorrente="2026-03-10"
    fuso="America/Sao_Paulo"
    visaoInicial={parametros.get("visao") ?? "gestao"}
    configuracoesIniciais={{ ...CONFIGURACOES_PADRAO, saidaAntecipada: true }}
    justificativasIniciais={[]}
    liberadoresIniciais={[]}
    seriesIniciais={[{ id: "serie-1", nome: "1º ano", ordem: 1 }]}
    turmasIniciais={turmas}
    alunosIniciais={[]}
    frequenciasIniciais={
      parametros.has("historico-com-frequencia")
        ? [
            {
              dia: "2026-03-09",
              turmaId: "turma-1",
              revisao: 1,
              atualizadoEm: "2026-03-09T12:00:00.000Z",
              atualizadoPorNome: null,
              faltas: [],
              alunos: [],
            },
          ]
        : []
    }
    saidasIniciais={[]}
    resumoInicial={null}
  />
);
createRoot(root).render(
  <ProvedorTema>
    <Suspense fallback={<p>Carregando tela de teste</p>}>
      {parametros.has("sessao-teste") ? (
        <ProvedorTransicaoSessao>
          <DestinoSessao usuarioId="teste" referenciaSessao={"G".repeat(43)}>
            {tela}
          </DestinoSessao>
        </ProvedorTransicaoSessao>
      ) : (
        <EscopoAvisosDaSessao autenticado>{tela}</EscopoAvisosDaSessao>
      )}
    </Suspense>
    <ProvedorAvisos />
  </ProvedorTema>,
);
