"use client";

// Registro e consulta de chegadas atrasadas com envio revisado para aba própria.
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import type {
  Aluno,
  Turma,
  LiberadorConfigurado,
  JustificativaConfigurada,
} from "@/domain/frequencia";
import {
  horaNoFuso,
  rotuloData,
  rotuloDiaSemana,
  diaSeguinte,
  MOMENTOS_SAIDA,
  partesDoMotivo,
  rotuloMomento,
} from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { avisarSucesso } from "@/lib/avisos";
import { Button } from "@/components/ui/button";
import { CaixasDeInfo } from "@/components/ui/caixas-de-info";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { SeletorHorario } from "@/components/ui/seletor-horario";
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
  liberadores: LiberadorConfigurado[];
  catalogoJustificativas: JustificativaConfigurada[];
}
const OPCOES_MOMENTO = MOMENTOS_SAIDA.map((item) => ({ valor: item.codigo, rotulo: item.rotulo }));

export default function VistaEntradas({
  diaCorrente,
  fuso,
  turmas,
  alunos,
  liberadores,
  catalogoJustificativas,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [turma, setTurma] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [horario, setHorario] = useState(() => horaNoFuso(new Date().toISOString(), fuso));
  const [motivo, setMotivo] = useState("");
  const [momento, setMomento] = useState("");
  const [responsavelCodigo, setResponsavelCodigo] = useState("");
  const [formaJustificativa, setFormaJustificativa] = useState<"catalogo" | "texto">("catalogo");
  const [justificativa, setJustificativa] = useState("");
  const [observacao, setObservacao] = useState("");
  const [entradas, setEntradas] = useState<EntradaAtrasada[]>([]);
  const [erro, setErro] = useState("");
  const [recorteCarregado, setRecorteCarregado] = useState("");
  const [versao, setVersao] = useState(0);
  const [remover, setRemover] = useState<EntradaAtrasada | null>(null);
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
  const { chaveAtiva, executar: executarPorChave } = useAcoesPorChave();
  const executando = chaveAtiva !== null;
  const executar = (acao: () => Promise<void>) =>
    executarPorChave("entrada", async () => {
      setErro("");
      try {
        await acao();
      } catch (erro) {
        setRemover(null);
        setErro(mensagemErro(erro));
      }
    });
  const opcoesResponsavel = useMemo(
    () =>
      liberadores
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: item.rotulo })),
    [liberadores],
  );
  const opcoesJustificativa = useMemo(
    () =>
      catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({
          valor: item.codigo,
          rotulo: `${item.codigo} · ${item.rotulo}`,
        })),
    [catalogoJustificativas],
  );
  const turmasPorId = useMemo(
    () => new Map(turmas.map((item) => [item.id, item.rotulo])),
    [turmas],
  );
  const opcoesTurma = useMemo(() => {
    const comAlunos = new Set(alunos.filter((aluno) => aluno.ativo).map((aluno) => aluno.turmaId));
    return [
      { valor: "todas", rotulo: "Todas as turmas" },
      ...turmas
        .filter((item) => comAlunos.has(item.id))
        .map((item) => ({ valor: item.id, rotulo: item.rotulo })),
    ];
  }, [alunos, turmas]);
  const opcoesAluno = useMemo(
    () =>
      alunos
        .filter(
          (item) =>
            item.ativo &&
            (!item.desistenteEm || item.desistenteEm > dia) &&
            (!turma || item.turmaId === turma),
        )
        .map((item) => ({
          valor: item.id,
          rotulo: `${item.nome} · ${turmasPorId.get(item.turmaId) ?? ""}`,
        })),
    [alunos, dia, turma, turmasPorId],
  );
  function escolherDia(valor: string) {
    setDia(valor);
    setErro("");
  }
  return (
    <div className="space-y-5 pb-6">
      <h1 className="sr-only">Entradas atrasadas</h1>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia anterior"
          disabled={executando}
          onClick={() => escolherDia(diaSeguinte(dia, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="entrada-dia"
            modo="dia"
            valor={dia}
            max={diaCorrente}
            rotuloAcessivel="Data da entrada"
            rotulo={dia.split("-").reverse().join("/")}
            detalhe={rotuloDiaSemana(dia).replace("-feira", "")}
            disabled={executando}
            onValor={escolherDia}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia seguinte"
          disabled={executando || dia >= diaCorrente}
          onClick={() => escolherDia(diaSeguinte(dia, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      <form
        className="superficie-vidro flex flex-col gap-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void executar(async () => {
            await pedir("/api/entradas", {
              method: "POST",
              ...corpoJson({
                alunoId,
                dia,
                horario,
                momento,
                responsavelRegistroCodigo: responsavelCodigo,
                ...(formaJustificativa === "texto"
                  ? { motivo }
                  : { justificativa, observacao: observacao || undefined }),
              }),
            });
            setAlunoId("");
            setMotivo("");
            setMomento("");
            setResponsavelCodigo("");
            setJustificativa("");
            setObservacao("");
            setFormaJustificativa("catalogo");
            setVersao((valor) => valor + 1);
            avisarSucesso("Entrada registrada.");
          });
        }}
      >
        <h2 className="font-medium">Registrar entrada</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entrada-turma">Turma</Label>
            <Selecionar
              id="entrada-turma"
              value={turma || "todas"}
              disabled={executando}
              onValueChange={(valor) => {
                setTurma(valor === "todas" ? "" : valor);
                setErro("");
                setAlunoId("");
              }}
              opcoes={opcoesTurma}
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-1 xl:col-span-2">
            <Label htmlFor="entrada-aluno">Aluno</Label>
            <Selecionar
              id="entrada-aluno"
              value={alunoId}
              onValueChange={setAlunoId}
              disabled={executando}
              buscavel
              opcoes={opcoesAluno}
              placeholder="Selecione o aluno"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entrada-momento">Momento da entrada</Label>
            <Selecionar
              id="entrada-momento"
              value={momento}
              disabled={executando}
              onValueChange={setMomento}
              placeholder="Selecione a aula ou pausa"
              opcoes={OPCOES_MOMENTO}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entrada-horario">Horário da chegada</Label>
            <SeletorHorario
              id="entrada-horario"
              valor={horario}
              onValor={setHorario}
              rotuloAcessivel="Horário da chegada"
              agora={horaNoFuso(new Date().toISOString(), fuso)}
              disabled={executando}
            />
          </div>
          <fieldset className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
            <legend className="text-sm font-medium">Justificativa</legend>
            <div
              role="radiogroup"
              aria-label="Forma da justificativa"
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { valor: "texto", rotulo: "Escrever" },
                  { valor: "catalogo", rotulo: "Selecionar tipo" },
                ] as const
              ).map((item) => (
                <button
                  key={item.valor}
                  type="button"
                  role="radio"
                  aria-checked={formaJustificativa === item.valor}
                  disabled={executando}
                  onClick={() => {
                    setFormaJustificativa(item.valor);
                    setMotivo("");
                    setJustificativa("");
                    setObservacao("");
                  }}
                  className={`controle-vidro pressionavel flex h-11 items-center px-4 text-sm font-medium transition-colors ${formaJustificativa === item.valor ? "vidro-selecionado" : ""}`}
                >
                  {item.rotulo}
                </button>
              ))}
            </div>
            {formaJustificativa === "texto" ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="entrada-motivo">Texto da justificativa</Label>
                <Input
                  id="entrada-motivo"
                  required
                  minLength={2}
                  maxLength={100}
                  value={motivo}
                  disabled={executando}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Descreva o motivo"
                  className="h-11"
                />
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="entrada-justificativa">Tipo</Label>
                  <Selecionar
                    id="entrada-justificativa"
                    value={justificativa}
                    disabled={executando}
                    onValueChange={setJustificativa}
                    placeholder="Selecione a justificativa"
                    opcoes={opcoesJustificativa}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="entrada-observacao">Observação</Label>
                  <Input
                    id="entrada-observacao"
                    value={observacao}
                    disabled={executando}
                    maxLength={100}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Opcional: descreva brevemente o motivo"
                    className="h-11"
                  />
                </div>
              </>
            )}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="entrada-responsavel">Responsável pelo registro</Label>
            <Selecionar
              id="entrada-responsavel"
              value={responsavelCodigo}
              disabled={executando}
              onValueChange={setResponsavelCodigo}
              placeholder="Selecione quem registrou"
              opcoes={opcoesResponsavel}
            />
            {opcoesResponsavel.length === 0 && (
              <p className="text-muted-foreground text-xs">
                Nenhum responsável cadastrado. Cadastre em Gestão, Configurações.
              </p>
            )}
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            className="h-11 w-full px-6 sm:w-auto"
            size="lg"
            type="submit"
            disabled={
              executando ||
              !alunoId ||
              !momento ||
              !responsavelCodigo ||
              carregando ||
              opcoesResponsavel.length === 0 ||
              (formaJustificativa === "catalogo" && !justificativa)
            }
          >
            Registrar entrada
          </Button>
        </div>
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
              className="superficie-vidro flex items-start justify-between gap-3 p-4"
            >
              <div className="min-w-0">
                <h3 className="font-semibold break-words">{entrada.nome}</h3>
                <CaixasDeInfo
                  partes={[
                    entrada.turmaRotulo,
                    entrada.horario,
                    entrada.momento ? rotuloMomento(entrada.momento) : "",
                  ]}
                  className="mt-1"
                />
                <CaixasDeInfo partes={partesDoMotivo(entrada.motivo)} className="mt-2" />
                <p className="text-muted-foreground mt-1 text-xs">
                  Responsável pelo registro:{" "}
                  {entrada.responsavelRegistroNome ?? entrada.registradoPorNome}
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
    </div>
  );
}
