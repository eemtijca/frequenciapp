"use client";

// Registro e consulta de chegadas atrasadas com envio revisado para aba própria.
import { OrganizarPlanilha } from "@/components/gestao/dialogo-organizar-planilha";
import { useCallback, useEffect, useState } from "react";
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
  rotuloMomento,
} from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { avisarSucesso } from "@/lib/avisos";
import { Button } from "@/components/ui/button";
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
  liberadores,
  catalogoJustificativas,
  podePrepararPlanilha,
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
  const opcoesResponsavel = liberadores
    .filter((item) => item.ativo)
    .map((item) => ({ valor: item.codigo, rotulo: item.rotulo }));
  function escolherDia(valor: string) {
    setDia(valor);
    setPrevia(null);
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
            detalhe={rotuloDiaSemana(dia)}
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
        className="superficie-vidro flex flex-col gap-3 p-4"
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
            setPrevia(null);
            setVersao((valor) => valor + 1);
            avisarSucesso("Entrada registrada.");
          });
        }}
      >
        <h2 className="font-medium">Registro</h2>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
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
              ...turmas
                .filter((item) => alunos.some((aluno) => aluno.ativo && aluno.turmaId === item.id))
                .map((item) => ({ valor: item.id, rotulo: item.rotulo })),
            ]}
          />
        </div>
        <div className="flex flex-col gap-1.5">
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
            placeholder="Selecione o aluno"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="entrada-momento">Momento da entrada</Label>
          <Selecionar
            id="entrada-momento"
            value={momento}
            disabled={executando}
            onValueChange={setMomento}
            placeholder="Selecione a aula ou pausa"
            opcoes={MOMENTOS_SAIDA.map((item) => ({ valor: item.codigo, rotulo: item.rotulo }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
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
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Justificativa</legend>
          <div
            role="radiogroup"
            aria-label="Forma da justificativa"
            className="flex flex-wrap gap-2"
          >
            {(
              [
                { valor: "texto", rotulo: "Escrever em poucas palavras" },
                { valor: "catalogo", rotulo: "Tipos de justificativa" },
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
                className="controle-vidro pressionavel flex h-11 items-center px-4 text-sm font-medium transition-colors"
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
                placeholder="Escreva a justificativa em poucas palavras"
                className="h-11"
              />
              <p className="text-muted-foreground text-xs">
                Até 100 caracteres. Este texto é a justificativa da entrada.
              </p>
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
                  opcoes={catalogoJustificativas
                    .filter((item) => item.ativo)
                    .map((item) => ({
                      valor: item.codigo,
                      rotulo: `${item.codigo} · ${item.rotulo}`,
                    }))}
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
              Nenhum nome cadastrado. A administração cadastra em Gestão, Configurações, Quem
              libera.
            </p>
          )}
        </div>
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
                <p className="text-muted-foreground text-sm">
                  {entrada.turmaRotulo} · {entrada.horario}
                  {entrada.momento ? ` · ${rotuloMomento(entrada.momento)}` : ""}
                </p>
                <p className="mt-2 text-sm break-words">{entrada.motivo}</p>
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
      <section className="superficie-vidro space-y-3 p-4" aria-label="Planilha de entradas">
        <h2 className="sr-only">Planilha de entradas</h2>
        {estado?.podeEnviar ? (
          <>
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
              {podePrepararPlanilha && (
                <OrganizarPlanilha
                  rota="/api/planilha-entradas/organizar"
                  aba="Entradas"
                  disabled={executando}
                />
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
              A aba Entradas da planilha {estado?.planilhaNome} receberá a mesma organização visual
              de Saídas. Os registros serão preservados. A aba Sheet1 será removida somente se
              estiver vazia e a aba de saídas estiver configurada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={executando}
              onClick={(e) => {
                e.preventDefault();
                void executar(async () => {
                  const dados = await pedir<{
                    criada: boolean;
                    sheet1: "ausente" | "removida" | "mantida";
                  }>("/api/planilha-entradas/preparar", { method: "POST" });
                  setConfirmarAba(false);
                  avisarSucesso(
                    `${dados.criada ? "Aba Entradas criada e organizada." : "Aba Entradas organizada."}${
                      dados.sheet1 === "removida"
                        ? " Sheet1 removida."
                        : dados.sheet1 === "mantida"
                          ? " Sheet1 mantida para conferência."
                          : ""
                    }`,
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
