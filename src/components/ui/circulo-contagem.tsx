// Círculo de contagem: valor e sigla (F, FJ ou S) do acumulado e dos relatórios.
import { cn } from "@/lib/utils";

type TomContagem = "falta" | "justificada" | "saida";

interface CirculoContagemProps {
  valor: number;
  sigla: string;
  tom: TomContagem;
  singular: string;
  plural: string;
}

function legendaDe(valor: number, singular: string, plural: string): string {
  return `${valor} ${valor === 1 ? singular : plural}`;
}

/** Um valor dentro de um círculo, com a sigla visível e o nome por extenso no leitor. */
export function CirculoContagem({ valor, sigla, tom, singular, plural }: CirculoContagemProps) {
  const legenda = legendaDe(valor, singular, plural);
  return (
    <span
      title={legenda}
      aria-label={legenda}
      className={cn(
        "numerais-tabulares inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] leading-none font-semibold",
        tom === "falta" && "border-falta/40 bg-falta-fraca text-falta-texto",
        tom === "justificada" && "border-primary/30 bg-primary/10 text-primary",
        tom === "saida" && "bg-secondary text-muted-foreground border-border",
      )}
    >
      <span aria-hidden="true">
        {valor} {sigla}
      </span>
    </span>
  );
}

interface CirculosAcumuladoProps {
  faltas: number;
  justificadas: number;
  saidas?: number;
}

/** Faltas e faltas justificadas lado a lado, com saídas quando o relatório pede. */
export function CirculosAcumulado({ faltas, justificadas, saidas }: CirculosAcumuladoProps) {
  return (
    <span className="inline-flex items-center gap-1">
      <CirculoContagem valor={faltas} sigla="F" tom="falta" singular="falta" plural="faltas" />
      <CirculoContagem
        valor={justificadas}
        sigla="FJ"
        tom="justificada"
        singular="falta justificada"
        plural="faltas justificadas"
      />
      {saidas !== undefined ? (
        <CirculoContagem valor={saidas} sigla="S" tom="saida" singular="saída" plural="saídas" />
      ) : null}
    </span>
  );
}

/** Frase do acumulado para o nome acessível da linha do aluno. */
export function fraseAcumulado(faltas: number, justificadas: number): string {
  return `Acumulado: ${legendaDe(faltas, "falta", "faltas")} e ${legendaDe(justificadas, "justificada", "justificadas")}.`;
}
