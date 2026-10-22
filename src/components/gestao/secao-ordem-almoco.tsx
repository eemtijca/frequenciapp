"use client";

// Ordem do almoço na Gestão: a administração ordena as turmas de cada dia da semana, com horário opcional, e a aba Horários mostra.
import { useEffect, useId, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  ListPlus,
  LoaderCircle,
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
  type OrdemAlmocoDoDia,
} from "@/domain/ordem-almoco";
import { corpoAlteracao, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { avisarOrdemAlmocoMudou } from "@/lib/eventos-ordem-almoco";
import { useAcaoUnica } from "@/lib/use-acao-unica";
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

function corpoDoDia(itens: ItemRascunho[]) {
  return { itens: itens.map((item) => ({ turmaId: item.turmaId, inicio: item.inicio || null })) };
}

export default function SecaoOrdemAlmoco({ turmas }: { turmas: Turma[] }) {
  const base = useId();
  const [aberto, setAberto] = useState(false);
  const [dias, setDias] = useState<OrdemAlmocoDoDia[] | null>(null);
  const [dia, setDia] = useState(1);
  const [rascunho, setRascunho] = useState<ItemRascunho[]>([]);
  const [paraAdicionar, setParaAdicionar] = useState("");
  const [erro, setErro] = useState("");
  const [copiando, setCopiando] = useState(false);

  const salvo = dias ? paraRascunho(dias, dia) : [];
  const alterado = JSON.stringify(salvo) !== JSON.stringify(rascunho);
  const rotuloDe = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
  const restantes = turmas.filter((turma) => !rascunho.some((item) => item.turmaId === turma.id));
  const diasDefinidos = dias?.filter((item) => item.itens.length > 0).length ?? 0;

  const { executar: carregar, executando: carregando } = useAcaoUnica(async () => {
    try {
      const lidos = (await pedir<{ dias: OrdemAlmocoDoDia[] }>("/api/ordem-almoco")).dias;
      setDias(lidos);
      setRascunho(paraRascunho(lidos, dia));
    } catch (excecao) {
      setErro("Não foi possível carregar a ordem do almoço. Tente novamente.");
      avisarErro(excecao, { contexto: "Não foi possível carregar a ordem do almoço." });
    }
  });
  useEffect(() => {
    if (aberto && dias === null) void carregar();
  }, [aberto, dias, carregar]);

  function trocarDia(valor: string) {
    const proximo = Number(valor);
    setDia(proximo);
    setRascunho(dias ? paraRascunho(dias, proximo) : []);
    setParaAdicionar("");
    setErro("");
  }

  function mover(indice: number, deslocamento: -1 | 1) {
    const destino = indice + deslocamento;
    if (destino < 0 || destino >= rascunho.length) return;
    const novo = [...rascunho];
    const [item] = novo.splice(indice, 1);
    if (item) novo.splice(destino, 0, item);
    setRascunho(novo);
  }

  function atualizarInicio(indice: number, inicio: string) {
    setRascunho(rascunho.map((item, i) => (i === indice ? { ...item, inicio } : item)));
  }

  const { executar: salvar, executando: salvando } = useAcaoUnica(async () => {
    const itens = rascunho.map((item) => ({ turmaId: item.turmaId, inicio: item.inicio || null }));
    const problema = problemaNaOrdemAlmoco(itens);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro("");
    try {
      await pedir(`/api/ordem-almoco/${dia}`, corpoAlteracao("PUT", corpoDoDia(rascunho)));
      avisarSucesso(`Ordem do almoço de ${rotuloDia(dia)} salva.`);
      avisarOrdemAlmocoMudou();
      await carregar();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a ordem.");
      avisarErro(excecao, { contexto: "Não foi possível salvar a ordem do almoço." });
    }
  });

  const { executar: copiar, executando: copiandoAgora } = useAcaoUnica(async () => {
    setCopiando(false);
    try {
      for (const outro of DIAS_ORDEM_ALMOCO) {
        if (outro === dia) continue;
        await pedir(`/api/ordem-almoco/${outro}`, corpoAlteracao("PUT", corpoDoDia(rascunho)));
      }
      avisarSucesso(`Ordem de ${rotuloDia(dia)} copiada para os outros dias.`);
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível copiar a ordem para todos os dias." });
    } finally {
      avisarOrdemAlmocoMudou();
      await carregar();
    }
  });

  const ocupado = carregando || salvando || copiandoAgora;

  return (
    <SecaoRecolhivel
      titulo="Ordem do almoço"
      descricao="Ordem e horário das turmas no almoço de cada dia."
      icone={Utensils}
      aberto={aberto}
      onAbertoChange={setAberto}
      dataSecao="config-ordem-almoco"
      resumo={
        dias ? (
          <Selo>
            {diasDefinidos} {diasDefinidos === 1 ? "dia definido" : "dias definidos"}
          </Selo>
        ) : undefined
      }
    >
      <p className="text-muted-foreground text-sm">
        A aba Horários mostra a ordem do dia consultado. O horário de cada turma é opcional.
      </p>
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor={`${base}-dia`}>Dia da semana</Label>
        <Selecionar
          id={`${base}-dia`}
          value={String(dia)}
          onValueChange={trocarDia}
          opcoes={DIAS_ORDEM_ALMOCO.map((valor) => ({
            valor: String(valor),
            rotulo: rotuloDia(valor),
          }))}
          disabled={ocupado || alterado || dias === null}
        />
        {alterado ? (
          <p className="text-muted-foreground text-xs">
            Salve ou descarte as mudanças para trocar de dia.
          </p>
        ) : null}
      </div>

      {dias === null ? (
        carregando ? (
          <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Carregando a ordem do almoço...
          </p>
        ) : null
      ) : (
        <>
          {rascunho.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma turma na ordem de {rotuloDia(dia)}.
            </p>
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
                      <span className="controle-vidro numerais-tabulares flex size-9 shrink-0 items-center justify-center text-sm font-semibold">
                        <span aria-hidden="true">{indice + 1}º</span>
                        <span className="sr-only">{indice + 1}º lugar</span>
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-medium break-words">
                        {rotulo}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Subir ${rotulo}`}
                        disabled={ocupado || indice === 0}
                        onClick={() => mover(indice, -1)}
                      >
                        <ChevronUp size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Descer ${rotulo}`}
                        disabled={ocupado || indice === rascunho.length - 1}
                        onClick={() => mover(indice, 1)}
                      >
                        <ChevronDown size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Tirar ${rotulo} da ordem`}
                        disabled={ocupado}
                        onClick={() => setRascunho(rascunho.filter((_, i) => i !== indice))}
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
                          disabled={ocupado}
                          onValor={(valor) => atualizarInicio(indice, valor)}
                        />
                      </div>
                      {item.inicio ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Limpar horário de ${rotulo}`}
                          disabled={ocupado}
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

          {restantes.length > 0 ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:max-w-xs">
                <Label htmlFor={`${base}-adicionar`}>Turma</Label>
                <Selecionar
                  id={`${base}-adicionar`}
                  value={paraAdicionar}
                  onValueChange={setParaAdicionar}
                  placeholder="Selecione a turma"
                  opcoes={restantes.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo }))}
                  disabled={ocupado}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={ocupado || !paraAdicionar}
                  onClick={() => {
                    setRascunho([...rascunho, { turmaId: paraAdicionar, inicio: "" }]);
                    setParaAdicionar("");
                  }}
                >
                  <Plus size={16} aria-hidden="true" />
                  Adicionar à ordem
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={ocupado}
                  onClick={() => {
                    setRascunho([
                      ...rascunho,
                      ...restantes.map((turma) => ({ turmaId: turma.id, inicio: "" })),
                    ]);
                    setParaAdicionar("");
                  }}
                >
                  <ListPlus size={16} aria-hidden="true" />
                  Adicionar as demais turmas
                </Button>
              </div>
            </div>
          ) : null}

          {erro ? (
            <AvisoCompacto variante="dados_invalidos" descricao={erro} tamanho="linha" />
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={ocupado || !alterado} onClick={() => void salvar()}>
              {salvando ? (
                <LoaderCircle
                  size={16}
                  aria-hidden="true"
                  className="animate-spin motion-reduce:animate-none"
                />
              ) : null}
              Salvar ordem de {rotuloDia(dia)}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado || !alterado}
              onClick={() => {
                setRascunho(salvo);
                setErro("");
              }}
            >
              Descartar mudanças
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={ocupado || alterado || rascunho.length === 0}
              onClick={() => setCopiando(true)}
            >
              <Copy size={16} aria-hidden="true" />
              Copiar para os outros dias
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={copiando} onOpenChange={setCopiando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copiar a ordem para os outros dias?</AlertDialogTitle>
            <AlertDialogDescription>
              A ordem e os horários de {rotuloDia(dia)} substituem os de todos os outros dias, de
              segunda a sábado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void copiar()}>Copiar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SecaoRecolhivel>
  );
}
