"use client";

// Relatórios em cinco sub-abas: resumo, histórico, grade, por aluno e movimentações.
import { useState } from "react";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import InsightsRoundedIcon from "@mui/icons-material/InsightsRounded";
import PersonRoundedIcon from "@mui/icons-material/PersonRounded";
import SwapHorizRoundedIcon from "@mui/icons-material/SwapHorizRounded";
import TableViewRoundedIcon from "@mui/icons-material/TableViewRounded";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type {
  Aluno,
  Frequencia,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import { Abas, type ItemAba } from "@/components/ui/mui/abas";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { ProvedorVisibilidadeGraficos } from "@/components/graficos/visibilidade-graficos";
import VistaHistorico from "@/components/relatorios/historico/vista-historico";
import VistaGrade from "@/components/grade/vista-grade";
import PorAluno from "@/components/relatorios/por-aluno";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

export type AbaRelatorio = "resumo" | "historico" | "grade" | "aluno" | "movimentacoes";

interface Props {
  abaInicial?: AbaRelatorio;
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
  versao: number;
  bloqueado: boolean;
  carregando?: boolean;
  erro?: string | null;
  rotuloTurma: (id: string) => string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

const ABAS: AbaRelatorio[] = ["resumo", "historico", "grade", "aluno", "movimentacoes"];

export default function VistaRelatorios({
  abaInicial,
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
  versao,
  bloqueado,
  carregando = false,
  erro = null,
  rotuloTurma,
  onMes,
  onAbrir,
  onRecarregar,
}: Props) {
  const [aba, setAba] = useState<AbaRelatorio>(() =>
    abaInicial && ABAS.includes(abaInicial) ? abaInicial : "resumo",
  );
  const [atualizacao, setAtualizacao] = useState(0);
  useAtualizacaoTela("relatorios", async () => {
    await onRecarregar(mes);
    setAtualizacao((valor) => valor + 1);
  });

  const itens: ItemAba<AbaRelatorio>[] = [
    {
      valor: "resumo",
      rotulo: "Resumo",
      icone: <InsightsRoundedIcon />,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={aba === "resumo"}>
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
      valor: "historico",
      rotulo: "Histórico",
      icone: <HistoryRoundedIcon />,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={aba === "historico"}>
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
      valor: "grade",
      rotulo: "Grade",
      icone: <TableViewRoundedIcon />,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={aba === "grade"}>
          <VistaGrade
            alunos={alunos}
            frequencias={frequencias}
            resumo={resumo}
            mes={mes}
            mesCorrente={mesCorrente}
            hoje={diaCorrente}
            aberto={ativo && aba === "grade"}
            versao={versao}
            atualizacao={atualizacao}
            origens={turmas}
            onMes={onMes}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
    {
      valor: "aluno",
      rotulo: "Por aluno",
      icone: <PersonRoundedIcon />,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={aba === "aluno"}>
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
      valor: "movimentacoes",
      rotulo: "Saídas e Entradas",
      icone: <SwapHorizRoundedIcon />,
      conteudo: (
        <ProvedorVisibilidadeGraficos visivel={aba === "movimentacoes"}>
          <VistaMovimentacoes
            hoje={diaCorrente}
            turmas={turmas}
            alunos={alunos}
            ativa={ativo && aba === "movimentacoes"}
            atualizacao={atualizacao}
          />
        </ProvedorVisibilidadeGraficos>
      ),
    },
  ];

  return (
    <Box
      component="section"
      aria-label="Relatórios"
      sx={{ display: "flex", flexDirection: "column", gap: 2, pb: 3, minWidth: 0 }}
    >
      <Typography
        component="h1"
        sx={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        Relatórios
      </Typography>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <AtualizadoDaVisao fuso={fuso} />
      </Box>
      <Abas
        itens={itens}
        ativo={aba}
        onChange={setAba}
        rotuloAcessivel="Relatórios"
        dataPager="relatorios"
      />
    </Box>
  );
}
