"use client";

// Botão único para reorganizar a chamada de todas as turmas, com confirmação.
import { useState } from "react";
import SortByAlphaRoundedIcon from "@mui/icons-material/SortByAlphaRounded";
import { Botao } from "@/components/ui/mui/botao";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { useAvisosDaSessao } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";

export function DialogoOrdenarTurmas({
  disabled,
  onMudanca,
}: {
  disabled?: boolean;
  onMudanca: () => Promise<void>;
}) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
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
      <Botao
        variante="contorno"
        icone={<SortByAlphaRoundedIcon />}
        disabled={disabled || executando}
        onClick={() => setAberto(true)}
      >
        Reorganizar turmas
      </Botao>
      <DialogoConfirmacao
        aberto={aberto}
        titulo="Reorganizar todas as turmas?"
        descricao="Ordena os alunos ativos pelo nome e renumera a chamada de cada turma a partir de 1. Os inativos ficam depois dos ativos. Vínculos e registros de frequência são preservados. As planilhas já existentes mantêm a ordem das linhas."
        rotuloConfirmar="Reorganizar todas"
        operacaoEmAndamento={executando}
        onConfirmar={() => void executar()}
        onCancelar={() => setAberto(false)}
      />
    </>
  );
}
