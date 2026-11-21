"use client";

// Painéis com puxadores de toque, arraste, tamanho e alternativas completas por teclado.
import { useRef, type CSSProperties, type PointerEvent as EventoPonteiro } from "react";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import ArrowUpwardRoundedIcon from "@mui/icons-material/ArrowUpwardRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import DragIndicatorRoundedIcon from "@mui/icons-material/DragIndicatorRounded";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { TOKENS_LAYOUT } from "@/theme/layout";
import { CartaoGrafico, type CalcularBi, type ConfirmarExportacaoBi } from "./cartao-grafico";
import type { GraficoBi, PontoBi } from "@/domain/bi-analise";
import type { PainelBi } from "@/domain/bi-personalizacao";
import type { LinhaBi, RecursoBi } from "@/domain/bi";
import type { RecorteBi } from "@/domain/bi-recortes";
const LINHAS_VAZIAS: LinhaBi[] = [];
const ALVO = { width: TOKENS_LAYOUT.alvoToque, height: TOKENS_LAYOUT.alvoToque } as const;
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
    e: EventoPonteiro<HTMLButtonElement>,
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
  const acompanhar = (e: EventoPonteiro<HTMLButtonElement>) => {
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
  const terminar = (e: EventoPonteiro<HTMLButtonElement>, cancelado = false) => {
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
    <Box
      ref={grade}
      role="group"
      aria-label="Gráficos do painel"
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "minmax(0, 1fr)", md: "repeat(12, minmax(0, 1fr))" },
        gap: 2,
        "@media print": { display: "block" },
      }}
    >
      {graficos.map(({ grafico: g, recorte }, i) => (
        <Box
          key={g.id}
          data-painel-item={g.id}
          style={{ "--largura": g.largura, "--altura": `${g.altura}px` } as CSSProperties}
          sx={{
            minWidth: 0,
            minHeight: "var(--altura, 360px)",
            gridColumn: { xs: "auto", md: "span var(--largura, 6)" },
            "@media print": { breakInside: "avoid", mb: 2, minHeight: 0 },
          }}
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
              <Stack
                direction="row"
                useFlexGap
                spacing={0.5}
                data-acoes-grafico
                sx={{ flexWrap: "wrap", "@media print": { display: "none" } }}
              >
                <BotaoIcone
                  rotulo={`Mover ${g.titulo}`}
                  title="Arrastar ou usar as setas do teclado"
                  icone={<DragIndicatorRoundedIcon />}
                  variante="texto"
                  sx={{ ...ALVO, touchAction: "none", cursor: "grab" }}
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
                />
                <BotaoIcone
                  rotulo={`Subir ${g.titulo}`}
                  icone={<ArrowUpwardRoundedIcon />}
                  variante="texto"
                  disabled={!i}
                  sx={ALVO}
                  onClick={() => mover(g.id, i - 1)}
                />
                <BotaoIcone
                  rotulo={`Descer ${g.titulo}`}
                  icone={<ArrowDownwardRoundedIcon />}
                  variante="texto"
                  disabled={i === painel.graficos.length - 1}
                  sx={ALVO}
                  onClick={() => mover(g.id, i + 1)}
                />
                <BotaoIcone
                  rotulo={`Redimensionar ${g.titulo}`}
                  title="Arrastar; setas alteram largura e altura"
                  icone={<OpenInFullRoundedIcon />}
                  variante="texto"
                  sx={{ ...ALVO, touchAction: "none", cursor: "nwse-resize" }}
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
                />
                <Botao
                  variante="secundario"
                  tamanho="pequeno"
                  sx={{ height: 48 }}
                  onClick={() => onEditar(g)}
                >
                  Editar
                </Botao>
                <BotaoIcone
                  rotulo={`Duplicar ${g.titulo}`}
                  icone={<ContentCopyRoundedIcon />}
                  variante="texto"
                  disabled={painel.graficos.length >= 40}
                  sx={ALVO}
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
                />
                <BotaoIcone
                  rotulo={`Excluir ${g.titulo}`}
                  icone={<DeleteOutlineRoundedIcon />}
                  variante="destrutivo"
                  sx={ALVO}
                  onClick={() =>
                    onAlterar({
                      ...painel,
                      graficos: painel.graficos.filter((v) => v.id !== g.id),
                    })
                  }
                />
              </Stack>
            }
          />
        </Box>
      ))}
    </Box>
  );
}
