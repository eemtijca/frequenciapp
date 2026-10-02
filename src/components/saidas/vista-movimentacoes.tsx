"use client";

// Área compartilhada de saídas e entradas, em abas, com registros independentes.
// A aba ativa vai para a URL (?visao=saidas&aba=entradas) enquanto a área está aberta.
import { useCallback, useEffect, useState, type ComponentProps } from "react";
import { FileSpreadsheet, LogIn, LogOut } from "lucide-react";
import VistaSaidas from "./vista-saidas";
import VistaEntradas from "./vista-entradas";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import { Button } from "@/components/ui/button";
import DialogoEnvioSaidas, {
  useEstadoPlanilhaSaidas,
} from "@/components/saidas/dialogo-envio-saidas";

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

  // O envio para a planilha fica ao lado das abas. Nas Saídas abre o envio do
  // mês; nas Entradas leva à seção da planilha de entradas.
  const [envioAberto, setEnvioAberto] = useState(false);
  const [mesEnvio, setMesEnvio] = useState(props.diaCorrente.slice(0, 7));
  const { estado: estadoPlanilha, recarregar: recarregarPlanilha } = useEstadoPlanilhaSaidas();
  // A área é aquecida em segundo plano e pode montar antes de a planilha ser
  // configurada; ao ficar visível, o estado da integração é relido.
  useEffect(() => {
    if (ativo) void recarregarPlanilha();
  }, [ativo, recarregarPlanilha]);

  function aoToqueNaPlanilha() {
    if (aba === "saidas") {
      setEnvioAberto(true);
      return;
    }
    document
      .querySelector('section[aria-label="Planilha de entradas"]')
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <div className="space-y-4">
      <AbasDeslizantes
        rotuloAcessivel="Tipo de registro"
        abaInicial={abaInicial}
        abas={ABAS}
        chaveIndicador="indicador-movimentacoes"
        dataPager="movimentacoes"
        aoTrocar={aoTrocar}
        acao={
          <Button
            type="button"
            variant="outline"
            className="h-auto min-h-12 shrink-0 rounded-lg px-3"
            aria-label={
              aba === "saidas" ? "Enviar as saídas para a planilha" : "Ir à planilha de entradas"
            }
            disabled={
              aba === "saidas" && (!estadoPlanilha?.podeEnviar || !estadoPlanilha.configurada)
            }
            title={
              aba === "saidas"
                ? estadoPlanilha?.configurada
                  ? "Enviar as saídas do mês para o Google Planilhas"
                  : "Configure a planilha de saídas na Gestão"
                : "Planilha de entradas"
            }
            onClick={aoToqueNaPlanilha}
          >
            <FileSpreadsheet size={18} aria-hidden="true" />
          </Button>
        }
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
      <DialogoEnvioSaidas
        aberto={envioAberto}
        onAbrir={setEnvioAberto}
        mes={mesEnvio}
        onMes={setMesEnvio}
        modoCompleto={estadoPlanilha?.modo === "completo"}
        aoConcluir={() => void recarregarPlanilha()}
      />
    </div>
  );
}
