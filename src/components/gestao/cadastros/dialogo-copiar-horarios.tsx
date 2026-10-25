"use client";

// Cópia da grade entre turmas, com prévia e confirmação antes da gravação.
import { useMemo, useState } from "react";
import { Copy, LoaderCircle } from "lucide-react";
import type { Horario, Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarInfo, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
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

interface Props {
  destino: Turma;
  turmas: Turma[];
  disabled: boolean;
  onOcupado: (ocupado: boolean) => void;
  onMudanca: () => Promise<void>;
}

export function DialogoCopiarHorarios({ destino, turmas, disabled, onOcupado, onMudanca }: Props) {
  const [aberto, setAberto] = useState(false);
  const [origemId, setOrigemId] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const opcoes = useMemo(
    () =>
      turmas
        .filter((turma) => turma.id !== destino.id)
        .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    [destino.id, turmas],
  );
  const origem = turmas.find((turma) => turma.id === origemId);
  const aulas = useMemo(
    () => [...(origem?.horarios ?? [])].sort((a, b) => a.ordem - b.ordem),
    [origem],
  );

  const { executando, executar } = useAcaoUnica(async () => {
    if (!origem || aulas.length === 0 || disabled) return;
    setErro("");
    onOcupado(true);
    try {
      await pedir<{ horarios: Horario[] }>(
        "/api/horarios/copiar",
        corpoJson({ turmaOrigemId: origem.id, turmaDestinoId: destino.id }),
      );
      setConfirmando(false);
      setAberto(false);
      setOrigemId("");
      avisarSucesso("Grade copiada.");
      try {
        await onMudanca();
      } catch {
        avisarInfo(
          "Grade copiada.",
          "Recarregue a página para visualizar os horários atualizados.",
        );
      }
    } catch (excecao) {
      setConfirmando(false);
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível copiar a grade.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível copiar a grade." });
    } finally {
      onOcupado(false);
    }
  });

  if (!aberto)
    return (
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        disabled={disabled || opcoes.length === 0}
        onClick={() => setAberto(true)}
      >
        <Copy size={16} />
        Copiar de outra turma
      </Button>
    );

  return (
    <section aria-label="Copiar grade" className="superficie flex min-w-0 flex-col gap-3 p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="horarios-turma-origem">Turma de origem</Label>
        <Selecionar
          id="horarios-turma-origem"
          buscavel
          value={origemId}
          opcoes={opcoes}
          disabled={disabled || executando}
          onValueChange={(valor) => {
            setOrigemId(valor);
            setErro("");
          }}
          placeholder="Selecionar turma"
        />
      </div>
      <p className="text-sm break-words">
        Destino: <span className="font-medium">{destino.rotulo}</span>
      </p>
      {origem &&
        (aulas.length === 0 ? (
          <p className="text-muted-foreground text-sm">A turma de origem não tem horários.</p>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium break-words">
              {aulas.length} {aulas.length === 1 ? "aula" : "aulas"} de {origem.rotulo}
            </p>
            <ul aria-label="Prévia da grade" className="divide-y rounded-lg border">
              {aulas.map((aula) => (
                <li key={aula.id} className="flex min-w-0 flex-col gap-1 px-3 py-2 text-sm">
                  <p className="numerais-tabulares font-medium">
                    Aula {aula.ordem}: {aula.inicio} às {aula.fim}
                  </p>
                  <p className="text-muted-foreground text-xs break-words">
                    {aula.diasSemana
                      .map((dia) => {
                        const rotulo =
                          DIAS_DA_SEMANA.find((opcao) => opcao.valor === dia)?.abreviacao ?? dia;
                        return `${rotulo}: ${aula.disciplinas?.[String(dia)] || "sem disciplina"}`;
                      })
                      .join(" · ")}
                  </p>
                  {!aula.ativo && <p className="text-muted-foreground text-xs">Desativada</p>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          disabled={disabled || executando}
          onClick={() => {
            setAberto(false);
            setErro("");
          }}
        >
          Cancelar cópia
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={!origem || aulas.length === 0 || disabled || executando}
          onClick={() => setConfirmando(true)}
        >
          Copiar grade
        </Button>
      </div>
      <AlertDialog
        open={confirmando}
        onOpenChange={(valor) => {
          if (!executando) setConfirmando(valor);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar grade?</AlertDialogTitle>
            <AlertDialogDescription>
              Copia {aulas.length} {aulas.length === 1 ? "aula" : "aulas"} de {origem?.rotulo} para{" "}
              {destino.rotulo}, incluindo ordem, horários, dias, disciplinas e estado de ativação.
              Aulas existentes e faltas são preservadas. Ordens repetidas impedem a cópia inteira.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled || executando || !origem || aulas.length === 0}
              onClick={(evento) => {
                evento.preventDefault();
                void executar();
              }}
            >
              {executando && <LoaderCircle size={16} className="animate-spin" />}
              Confirmar cópia
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
