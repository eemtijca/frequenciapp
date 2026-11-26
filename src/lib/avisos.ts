"use client";

// Avisos padrão da interface: tom único, mensagem clara e ação de repetir.
import { useContext, useMemo } from "react";
import {
  ContextoEscopoAvisos,
  publicarAviso,
  publicarAvisoPublico,
  type EntradaAviso,
} from "@/components/ui/mui/avisos";
import { ErroApi } from "@/lib/api-cliente";

export function mensagemAmigavel(excecao: unknown, alternativa: string): string {
  return excecao instanceof ErroApi ? excecao.message : alternativa;
}

type OpcoesErro = { contexto: string; descricao?: string; tentarDeNovo?: () => void; id?: string };

function criarAvisos(publicar: (entrada: EntradaAviso) => string) {
  return {
    avisarSucesso(titulo: string, descricao?: string, id?: string) {
      publicar({ severidade: "success", titulo, descricao, id });
    },
    avisarInfo(titulo: string, descricao?: string, id?: string) {
      publicar({ severidade: "info", titulo, descricao, id });
    },
    avisarErro(excecao: unknown, opcoes: OpcoesErro) {
      // A sessão expirada tem fluxo próprio: o shell volta para a entrada com aviso.
      if (excecao instanceof ErroApi && excecao.status === 401) return;
      const descricaoDaFalha =
        excecao instanceof ErroApi
          ? excecao.status === 0 || excecao.status >= 500
            ? "Tente de novo em instantes."
            : undefined
          : "Confira a internet e tente de novo em instantes.";
      publicar({
        severidade: "error",
        titulo: mensagemAmigavel(excecao, opcoes.contexto),
        descricao: opcoes.descricao ?? descricaoDaFalha,
        tentarDeNovo: opcoes.tentarDeNovo,
        id: opcoes.id,
      });
    },
  };
}

export const avisosPublicos = criarAvisos(publicarAvisoPublico);

/** Vincula as continuações assíncronas ao destino que iniciou o trabalho. */
export function useAvisosDaSessao() {
  const escopo = useContext(ContextoEscopoAvisos);
  return useMemo(() => {
    const publicar = (entrada: EntradaAviso) => publicarAviso(entrada, escopo);
    return { ...criarAvisos(publicar), publicarAviso: publicar };
  }, [escopo]);
}
