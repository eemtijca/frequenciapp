"use client";

// Isola falhas no download de gráficos para preservar os controles e registros da tela.
import { Component, type ReactNode } from "react";
import Box from "@mui/material/Box";

export default class LimiteErroGrafico extends Component<
  { children: ReactNode },
  { falhou: boolean }
> {
  state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  render() {
    if (this.state.falhou)
      return (
        <Box
          component="p"
          role="alert"
          sx={{
            m: 0,
            border: 1,
            borderStyle: "dashed",
            borderColor: "divider",
            borderRadius: 2,
            p: 3,
            textAlign: "center",
            typography: "body2",
            color: "text.secondary",
          }}
        >
          Não foi possível carregar o gráfico. Confira a conexão.
        </Box>
      );
    return this.props.children;
  }
}
