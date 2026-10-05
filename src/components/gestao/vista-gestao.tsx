"use client";

// Gestão: área do administrador. Séries, turmas, alunos, equipe, diretores
// de turma e configurações em abas curtas.
import { GraduationCap, ListChecks, School, Settings2, UserRoundCheck, Users } from "lucide-react";
import type {
  Aluno,
  Configuracoes,
  JustificativaConfigurada,
  LiberadorConfigurado,
  Serie,
  Turma,
} from "@/domain/frequencia";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import AbaSeries from "@/components/gestao/aba-series";
import AbaTurmas from "@/components/gestao/aba-turmas";
import AbaAlunos from "@/components/gestao/aba-alunos";
import AbaEquipe from "@/components/gestao/aba-equipe";
import AbaDiretores from "@/components/gestao/aba-diretores";
import AbaConfiguracoes from "@/components/gestao/aba-configuracoes";

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
  onSeriesMudaram: () => Promise<void>;
  onTurmasMudaram: () => Promise<void>;
  onAlunosMudaram: () => Promise<void>;
  onConfiguracoesMudaram: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
  onLiberadoresMudaram: () => Promise<void>;
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
  onSeriesMudaram,
  onTurmasMudaram,
  onAlunosMudaram,
  onConfiguracoesMudaram,
  onJustificativasMudaram,
  onLiberadoresMudaram,
  onAbrirSaidas,
  onAbrirParcial,
}: Props) {
  return (
    <section aria-label="Gestão da escola" className="flex flex-col gap-4 pb-6">
      <h1 className="sr-only">Gestão</h1>

      <AbasDeslizantes
        rotuloAcessivel="Áreas de gestão"
        abaInicial={abaInicial}
        abas={ABAS}
        chaveIndicador="indicador-aba"
        dataPager="gestao"
      >
        {(aba) => (
          <>
            {aba === "series" && <AbaSeries series={series} onMudanca={onSeriesMudaram} />}
            {aba === "turmas" && (
              <AbaTurmas series={series} turmas={turmas} onMudanca={onTurmasMudaram} />
            )}
            {aba === "alunos" && (
              <AbaAlunos turmas={turmas} alunos={alunos} onMudanca={onAlunosMudaram} />
            )}
            {aba === "equipe" && <AbaEquipe usuarioId={usuarioId} onMudanca={onTurmasMudaram} />}
            {aba === "diretores" && <AbaDiretores turmas={turmas} diaCorrente={diaCorrente} />}
            {aba === "configuracoes" && (
              <AbaConfiguracoes
                planilhaInicial={planilhaInicial}
                configuracoes={configuracoes}
                series={series}
                justificativas={justificativas}
                liberadores={liberadores}
                turmas={turmas}
                diaCorrente={diaCorrente}
                onMudanca={onConfiguracoesMudaram}
                onJustificativasMudaram={onJustificativasMudaram}
                onLiberadoresMudaram={onLiberadoresMudaram}
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
