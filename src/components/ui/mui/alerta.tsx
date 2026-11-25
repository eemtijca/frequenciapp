// Aviso do Material UI com severidade, título, conteúdo e ação opcionais.
import type { ReactNode } from "react";
import Alert, { type AlertProps } from "@mui/material/Alert";
import AlertTitle from "@mui/material/AlertTitle";

export type AlertaProps = Omit<AlertProps, "title" | "severity" | "action" | "className"> & {
  severity?: AlertProps["severity"];
  titulo?: ReactNode;
  acao?: ReactNode;
};

/** Alerta padrão com título opcional e ação alinhada à direita. */
export function Alerta({
  severity = "info",
  titulo,
  children,
  acao,
  closeText = "Fechar",
  ...props
}: AlertaProps) {
  return (
    <Alert severity={severity} action={acao} closeText={closeText} {...props}>
      {titulo ? <AlertTitle>{titulo}</AlertTitle> : null}
      {children}
    </Alert>
  );
}

export { Alerta as Alert };
