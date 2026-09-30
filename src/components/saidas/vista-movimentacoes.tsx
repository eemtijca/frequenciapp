"use client";

// Área compartilhada de saídas e entradas, em abas, com registros independentes.
// A aba ativa vai para a URL (?visao=saidas&aba=entradas) enquanto a área está aberta.
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { LogIn, LogOut } from "lucide-react";
import VistaSaidas from "./vista-saidas";
import VistaEntradas from "./vista-entradas";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";

export type AbaMovimentacao = "saidas" | "entradas";

type Props = ComponentProps<typeof VistaSaidas> & {
  podePrepararPlanilha: boolean;
  abaInicial?: AbaMovimentacao;
};

const ABAS: AbaItem<AbaMovimentacao>[] = [
  { valor: "saidas", rotulo: "Saídas", icone: LogOut },
  { valor: "entradas", rotulo: "Entradas", icone: LogIn },
];

/** Grava a aba na URL sem criar entrada de histórico; sem argumento, limpa os parâmetros. */
function refletirNaUrl(aba: AbaMovimentacao | null) {
  try {
    const url = new URL(window.location.href);
    if (aba) {
      url.searchParams.set("visao", "saidas");
      url.searchParams.set("aba", aba);
    } else {
      url.searchParams.delete("visao");
      url.searchParams.delete("aba");
    }
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Sem histórico disponível, a aba só deixa de constar no endereço.
  }
}

export default function VistaMovimentacoes({
  podePrepararPlanilha,
  abaInicial = "saidas",
  ...props
}: Props) {
  const [aba, setAba] = useState<AbaMovimentacao>(abaInicial);
  const { ativo } = props;

  useEffect(() => {
    if (!ativo) return;
    refletirNaUrl(aba);
    return () => refletirNaUrl(null);
  }, [ativo, aba]);

  const aoTrocar = useCallback((proxima: AbaMovimentacao) => setAba(proxima), []);

  return (
    <div className="space-y-4">
      <AbasDeslizantes
        rotuloAcessivel="Tipo de registro"
        abaInicial={abaInicial}
        abas={ABAS}
        chaveIndicador="indicador-movimentacoes"
        dataPager="movimentacoes"
        aoTrocar={aoTrocar}
      >
        {(atual, ativa) =>
          atual === "saidas" ? (
            <VistaSaidas {...props} ativo={props.ativo && ativa} />
          ) : (
            <VistaEntradas
              diaCorrente={props.diaCorrente}
              fuso={props.fuso}
              turmas={props.turmas}
              alunos={props.alunos}
              liberadores={props.liberadores}
              catalogoJustificativas={props.catalogoJustificativas}
              podePrepararPlanilha={podePrepararPlanilha}
            />
          )
        }
      </AbasDeslizantes>
    </div>
  );
}
