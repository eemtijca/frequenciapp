"use client";

// Aba de turmas: criar, renomear, mover de série e excluir, sempre
// agrupadas por série para leitura rápida.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { LoaderCircle, Pencil, Plus, School, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Serie, Turma } from "@/domain/frequencia";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
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

interface Props {
  series: Serie[];
  turmas: Turma[];
  onMudanca: () => Promise<void>;
}

interface Formulario {
  serieId: string;
  nome: string;
}

export default function AbaTurmas({ series, turmas, onMudanca }: Props) {
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Turma | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({ serieId: "", nome: "" });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const opcoesSerie = useMemo(
    () => series.map((serie) => ({ valor: serie.id, rotulo: serie.nome })),
    [series],
  );

  const grupos = useMemo(() => {
    const mapa = new Map<string, { serie: Serie | undefined; turmas: Turma[] }>();
    for (const turma of turmas) {
      const item = mapa.get(turma.serieId) ?? {
        serie: series.find((s) => s.id === turma.serieId),
        turmas: [],
      };
      item.turmas.push(turma);
      mapa.set(turma.serieId, item);
    }
    return [...mapa.entries()].sort((a, b) => (a[1].serie?.ordem ?? 0) - (b[1].serie?.ordem ?? 0));
  }, [turmas, series]);

  function abrirNovo() {
    setEmEdicao(null);
    setFormulario({ serieId: series[0]?.id ?? "", nome: "" });
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(turma: Turma) {
    setEmEdicao(turma);
    setFormulario({ serieId: turma.serieId, nome: turma.nome });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const dados = { serieId: formulario.serieId, nome: formulario.nome };
    try {
      if (emEdicao) {
        await pedir<{ turma: Turma }>(`/api/turmas/${emEdicao.id}`, corpoAlteracao("PATCH", dados));
        toast.success("Turma atualizada.");
      } else {
        await pedir<{ turma: Turma }>("/api/turmas", corpoJson(dados));
        toast.success("Turma criada.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a turma.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(turma: Turma) {
    try {
      await pedir<{ ok: boolean }>(`/api/turmas/${turma.id}`, corpoAlteracao("DELETE"));
      toast.success(`Turma ${turma.rotulo} excluída.`);
      await onMudanca();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir a turma.";
      toast.error(mensagem);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {turmas.length === 0
            ? "As turmas recebem os alunos"
            : `${turmas.length} ${turmas.length === 1 ? "turma" : "turmas"}`}
        </p>
        <Button
          size="lg"
          className="h-11 rounded-lg"
          onClick={abrirNovo}
          disabled={series.length === 0}
        >
          <Plus size={16} />
          Nova turma
        </Button>
      </div>

      {series.length === 0 ? (
        <div className="bg-card flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <School size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Crie uma série primeiro</p>
          <p className="text-muted-foreground text-sm">
            Toda turma pertence a uma série, como 1º ano A.
          </p>
        </div>
      ) : turmas.length === 0 ? (
        <div className="bg-card flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <School size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma turma cadastrada</p>
          <p className="text-muted-foreground text-sm">
            Crie a primeira turma da série para começar a cadastrar alunos.
          </p>
          <Button variant="outline" className="mt-2" onClick={abrirNovo}>
            <Plus size={16} />
            Criar turma
          </Button>
        </div>
      ) : (
        grupos.map(([serieId, grupo]) => (
          <motion.div
            key={serieId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="bg-card overflow-hidden rounded-lg border"
          >
            <div className="bg-secondary/50 flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="font-medium">{grupo.serie?.nome ?? "Série"}</h2>
              <span className="numerais-tabulares text-muted-foreground text-xs">
                {grupo.turmas.length} {grupo.turmas.length === 1 ? "turma" : "turmas"}
              </span>
            </div>
            <ul className="divide-y">
              {grupo.turmas.map((turma) => (
                <li key={turma.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{turma.rotulo}</p>
                    <p className="text-muted-foreground text-xs">letra {turma.nome}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`Editar turma ${turma.rotulo}`}
                      onClick={() => abrirEdicao(turma)}
                    >
                      <Pencil size={16} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-falta-texto size-11"
                          aria-label={`Excluir turma ${turma.rotulo}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir a turma {turma.rotulo}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A exclusão só é possível quando a turma não tem alunos nem chamadas.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-falta text-falta-foreground hover:bg-falta/90"
                            onClick={() => excluir(turma)}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              ))}
            </ul>
          </motion.div>
        ))
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{emEdicao ? `Editar turma ${emEdicao.rotulo}` : "Nova turma"}</DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(evento) => {
              evento.preventDefault();
              void submeter();
            }}
            noValidate
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="serie-turma">Série</Label>
              <Selecionar
                id="serie-turma"
                value={formulario.serieId}
                required
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, serieId: evento.target.value }))
                }
                opcoes={opcoesSerie}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="nome-turma">Turma (letra ou nome)</Label>
              <Input
                id="nome-turma"
                value={formulario.nome}
                required
                maxLength={40}
                autoComplete="off"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
                }
                placeholder="Por exemplo: A"
                className="h-11 rounded-lg"
              />
              <p className="text-muted-foreground text-xs">
                O rótulo completo aparece como série + turma, por exemplo 1º ano A.
              </p>
            </div>
            {erro && (
              <p
                role="alert"
                className="bg-falta-fraca text-falta-texto rounded-lg px-3 py-2 text-sm"
              >
                {erro}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogoAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando && <LoaderCircle size={16} className="animate-spin" />}
                {emEdicao ? "Salvar" : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
