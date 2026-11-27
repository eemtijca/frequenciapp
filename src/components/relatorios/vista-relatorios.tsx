"use client";

// Mantém os painéis de Relatórios montados sob a seleção da gaveta.
import { useState } from "react";
import Box from "@mui/material/Box";
import type {
  Aluno,
  Frequencia,
  Justificativa,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { PaineisVisitados } from "@/components/gestao/paineis-visitados";
import type { DestinoRelatorios } from "@/components/relatorios/navegacao-relatorios";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import VistaGrade from "@/components/grade/vista-grade";
import PorAluno from "@/components/relatorios/por-aluno";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

interface Props {
  destino: DestinoRelatorios;
  /** Destinos que o papel pode ler; sem a lista, todos. */
  destinosPermitidos?: readonly DestinoRelatorios[];
  ativo?: boolean;
  mes: string;
  mesCorrente: string;
  diaCorrente: string;
  fuso: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  frequencias: Frequencia[];
  saidas: SaidaAntecipada[];
  resumo: ResumoAcumulado | null;
  justificativas: Justificativa[];
  versao: number;
  bloqueado: boolean;
  carregando?: boolean;
  erro?: string | null;
  rotuloTurma: (id: string) => string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

export default function VistaRelatorios({
  destino,
  destinosPermitidos,
  ativo = true,
  mes,
  mesCorrente,
  diaCorrente,
  fuso,
  series,
  turmas,
  alunos,
  frequencias,
  saidas,
  resumo,
  justificativas,
  versao,
  bloqueado,
  carregando = false,
  erro = null,
  rotuloTurma,
  onMes,
  onAbrir,
  onRecarregar,
}: Props) {
  const [atualizacao, setAtualizacao] = useState(0);
  useAtualizacaoTela("relatorios", async () => {
    await onRecarregar(mes);
    setAtualizacao((valor) => valor + 1);
  });

  const todosOsDestinos = [
    {
      valor: "resumo" as const,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={destino === "resumo"}>
          <ResumoRelatorios
            mes={mes}
            mesCorrente={mesCorrente}
            diaCorrente={diaCorrente}
            series={series}
            turmas={turmas}
            alunos={alunos}
            frequencias={frequencias}
            bloqueado={bloqueado}
            carregando={carregando}
            erro={erro}
            onMes={onMes}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
    {
      valor: "historico" as const,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={destino === "historico"}>
          <VistaHistorico
            frequencias={frequencias}
            turmas={turmas}
            series={series}
            mes={mes}
            mesCorrente={mesCorrente}
            fuso={fuso}
            onMes={onMes}
            onAbrir={onAbrir}
            bloqueado={bloqueado}
            rotuloTurma={rotuloTurma}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
    {
      valor: "grade" as const,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={destino === "grade"}>
          <VistaGrade
            alunos={alunos}
            frequencias={frequencias}
            resumo={resumo}
            mes={mes}
            mesCorrente={mesCorrente}
            hoje={diaCorrente}
            aberto={ativo && destino === "grade"}
            versao={versao}
            atualizacao={atualizacao}
            origens={turmas}
            justificativas={justificativas}
            onMes={onMes}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
    {
      valor: "aluno" as const,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={destino === "aluno"}>
          <PorAluno
            alunos={alunos}
            series={series}
            turmas={turmas}
            frequencias={frequencias}
            saidas={saidas}
            resumo={resumo}
            mes={mes}
            mesCorrente={mesCorrente}
            onMes={onMes}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
    {
      valor: "movimentacoes" as const,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={destino === "movimentacoes"}>
          <VistaMovimentacoes
            hoje={diaCorrente}
            turmas={turmas}
            alunos={alunos}
            ativa={ativo && destino === "movimentacoes"}
            atualizacao={atualizacao}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
  ];
  // Quem só consulta nunca monta os destinos de fora da lista, nem escondidos.
  const itens = destinosPermitidos
    ? todosOsDestinos.filter((item) => destinosPermitidos.includes(item.valor))
    : todosOsDestinos;

  return (
    <Box
      component="section"
      aria-label="Relatórios"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <AtualizadoDaVisao fuso={fuso} />
      </Box>
      <PaineisVisitados itens={itens} ativo={destino} />
    </Box>
  );
}
