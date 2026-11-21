"use client";

// Mantém a tabela acessível se o gráfico falhar, inclusive sem o módulo visual no cache offline.
import { Component, type ReactNode } from "react";
import Typography from "@mui/material/Typography";

export class LimiteGrafico extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    return this.state.falhou ? (
      <Typography variant="body2" role="note" sx={{ p: 2, color: "text.secondary" }}>
        Gráfico indisponível neste dispositivo. Consulte a tabela ou reabra a tela com conexão.
      </Typography>
    ) : (
      this.props.children
    );
  }
}
