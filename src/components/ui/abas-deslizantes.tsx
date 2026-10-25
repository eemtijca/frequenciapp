"use client";

// Abas com pílula indicadora: troca instantânea por toque, teclado e botões,
// com deslize curto do conteúdo no desktop.
import { useCallback, useRef, useState, type CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

export interface AbaItem<T extends string> {
  valor: T;
  rotulo: string;
  /** Rótulo curto no celular, quando o nome cheio não cabe na aba. */
  rotuloCurto?: string;
  icone: LucideIcon;
}

interface Props<T extends string> {
  rotuloAcessivel: string;
  abaInicial: T;
  abas: AbaItem<T>[];
  dataPager: string;
  /** Bloqueia só a troca de abas, preservando a edição no conteúdo ativo. */
  bloqueada?: boolean;
  /** Avisa a troca de aba (por exemplo, para refletir a aba na URL). */
  aoTrocar?: (aba: T) => void;
  /** Ação ao lado das abas (por exemplo, um botão), na mesma linha. */
  acao?: React.ReactNode;
  children: (aba: T, ativa: boolean) => React.ReactNode;
}

export default function AbasDeslizantes<T extends string>({
  rotuloAcessivel,
  abaInicial,
  abas,
  dataPager,
  bloqueada = false,
  aoTrocar,
  acao,
  children,
}: Props<T>) {
  const [aba, setAba] = useState<T>(abaInicial);
  const [visitadas, setVisitadas] = useState<Set<T>>(() => new Set([abaInicial]));
  const abasRef = useRef<(HTMLButtonElement | null)[]>([]);
  const indiceAtivo = Math.max(
    0,
    abas.findIndex((item) => item.valor === aba),
  );

  const trocarAba = useCallback(
    (proxima: T, focar = false) => {
      if (bloqueada) return;
      const indice = abas.findIndex((item) => item.valor === proxima);
      if (indice < 0) return;
      setAba(proxima);
      aoTrocar?.(proxima);
      setVisitadas((atuais) => (atuais.has(proxima) ? atuais : new Set(atuais).add(proxima)));
      if (focar) abasRef.current[indice]?.focus();
    },
    [abas, aoTrocar, bloqueada],
  );

  function aoTeclar(evento: React.KeyboardEvent) {
    if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;
    evento.preventDefault();
    const indice = abas.findIndex((item) => item.valor === aba);
    const proximo = evento.key === "ArrowRight" ? indice + 1 : indice - 1;
    const item = abas[(proximo + abas.length) % abas.length];
    if (item) trocarAba(item.valor, true);
  }

  return (
    <>
      <div className={acao ? "flex items-stretch gap-2" : undefined}>
        <div
          role="tablist"
          aria-label={rotuloAcessivel}
          onKeyDown={aoTeclar}
          className={`superficie relative grid gap-0.5 p-1 sm:gap-1 ${acao ? "min-w-0 flex-1" : ""}`}
          style={
            {
              gridTemplateColumns: `repeat(${abas.length}, minmax(0, 1fr))`,
              "--aba-indice": indiceAtivo,
            } as CSSProperties
          }
        >
          <span
            aria-hidden="true"
            className="indicador-abas"
            style={{
              width: `calc((100% - 0.5rem - ${Math.max(0, abas.length - 1)} * var(--aba-gap)) / ${abas.length})`,
            }}
          />
          {abas.map((item, indice) => {
            const Icone = item.icone;
            const ativo = aba === item.valor;
            return (
              <button
                key={item.valor}
                ref={(elemento) => {
                  abasRef.current[indice] = elemento;
                }}
                id={`aba-${item.valor}`}
                type="button"
                role="tab"
                aria-label={item.rotuloCurto ? item.rotulo : undefined}
                aria-selected={ativo}
                aria-controls={`painel-${item.valor}`}
                tabIndex={ativo ? 0 : -1}
                disabled={bloqueada}
                onClick={() => trocarAba(item.valor)}
                className={`${ativo ? "" : "discreto"} focus-visible:ring-ring/50 pressionavel relative z-10 flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 px-0 text-[11px] leading-tight font-semibold focus-visible:ring-[3px] focus-visible:outline-none sm:flex-row sm:gap-1.5 sm:px-1 sm:text-xs`}
              >
                <Icone
                  size={15}
                  className={`relative z-10 ${ativo ? "text-primary" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span
                  className={`relative z-10 min-w-0 text-center ${ativo ? "text-foreground" : "text-muted-foreground"}`}
                >
                  {item.rotuloCurto ? (
                    <>
                      <span className="sm:hidden">{item.rotuloCurto}</span>
                      <span className="hidden sm:inline">{item.rotulo}</span>
                    </>
                  ) : (
                    item.rotulo
                  )}
                </span>
              </button>
            );
          })}
        </div>
        {acao}
      </div>

      <div className="min-w-0">
        <div data-pager={dataPager} className="min-w-0">
          {abas.map((item) => {
            const ativo = item.valor === aba;
            if (!ativo && !visitadas.has(item.valor)) return null;
            return (
              <div
                key={item.valor}
                id={`painel-${item.valor}`}
                role="tabpanel"
                aria-labelledby={`aba-${item.valor}`}
                aria-hidden={!ativo}
                inert={!ativo}
                hidden={!ativo}
                className="pagina-painel aba-painel min-w-0"
              >
                {children(item.valor, ativo)}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
