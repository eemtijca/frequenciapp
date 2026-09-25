"use client";

// Aba de séries: criar, renomear, reordenar e excluir.
import { useState } from "react";
import { motion } from "motion/react";
import { GraduationCap, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Serie } from "@/domain/frequencia";
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

interface Props {
  series: Serie[];
  onMudanca: () => Promise<void>;
}

interface Formulario {
  nome: string;
  ordem: string;
}

const VAZIO: Formulario = { nome: "", ordem: "1" };

export default function AbaSeries({ series, onMudanca }: Props) {
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Serie | null>(null);
  const [formulario, setFormulario] = useState<Formulario>(VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  function abrirNovo() {
    const proxima = series.length > 0 ? Math.max(...series.map((s) => s.ordem)) + 1 : 1;
    setEmEdicao(null);
    setFormulario({ nome: "", ordem: String(proxima) });
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(serie: Serie) {
    setEmEdicao(serie);
    setFormulario({ nome: serie.nome, ordem: String(serie.ordem) });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const dados = {
      nome: formulario.nome,
      ordem: Number(formulario.ordem),
    };
    try {
      if (emEdicao) {
        await pedir<{ serie: Serie }>(`/api/series/${emEdicao.id}`, corpoAlteracao("PATCH", dados));
        toast.success("Série atualizada.");
      } else {
        await pedir<{ serie: Serie }>("/api/series", corpoJson(dados));
        toast.success("Série criada.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar a série.");
    } finally {
      setEnviando(false);
    }
  }

  async function excluir(serie: Serie) {
    try {
      await pedir<{ ok: boolean }>(`/api/series/${serie.id}`, corpoAlteracao("DELETE"));
      toast.success(`Série ${serie.nome} excluída.`);
      await onMudanca();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir a série.";
      toast.error(mensagem);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {series.length === 0
            ? "As séries organizam as turmas"
            : `${series.length} ${series.length === 1 ? "série" : "séries"}`}
        </p>
        <Button size="lg" className="h-11 rounded-lg" onClick={abrirNovo}>
          <Plus size={16} />
          Nova série
        </Button>
      </div>

      {series.length === 0 ? (
        <div className="bg-card flex min-h-44 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <GraduationCap size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma série cadastrada</p>
          <p className="text-muted-foreground text-sm">
            Comece pelas séries (por exemplo, 1º ano) e depois crie as turmas.
          </p>
          <Button variant="outline" className="mt-2" onClick={abrirNovo}>
            <Plus size={16} />
            Criar série
          </Button>
        </div>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-lg border">
          {series.map((serie) => (
            <motion.li
              key={serie.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="numerais-tabulares text-muted-foreground w-8 shrink-0 text-sm">
                {String(serie.ordem).padStart(2, "0")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{serie.nome}</p>
                <p className="text-muted-foreground text-xs">ordem de exibição {serie.ordem}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Editar série ${serie.nome}`}
                  onClick={() => abrirEdicao(serie)}
                >
                  <Pencil size={16} />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-falta-texto size-11"
                      aria-label={`Excluir série ${serie.nome}`}
                    >
                      <Trash2 size={16} />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir a série {serie.nome}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        A exclusão só é possível quando a série não tem turmas.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-falta text-falta-foreground hover:bg-falta/90"
                        onClick={() => excluir(serie)}
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </motion.li>
          ))}
        </ul>
      )}

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{emEdicao ? "Editar série" : "Nova série"}</DialogTitle>
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
              <Label htmlFor="nome-serie">Nome</Label>
              <Input
                id="nome-serie"
                value={formulario.nome}
                required
                maxLength={40}
                autoComplete="off"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
                }
                placeholder="Por exemplo: 1º ano"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="ordem-serie">Ordem de exibição</Label>
              <Input
                id="ordem-serie"
                type="number"
                min={1}
                max={999}
                value={formulario.ordem}
                required
                inputMode="numeric"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, ordem: evento.target.value }))
                }
                className="numerais-tabulares h-11 rounded-lg"
              />
              <p className="text-muted-foreground text-xs">
                Menor número aparece primeiro na listagem.
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
