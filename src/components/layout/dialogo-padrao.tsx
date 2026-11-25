"use client";

// Diálogo padrão com título, descrição, alerta, conteúdo, ações e fechamento.
import { useId, type ReactNode } from "react";
import CloseIcon from "@mui/icons-material/Close";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import { useTheme } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";

export type TamanhoDialogo = "pequeno" | "medio" | "grande";

interface DialogoPadraoProps {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  alerta?: ReactNode;
  tamanho?: TamanhoDialogo;
  children: ReactNode;
}

export function DialogoPadrao({
  aberto,
  onFechar,
  titulo,
  descricao,
  acoes,
  alerta,
  tamanho = "medio",
  children,
}: DialogoPadraoProps) {
  const tituloId = useId();
  const descricaoId = useId();
  const tema = useTheme();
  const telaPequena = useMediaQuery(tema.breakpoints.down("sm"));

  return (
    <Dialog
      open={aberto}
      onClose={onFechar}
      fullWidth
      fullScreen={tamanho === "grande" && telaPequena}
      scroll="paper"
      aria-labelledby={tituloId}
      aria-describedby={descricao ? descricaoId : undefined}
      role={alerta ? "alertdialog" : "dialog"}
      disableEnforceFocus={false}
      disableRestoreFocus={false}
    >
      <DialogTitle
        id={tituloId}
        sx={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Stack component="span" sx={{ minWidth: 0 }}>
          {titulo}
        </Stack>
        <IconButton aria-label="Fechar" size="small" onClick={onFechar} sx={{ flexShrink: 0 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {alerta}
          {descricao ? <DialogContentText id={descricaoId}>{descricao}</DialogContentText> : null}
          {children}
        </Stack>
      </DialogContent>
      {acoes ? <DialogActions>{acoes}</DialogActions> : null}
    </Dialog>
  );
}
