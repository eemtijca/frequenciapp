"use client";

// Aba de alunos: criar, editar, mover de turma, ativar, desativar e
// excluir, agrupados por turma com busca por nome.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { LoaderCircle, Pencil, Plus, Power, Search, Trash2, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import type { Aluno, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
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
  turmas: Turma[];
  alunos: Aluno[];
  onMudanca: () => Promise<void>;
}

interface Formulario {
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
}

export default function AbaAlunos({ turmas, alunos, onMudanca }: Props) {
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const [emEdicao, setEmEdicao] = useState<Aluno | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({
    nome: "",
    turmaId: "",
    turmaOriginalId: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");

  const opcoesTurma = useMemo(
    () => turmas.map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    [turmas],
  );

  const rotulo = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const grupos = useMemo(() => {
    const termo = normalizar(busca);
    const mapa = new Map<string, Turma | undefined>();
    for (const aluno of alunos) {
      if (!mapa.has(aluno.turmaId)) {
        mapa.set(
          aluno.turmaId,
          turmas.find((t) => t.id === aluno.turmaId),
        );
      }
    }
    return [...mapa.entries()]
      .sort((a, b) => (a[1]?.rotulo ?? "").localeCompare(b[1]?.rotulo ?? "", "pt-BR"))
      .map(
        ([id, turma]) =>
          [
            id,
            turma,
            alunos
              .filter(
                (aluno) =>
                  aluno.turmaId === id && (termo === "" || normalizar(aluno.nome).includes(termo)),
              )
              .sort((a, b) => a.ordem - b.ordem),
          ] as const,
      );
  }, [alunos, turmas, busca]);

  const ativos = alunos.filter((aluno) => aluno.ativo).length;

  function abrirNovo() {
    setEmEdicao(null);
    const primeira = turmas[0]?.id ?? "";
    setFormulario({ nome: "", turmaId: primeira, turmaOriginalId: primeira });
    setErro("");
    setDialogoAberto(true);
  }

  function abrirEdicao(aluno: Aluno) {
    setEmEdicao(aluno);
    setFormulario({
      nome: aluno.nome,
      turmaId: aluno.turmaId,
      turmaOriginalId: aluno.turmaOriginalId,
    });
    setErro("");
    setDialogoAberto(true);
  }

  async function submeter() {
    if (enviando) return;
    setEnviando(true);
    setErro("");
    const corpo = {
      nome: formulario.nome,
      turmaId: formulario.turmaId,
      ...(formulario.turmaOriginalId !== formulario.turmaId
        ? { turmaOriginalId: formulario.turmaOriginalId }
        : {}),
    };
    try {
      if (emEdicao) {
        await pedir<{ aluno: Aluno }>(`/api/alunos/${emEdicao.id}`, corpoAlteracao("PATCH", corpo));
        toast.success("Aluno atualizado.");
      } else {
        await pedir<{ aluno: Aluno }>("/api/alunos", corpoJson(corpo));
        toast.success("Aluno cadastrado.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o aluno.");
    } finally {
      setEnviando(false);
    }
  }

  async function alternarAtivo(aluno: Aluno) {
    try {
      await pedir<{ aluno: Aluno }>(
        `/api/alunos/${aluno.id}`,
        corpoAlteracao("PATCH", { ativo: !aluno.ativo }),
      );
      toast.success(aluno.ativo ? "Aluno desativado." : "Aluno reativado.");
      await onMudanca();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível alterar o aluno.";
      toast.error(mensagem);
    }
  }

  async function excluir(aluno: Aluno) {
    try {
      await pedir<{ ok: boolean }>(`/api/alunos/${aluno.id}`, corpoAlteracao("DELETE"));
      toast.success("Aluno excluído.");
      await onMudanca();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir o aluno.";
      toast.error(mensagem);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {alunos.length} no total · {ativos} ativos
        </p>
        <Button
          size="lg"
          className="h-11 rounded-lg"
          onClick={abrirNovo}
          disabled={turmas.length === 0}
        >
          <Plus size={16} />
          Novo aluno
        </Button>
      </div>

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Guardamos apenas o nome do aluno e as turmas. Nenhum outro dado pessoal é necessário para a
        frequência. A exclusão apaga também o histórico de faltas do aluno; para retirá-lo das
        frequências preservando o histórico, desative.
      </p>

      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex items-center gap-2 border-b px-3 py-2.5">
          <Search size={16} className="text-muted-foreground shrink-0" aria-hidden="true" />
          <label htmlFor="busca-gestao-aluno" className="sr-only">
            Buscar aluno
          </label>
          <Input
            id="busca-gestao-aluno"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar aluno"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          {busca && (
            <button
              type="button"
              aria-label="Limpar busca"
              onClick={() => setBusca("")}
              className="text-muted-foreground hover:bg-secondary shrink-0 rounded-md p-1.5"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {turmas.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
            <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Nenhuma turma cadastrada</p>
            <p className="text-muted-foreground text-sm">
              Crie séries e turmas antes de cadastrar alunos.
            </p>
          </div>
        ) : grupos.length === 0 || grupos.every(([, , lista]) => lista.length === 0) ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-2 px-6 text-center">
            <UserRound size={28} className="text-muted-foreground" aria-hidden="true" />
            <p className="font-medium">Nenhum aluno encontrado</p>
            <p className="text-muted-foreground text-sm">
              {busca === "" ? "Cadastre o primeiro aluno da turma." : "Nenhum aluno com esse nome."}
            </p>
          </div>
        ) : (
          grupos
            .filter(([, , lista]) => lista.length > 0)
            .map(([id, turma, lista]) => (
              <div key={id}>
                <div className="bg-secondary/50 flex items-center justify-between border-y px-4 py-2.5 first:border-t-0">
                  <h2 className="font-medium">{turma?.rotulo ?? "Turma"}</h2>
                  <span className="numerais-tabulares text-muted-foreground text-xs">
                    {lista.filter((aluno) => aluno.ativo).length} ativos
                  </span>
                </div>
                <ul className="divide-y">
                  {lista.map((aluno) => (
                    <motion.li
                      key={aluno.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.18 }}
                      className={`flex items-center gap-3 px-4 py-2.5 ${aluno.ativo ? "" : "opacity-55"}`}
                    >
                      <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
                        {String(aluno.ordem).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{aluno.nome}</p>
                        {aluno.turmaOriginalId !== aluno.turmaId && (
                          <p className="text-muted-foreground text-xs">
                            Origem {rotulo(aluno.turmaOriginalId)}
                          </p>
                        )}
                        {!aluno.ativo && (
                          <p className="text-muted-foreground text-xs">desativado</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Editar ${aluno.nome}`}
                          onClick={() => abrirEdicao(aluno)}
                        >
                          <Pencil size={16} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={
                            aluno.ativo ? `Desativar ${aluno.nome}` : `Reativar ${aluno.nome}`
                          }
                          onClick={() => alternarAtivo(aluno)}
                        >
                          <Power size={16} />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-falta-texto size-11"
                              aria-label={`Excluir ${aluno.nome}`}
                            >
                              <Trash2 size={16} />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir {aluno.nome}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                A exclusão é definitiva e apaga também o histórico de faltas do
                                aluno. Para preservar o histórico, desative em vez de excluir.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-falta text-falta-foreground hover:bg-falta/90"
                                onClick={() => excluir(aluno)}
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
              </div>
            ))
        )}
      </div>

      <Dialog open={dialogoAberto} onOpenChange={setDialogoAberto}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{emEdicao ? `Editar ${emEdicao.nome}` : "Novo aluno"}</DialogTitle>
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
              <Label htmlFor="nome-aluno-gestao">Nome</Label>
              <Input
                id="nome-aluno-gestao"
                value={formulario.nome}
                required
                minLength={2}
                maxLength={100}
                autoComplete="off"
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, nome: evento.target.value }))
                }
                placeholder="Nome do aluno"
                className="h-11 rounded-lg"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="turma-aluno-gestao">Turma</Label>
              <Selecionar
                id="turma-aluno-gestao"
                value={formulario.turmaId}
                required
                onChange={(evento) =>
                  setFormulario((atual) => ({
                    ...atual,
                    turmaId: evento.target.value,
                    turmaOriginalId:
                      emEdicao === null || atual.turmaOriginalId === atual.turmaId
                        ? evento.target.value
                        : atual.turmaOriginalId,
                  }))
                }
                opcoes={opcoesTurma}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="origem-aluno-gestao">Turma de origem</Label>
              <Selecionar
                id="origem-aluno-gestao"
                value={formulario.turmaOriginalId}
                onChange={(evento) =>
                  setFormulario((atual) => ({ ...atual, turmaOriginalId: evento.target.value }))
                }
                opcoes={opcoesTurma}
              />
              <p className="text-muted-foreground text-xs">
                Para a grade Originais. Por padrão é a própria turma; mude quando o aluno veio de
                outra.
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
                {emEdicao ? "Salvar" : "Cadastrar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
