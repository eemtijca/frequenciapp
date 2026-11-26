"use client";

// Carregamento inicial da rota; uma transição de sessão tem apresentação própria.
import { EsqueletoAplicacao } from "@/components/entrada/esqueleto-aplicacao";
import { useAtualizacaoDeSessaoEmCurso } from "@/components/entrada/transicao-sessao";

export default function Carregando() {
  return useAtualizacaoDeSessaoEmCurso() ? null : <EsqueletoAplicacao />;
}
