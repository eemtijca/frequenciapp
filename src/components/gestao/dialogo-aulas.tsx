"use client";

// Horários da turma: janelas das aulas e disciplinas por dia, com preservação do histórico.
import { useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type { Horario, Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Formulario {
  id?: string;
  ordem: string;
  inicio: string;
  fim: string;
  diasSemana: number[];
  disciplinas: Record<string, string>;
  ativo: boolean;
}

interface Props {
  turma: Turma | null;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onMudanca: () => Promise<void>;
}

export default function DialogoAulas(props: Props) {
  return (
    <ConteudoDialogoAulas key={`${props.turma?.id ?? "nenhuma"}-${props.aberto}`} {...props} />
  );
}

function ConteudoDialogoAulas({ turma, aberto, onAbrir, onMudanca }: Props) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");

  const aulas = turma?.horarios ?? [];

  function abrirNova() {
    const proxima = aulas.length > 0 ? Math.max(...aulas.map((aula) => aula.ordem)) + 1 : 1;
    setFormulario({
      ordem: String(proxima),
      inicio: "07:00",
      fim: "07:50",
      diasSemana: [1, 2, 3, 4, 5],
      disciplinas: {},
      ativo: true,
    });
    setErro("");
  }

  function abrirEdicao(aula: Horario) {
    setFormulario({
      id: aula.id,
      ordem: String(aula.ordem),
      inicio: aula.inicio,
      fim: aula.fim,
      // Domingo não tem aula: grades antigas com "dom" abrem sem ele.
      diasSemana: aula.diasSemana.filter((dia) => dia !== 7),
      disciplinas: { ...aula.disciplinas },
      ativo: aula.ativo,
    });
    setErro("");
  }

  function alternarDia(dia: number) {
    setFormulario((atual) => {
      if (!atual) return atual;
      const dias = atual.diasSemana.includes(dia)
        ? atual.diasSemana.filter((valor) => valor !== dia)
        : [...atual.diasSemana, dia].sort((a, b) => a - b);
      return { ...atual, diasSemana: dias };
    });
  }

  const { executando: enviando, executar: submeter } = useAcaoUnica(async () => {
    if (!turma || !formulario || chaveAtiva !== null) return;
    setErro("");
    const corpo = {
      ordem: Number(formulario.ordem),
      inicio: formulario.inicio,
      fim: formulario.fim,
      diasSemana: formulario.diasSemana,
      disciplinas: Object.fromEntries(
        formulario.diasSemana.map((dia) => [
          String(dia),
          formulario.disciplinas[String(dia)]?.trim() ?? "",
        ]),
      ),
      ativo: formulario.ativo,
    };
    try {
      if (formulario.id) {
        await pedir<{ horario: Horario }>(
          `/api/horarios/${formulario.id}`,
          corpoAlteracao("PATCH", corpo),
        );
        avisarSucesso("Horário atualizado.");
      } else {
        await pedir<{ horario: Horario }>(
          "/api/horarios",
          corpoJson({ turmaId: turma.id, ...corpo }),
        );
        avisarSucesso("Horário criado.");
      }
      setFormulario(null);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a aula.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a aula." });
    }
  });

  const ocupado = enviando || chaveAtiva !== null;

  function alternarAtiva(aula: Horario) {
    if (ocupado) return;
    void executarPorChave(aula.id, async () => {
      try {
        await pedir<{ horario: Horario }>(
          `/api/horarios/${aula.id}`,
          corpoAlteracao("PATCH", { ativo: !aula.ativo }),
        );
        avisarSucesso(
          aula.ativo ? "Aula desativada." : "Aula reativada.",
          aula.ativo
            ? "As faltas já registradas continuam guardadas."
            : "Ela volta a aparecer na grade da turma.",
        );
        await onMudanca();
      } catch (excecao) {
        const mensagem =
          excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar a aula.";
        toast.error(mensagem);
      }
    });
  }

  function excluir(aula: Horario) {
    if (ocupado) return;
    void executarPorChave(aula.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/horarios/${aula.id}`, corpoAlteracao("DELETE"));
        toast.success("Aula excluída.");
        await onMudanca();
      } catch (excecao) {
        const mensagem =
          excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir a aula.";
        toast.error(mensagem);
      }
    });
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(valor) => {
        if (!ocupado) onAbrir(valor);
      }}
    >
      <DialogContent
        className="max-w-lg"
        aria-describedby={undefined}
        showCloseButton={!ocupado}
        onEscapeKeyDown={(evento) => {
          if (ocupado) evento.preventDefault();
        }}
        onInteractOutside={(evento) => {
          if (ocupado) evento.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>Horários de {turma?.rotulo ?? "turma"}</DialogTitle>
        </DialogHeader>

        {aulas.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            Nenhum horário configurado.
          </div>
        ) : (
          <ul className="superficie-vidro divide-y overflow-hidden">
            {[...aulas]
              .sort((a, b) => a.ordem - b.ordem)
              .map((aula) => (
                <li
                  key={aula.id}
                  className={`flex items-center gap-2 px-3 py-2 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${aula.ativo ? "" : "opacity-60"}`}
                >
                  <span className="numerais-tabulares text-muted-foreground w-6 shrink-0 text-sm">
                    {String(aula.ordem).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="numerais-tabulares truncate text-sm font-medium">
                      {aula.inicio} às {aula.fim}
                    </p>
                    <p className="text-muted-foreground truncate text-xs">
                      {aula.diasSemana
                        .filter((dia) => dia !== 7)
                        .map(
                          (dia) =>
                            DIAS_DA_SEMANA.find((opcao) => opcao.valor === dia)?.abreviacao ?? dia,
                        )
                        .join(" ")}
                      {aula.ativo ? "" : " · desativada"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={`Editar aula ${aula.ordem}`}
                    onClick={() => abrirEdicao(aula)}
                    disabled={ocupado}
                  >
                    <Pencil size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={
                      aula.ativo ? `Desativar aula ${aula.ordem}` : `Ativar aula ${aula.ordem}`
                    }
                    onClick={() => alternarAtiva(aula)}
                    disabled={ocupado}
                  >
                    <Power size={16} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-falta-texto size-11"
                        aria-label={`Excluir aula ${aula.ordem}`}
                        disabled={ocupado}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Excluir a aula {aula.ordem} das {aula.inicio}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          A exclusão só é possível quando não há faltas registradas nesta aula. Com
                          histórico, o caminho é desativar.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() => excluir(aula)}
                          disabled={ocupado}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </li>
              ))}
          </ul>
        )}

        {!formulario ? (
          <Button
            variant="outline"
            onClick={abrirNova}
            disabled={aulas.length >= 99 || ocupado}
            className="min-h-11"
          >
            <Plus size={16} />
            Nova aula
          </Button>
        ) : (
          <form
            className="superficie-vidro flex flex-col gap-3 p-3"
            aria-busy={ocupado}
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
          >
            <p className="text-sm font-medium">{formulario.id ? "Editar aula" : "Nova aula"}</p>
            <fieldset disabled={ocupado} className="flex min-w-0 flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                  <Label htmlFor="aula-ordem">Ordem</Label>
                  <Input
                    id="aula-ordem"
                    type="number"
                    min={1}
                    max={99}
                    inputMode="numeric"
                    value={formulario.ordem}
                    onChange={(evento) =>
                      setFormulario((atual) =>
                        atual ? { ...atual, ordem: evento.target.value } : atual,
                      )
                    }
                    className="numerais-tabulares h-11"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="aula-inicio">Início</Label>
                  <SeletorHorario
                    id="aula-inicio"
                    valor={formulario.inicio}
                    disabled={ocupado}
                    rotuloAcessivel="Início da aula"
                    onValor={(valor) =>
                      setFormulario((atual) => (atual ? { ...atual, inicio: valor } : atual))
                    }
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="aula-fim">Fim</Label>
                  <SeletorHorario
                    id="aula-fim"
                    valor={formulario.fim}
                    disabled={ocupado}
                    rotuloAcessivel="Fim da aula"
                    onValor={(valor) =>
                      setFormulario((atual) => (atual ? { ...atual, fim: valor } : atual))
                    }
                  />
                </div>
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="text-sm font-medium">Dias da semana</legend>
                <div className="flex flex-wrap gap-1.5">
                  {DIAS_DA_SEMANA.filter((dia) => dia.valor !== 7).map((dia) => {
                    const marcado = formulario.diasSemana.includes(dia.valor);
                    return (
                      <button
                        key={dia.valor}
                        type="button"
                        aria-pressed={marcado}
                        aria-label={dia.rotulo}
                        onClick={() => alternarDia(dia.valor)}
                        className="controle-vidro pressionavel h-11 px-3 text-xs font-medium transition-colors"
                      >
                        {dia.abreviacao}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              {formulario.diasSemana.length > 0 && (
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium">Disciplinas</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {DIAS_DA_SEMANA.filter((dia) => formulario.diasSemana.includes(dia.valor)).map(
                      (dia) => (
                        <div key={dia.valor} className="flex min-w-0 flex-col gap-1.5">
                          <Label htmlFor={`disciplina-dia-${dia.valor}`}>
                            <span aria-hidden="true">
                              {dia.rotulo.charAt(0).toUpperCase() + dia.rotulo.slice(1)}
                            </span>
                            <span className="sr-only">Disciplina de {dia.rotulo}</span>
                          </Label>
                          <Input
                            id={`disciplina-dia-${dia.valor}`}
                            value={formulario.disciplinas[String(dia.valor)] ?? ""}
                            maxLength={80}
                            autoComplete="off"
                            placeholder="Disciplina"
                            className="h-11"
                            onChange={(evento) =>
                              setFormulario((atual) =>
                                atual
                                  ? {
                                      ...atual,
                                      disciplinas: {
                                        ...atual.disciplinas,
                                        [String(dia.valor)]: evento.target.value,
                                      },
                                    }
                                  : atual,
                              )
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>
                </fieldset>
              )}
            </fieldset>
            {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormulario(null)}
                disabled={ocupado}
                className="min-h-11"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={ocupado} className="min-h-11">
                {enviando && <LoaderCircle size={16} className="animate-spin" />}
                {formulario.id ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        )}
        {erro && !formulario && (
          <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />
        )}
      </DialogContent>
    </Dialog>
  );
}
