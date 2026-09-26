"use client";

// Aba de alunos: criar, editar, mover de turma, ativar, desativar e
// excluir, agrupados por turma com busca por nome.
import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, LoaderCircle, Pencil, Plus, Power, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type { Aluno, Turma } from "@/domain/frequencia";
import { normalizar } from "@/domain/frequencia";
import { pedir, corpoJson, corpoAlteracao, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraBusca } from "@/components/ui/barra-busca";
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
  const semMovimento = useReducedMotion() ?? false;
  const [emEdicao, setEmEdicao] = useState<Aluno | null>(null);
  const [formulario, setFormulario] = useState<Formulario>({
    nome: "",
    turmaId: "",
    turmaOriginalId: "",
  });
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const [busca, setBusca] = useState("");
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [origemEmMassa, setOrigemEmMassa] = useState("");
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();

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
  const visiveis = useMemo(() => grupos.flatMap(([, , lista]) => lista), [grupos]);

  function alternarSelecao(id: string) {
    setSelecionados((atuais) => {
      const proximos = new Set(atuais);
      if (proximos.has(id)) proximos.delete(id);
      else proximos.add(id);
      return proximos;
    });
  }

  function alternarTodos() {
    setSelecionados((atuais) => {
      const todos = visiveis.length > 0 && visiveis.every((aluno) => atuais.has(aluno.id));
      if (todos) return new Set();
      return new Set(visiveis.map((aluno) => aluno.id));
    });
  }

  function cancelarSelecao() {
    setModoSelecao(false);
    setSelecionados(new Set());
    setOrigemEmMassa("");
  }

  const { executando: aplicando, executar: aplicarOrigem } = useAcaoUnica(async () => {
    if (selecionados.size === 0 || origemEmMassa === "") return;
    try {
      const dados = await pedir<{ atualizados: number }>(
        "/api/alunos",
        corpoAlteracao("PATCH", {
          ids: [...selecionados],
          turmaOriginalId: origemEmMassa,
        }),
      );
      avisarSucesso(
        dados.atualizados === 1
          ? "Origem de 1 aluno atualizada."
          : `Origem de ${dados.atualizados} alunos atualizada.`,
        "As faltas antigas continuam contando na turma de origem anterior.",
      );
      cancelarSelecao();
      await onMudanca();
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível atualizar a origem.";
      toast.error(mensagem);
    }
  });

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
        avisarSucesso("Aluno atualizado.", "A lista da Chamada já mostra os dados novos.");
      } else {
        await pedir<{ aluno: Aluno }>("/api/alunos", corpoJson(corpo));
        avisarSucesso("Aluno cadastrado.", "O aluno entra na chamada de hoje e nos próximos dias.");
      }
      setDialogoAberto(false);
      await onMudanca();
    } catch (excecao) {
      setErro(excecao instanceof ErroApi ? excecao.message : "Não foi possível salvar o aluno.");
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar o aluno." });
    } finally {
      setEnviando(false);
    }
  }

  function alternarAtivo(aluno: Aluno) {
    void executarPorChave(aluno.id, async () => {
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
    });
  }

  function excluir(aluno: Aluno) {
    void executarPorChave(aluno.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/alunos/${aluno.id}`, corpoAlteracao("DELETE"));
        toast.success("Aluno excluído.");
        await onMudanca();
      } catch (excecao) {
        const mensagem =
          excecao instanceof ErroApi ? excecao.message : "Não foi possível excluir o aluno.";
        toast.error(mensagem);
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {modoSelecao
            ? `${selecionados.size} ${
                selecionados.size === 1 ? "aluno selecionado" : "alunos selecionados"
              }`
            : `${alunos.length} no total · ${ativos} ativos`}
        </p>
        {modoSelecao ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-11 rounded-lg" onClick={alternarTodos}>
              <Check size={16} />
              Selecionar todos
            </Button>
            <Button variant="ghost" className="h-11 rounded-lg" onClick={cancelarSelecao}>
              Cancelar
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-lg"
              onClick={() => setModoSelecao(true)}
              disabled={turmas.length === 0 || alunos.length === 0}
            >
              <Check size={16} />
              Definir origem
            </Button>
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
        )}
      </div>

      {modoSelecao && (
        <div className="bg-card flex flex-col gap-3 rounded-lg border p-3">
          <p className="text-muted-foreground text-xs leading-relaxed">
            Mudar a turma de origem não move o aluno. A Grade e a planilha passam a agrupar o
            histórico pela origem escolhida.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label htmlFor="origem-em-massa">Turma de origem</Label>
              <Selecionar
                id="origem-em-massa"
                value={origemEmMassa}
                buscavel
                onValueChange={setOrigemEmMassa}
                placeholder="Escolha a turma"
                opcoes={opcoesTurma}
              />
            </div>
            <Button
              className="h-11 rounded-lg sm:w-auto"
              onClick={() => void aplicarOrigem()}
              disabled={aplicando || selecionados.size === 0 || origemEmMassa === ""}
            >
              {aplicando ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : (
                <Check size={16} />
              )}
              Aplicar origem
            </Button>
          </div>
        </div>
      )}

      <p className="bg-secondary/60 text-secondary-foreground rounded-lg border px-4 py-3 text-xs leading-relaxed">
        Guardamos apenas o nome do aluno e as turmas. Nenhum outro dado pessoal é necessário para a
        frequência. A exclusão apaga também o histórico de faltas do aluno; para retirá-lo das
        frequências preservando o histórico, desative.
      </p>

      <div className="bg-card overflow-hidden rounded-lg border">
        <BarraBusca
          id="busca-gestao-aluno"
          valor={busca}
          onValor={setBusca}
          placeholder="Buscar aluno"
          className="rounded-none border-0 border-b px-3 py-1.5"
        />

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
                      initial={semMovimento ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={semMovimento ? { duration: 0 } : { duration: 0.18 }}
                      className={`flex items-center gap-3 px-4 py-2.5 ${aluno.ativo ? "" : "opacity-55"}`}
                    >
                      {modoSelecao && (
                        <button
                          type="button"
                          aria-pressed={selecionados.has(aluno.id)}
                          aria-label={`Selecionar ${aluno.nome}`}
                          onClick={() => alternarSelecao(aluno.id)}
                          className="pressionavel -ml-2 flex size-11 shrink-0 items-center justify-center rounded-lg"
                        >
                          <span
                            className={`flex size-5 items-center justify-center rounded border ${
                              selecionados.has(aluno.id)
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input"
                            }`}
                          >
                            {selecionados.has(aluno.id) && <Check size={13} aria-hidden="true" />}
                          </span>
                        </button>
                      )}
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
                      {!modoSelecao && (
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
                            disabled={chaveAtiva === aluno.id}
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
                                  disabled={chaveAtiva === aluno.id}
                                >
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      )}
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
                buscavel
                onValueChange={(valor) =>
                  setFormulario((atual) => ({
                    ...atual,
                    turmaId: valor,
                    turmaOriginalId:
                      emEdicao === null || atual.turmaOriginalId === atual.turmaId
                        ? valor
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
                buscavel
                onValueChange={(valor) =>
                  setFormulario((atual) => ({ ...atual, turmaOriginalId: valor }))
                }
                opcoes={opcoesTurma}
              />
              <p className="text-muted-foreground text-xs">
                Para a Grade do mês. Por padrão é a própria turma; mude quando o aluno veio de
                outra.
              </p>
            </div>
            {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
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
