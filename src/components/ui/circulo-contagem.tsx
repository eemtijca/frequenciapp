// Círculos de contagem: valor e sigla (F, FJ ou S) do acumulado e dos relatórios,
// e o círculo neutro que separa números nos gráficos, no lugar de pontos.
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
      role="img"
      title={legenda}
      aria-label={legenda}
      className={cn(
        "numerais-tabulares inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] leading-none font-semibold",
        tom === "falta" && "border-falta/40 bg-falta-fraca text-falta-texto",
        tom === "justificada" &&
          "border-justificada/40 bg-justificada-fraca text-justificada-texto",
        tom === "saida" && "bg-secondary text-muted-foreground border-border",
      )}
    >
      <span aria-hidden="true">
        {valor} {sigla}
      </span>
    </span>
  );
}

interface CirculoValorProps {
  /** Texto visível dentro do círculo, por exemplo 27 ou 35,5%. */
  texto: string;
  /** Leitura por extenso para leitores de tela, por exemplo "27 faltas". */
  rotulo: string;
}

/** Um número isolado em círculo neutro; vários lado a lado se separam sem pontos. */
export function CirculoValor({ texto, rotulo }: CirculoValorProps) {
  return (
    <span
      role="img"
      title={rotulo}
      aria-label={rotulo}
      className="numerais-tabulares bg-secondary text-foreground border-border inline-flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full border px-1.5 text-[11px] leading-none font-semibold"
    >
      <span aria-hidden="true">{texto}</span>
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
  return `Acumulado: ${legendaDe(faltas, "falta", "faltas")} e ${legendaDe(
    justificadas,
    "falta justificada",
    "faltas justificadas",
  )}.`;
}
