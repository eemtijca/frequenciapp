// Próximas provas bimestrais da turma consultada em Horários, agrupadas por data.
import { CalendarClock, Clock } from "lucide-react";
import { rotuloDataCurta, rotuloDiaSemana } from "@/domain/frequencia";
import {
  provasPorDia,
  proximasProvasDaTurma,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";

interface Props {
  provas: readonly ProvaBimestral[];
  turmaId: string | undefined;
  turmaRotulo: string;
  diaCorrente: string;
}

function rotuloDoDia(dia: string): string {
  const nome = rotuloDiaSemana(dia);
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${rotuloDataCurta(dia)}`;
}

/** Some quando a turma não tem prova de hoje em diante. */
export default function CartaoProvasBimestrais({
  provas,
  turmaId,
  turmaRotulo,
  diaCorrente,
}: Props) {
  const dias = provasPorDia(proximasProvasDaTurma(provas, turmaId, diaCorrente));
  if (dias.length === 0) return null;
  return (
    <section
      aria-label={`Provas bimestrais de ${turmaRotulo}`}
      className="superficie overflow-hidden"
    >
      <h2 className="bg-secondary/50 flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <CalendarClock size={16} aria-hidden="true" className="shrink-0" />
        Provas bimestrais · {turmaRotulo}
      </h2>
      <ol className="divide-y">
        {dias.map((grupo) => (
          <li key={grupo.dia} className="flex flex-col gap-2 px-4 py-3">
            <h3 className="text-sm font-medium">
              {rotuloDoDia(grupo.dia)}
              {grupo.dia === diaCorrente ? (
                <span className="text-muted-foreground font-normal"> · hoje</span>
              ) : null}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {grupo.provas.map((prova) => (
                <li key={prova.id} className="flex min-w-0 items-center gap-3 text-sm">
                  <span className="min-w-0 flex-1 break-words">{prova.disciplina}</span>
                  <span className="numerais-tabulares text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
                    <Clock size={14} aria-hidden="true" className="shrink-0" />
                    {prova.inicio} às {prova.fim}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
