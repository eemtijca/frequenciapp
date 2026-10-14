"use client";

// Mantém a tabela acessível se o gráfico falhar, inclusive sem o módulo visual no cache offline.
import { Component, type ReactNode } from "react";

export class LimiteGrafico extends Component<{ children: ReactNode }, { falhou: boolean }> {
  state = { falhou: false };

  static getDerivedStateFromError() {
    return { falhou: true };
  }

  render() {
    return this.state.falhou ? (
      <p role="note" className="text-muted-foreground p-4 text-sm">
        Gráfico indisponível neste dispositivo. Consulte a tabela ou reabra a tela com conexão.
      </p>
    ) : (
      this.props.children
    );
  }
}
