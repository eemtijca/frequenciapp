"use client";

// Botão único para reorganizar a chamada de todas as turmas, com confirmação.
import { useState } from "react";
import { ArrowDownAZ, LoaderCircle } from "lucide-react";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
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

export function DialogoOrdenarTurmas({
  disabled,
  onMudanca,
}: {
  disabled?: boolean;
  onMudanca: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const { executando, executar } = useAcaoUnica(async () => {
    try {
      const resultado = await pedir<{ atualizados: number }>(
        "/api/turmas/ordenar",
        corpoJson({ confirmar: true }),
      );
      setAberto(false);
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Turmas reorganizadas.",
          "Recarregue a página para visualizar a numeração atualizada.",
        );
        return;
      }
      avisarSucesso(
        resultado.atualizados ? "Turmas reorganizadas." : "As turmas já estão organizadas.",
        "Alunos em ordem alfabética e numeração da chamada atualizada.",
      );
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível reorganizar as turmas." });
    }
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={disabled || executando}
        onClick={() => setAberto(true)}
      >
        <ArrowDownAZ size={16} /> Reorganizar turmas
      </Button>
      <AlertDialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!executando) setAberto(valor);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reorganizar todas as turmas?</AlertDialogTitle>
            <AlertDialogDescription>
              Ordena os alunos ativos pelo nome e renumera a chamada de cada turma a partir de 1. Os
              inativos ficam depois dos ativos. Vínculos e registros de frequência são preservados.
              As planilhas já existentes mantêm a ordem das linhas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled || executando}
              onClick={(evento) => {
                evento.preventDefault();
                void executar();
              }}
            >
              {executando && <LoaderCircle size={16} className="animate-spin" />}
              Reorganizar todas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
