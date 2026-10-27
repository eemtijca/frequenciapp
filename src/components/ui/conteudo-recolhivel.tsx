"use client";

// Preserva a altura e o foco durante a expansão e o recolhimento.

import { Component, createRef, type ComponentProps } from "react";
import * as Collapsible from "@radix-ui/react-collapsible";

type Props = ComponentProps<typeof Collapsible.Content> & { aberto: boolean };

// O snapshot é colhido antes de React trocar data-state, portanto captura também
// uma altura intermediária, sem manter o conteúdo montado após a saída do Radix.
export class ConteudoRecolhivel extends Component<Props> {
  private conteudo = createRef<HTMLDivElement>();

  getSnapshotBeforeUpdate(anterior: Props) {
    if (anterior.aberto === this.props.aberto || !this.conteudo.current) return null;
    const el = this.conteudo.current;
    return {
      altura: el.getBoundingClientRect().height,
      gatilho: el.contains(document.activeElement)
        ? document.querySelector<HTMLButtonElement>(`[aria-controls="${CSS.escape(el.id)}"]`)
        : null,
    };
  }

  componentDidUpdate(
    _anterior: Props,
    _estado: unknown,
    snapshot: { altura: number; gatilho: HTMLButtonElement | null } | null,
  ) {
    const el = this.conteudo.current;
    if (!el || !snapshot) return;
    el.style.setProperty("--altura-recolhivel-inicial", `${snapshot.altura}px`);
    if (!this.props.aberto) snapshot.gatilho?.focus();
  }

  render() {
    const { aberto, ...props } = this.props;
    return <Collapsible.Content {...props} ref={this.conteudo} inert={!aberto} />;
  }
}
