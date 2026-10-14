"use client";

// Painéis com puxadores de toque, arraste, tamanho e alternativas completas por teclado.
import { useRef } from "react";
import { GripVertical, MoveDown, MoveUp, Expand, Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CartaoGrafico, type CalcularBi, type ConfirmarExportacaoBi } from "./cartao-grafico";
import type { GraficoBi, PontoBi } from "@/domain/bi-analise";
import type { PainelBi } from "@/domain/bi-personalizacao";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
import type { RecorteBi } from "@/domain/bi-recortes";
import estilos from "./grade-paineis.module.css";
const LINHAS_VAZIAS: LinhaBi[] = [];
export function GradePaineisBi({
  painel,
  onAlterar,
  recortes,
  prepararImpressao = false,
  calcular,
  onFiltrar,
  confirmar,
  onEditar,
}: {
  painel: PainelBi;
  onAlterar: (p: PainelBi) => void;
  recortes: Partial<Record<RecursoBi, RecorteBi>>;
  prepararImpressao?: boolean;
  calcular: CalcularBi;
  onFiltrar: (g: GraficoBi, p: PontoBi) => void;
  confirmar: ConfirmarExportacaoBi;
  onEditar: (g: GraficoBi) => void;
}) {
  const grade = useRef<HTMLDivElement>(null);
  const gesto = useRef<{
    id: string;
    x: number;
    y: number;
    largura: number;
    altura: number;
    modo: "mover" | "tamanho";
    novaLargura: number;
    novaAltura: number;
    movido: boolean;
  } | null>(null);
  function mover(id: string, destino: number) {
    const graficos = [...painel.graficos];
    const indice = graficos.findIndex((g) => g.id === id);
    const [g] = graficos.splice(indice, 1);
    if (g) {
      graficos.splice(Math.max(0, Math.min(graficos.length, destino)), 0, g);
      onAlterar({ ...painel, graficos });
    }
  }
  function alterar(g: GraficoBi) {
    onAlterar({ ...painel, graficos: painel.graficos.map((v) => (v.id === g.id ? g : v)) });
  }
  const iniciar = (
    e: React.PointerEvent<HTMLButtonElement>,
    g: GraficoBi,
    modo: "mover" | "tamanho",
  ) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    gesto.current = {
      id: g.id,
      x: e.clientX,
      y: e.clientY,
      largura: g.largura,
      altura: g.altura,
      modo,
      novaLargura: g.largura,
      novaAltura: g.altura,
      movido: false,
    };
  };
  const acompanhar = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesto.current;
    if (!g) return;
    if (Math.hypot(e.clientX - g.x, e.clientY - g.y) > 8) g.movido = true;
    if (g.modo !== "tamanho") return;
    g.novaLargura = Math.min(
      12,
      Math.max(
        3,
        Math.round(
          g.largura + (e.clientX - g.x) / (Math.max(300, grade.current?.clientWidth ?? 900) / 12),
        ),
      ),
    );
    g.novaAltura = Math.min(900, Math.max(260, g.altura + e.clientY - g.y));
    const item = grade.current?.querySelector<HTMLElement>(
      `[data-painel-item="${CSS.escape(g.id)}"]`,
    );
    item?.style.setProperty("--largura", String(g.novaLargura));
    item?.style.setProperty("--altura", `${g.novaAltura}px`);
  };
  const terminar = (e: React.PointerEvent<HTMLButtonElement>, cancelado = false) => {
    const g = gesto.current;
    gesto.current = null;
    if (!g) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (g.modo === "tamanho") {
      const anterior = painel.graficos.find((v) => v.id === g.id);
      if (anterior) {
        const item = grade.current?.querySelector<HTMLElement>(
          `[data-painel-item="${CSS.escape(g.id)}"]`,
        );
        item?.style.setProperty("--largura", String(cancelado ? anterior.largura : g.novaLargura));
        item?.style.setProperty("--altura", `${cancelado ? anterior.altura : g.novaAltura}px`);
        if (!cancelado)
          alterar({ ...anterior, largura: g.novaLargura, altura: Math.round(g.novaAltura) });
      }
    } else if (!cancelado && g.movido) {
      const alvo = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((el) => el.closest<HTMLElement>("[data-painel-item]"))
        .find((el) => el?.dataset.painelItem !== g.id);
      const destino = painel.graficos.findIndex((v) => v.id === alvo?.dataset.painelItem);
      if (destino >= 0) mover(g.id, destino);
    }
  };
  const graficos = painel.graficos.map((grafico) => ({
    grafico,
    recorte:
      recortes[grafico.recurso] ??
      ({
        disponivel: false,
        motivo: "Base indisponível para esta chave ou recorte.",
      } satisfies RecorteBi),
  }));
  return (
    <div ref={grade} className={estilos.grade} aria-label="Gráficos do painel">
      {graficos.map(({ grafico: g, recorte }, i) => (
        <div
          key={g.id}
          className={estilos.item}
          data-painel-item={g.id}
          style={{ "--largura": g.largura, "--altura": `${g.altura}px` } as React.CSSProperties}
        >
          <CartaoGrafico
            config={g}
            prepararImpressao={prepararImpressao}
            filtros={painel.filtros}
            filtrosDados={recorte.disponivel ? recorte.filtros : painel.filtros}
            linhas={recorte.disponivel ? recorte.linhas : LINHAS_VAZIAS}
            indisponivel={recorte.disponivel ? undefined : recorte.motivo}
            calcular={calcular}
            onFiltrar={onFiltrar}
            confirmar={confirmar}
            acoes={
              <div className="flex flex-wrap gap-1 print:hidden">
                <Button
                  size="icon"
                  variant="ghost"
                  className={estilos.puxador}
                  aria-label={`Mover ${g.titulo}`}
                  title="Arrastar ou usar as setas do teclado"
                  onPointerDown={(e) => iniciar(e, g, "mover")}
                  onPointerMove={acompanhar}
                  onPointerUp={(e) => terminar(e)}
                  onPointerCancel={(e) => terminar(e, true)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                      e.preventDefault();
                      mover(g.id, i - 1);
                    }
                    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                      e.preventDefault();
                      mover(g.id, i + 1);
                    }
                  }}
                >
                  <GripVertical size={16} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Subir ${g.titulo}`}
                  disabled={!i}
                  onClick={() => mover(g.id, i - 1)}
                >
                  <MoveUp size={15} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Descer ${g.titulo}`}
                  disabled={i === painel.graficos.length - 1}
                  onClick={() => mover(g.id, i + 1)}
                >
                  <MoveDown size={15} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className={estilos.redimensionar}
                  aria-label={`Redimensionar ${g.titulo}`}
                  title="Arrastar; setas alteram largura e altura"
                  onPointerDown={(e) => iniciar(e, g, "tamanho")}
                  onPointerMove={acompanhar}
                  onPointerUp={(e) => terminar(e)}
                  onPointerCancel={(e) => terminar(e, true)}
                  onKeyDown={(e) => {
                    const ajuste: Record<string, Partial<GraficoBi>> = {
                      ArrowLeft: { largura: Math.max(3, g.largura - 1) },
                      ArrowRight: { largura: Math.min(12, g.largura + 1) },
                      ArrowUp: { altura: Math.max(260, g.altura - 40) },
                      ArrowDown: { altura: Math.min(900, g.altura + 40) },
                    };
                    if (ajuste[e.key]) {
                      e.preventDefault();
                      alterar({ ...g, ...ajuste[e.key] });
                    }
                  }}
                >
                  <Expand size={15} />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onEditar(g)}>
                  Editar
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Duplicar ${g.titulo}`}
                  disabled={painel.graficos.length >= 40}
                  onClick={() =>
                    onAlterar({
                      ...painel,
                      graficos: [
                        ...painel.graficos,
                        {
                          ...g,
                          id: crypto.randomUUID(),
                          titulo: `${g.titulo.slice(0, 90)} (cópia)`,
                        },
                      ],
                    })
                  }
                >
                  <Copy size={15} />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Excluir ${g.titulo}`}
                  onClick={() =>
                    onAlterar({
                      ...painel,
                      graficos: painel.graficos.filter((v) => v.id !== g.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            }
          />
        </div>
      ))}
    </div>
  );
}
