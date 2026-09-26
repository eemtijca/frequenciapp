"use client";

// Diálogo das aulas da turma: listar, criar, editar, ativar e excluir.
import { useEffect, useState } from "react";
import { LoaderCircle, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import type { Horario, Turma } from "@/domain/frequencia";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const DIAS = [
  { valor: 1, rotulo: "seg" },
  { valor: 2, rotulo: "ter" },
  { valor: 3, rotulo: "qua" },
  { valor: 4, rotulo: "qui" },
  { valor: 5, rotulo: "sex" },
  { valor: 6, rotulo: "sáb" },
  { valor: 7, rotulo: "dom" },
];

interface Formulario {
  id?: string;
  ordem: string;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
}

interface Props {
  turma: Turma | null;
  aberto: boolean;
  onAbrir: (aberto: boolean) => void;
  onMudanca: () => Promise<void>;
}

export default function DialogoAulas({ turma, aberto, onAbrir, onMudanca }: Props) {
  const [formulario, setFormulario] = useState<Formulario | null>(null);
  const [enviando, setEnviando] = useState(false);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const [erro, setErro] = useState("");

  useEffect(() => {
    setFormulario(null);
    setErro("");
  }, [aberto, turma?.id]);

  const aulas = turma?.horarios ?? [];

  function abrirNova() {
    const proxima = aulas.length > 0 ? Math.max(...aulas.map((aula) => aula.ordem)) + 1 : 1;
    setFormulario({
      ordem: String(proxima),
      inicio: "07:00",
      fim: "07:50",
      diasSemana: [1, 2, 3, 4, 5],
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
      diasSemana: [...aula.diasSemana],
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

  async function submeter() {
    if (!turma || !formulario || enviando) return;
    setEnviando(true);
    setErro("");
    const corpo = {
      ordem: Number(formulario.ordem),
      inicio: formulario.inicio,
      fim: formulario.fim,
      diasSemana: formulario.diasSemana,
      ativo: formulario.ativo,
    };
    try {
      if (formulario.id) {
        await pedir<{ horario: Horario }>(
          `/api/horarios/${formulario.id}`,
          corpoAlteracao("PATCH", corpo),
        );
        avisarSucesso("Aula atualizada.", "A grade da turma já mostra os horários novos.");
      } else {
        await pedir<{ horario: Horario }>(
          "/api/horarios",
          corpoJson({ turmaId: turma.id, ...corpo }),
        );
        avisarSucesso("Aula criada.", "Ela entra na grade da turma nos dias marcados.");
      }
      setFormulario(null);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a aula.");
      avisarErro(excecao, { contexto: "Não foi possível salvar a aula." });
    } finally {
      setEnviando(false);
    }
  }

  function alternarAtiva(aula: Horario) {
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
    <Dialog open={aberto} onOpenChange={onAbrir}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aulas de {turma?.rotulo ?? "turma"}</DialogTitle>
        </DialogHeader>
        <p className="text-muted-foreground text-xs leading-relaxed">
          As aulas definem em quais períodos o aluno pode sair no meio do dia. A aula com faltas
          registradas só pode ser desativada.
        </p>

        {aulas.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed px-4 py-6 text-center text-sm">
            Nenhuma aula configurada. Crie a primeira para registrar saídas.
          </div>
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border">
            {aulas.map((aula) => (
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
                      .map((dia) => DIAS.find((opcao) => opcao.valor === dia)?.rotulo ?? dia)
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
                  disabled={chaveAtiva === aula.id}
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
                        className="bg-falta text-falta-foreground hover:bg-falta/90"
                        onClick={() => excluir(aula)}
                        disabled={chaveAtiva === aula.id}
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
          <Button variant="outline" onClick={abrirNova} disabled={aulas.length >= 99}>
            <Plus size={16} />
            Nova aula
          </Button>
        ) : (
          <form
            className="flex flex-col gap-3 rounded-lg border p-3"
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
          >
            <p className="text-sm font-medium">{formulario.id ? "Editar aula" : "Nova aula"}</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col gap-1.5">
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
                <Input
                  id="aula-inicio"
                  type="time"
                  value={formulario.inicio}
                  onChange={(evento) =>
                    setFormulario((atual) =>
                      atual ? { ...atual, inicio: evento.target.value } : atual,
                    )
                  }
                  className="numerais-tabulares h-11"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="aula-fim">Fim</Label>
                <Input
                  id="aula-fim"
                  type="time"
                  value={formulario.fim}
                  onChange={(evento) =>
                    setFormulario((atual) =>
                      atual ? { ...atual, fim: evento.target.value } : atual,
                    )
                  }
                  className="numerais-tabulares h-11"
                />
              </div>
            </div>
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium">Dias da semana</legend>
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map((dia) => {
                  const marcado = formulario.diasSemana.includes(dia.valor);
                  return (
                    <button
                      key={dia.valor}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() => alternarDia(dia.valor)}
                      className={`pressionavel h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
                        marcado
                          ? "border-primary bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:border-foreground/30"
                      }`}
                    >
                      {dia.rotulo}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            {erro && (
              <p
                role="alert"
                className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm"
              >
                {erro}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormulario(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando && <LoaderCircle size={16} className="animate-spin" />}
                {formulario.id ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
