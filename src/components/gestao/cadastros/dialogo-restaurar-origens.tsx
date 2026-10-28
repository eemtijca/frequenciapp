"use client";

// Volta dos alunos remanejados de uma série às turmas de origem, com prévia por turma e confirmação.
import { useMemo, useState } from "react";
import { LoaderCircle, Undo2 } from "lucide-react";
import type { Aluno, Turma } from "@/domain/frequencia";
import { alunosForaDaOrigem, resumoDaRestauracao } from "@/domain/restauracao-origens";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
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

function contarAlunos(quantidade: number): string {
  return quantidade === 1 ? "1 aluno" : `${quantidade} alunos`;
}

export default function DialogoRestaurarOrigens({
  turmas,
  alunos,
  onMudanca,
}: {
  turmas: Turma[];
  alunos: Aluno[];
  onMudanca: () => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [serieEscolhida, setSerieEscolhida] = useState("");

  // Só entram as séries com alguém fora da origem, na ordem das turmas cadastradas.
  const series = useMemo(() => {
    const vistas = new Map<string, { id: string; nome: string; movidos: Aluno[] }>();
    for (const turma of turmas) {
      if (vistas.has(turma.serieId)) continue;
      const daSerie = new Set(
        turmas.filter((item) => item.serieId === turma.serieId).map((item) => item.id),
      );
      const movidos = alunosForaDaOrigem(alunos, daSerie);
      if (movidos.length > 0) {
        vistas.set(turma.serieId, { id: turma.serieId, nome: turma.serieNome, movidos });
      }
    }
    return [...vistas.values()];
  }, [alunos, turmas]);

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Turma";
  }, [turmas]);

  const serie = series.find((item) => item.id === serieEscolhida) ?? series[0];
  const resumo = useMemo(() => (serie ? resumoDaRestauracao(serie.movidos) : []), [serie]);

  const { executando, executar } = useAcaoUnica(async () => {
    if (!serie) return;
    try {
      const resultado = await pedir<{ alunos: number; turmas: number; jaAplicado: boolean }>(
        "/api/alunos/restaurar-origens",
        corpoJson({
          serieId: serie.id,
          // A prévia vai inteira: o servidor recusa se qualquer aluno mudou desde então.
          previa: serie.movidos.map(({ id, turmaId, turmaOriginalId }) => ({
            id,
            turmaId,
            turmaOriginalId,
          })),
          confirmar: true,
        }),
      );
      setAberto(false);
      setSerieEscolhida("");
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Turmas de origem restauradas.",
          "Recarregue a página para ver os alunos nas novas turmas.",
        );
        return;
      }
      if (resultado.jaAplicado) {
        avisarInfo(
          "Os alunos já estavam nas turmas de origem.",
          "A restauração anterior tinha sido concluída.",
        );
        return;
      }
      avisarSucesso(
        `${contarAlunos(resultado.alunos)} de volta às turmas de origem.`,
        "A chamada das turmas afetadas foi renumerada em ordem alfabética.",
      );
    } catch (erro) {
      avisarErro(erro, { contexto: "Não foi possível restaurar as turmas de origem." });
      // Relação mudou: recarrega os alunos para a prévia mostrar o estado atual.
      if (erro instanceof ErroApi && erro.status === 409) await onMudanca().catch(() => undefined);
    }
  });

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11 whitespace-nowrap"
        disabled={series.length === 0 || executando}
        title={series.length === 0 ? "Todos os alunos já estão nas turmas de origem." : undefined}
        onClick={() => setAberto(true)}
      >
        <Undo2 size={16} />
        Restaurar origens
      </Button>
      <AlertDialog
        open={aberto}
        onOpenChange={(valor) => {
          if (!executando) setAberto(valor);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar as turmas de origem?</AlertDialogTitle>
            <AlertDialogDescription>
              Os alunos remanejados dentro da série, ativos e inativos, voltam para a turma de
              origem. Quem mudou de série não é alterado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {serie && (
            <div className="flex flex-col gap-3">
              {series.length > 1 && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="restaurar-origens-serie">Série</Label>
                  <Selecionar
                    id="restaurar-origens-serie"
                    value={serie.id}
                    onValueChange={setSerieEscolhida}
                    disabled={executando}
                    opcoes={series.map((item) => ({
                      valor: item.id,
                      rotulo: `${item.nome} (${contarAlunos(item.movidos.length)})`,
                    }))}
                  />
                </div>
              )}
              <ul className="superficie divide-y text-sm" aria-label="Prévia da restauração">
                {resumo.map((item) => (
                  <li key={item.turmaId} className="flex flex-col gap-0.5 px-3 py-2">
                    <span className="font-medium">
                      {rotulo(item.turmaId)}: {contarAlunos(item.quantidade)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      Voltam de {item.de.map(rotulo).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="text-muted-foreground flex flex-col gap-2 text-sm">
                <p>
                  As turmas que perdem ou recebem alunos são reorganizadas em ordem alfabética, com
                  inativos no fim, pela mesma regra de Reorganizar turmas. As demais turmas mantêm a
                  numeração.
                </p>
                <p>
                  Saídas já registradas desses alunos passam a aparecer na turma de origem no
                  relatório de saídas e entradas e na planilha de saídas. Faltas, chamadas salvas,
                  entradas e registros parciais continuam como estão.
                </p>
              </div>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(evento) => {
                evento.preventDefault();
                void executar();
              }}
              disabled={executando || !serie}
            >
              {executando && <LoaderCircle size={16} className="animate-spin" />}
              {serie ? `Restaurar ${contarAlunos(serie.movidos.length)}` : "Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
