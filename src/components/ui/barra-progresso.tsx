// Barra de progresso compartilhada com trilho neutro e leitura acessível.
import { cn } from "@/lib/utils";

type TomBarra = "primary" | "alerta" | "falta";

const TONS: Record<TomBarra, string> = {
  primary: "bg-primary",
  alerta: "bg-alerta",
  falta: "bg-falta",
};

interface Props {
  valor: number;
  max?: number;
  tom?: TomBarra;
  rotulo: string;
  descricao?: string;
  descritoPor?: string;
  testId?: string;
  className?: string;
}

function BarraProgresso({
  valor,
  max = 100,
  tom = "primary",
  rotulo,
  descricao,
  descritoPor,
  testId,
  className,
}: Props) {
  const percentual = max > 0 ? Math.min(100, Math.max(0, (valor / max) * 100)) : 0;
  const texto = descricao ?? `${Math.round(percentual)}%`;

  return (
    <div
      role="progressbar"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percentual)}
      aria-valuetext={texto}
      aria-describedby={descritoPor}
      data-testid={testId ? `${testId}-trilho` : undefined}
      className={cn(
        "h-3 w-full overflow-hidden rounded-full bg-[var(--trilho)] ring-1 ring-[var(--border)] ring-inset",
        className,
      )}
    >
      <div
        aria-hidden="true"
        data-testid={testId}
        className={cn(
          "h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none",
          TONS[tom],
        )}
        style={{ width: `${percentual}%` }}
      />
    </div>
  );
}

export { BarraProgresso };
