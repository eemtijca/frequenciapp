"use client";

// Confirmação modal com alertdialog, ação principal, cancelamento e bloqueio durante a operação.
import { useId, type ReactNode } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import { RAIOS, TOKENS_LAYOUT } from "@/theme/layout";

interface DialogoConfirmacaoProps {
  aberto: boolean;
  titulo: string;
  descricao?: ReactNode;
  onConfirmar: () => void;
  onCancelar: () => void;
  rotuloConfirmar?: string;
  rotuloCancelar?: string;
  destrutivo?: boolean;
  operacaoEmAndamento?: boolean;
}

export function DialogoConfirmacao({
  aberto,
  titulo,
  descricao,
  onConfirmar,
  onCancelar,
  rotuloConfirmar = "Confirmar",
  rotuloCancelar = "Cancelar",
  destrutivo = false,
  operacaoEmAndamento = false,
}: DialogoConfirmacaoProps) {
  const tituloId = useId();
  const descricaoId = useId();
  const padding = `${TOKENS_LAYOUT.dialogo.padding}px`;

  return (
    <Dialog
      open={aberto}
      onClose={(_evento, motivo) => {
        if (operacaoEmAndamento || motivo === "backdropClick") return;
        onCancelar();
      }}
      fullWidth
      maxWidth="sm"
      role="alertdialog"
      aria-labelledby={tituloId}
      aria-describedby={descricao ? descricaoId : undefined}
      disableEnforceFocus={false}
      disableRestoreFocus={false}
      slotProps={{
        paper: {
          "aria-busy": operacaoEmAndamento,
          sx: {
            maxWidth: `${TOKENS_LAYOUT.dialogo.larguraMaxima}px`,
            borderRadius: `${RAIOS.dialogo}px`,
          },
        },
      }}
    >
      <DialogTitle id={tituloId} sx={{ padding, paddingBottom: 0 }}>
        {titulo}
      </DialogTitle>
      <DialogContent sx={{ padding }}>
        {descricao ? (
          <DialogContentText id={descricaoId} component="div">
            {descricao}
          </DialogContentText>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ padding, paddingTop: 0 }}>
        <Button autoFocus onClick={onCancelar} disabled={operacaoEmAndamento}>
          {rotuloCancelar}
        </Button>
        <Button
          variant="contained"
          color={destrutivo ? "error" : "secondary"}
          onClick={onConfirmar}
          disabled={operacaoEmAndamento}
          aria-busy={operacaoEmAndamento}
        >
          {rotuloConfirmar}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
