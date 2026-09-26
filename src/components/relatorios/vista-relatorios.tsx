"use client";

// Relatórios em sub-abas: Histórico, Grade e Por aluno.
import { History, Table2, UserRound } from "lucide-react";
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

export type AbaRelatorio = "historico" | "grade" | "aluno";

interface Props {
  abaInicial?: AbaRelatorio;
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
  rotuloTurma: (id: string) => string;
  onMes: (mes: string) => void;
  onAbrir: (dia: string, turmaId: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
}

const ABAS: AbaItem<AbaRelatorio>[] = [
  { valor: "historico", rotulo: "Histórico", icone: History },
  { valor: "grade", rotulo: "Grade", icone: Table2 },
  { valor: "aluno", rotulo: "Por aluno", icone: UserRound },
];

export default function VistaRelatorios({
  abaInicial,
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
        <p className="text-muted-foreground text-sm">
          Histórico das chamadas, grade por período e relatório por aluno.
        </p>
      </div>

      <AbasDeslizantes
        rotuloAcessivel="Relatórios"
        abaInicial={inicial}
        abas={ABAS}
        chaveIndicador="indicador-relatorio"
        dataPager="relatorios"
      >
        {(aba, ativa) => (
          <>
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
                aberto={ativa}
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
          </>
        )}
      </AbasDeslizantes>
    </section>
  );
}
