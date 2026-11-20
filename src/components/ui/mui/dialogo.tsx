"use client";

// Diálogo modal com título, descrição, alerta, ações, foco contido e retorno de foco.
import { useId, type ReactNode } from "react";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import { RAIOS, TOKENS_LAYOUT } from "@/theme/layout";

export type TamanhoDialogo = "pequeno" | "medio" | "grande";

interface DialogoProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  children: ReactNode;
  acoes?: ReactNode;
  alerta?: ReactNode;
  /** O tamanho grande abre em tela cheia no celular, para formulários longos. */
  tamanho?: TamanhoDialogo;
  /** Força tela cheia no celular independentemente do tamanho. */
  telaCheiaNoCelular?: boolean;
}

export function Dialogo({
  aberto,
  onFechar,
  titulo,
  descricao,
  children,
  acoes,
  alerta,
  tamanho = "medio",
  telaCheiaNoCelular,
}: DialogoProps) {
  const tituloId = useId();
  const descricaoId = useId();
  const tema = useTheme();
  const telaPequena = useMediaQuery(tema.breakpoints.down("sm"));
  const telaCheia = telaPequena && (telaCheiaNoCelular ?? tamanho === "grande");
  const padding = `${TOKENS_LAYOUT.dialogo.padding}px`;

  return (
    <Dialog
      open={aberto}
      onClose={onFechar}
      fullWidth
      fullScreen={telaCheia}
      maxWidth="sm"
      scroll="paper"
      role="dialog"
      aria-labelledby={tituloId}
      aria-describedby={descricao ? descricaoId : undefined}
      disableEnforceFocus={false}
      disableRestoreFocus={false}
      slotProps={{
        paper: {
          sx: {
            maxWidth: telaCheia ? "none" : `${TOKENS_LAYOUT.dialogo.larguraMaxima}px`,
            borderRadius: telaCheia ? 0 : `${RAIOS.dialogo}px`,
          },
        },
      }}
    >
      <DialogTitle
        id={tituloId}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: 2,
          padding,
          paddingBottom: 0,
        }}
      >
        <Box component="span" sx={{ flex: 1, minWidth: 0 }}>
          {titulo}
        </Box>
        <IconButton
          aria-label="Fechar"
          onClick={onFechar}
          sx={{
            flexShrink: 0,
            minWidth: TOKENS_LAYOUT.alvoToque,
            minHeight: TOKENS_LAYOUT.alvoToque,
          }}
        >
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          padding,
        }}
      >
        {alerta}
        {descricao ? (
          <DialogContentText id={descricaoId} component="div">
            {descricao}
          </DialogContentText>
        ) : null}
        {children}
      </DialogContent>
      {acoes ? <DialogActions sx={{ padding, paddingTop: 0 }}>{acoes}</DialogActions> : null}
    </Dialog>
  );
}
