"use client";

// Gestão: área do administrador. Séries, turmas, alunos, equipe, diretores
// de turma e configurações em abas curtas.
import { GraduationCap, ListChecks, School, Settings2, UserRoundCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import type {
  Aluno,
  Configuracoes,
  JustificativaConfigurada,
  LiberadorConfigurado,
  Serie,
  Turma,
} from "@/domain/frequencia";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import { AtualizadoDaVisao } from "@/components/ui/atualizado-em";
import AbaSeries from "@/components/gestao/abas/aba-series";
import AbaTurmas from "@/components/gestao/abas/aba-turmas";
import AbaAlunos from "@/components/gestao/abas/aba-alunos";
import AbaEquipe from "@/components/gestao/abas/aba-equipe";
import AbaDiretores from "@/components/gestao/abas/aba-diretores";
import AbaConfiguracoes from "@/components/gestao/abas/aba-configuracoes";
import { avisarInfo } from "@/lib/avisos";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

export type Aba = "series" | "turmas" | "alunos" | "equipe" | "diretores" | "configuracoes";

interface Props {
  abaInicial?: Aba;
  planilhaInicial?: "FREQUENCIA" | "SAIDAS" | "PARCIAL";
  usuarioId: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  diaCorrente: string;
  fuso: string;
  onSeriesMudaram: () => Promise<void>;
  onTurmasMudaram: () => Promise<void>;
  onAlunosMudaram: () => Promise<void>;
  onConfiguracoesMudaram: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
  onHorariosMudaram: () => Promise<void> | void;
  onPendenciaHorarios?: (pendente: boolean) => void;
  onPendenciaConfiguracoes?: (pendente: boolean) => void;
  onAbrirSaidas?: () => void;
  onAbrirParcial?: () => void;
}

const ABAS: AbaItem<Aba>[] = [
  { valor: "series", rotulo: "Séries", icone: GraduationCap },
  { valor: "turmas", rotulo: "Turmas", icone: School },
  { valor: "alunos", rotulo: "Alunos", icone: ListChecks },
  { valor: "equipe", rotulo: "Equipe", icone: Users },
  { valor: "diretores", rotulo: "Diretores", rotuloCurto: "Diretores", icone: UserRoundCheck },
  { valor: "configuracoes", rotulo: "Configurações", rotuloCurto: "Config.", icone: Settings2 },
];

export default function VistaGestao({
  abaInicial = "series",
  planilhaInicial,
  usuarioId,
  series,
  turmas,
  alunos,
  configuracoes,
  justificativas,
  liberadores,
  diaCorrente,
  fuso,
  onSeriesMudaram,
  onTurmasMudaram,
  onAlunosMudaram,
  onConfiguracoesMudaram,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onHorariosMudaram,
  onPendenciaHorarios,
  onPendenciaConfiguracoes,
  onAbrirSaidas,
  onAbrirParcial,
}: Props) {
  const [atualizacao, setAtualizacao] = useState(0);
  const [horariosPendentes, setHorariosPendentes] = useState(false);
  const [configPendente, setConfigPendente] = useState(false);

  useEffect(() => {
    onPendenciaHorarios?.(horariosPendentes);
  }, [horariosPendentes, onPendenciaHorarios]);

  useEffect(() => {
    onPendenciaConfiguracoes?.(configPendente);
  }, [configPendente, onPendenciaConfiguracoes]);

  useAtualizacaoTela("gestao", async () => {
    if (horariosPendentes || configPendente) {
      avisarInfo("Salve ou descarte as alterações antes de atualizar.");
      return;
    }
    await Promise.all([
      onTurmasMudaram(),
      onAlunosMudaram(),
      onJustificativasMudaram(),
      onLiberadoresMudaram(),
    ]);
    setAtualizacao((valor) => valor + 1);
  });

  return (
    <section aria-label="Gestão da escola" className="flex flex-col gap-4 pb-6">
      <h1 className="sr-only">Gestão</h1>
      <div className="flex justify-end">
        <AtualizadoDaVisao fuso={fuso} />
      </div>

      <AbasDeslizantes
        rotuloAcessivel="Áreas de gestão"
        abaInicial={abaInicial}
        abas={ABAS}
        dataPager="gestao"
      >
        {(aba) => (
          <>
            {aba === "series" && <AbaSeries series={series} onMudanca={onSeriesMudaram} />}
            {aba === "turmas" && (
              <AbaTurmas
                series={series}
                turmas={turmas}
                onMudanca={onTurmasMudaram}
                onOrdenacao={onAlunosMudaram}
              />
            )}
            {aba === "alunos" && (
              <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />
            )}
            {aba === "equipe" && (
              <AbaEquipe
                usuarioId={usuarioId}
                onMudanca={onTurmasMudaram}
                atualizacao={atualizacao}
              />
            )}
            {aba === "diretores" && (
              <AbaDiretores turmas={turmas} diaCorrente={diaCorrente} atualizacao={atualizacao} />
            )}
            {aba === "configuracoes" && (
              <AbaConfiguracoes
                planilhaInicial={planilhaInicial}
                configuracoes={configuracoes}
                series={series}
                justificativas={justificativas}
                liberadores={liberadores}
                turmas={turmas}
                diaCorrente={diaCorrente}
                fuso={fuso}
                atualizacao={atualizacao}
                onMudanca={onConfiguracoesMudaram}
                onJustificativasMudaram={onJustificativasMudaram}
                onLiberadoresMudaram={onLiberadoresMudaram}
                onHorariosMudaram={onHorariosMudaram}
                onPendenciaHorarios={setHorariosPendentes}
                onPendenciaConfiguracoes={setConfigPendente}
                onAbrirSaidas={onAbrirSaidas}
                onAbrirParcial={onAbrirParcial}
              />
            )}
          </>
        )}
      </AbasDeslizantes>
    </section>
  );
}
