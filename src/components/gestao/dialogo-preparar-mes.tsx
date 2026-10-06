"use client";

// Prepara as abas mensais das turmas em sequência, com confirmação e resultado por turma.
import { useState } from "react";
import { CalendarPlus, LoaderCircle } from "lucide-react";
import { rotuloMes } from "@/domain/frequencia";
import { corpoJson, pedir } from "@/lib/api-cliente";
import { avisarInfo, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
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

interface ResultadoTurma {
  turmaOriginalId: string;
  rotulo: string;
  aba?: string;
  criada?: boolean;
  erro?: string;
}

export function DialogoPrepararMes({
  turmas,
  mes,
  onMes,
  mesMaximo,
  disabled,
  onAtualizar,
}: {
  turmas: { id: string; rotulo: string }[];
  mes: string;
  onMes: (mes: string) => void;
  mesMaximo: string;
  disabled?: boolean;
  onAtualizar: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [resultados, setResultados] = useState<ResultadoTurma[] | null>(null);
  const [turmaAtual, setTurmaAtual] = useState("");
  const { executando, executar } = useAcaoUnica(async () => {
    if (resultados !== null || turmas.length === 0) return;
    const saida: ResultadoTurma[] = [];
    setResultados([]);
    try {
      for (const turma of turmas) {
        setTurmaAtual(turma.rotulo);
        try {
          const dados = await pedir<{ aba: string; mes: string; criada: boolean }>(
            "/api/planilha/mensal",
            corpoJson({ turmaOriginalId: turma.id, mes }),
          );
          saida.push({
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            aba: dados.aba,
            criada: dados.criada,
          });
        } catch (erro) {
          saida.push({
            turmaOriginalId: turma.id,
            rotulo: turma.rotulo,
            erro: mensagemAmigavel(erro, "Não foi possível preparar a aba. Tente novamente."),
          });
        }
        setResultados([...saida]);
      }
      if (saida.every((item) => !item.erro)) {
        avisarSucesso(`Abas de ${rotuloMes(mes).toLowerCase()} preparadas.`);
      } else {
        avisarInfo("Mês preparado com pendências.", "Confira o resultado de cada turma.");
      }
      await onAtualizar();
    } finally {
      setTurmaAtual("");
    }
  });
  const concluidas = resultados?.filter((item) => !item.erro).length ?? 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={disabled || executando || turmas.length === 0}
        onClick={() => {
          setResultados(null);
          setAberto(true);
        }}
      >
        <CalendarPlus size={16} />
        Preparar mês
      </Button>
      <AlertDialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!executando) setAberto(valor);
        }}
      >
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {resultados === null ? "Preparar mês para todas as turmas" : "Abas do mês"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resultados === null
                ? "Cria uma aba por turma, com alunos e dias do mês. Abas já preparadas são reutilizadas e o histórico antigo é preservado."
                : `${concluidas} de ${turmas.length} turmas prontas para ${rotuloMes(mes).toLowerCase()}.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resultados === null ? (
            <>
              <SeletorPeriodo
                id="planilha-mes-preparar"
                modo="mes"
                valor={mes}
                max={mesMaximo}
                rotuloAcessivel="Mês das novas abas"
                rotulo={rotuloMes(mes)}
                onValor={onMes}
              />
              <p className="text-muted-foreground text-sm">
                Exemplo: {turmas[0]?.rotulo ?? "1º A"} · {mes.slice(5)}-{mes.slice(0, 4)}. Para
                incluir chamadas já salvas, use o envio com prévia.
              </p>
            </>
          ) : (
            <ul className="space-y-2 text-sm" aria-label="Resultado da preparação por turma">
              {resultados.map((item) => (
                <li key={item.turmaOriginalId} className="rounded-lg border p-3">
                  <strong className="block">{item.aba ?? item.rotulo}</strong>
                  <p className={item.erro ? "text-falta-texto" : "text-muted-foreground"}>
                    {item.erro ?? (item.criada ? "Criada" : "Reutilizada")}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {executando && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" />
              Preparando {turmaAtual}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>
              {resultados === null ? "Cancelar" : "Fechar"}
            </AlertDialogCancel>
            {resultados === null && (
              <AlertDialogAction
                disabled={disabled || executando || turmas.length === 0}
                onClick={(evento) => {
                  evento.preventDefault();
                  void executar();
                }}
              >
                Preparar {turmas.length} turmas
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
