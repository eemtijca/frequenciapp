"use client";

// Consulta um mês na planilha, mantendo as demais frequências ocultas e preservadas.
import { useState } from "react";
import { Eye, LoaderCircle } from "lucide-react";
import { rotuloMes } from "@/domain/frequencia";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { mensagemAmigavel } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function DialogoMostrarMes({
  mesAtual,
  disabled,
  onAtualizar,
}: {
  mesAtual: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(mesAtual);
  const [mensagem, setMensagem] = useState("");
  const { executando, executar } = useAcaoUnica(async () => {
    setMensagem("");
    try {
      await pedir("/api/planilha/mensal/visibilidade", corpoJson({ mes }));
      setMensagem(`Abas de ${rotuloMes(mes).toLowerCase()} visíveis. Histórico preservado.`);
      await onAtualizar();
    } catch (erro) {
      setMensagem(
        mensagemAmigavel(
          erro,
          "Não foi possível mudar as abas visíveis. Confira a planilha antes de tentar novamente.",
        ),
      );
    }
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={disabled || executando}
        onClick={() => {
          setMes(mesAtual);
          setMensagem("");
          setAberto(true);
        }}
      >
        <Eye size={16} /> Mostrar mês na planilha
      </Button>
      <AlertDialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!executando) setAberto(valor);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abas visíveis da frequência</AlertDialogTitle>
            <AlertDialogDescription>
              Mostra as turmas do mês escolhido e oculta outros meses e abas antigas vinculadas. O
              histórico permanece na planilha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <SeletorPeriodo
            id="planilha-mes-visivel"
            modo="mes"
            valor={mes}
            disabled={executando}
            max={mesAtual}
            rotuloAcessivel="Mês visível na planilha"
            rotulo={rotuloMes(mes)}
            onValor={(valor) => {
              setMes(valor);
              setMensagem("");
            }}
          />
          {mensagem && (
            <p role="status" className="text-sm">
              {mensagem}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Fechar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando || disabled}
              onClick={(evento) => {
                evento.preventDefault();
                void executar();
              }}
            >
              {executando && <LoaderCircle size={16} className="animate-spin" />} Mostrar mês
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
