"use client";

// A lista da gaveta assina o nível sem renderizar as visões do aplicativo.
import { useSyncExternalStore, type ReactNode } from "react";
import type { CategoriaConfiguracoes } from "@/components/gestao/destinos-gestao";

type NivelGaveta = "principal" | "gestao" | "configuracoes" | "relatorios";
type FocoNivel = "voltar" | Exclude<NivelGaveta, "principal">;
export type PassoGaveta = { nivel: NivelGaveta; foco?: FocoNivel; sentido?: "entrar" | "voltar" };
type EstadoGaveta = PassoGaveta & { categoria: CategoriaConfiguracoes | null };

export function criarNiveisGaveta(inicial: EstadoGaveta) {
  let compartilhado = inicial;
  let exploracaoMovel: EstadoGaveta | undefined;
  const ouvintes = new Set<() => void>();
  const emitir = () => ouvintes.forEach((ouvinte) => ouvinte());
  return {
    assinar(ouvinte: () => void) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
    lerDesktop: () => compartilhado,
    lerMovel: () => exploracaoMovel ?? compartilhado,
    lerInicial: () => inicial,
    temExploracaoMovel: () => exploracaoMovel !== undefined,
    limparExploracaoMovel() {
      if (!exploracaoMovel) return;
      exploracaoMovel = undefined;
      emitir();
    },
    definir(passo: PassoGaveta, movel = false) {
      if (movel)
        exploracaoMovel = { categoria: (exploracaoMovel ?? compartilhado).categoria, ...passo };
      else compartilhado = { categoria: compartilhado.categoria, ...passo };
      emitir();
    },
    expandir(categoria: CategoriaConfiguracoes | null, movel: boolean) {
      if (movel && exploracaoMovel) exploracaoMovel = { ...exploracaoMovel, categoria };
      else compartilhado = { ...compartilhado, categoria };
      emitir();
    },
  };
}

export function NiveisGaveta({
  niveis,
  movel,
  children,
}: {
  niveis: ReturnType<typeof criarNiveisGaveta>;
  movel: boolean;
  children: (estado: EstadoGaveta) => ReactNode;
}) {
  const estado = useSyncExternalStore(
    niveis.assinar,
    movel ? niveis.lerMovel : niveis.lerDesktop,
    niveis.lerInicial,
  );
  return children(estado);
}
