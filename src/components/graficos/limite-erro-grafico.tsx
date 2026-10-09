"use client";

// Isola falhas no download de gráficos para preservar os controles e registros da tela.
import { Component, type ReactNode } from "react";

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
        <p
          role="alert"
          className="text-muted-foreground rounded-2xl border border-dashed p-6 text-center text-sm"
        >
          Não foi possível carregar o gráfico. Confira a conexão.
        </p>
      );
    return this.props.children;
  }
}
