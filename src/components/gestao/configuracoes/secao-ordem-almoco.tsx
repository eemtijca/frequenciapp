"use client";

// Ordem do almoço no rascunho: a administração ordena as turmas de cada dia
// da semana, com horário opcional, e a aba Horários mostra.
import { useId, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  HelpCircle,
  ListPlus,
  Plus,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import type { Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import {
  DIAS_ORDEM_ALMOCO,
  ordemDoDia,
  problemaNaOrdemAlmoco,
  type ItemOrdemAlmoco,
  type OrdemAlmocoDoDia,
} from "@/domain/ordem-almoco";
import { avisarSucesso } from "@/lib/avisos";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SecaoRecolhivel } from "@/components/ui/secao-recolhivel";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { Selo } from "@/components/ui/selo";
import { AvisoCompacto } from "@/components/ui/tela-estado";

interface ItemRascunho {
  turmaId: string;
  /** "HH:MM" ou vazio, quando a turma só tem posição. */
  inicio: string;
}

function rotuloDia(valor: number): string {
  const rotulo = DIAS_DA_SEMANA.find((dia) => dia.valor === valor)?.rotulo ?? "dia";
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

function paraRascunho(dias: OrdemAlmocoDoDia[], dia: number): ItemRascunho[] {
  return ordemDoDia(dias, dia).map((item) => ({
    turmaId: item.turmaId,
    inicio: item.inicio ?? "",
  }));
}

function paraItens(itens: ItemRascunho[]): ItemOrdemAlmoco[] {
  return itens.map((item, indice) => ({
    turmaId: item.turmaId,
    posicao: indice + 1,
    inicio: item.inicio || null,
  }));
}

export default function SecaoOrdemAlmoco({
  turmas,
  dias,
  onMudar,
  onCopiarParaTodos,
}: {
  turmas: Turma[];
  dias: OrdemAlmocoDoDia[];
  onMudar: (dia: number, itens: ItemOrdemAlmoco[]) => void;
  onCopiarParaTodos: (dia: number, itens: ItemOrdemAlmoco[]) => void;
}) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [dia, setDia] = useState(1);
  const [paraAdicionar, setParaAdicionar] = useState("");
  const [erro, setErro] = useState("");
  const [copiando, setCopiando] = useState(false);

  const rascunho = paraRascunho(dias, dia);
  const rotuloDe = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
  const restantes = turmas.filter((turma) => !rascunho.some((item) => item.turmaId === turma.id));
  const diasDefinidos = dias.filter((item) => item.itens.length > 0).length;

  function aplicar(itens: ItemRascunho[]) {
    const problema = problemaNaOrdemAlmoco(paraItens(itens));
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    onMudar(dia, paraItens(itens));
  }

  function trocarDia(valor: string) {
    setDia(Number(valor));
    setParaAdicionar("");
    setErro("");
  }

  function mover(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    if (destino < 0 || destino >= rascunho.length) return;
    const novo = [...rascunho];
    const [item] = novo.splice(indice, 1);
    if (item) novo.splice(destino, 0, item);
    aplicar(novo);
  }

  function atualizarInicio(indice: number, inicio: string) {
    aplicar(rascunho.map((item, i) => (i === indice ? { ...item, inicio } : item)));
  }

  return (
    <SecaoRecolhivel
      titulo="Ordem do almoço"
      icone={Utensils}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="config-ordem-almoco"
      resumo={
        <Selo>
          {diasDefinidos} {diasDefinidos === 1 ? "dia definido" : "dias definidos"}
        </Selo>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor={`${base}-dia`}>Dia da semana</Label>
          <Selecionar
            id={`${base}-dia`}
            value={String(dia)}
            onValueChange={trocarDia}
            opcoes={DIAS_ORDEM_ALMOCO.map((valor) => ({
              valor: String(valor),
              rotulo: rotuloDia(valor),
            }))}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-0 whitespace-normal"
          aria-label="Copiar para os outros dias"
          disabled={rascunho.length === 0}
          onClick={() => setCopiando(true)}
        >
          <Copy size={16} aria-hidden="true" />
          Copiar para os outros dias
        </Button>
      </div>

      {restantes.length > 0 ? (
        <div className="superficie flex flex-col gap-3 p-3">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={`${base}-adicionar`}>Turma</Label>
            <Selecionar
              id={`${base}-adicionar`}
              buscavel
              value={paraAdicionar}
              onValueChange={setParaAdicionar}
              placeholder="Selecione a turma"
              opcoes={restantes.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              className="h-auto min-h-11 min-w-0 px-2 whitespace-normal"
              aria-label="Adicionar à ordem"
              disabled={!paraAdicionar}
              onClick={() => {
                aplicar([...rascunho, { turmaId: paraAdicionar, inicio: "" }]);
                setParaAdicionar("");
              }}
            >
              <Plus size={16} aria-hidden="true" />
              Adicionar
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-11 min-w-0 px-2 whitespace-normal"
              aria-label="Incluir todas as turmas restantes"
              onClick={() => {
                aplicar([
                  ...rascunho,
                  ...restantes.map((turma) => ({ turmaId: turma.id, inicio: "" })),
                ]);
                setParaAdicionar("");
              }}
            >
              <ListPlus size={16} aria-hidden="true" />
              Incluir todas
            </Button>
          </div>
        </div>
      ) : null}

      {rascunho.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma turma na ordem de {rotuloDia(dia)}.</p>
      ) : (
        <ol
          aria-label={`Ordem do almoço de ${rotuloDia(dia)}`}
          className="flex flex-col divide-y rounded-2xl border"
        >
          {rascunho.map((item, indice) => {
            const rotulo = rotuloDe.get(item.turmaId) ?? "Turma";
            return (
              <li key={item.turmaId} className="flex flex-col gap-2 px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className="controle numerais-tabulares flex size-9 shrink-0 items-center justify-center text-sm font-semibold">
                    <span aria-hidden="true">{indice + 1}º</span>
                    <span className="sr-only">{indice + 1}º lugar</span>
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium break-words">{rotulo}</span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Subir ${rotulo}`}
                    disabled={indice === 0}
                    onClick={() => mover(indice, -1)}
                  >
                    <ChevronUp size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    aria-label={`Descer ${rotulo}`}
                    disabled={indice === rascunho.length - 1}
                    onClick={() => mover(indice, 1)}
                  >
                    <ChevronDown size={16} aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon"
                    className="text-falta-texto"
                    aria-label={`Tirar ${rotulo} da ordem`}
                    onClick={() => aplicar(rascunho.filter((_, i) => i !== indice))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 pl-11">
                  <div className="min-w-0 flex-1 sm:max-w-48">
                    <SeletorHorario
                      id={`${base}-inicio-${item.turmaId}`}
                      valor={item.inicio}
                      rotuloAcessivel={`Horário de ${rotulo} no almoço`}
                      onValor={(valor) => atualizarInicio(indice, valor)}
                    />
                  </div>
                  {item.inicio ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      aria-label={`Limpar horário de ${rotulo}`}
                      onClick={() => atualizarInicio(indice, "")}
                    >
                      <X size={16} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {erro ? <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" /> : null}

      <details className="text-muted-foreground text-xs">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium">
          <HelpCircle size={16} aria-hidden="true" />
          Ajuda
        </summary>
        <p className="mt-1 leading-relaxed">
          Use as setas para ordenar as turmas. Os horários são opcionais. A ordem aparece na
          consulta de Horários depois de salvar as configurações.
        </p>
      </details>

      <AlertDialog open={copiando} onOpenChange={setCopiando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar a ordem para os outros dias?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem e os horários de {rotuloDia(dia)} substituem os de todos os outros dias, de
              segunda a sábado, no rascunho.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onCopiarParaTodos(dia, paraItens(rascunho));
                setCopiando(false);
                avisarSucesso(
                  "Ordem copiada no rascunho.",
                  "Salve as configurações para aplicar aos outros dias.",
                );
              }}
            >
              Copiar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecaoRecolhivel>
  );
}
