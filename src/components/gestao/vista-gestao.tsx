"use client";

// Gestão: área do administrador. Séries, turmas, alunos, equipe e
// configurações em abas curtas.
import { GraduationCap, ListChecks, School, Settings2, Users } from "lucide-react";
import type {
  Aluno,
  Configuracoes,
  JustificativaConfigurada,
  Serie,
  Turma,
} from "@/domain/frequencia";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import AbaSeries from "@/components/gestao/aba-series";
import AbaTurmas from "@/components/gestao/aba-turmas";
import AbaAlunos from "@/components/gestao/aba-alunos";
import AbaEquipe from "@/components/gestao/aba-equipe";
import AbaConfiguracoes from "@/components/gestao/aba-configuracoes";

export type Aba = "series" | "turmas" | "alunos" | "equipe" | "configuracoes";

interface Props {
  usuarioId: string;
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  configuracoes: Configuracoes;
  justificativas: JustificativaConfigurada[];
  diaCorrente: string;
  onSeriesMudaram: () => Promise<void>;
  onTurmasMudaram: () => Promise<void>;
  onAlunosMudaram: () => Promise<void>;
  onConfiguracoesMudaram: (configuracoes: Configuracoes) => void;
  onJustificativasMudaram: () => Promise<void>;
}

const ABAS: AbaItem<Aba>[] = [
  { valor: "series", rotulo: "Séries", icone: GraduationCap },
  { valor: "turmas", rotulo: "Turmas", icone: School },
  { valor: "alunos", rotulo: "Alunos", icone: ListChecks },
  { valor: "equipe", rotulo: "Equipe", icone: Users },
  { valor: "configuracoes", rotulo: "Configurações", rotuloCurto: "Config.", icone: Settings2 },
];

export default function VistaGestao({
  usuarioId,
  series,
  turmas,
  alunos,
  configuracoes,
  justificativas,
  diaCorrente,
  onSeriesMudaram,
  onTurmasMudaram,
  onAlunosMudaram,
  onConfiguracoesMudaram,
  onJustificativasMudaram,
}: Props) {
  return (
    <section aria-label="Gestão da escola" className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Gestão</h1>
        <p className="text-muted-foreground text-sm">
          Séries, turmas, alunos, equipe e recursos da escola.
        </p>
      </div>

      <AbasDeslizantes
        rotuloAcessivel="Áreas de gestão"
        abaInicial="series"
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
            {aba === "configuracoes" && (
              <AbaConfiguracoes
                configuracoes={configuracoes}
                justificativas={justificativas}
                turmas={turmas}
                diaCorrente={diaCorrente}
                onMudanca={onConfiguracoesMudaram}
                onJustificativasMudaram={onJustificativasMudaram}
              />
            )}
          </>
        )}
      </AbasDeslizantes>
    </section>
  );
}
