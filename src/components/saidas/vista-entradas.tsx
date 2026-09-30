"use client";

// Registro e consulta de chegadas atrasadas com envio revisado para aba própria.
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Trash2 } from "lucide-react";
import type { Aluno, Turma } from "@/domain/frequencia";
import { horaNoFuso, rotuloData } from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { avisarSucesso } from "@/lib/avisos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface Props {
  diaCorrente: string;
  fuso: string;
  turmas: Turma[];
  alunos: Aluno[];
  podePrepararPlanilha: boolean;
}
interface Previa {
  planoHash: string;
  novas: number;
  existentes: number;
  bloqueado: boolean;
  avisos: string[];
  criar: { nome: string; linha: number }[];
}

export default function VistaEntradas({
  diaCorrente,
  fuso,
  turmas,
  alunos,
  podePrepararPlanilha,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [turma, setTurma] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [horario, setHorario] = useState(() => horaNoFuso(new Date().toISOString(), fuso));
  const [motivo, setMotivo] = useState("");
  const [entradas, setEntradas] = useState<EntradaAtrasada[]>([]);
  const [erro, setErro] = useState("");
  const [recorteCarregado, setRecorteCarregado] = useState("");
  const [versao, setVersao] = useState(0);
  const [remover, setRemover] = useState<EntradaAtrasada | null>(null);
  const [estado, setEstado] = useState<{ podeEnviar: boolean; planilhaNome: string | null } | null>(
    null,
  );
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [confirmarAba, setConfirmarAba] = useState(false);
  const mensagemErro = useCallback(
    (erro: unknown) =>
      erro instanceof ErroApi
        ? erro.message
        : "Não foi possível concluir a operação. Tente novamente.",
    [],
  );
  const recorte = `${dia}|${turma}|${versao}`;
  const carregando = recorteCarregado !== recorte;
  useEffect(() => {
    let viva = true;
    pedir<{ entradas: EntradaAtrasada[] }>(
      `/api/entradas?de=${dia}&ate=${dia}${turma ? `&turmaId=${turma}` : ""}`,
    )
      .then((dados) => {
        if (viva) setEntradas(dados.entradas);
      })
      .catch((erro: unknown) => {
        if (viva) {
          setEntradas([]);
          setErro(mensagemErro(erro));
        }
      })
      .finally(() => {
        if (viva) setRecorteCarregado(recorte);
      });
    return () => {
      viva = false;
    };
  }, [dia, turma, versao, recorte, mensagemErro]);
  useEffect(() => {
    let viva = true;
    pedir<{ podeEnviar: boolean; planilhaNome: string | null }>("/api/planilha-entradas/estado")
      .then((dados) => {
        if (viva) setEstado(dados);
      })
      .catch(() => {
        if (viva) setEstado(null);
      });
    return () => {
      viva = false;
    };
  }, []);
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const executando = chaveAtiva !== null;
  const executar = (acao: () => Promise<void>) =>
    executarPorChave("entrada", async () => {
      setErro("");
      try {
        await acao();
      } catch (erro) {
        setRemover(null);
        setConfirmarAba(false);
        setPrevia(null);
        setErro(mensagemErro(erro));
      }
    });
  const dadosEnvio = { de: dia, ate: dia, ...(turma ? { turmaId: turma } : {}) };
  return (
    <div className="space-y-5 pb-6">
      <header>
        <h1 className="text-xl font-semibold">Entradas atrasadas</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registro de chegada à escola. A frequência da chamada permanece como foi marcada.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entrada-dia">Data da entrada</Label>
          <Input
            id="entrada-dia"
            type="date"
            value={dia}
            max={diaCorrente}
            disabled={executando}
            onChange={(e) => {
              if (e.target.value) {
                setDia(e.target.value);
                setPrevia(null);
                setErro("");
              }
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entrada-turma">Turma</Label>
          <Selecionar
            id="entrada-turma"
            value={turma || "todas"}
            disabled={executando}
            onValueChange={(valor) => {
              setTurma(valor === "todas" ? "" : valor);
              setPrevia(null);
              setErro("");
              setAlunoId("");
            }}
            opcoes={[
              { valor: "todas", rotulo: "Todas as turmas" },
              ...turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo })),
            ]}
          />
        </div>
      </div>
      <form
        className="rounded-xl border p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void executar(async () => {
            await pedir("/api/entradas", {
              method: "POST",
              ...corpoJson({ alunoId, dia, horario, motivo }),
            });
            setAlunoId("");
            setMotivo("");
            setVersao((valor) => valor + 1);
            avisarSucesso("Entrada registrada.");
          });
        }}
      >
        <h2 className="mb-4 font-semibold">Registrar chegada atrasada</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="entrada-aluno">Aluno</Label>
            <Selecionar
              id="entrada-aluno"
              value={alunoId}
              onValueChange={setAlunoId}
              disabled={executando}
              buscavel
              opcoes={alunos
                .filter(
                  (item) =>
                    item.ativo &&
                    (!item.desistenteEm || item.desistenteEm > dia) &&
                    (!turma || item.turmaId === turma),
                )
                .map((item) => ({
                  valor: item.id,
                  rotulo: `${item.nome} · ${turmas.find((t) => t.id === item.turmaId)?.rotulo ?? ""}`,
                }))}
              placeholder="Escolha o aluno"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="entrada-horario">Horário da chegada</Label>
            <Input
              id="entrada-horario"
              type="time"
              required
              value={horario}
              disabled={executando}
              onChange={(e) => setHorario(e.target.value)}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="entrada-motivo">Motivo do atraso</Label>
            <Input
              id="entrada-motivo"
              required
              minLength={2}
              maxLength={200}
              value={motivo}
              disabled={executando}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>
        </div>
        <Button className="mt-4" type="submit" disabled={executando || !alunoId || carregando}>
          Registrar entrada
        </Button>
      </form>
      {erro && (
        <p role="alert" className="text-falta-texto rounded-lg border p-3 text-sm">
          {erro}
        </p>
      )}
      <section aria-label="Entradas registradas" className="space-y-3">
        <h2 className="font-semibold">
          Entradas em {rotuloData(dia)}{" "}
          <span className="text-muted-foreground">({entradas.length})</span>
        </h2>
        {carregando ? (
          <p role="status">Carregando entradas...</p>
        ) : entradas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma entrada registrada neste recorte.</p>
        ) : (
          entradas.map((entrada) => (
            <article
              key={entrada.id}
              className="flex items-start justify-between gap-3 rounded-xl border p-4"
            >
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{entrada.nome}</h3>
                <p className="text-muted-foreground text-sm">
                  {entrada.turmaRotulo} · {entrada.horario}
                </p>
                <p className="mt-2 text-sm break-words">{entrada.motivo}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Registrado por {entrada.registradoPorNome}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover entrada de ${entrada.nome}`}
                disabled={executando}
                onClick={() => setRemover(entrada)}
              >
                <Trash2 size={18} />
              </Button>
            </article>
          ))
        )}
      </section>
      <section className="space-y-3 rounded-xl border p-4" aria-label="Planilha de entradas">
        <h2 className="flex items-center gap-2 font-semibold">
          <FileSpreadsheet size={18} /> Planilha de entradas
        </h2>
        <p className="text-muted-foreground text-sm">
          A aba Entradas fica na planilha de saídas escolhida na Gestão. O envio usa a data e a
          turma deste recorte, com prévia obrigatória.
        </p>
        {estado?.podeEnviar ? (
          <>
            <p className="text-sm">Planilha: {estado.planilhaNome}</p>
            <div className="flex flex-wrap gap-2">
              {podePrepararPlanilha && (
                <Button
                  variant="outline"
                  disabled={executando}
                  onClick={() => setConfirmarAba(true)}
                >
                  Preparar aba Entradas
                </Button>
              )}
              <Button
                variant="outline"
                disabled={executando || carregando || entradas.length === 0}
                onClick={() =>
                  void executar(async () => {
                    setPrevia(null);
                    setPrevia(
                      await pedir<Previa>("/api/planilha-entradas/simular", {
                        method: "POST",
                        ...corpoJson(dadosEnvio),
                      }),
                    );
                  })
                }
              >
                Prévia das entradas
              </Button>
            </div>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">
            Ative a conexão Google da planilha de saídas na Gestão para enviar as entradas.
          </p>
        )}
      </section>
      <AlertDialog
        open={Boolean(remover)}
        onOpenChange={(aberto) => {
          if (!aberto && !executando) setRemover(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro de {remover?.nome} será removido do aplicativo para correção. A chamada e
              as linhas já enviadas à planilha serão preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(e) => {
                e.preventDefault();
                if (remover)
                  void executar(async () => {
                    await pedir(`/api/entradas/${remover.id}`, { method: "DELETE" });
                    setRemover(null);
                    setVersao((valor) => valor + 1);
                    avisarSucesso("Entrada removida.");
                  });
              }}
            >
              Remover entrada
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmarAba} onOpenChange={setConfirmarAba}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Preparar aba Entradas?</AlertDialogTitle>
            <AlertDialogDescription>
              Será criada uma aba Entradas na planilha {estado?.planilhaNome}, com o cabeçalho do
              registro. Se ela já existir, seu conteúdo será preservado. Nenhum registro de aluno
              será enviado nesta etapa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(e) => {
                e.preventDefault();
                void executar(async () => {
                  const dados = await pedir<{ criada: boolean }>(
                    "/api/planilha-entradas/preparar",
                    { method: "POST" },
                  );
                  setConfirmarAba(false);
                  avisarSucesso(
                    dados.criada ? "Aba Entradas criada." : "A aba Entradas já existe.",
                  );
                });
              }}
            >
              Preparar aba
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(previa)}
        onOpenChange={(aberto) => {
          if (!aberto && !executando) setPrevia(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar entradas para a planilha?</AlertDialogTitle>
            <AlertDialogDescription>
              {previa?.novas} {previa?.novas === 1 ? "linha nova" : "linhas novas"} na aba Entradas;{" "}
              {previa?.existentes}{" "}
              {previa?.existentes === 1 ? "registro já enviado" : "registros já enviados"}. Data:{" "}
              {rotuloData(dia)}. Linhas existentes e fórmulas serão preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-60 space-y-2 overflow-y-auto text-sm">
            {previa?.avisos.map((aviso) => (
              <p key={aviso}>{aviso}</p>
            ))}
            {previa?.criar.map((item) => (
              <p key={item.linha}>
                {item.nome}: linha {item.linha}
              </p>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando || previa?.bloqueado || !previa?.novas}
              onClick={(e) => {
                e.preventDefault();
                if (previa)
                  void executar(async () => {
                    const resultado = await pedir<{ linhasCriadas: number }>(
                      "/api/planilha-entradas/enviar",
                      {
                        method: "POST",
                        ...corpoJson({ ...dadosEnvio, planoHash: previa.planoHash }),
                      },
                    );
                    setPrevia(null);
                    avisarSucesso(
                      `Envio confirmado: ${resultado.linhasCriadas} ${resultado.linhasCriadas === 1 ? "linha criada" : "linhas criadas"}.`,
                    );
                  });
              }}
            >
              Enviar entradas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
