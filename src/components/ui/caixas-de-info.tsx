// Informações curtas de um registro em caixas arredondadas, no lugar do ponto entre elas.
import { cn } from "@/lib/utils";

export function CaixasDeInfo({
  partes,
  rotulo,
  className,
}: {
  partes: ReadonlyArray<string | null | undefined | false>;
  rotulo?: string;
  className?: string;
}) {
  const visiveis = partes.filter((parte): parte is string => Boolean(parte));
  if (visiveis.length === 0) return null;
  return (
    <div
      role={rotulo ? "group" : undefined}
      aria-label={rotulo}
      className={cn("flex min-w-0 flex-wrap gap-1.5", className)}
    >
      {visiveis.map((parte, indice) => (
        <span
          key={`${indice}:${parte}`}
          className="bg-muted/40 text-foreground min-w-0 rounded-lg border px-2 py-0.5 text-xs leading-5 wrap-anywhere"
        >
          {parte}
        </span>
      ))}
    </div>
  );
}
