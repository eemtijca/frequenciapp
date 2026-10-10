"use client";

// Relatórios em sub-abas: frequência, acompanhamento individual e movimentações por turma.
import { ArrowRightLeft, ChartNoAxesCombined, History, Table2, UserRound } from "lucide-react";
import type {
  Aluno,
  Frequencia,
  ResumoAcumulado,
  SaidaAntecipada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import VistaHistorico from "@/components/historico/vista-historico";
import VistaGrade from "@/components/grade/vista-grade";
import PorAluno from "@/components/relatorios/por-aluno";
import ResumoRelatorios from "@/components/relatorios/vista-resumo-relatorios";
import VistaMovimentacoes from "@/components/relatorios/vista-movimentacoes";

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

const ABAS: AbaItem<AbaRelatorio>[] = [
  { valor: "resumo", rotulo: "Resumo", icone: ChartNoAxesCombined },
  { valor: "historico", rotulo: "Histórico", icone: History },
  { valor: "grade", rotulo: "Grade", icone: Table2 },
  { valor: "aluno", rotulo: "Por aluno", icone: UserRound },
  { valor: "movimentacoes", rotulo: "Saídas e entradas", icone: ArrowRightLeft },
];

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
  const inicial = ABAS.some((item) => item.valor === abaInicial)
    ? (abaInicial as AbaRelatorio)
    : "historico";

  return (
    <section aria-label="Relatórios" className="flex flex-col gap-4 pb-6">
      <h1 className="sr-only">Relatórios</h1>

      <AbasDeslizantes
        rotuloAcessivel="Relatórios"
        abaInicial={inicial}
        abas={ABAS}
        chaveIndicador="indicador-relatorio"
        dataPager="relatorios"
      >
        {(aba, ativa) => (
          <>
            {aba === "resumo" && (
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
                onRecarregar={onRecarregar}
              />
            )}
            {aba === "historico" && (
              <VistaHistorico
                frequencias={frequencias}
                turmas={turmas}
                series={series}
                mes={mes}
                mesCorrente={mesCorrente}
                fuso={fuso}
                onMes={onMes}
                onAbrir={onAbrir}
                onRecarregar={onRecarregar}
                bloqueado={bloqueado}
                rotuloTurma={rotuloTurma}
              />
            )}
            {aba === "grade" && (
              <VistaGrade
                alunos={alunos}
                frequencias={frequencias}
                resumo={resumo}
                mes={mes}
                mesCorrente={mesCorrente}
                hoje={diaCorrente}
                aberto={ativo && ativa}
                versao={versao}
                origens={turmas}
                onMes={onMes}
                onRecarregar={async () => {
                  await onRecarregar(mes);
                }}
              />
            )}
            {aba === "aluno" && (
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
                onRecarregar={onRecarregar}
              />
            )}
            {aba === "movimentacoes" && (
              <VistaMovimentacoes
                hoje={diaCorrente}
                turmas={turmas}
                alunos={alunos}
                ativa={ativo && ativa}
              />
            )}
          </>
        )}
      </AbasDeslizantes>
    </section>
  );
}
