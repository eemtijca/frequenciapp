"use client";

// Tabela padrão com legenda, rolagem, primeira coluna fixa opcional e números alinhados à direita.
import { useRef, type DragEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import { TOKENS_LAYOUT } from "@/theme/layout";

interface TabelaPadraoProps {
  caption?: string;
  children: ReactNode;
  primeiraColunaFixa?: boolean;
  compacta?: boolean;
  /** A tabela ocupa a largura do conteúdo; o contêiner continua limitando a rolagem. */
  larguraIntrinseca?: boolean;
  /** Nome da região rolável; quando definido, inclui o contêiner na navegação por Tab. */
  rotuloRolagem?: string;
  arrastarHorizontalComMouse?: boolean;
}

const LIMIAR_ARRASTE = 6;
const CONTROLES =
  "a, button, input, select, textarea, label, summary, [contenteditable], [tabindex], [role='button'], [role='link']";

export function TabelaPadrao({
  caption,
  children,
  primeiraColunaFixa = false,
  compacta = false,
  larguraIntrinseca = false,
  rotuloRolagem,
  arrastarHorizontalComMouse = false,
}: TabelaPadraoProps) {
  const gesto = useRef<{
    id: number;
    x: number;
    y: number;
    ativo: boolean;
  } | null>(null);
  const suprimirClique = useRef(false);

  function prepararArraste(evento: PointerEvent<HTMLDivElement>) {
    suprimirClique.current = false;
    const { currentTarget: regiao, target } = evento;
    if (
      evento.pointerType !== "mouse" ||
      evento.button !== 0 ||
      evento.altKey ||
      evento.ctrlKey ||
      evento.metaKey ||
      evento.shiftKey ||
      regiao.scrollWidth <= regiao.clientWidth ||
      !(target instanceof Element)
    )
      return;

    const tabela = target.closest("table");
    const controle = target.closest(CONTROLES);
    // A barra nativa está fora da tabela; não capturar seus gestos nem os de controles.
    if (!tabela || !regiao.contains(tabela) || (controle && tabela.contains(controle))) return;
    gesto.current = {
      id: evento.pointerId,
      x: evento.clientX,
      y: evento.clientY,
      ativo: false,
    };
  }

  function encerrarArraste(evento: PointerEvent<HTMLDivElement>) {
    const atual = gesto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    gesto.current = null;
    if (!atual.ativo) return;
    const regiao = evento.currentTarget;
    regiao.removeAttribute("data-arrastando");
    suprimirClique.current = evento.type === "pointerup" || evento.type === "pointermove";
    // Soltar o botão principal com outro ainda pressionado pode não emitir pointerup.
    if (regiao.hasPointerCapture(atual.id)) regiao.releasePointerCapture(atual.id);
  }

  function moverArraste(evento: PointerEvent<HTMLDivElement>) {
    const atual = gesto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    if ((evento.buttons & 1) === 0) {
      encerrarArraste(evento);
      return;
    }
    const dx = evento.clientX - atual.x;
    const dy = evento.clientY - atual.y;
    const regiao = evento.currentTarget;
    if (!atual.ativo) {
      if (Math.abs(dy) >= LIMIAR_ARRASTE && Math.abs(dy) >= Math.abs(dx)) {
        gesto.current = null;
        return;
      }
      if (Math.abs(dx) < LIMIAR_ARRASTE) return;
      // Só captura depois de distinguir o arraste de um clique ou gesto vertical.
      regiao.setPointerCapture(evento.pointerId);
      atual.ativo = true;
      regiao.setAttribute("data-arrastando", "");
      const selecao = regiao.ownerDocument.getSelection();
      if (selecao?.anchorNode && regiao.contains(selecao.anchorNode)) selecao.removeAllRanges();
    }
    evento.preventDefault();
    // A rolagem real já respeita os limites; a sobra não deve atrasar a inversão.
    regiao.scrollLeft -= dx;
    atual.x = evento.clientX;
  }

  return (
    <TableContainer
      component={Paper}
      variant={compacta ? "elevation" : "outlined"}
      role={rotuloRolagem ? "region" : undefined}
      aria-label={rotuloRolagem}
      tabIndex={rotuloRolagem ? 0 : undefined}
      {...(arrastarHorizontalComMouse && {
        onPointerDown: prepararArraste,
        onPointerMove: moverArraste,
        onPointerUp: encerrarArraste,
        onPointerCancel: encerrarArraste,
        onLostPointerCapture: encerrarArraste,
        onPointerLeave: (evento: PointerEvent<HTMLDivElement>) => {
          if (!gesto.current?.ativo) encerrarArraste(evento);
        },
        onDragStart: (evento: DragEvent<HTMLDivElement>) => {
          if (gesto.current) evento.preventDefault();
        },
        onClickCapture: (evento: MouseEvent<HTMLDivElement>) => {
          if (!suprimirClique.current || evento.detail === 0) return;
          suprimirClique.current = false;
          evento.preventDefault();
          evento.stopPropagation();
        },
      })}
      sx={(tema) => ({
        width: "100%",
        overflowX: "auto",
        boxShadow: "none",
        ...(arrastarHorizontalComMouse && {
          "&[data-arrastando]": { cursor: "grabbing", userSelect: "none" },
        }),
        ...(rotuloRolagem && {
          "&:focus-visible": {
            outline: `${TOKENS_LAYOUT.campo.foco}px solid ${tema.vars.palette.primary.main}`,
            outlineOffset: 2,
          },
        }),
      })}
    >
      <Table
        aria-label={caption ? undefined : "Tabela de dados"}
        size={compacta ? "small" : "medium"}
        sx={(tema) => ({
          ...(larguraIntrinseca && { width: "max-content" }),
          ...(compacta && {
            tableLayout: "fixed",
            "& .MuiTableCell-root": { px: 0.5, whiteSpace: "normal", overflowWrap: "anywhere" },
            "& .MuiTableCell-head": { height: "auto", typography: "caption", fontWeight: 600 },
            "& .MuiTableRow-root:last-child .MuiTableCell-body": { borderBottom: 0 },
          }),
          "& .MuiTableCell-root.MuiTableCell-alignRight, & .MuiTableCell-root[data-numero='true']":
            {
              textAlign: "right",
              fontVariantNumeric: "tabular-nums",
            },
          ...(primeiraColunaFixa
            ? {
                "& .MuiTableCell-root:first-of-type": {
                  position: "sticky",
                  left: 0,
                  zIndex: 2,
                  backgroundColor: tema.vars.palette.background.paper,
                },
                "& .MuiTableHead .MuiTableCell-root:first-of-type": {
                  zIndex: 3,
                },
              }
            : {}),
        })}
      >
        {caption ? (
          <Box
            component="caption"
            sx={{
              captionSide: "bottom",
              p: compacta ? 0.5 : 2,
              color: "text.secondary",
              typography: compacta ? "caption" : "body2",
            }}
          >
            {caption}
          </Box>
        ) : null}
        {children}
      </Table>
    </TableContainer>
  );
}
