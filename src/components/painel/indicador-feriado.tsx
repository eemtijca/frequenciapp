// Indicador visual compartilhado para feriados nos cartões do Painel.
import { CalendarOff } from "lucide-react";

interface Props {
  nome: string;
}

export function IndicadorFeriado({ nome }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full border sm:size-14">
        <CalendarOff aria-hidden="true" className="size-5" />
      </div>
      <span className="text-muted-foreground text-xs break-words sm:text-sm">{nome}</span>
    </div>
  );
}
