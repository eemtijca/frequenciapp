"use client";

// Registro e consulta de chegadas atrasadas com envio revisado para aba própria.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Trash2 } from "lucide-react";
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
  MOMENTOS_SAIDA,
  partesDoMotivo,
  rotuloMomento,
} from "@/domain/frequencia";
import type { EntradaAtrasada } from "@/domain/entradas";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { avisarSucesso } from "@/lib/avisos";
import { useContextoAtualizacao } from "@/components/atualizacao/contexto-atualizacao";
import { Button } from "@/components/ui/button";
import { AtualizadoDaVisao } from "@/components/ui/atualizado-em";
import { CaixasDeInfo } from "@/components/ui/caixas-de-info";
import { Campo } from "@/components/ui/campo";
import { GrupoOpcoes } from "@/components/ui/grupo-opcoes";
import { Input } from "@/components/ui/input";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { SeletorHorario } from "@/components/ui/seletor-horario";
import { VistaResumoMovimentacoes } from "@/components/movimentacoes/resumo-semana-movimentacoes";
import { DialogoConfirmarMovimentacao } from "@/components/movimentacoes/dialogo-confirmar-movimentacao";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
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
  ativo?: boolean;
  atualizacao?: number;
}
const OPCOES_MOMENTO = MOMENTOS_SAIDA.map((item) => ({ valor: item.codigo, rotulo: item.rotulo }));

export default function VistaEntradas({
  diaCorrente,
  fuso,
  turmas,
  alunos,
  liberadores,
  catalogoJustificativas,
  ativo = true,
  atualizacao = 0,
}: Props) {
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    domingoComoResumo: true,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
  const dia = nav.dia;
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
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [erro, setErro] = useState("");
  const [recorteCarregado, setRecorteCarregado] = useState("");
  const [versao, setVersao] = useState(0);
  const [remover, setRemover] = useState<EntradaAtrasada | null>(null);
  const [verDomingo, setVerDomingo] = useState(false);
  const [entradasDomingo, setEntradasDomingo] = useState<EntradaAtrasada[]>([]);
  const [carregandoDomingo, setCarregandoDomingo] = useState(false);
  const marcarAtualizado = useContextoAtualizacao()?.marcarAtualizado;
  const mensagemErro = useCallback(
    (erro: unknown) =>
      erro instanceof ErroApi
        ? erro.message
        : "Não foi possível concluir a operação. Tente novamente.",
    [],
  );
  const recorte = `${dia}|${turma}|${versao}|${atualizacao}`;
  const carregando = !nav.resumo && recorteCarregado !== recorte;
  useEffect(() => {
    if (nav.resumo) return;
    let viva = true;
    pedir<{ entradas: EntradaAtrasada[] }>(
      `/api/entradas?de=${dia}&ate=${dia}${turma ? `&turmaId=${turma}` : ""}`,
    )
      .then((dados) => {
        if (!viva) return;
        setEntradas(dados.entradas);
        marcarAtualizado?.("saidas");
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
  }, [dia, turma, versao, recorte, mensagemErro, nav.resumo, marcarAtualizado]);

  useEffect(() => {
    if (!verDomingo || !nav.domingo) return;
    let viva = true;
    pedir<{ entradas: EntradaAtrasada[] }>(`/api/entradas?de=${nav.domingo}&ate=${nav.domingo}`)
      .then((dados) => {
        if (viva) setEntradasDomingo(dados.entradas);
      })
      .catch(() => {
        if (viva) setEntradasDomingo([]);
      })
      .finally(() => {
        if (viva) setCarregandoDomingo(false);
      });
    return () => {
      viva = false;
    };
  }, [verDomingo, nav.domingo, versao, atualizacao]);

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
    setErro("");
    nav.escolherDia(valor);
  }

  function validarEntrada(): boolean {
    if (!alunoId || !momento || !responsavelCodigo) {
      setErro("Escolha o aluno, o momento da entrada e o responsável.");
      return false;
    }
    if (formaJustificativa === "texto" && motivo.trim().length < 2) {
      setErro("Escreva a justificativa em poucas palavras.");
      return false;
    }
    if (formaJustificativa === "catalogo" && !justificativa) {
      setErro("Escolha o tipo de justificativa.");
      return false;
    }
    return true;
  }

  function abrirConfirmacao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (executando) return;
    if (!validarEntrada()) return;
    setConfirmacaoAberta(true);
  }

  async function registrarEntrada() {
    if (executando) return;
    if (!validarEntrada()) {
      setConfirmacaoAberta(false);
      return;
    }
    setConfirmacaoAberta(false);
    await executar(async () => {
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
  }

  const alunoConfirmacao = alunos.find((item) => item.id === alunoId);
  const justificativaConfirmacao =
    formaJustificativa === "texto"
      ? motivo.trim()
      : (catalogoJustificativas.find((item) => item.codigo === justificativa)?.rotulo ??
        justificativa);
  const responsavelConfirmacao =
    liberadores.find((item) => item.codigo === responsavelCodigo)?.rotulo ?? "";

  return (
    <div className="space-y-5 pb-6">
      <h1 className="sr-only">Entradas atrasadas</h1>
      <div className="navegacao-dia flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia anterior"
          disabled={executando}
          onClick={() => {
            setVerDomingo(false);
            nav.anterior();
          }}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="entrada-dia"
            modo="dia"
            valor={nav.resumo ? (nav.domingo ?? "") : dia}
            max={diaCorrente}
            calendarioSemanal
            mostrarSelo={!nav.resumo}
            rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da entrada"}
            rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : dia.split("-").reverse().join("/")}
            detalhe={nav.resumo ? "semana" : rotuloDiaSemana(dia).replace("-feira", "")}
            disabled={executando}
            onAbertoChange={setCalendarioAberto}
            onValor={(proximo) => {
              setVerDomingo(false);
              escolherDia(proximo);
            }}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia seguinte"
          disabled={executando || nav.seguinteDesabilitado}
          onClick={() => {
            setVerDomingo(false);
            nav.seguinte();
          }}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {!nav.resumo && (
        <div className="flex justify-end">
          <AtualizadoDaVisao fuso={fuso} />
        </div>
      )}
      {nav.resumo && nav.semana ? (
        <VistaResumoMovimentacoes
          tipo="entrada"
          turmas={turmas}
          alunos={alunos}
          dias={nav.semana}
          domingo={nav.domingo}
          versao={atualizacao}
          ativo={ativo}
          pausado={calendarioAberto}
          fuso={fuso}
          onAbrirDia={(proximo) => {
            setTurma("");
            setAlunoId("");
            setVerDomingo(false);
            nav.escolherDia(proximo);
          }}
          onVerDomingo={() => {
            setTurma("");
            setAlunoId("");
            setCarregandoDomingo(true);
            setVerDomingo(true);
          }}
        />
      ) : null}
      {nav.resumo && verDomingo && nav.domingo ? (
        <section className="superficie flex flex-col gap-3 p-4" aria-label="Registros do domingo">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Entradas de {rotuloData(nav.domingo)}</h2>
            <Button
              type="button"
              variant="link"
              className="min-h-11 px-0"
              onClick={() => setVerDomingo(false)}
            >
              Voltar ao resumo
            </Button>
          </div>
          {carregandoDomingo ? (
            <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
              Carregando entradas...
            </p>
          ) : entradasDomingo.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma entrada registrada neste domingo.
            </p>
          ) : (
            <ul className="divide-y">
              {entradasDomingo.map((entrada) => (
                <li key={entrada.id} className="flex items-start justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium break-words">{entrada.nome}</p>
                    <CaixasDeInfo
                      partes={[
                        entrada.turmaRotulo,
                        entrada.horario,
                        entrada.momento ? rotuloMomento(entrada.momento) : "",
                      ]}
                      className="mt-1"
                    />
                    <CaixasDeInfo partes={partesDoMotivo(entrada.motivo)} className="mt-2" />
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="text-falta-texto"
                    aria-label={`Remover entrada de ${entrada.nome}`}
                    disabled={executando}
                    onClick={() => setRemover(entrada)}
                  >
                    <Trash2 size={18} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {!nav.resumo && (
        <>
          <form
            className="superficie flex flex-col gap-4 p-4"
            onSubmit={abrirConfirmacao}
            noValidate
          >
            <h2 className="font-medium">Registrar entrada</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Campo id="entrada-turma" rotulo="Turma">
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
              </Campo>
              <Campo id="entrada-aluno" rotulo="Aluno" className="md:col-span-1 xl:col-span-2">
                <Selecionar
                  id="entrada-aluno"
                  value={alunoId}
                  onValueChange={setAlunoId}
                  disabled={executando}
                  buscavel
                  opcoes={opcoesAluno}
                  placeholder="Selecione o aluno"
                />
              </Campo>
              <Campo id="entrada-momento" rotulo="Momento da entrada">
                <Selecionar
                  id="entrada-momento"
                  value={momento}
                  disabled={executando}
                  onValueChange={setMomento}
                  placeholder="Selecione a aula ou pausa"
                  opcoes={OPCOES_MOMENTO}
                />
              </Campo>
              <Campo id="entrada-horario" rotulo="Horário da chegada">
                <SeletorHorario
                  id="entrada-horario"
                  valor={horario}
                  onValor={setHorario}
                  rotuloAcessivel="Horário da chegada"
                  agora={horaNoFuso(new Date().toISOString(), fuso)}
                  disabled={executando}
                />
              </Campo>
              <fieldset className="flex flex-col gap-2 md:col-span-2 xl:col-span-3">
                <legend className="text-sm font-medium">Justificativa</legend>
                <GrupoOpcoes
                  rotulo="Forma da justificativa"
                  valor={formaJustificativa}
                  disabled={executando}
                  onValor={(valor) => {
                    setFormaJustificativa(valor);
                    setMotivo("");
                    setJustificativa("");
                    setObservacao("");
                  }}
                  opcoes={[
                    { valor: "texto", rotulo: "Escrever" },
                    { valor: "catalogo", rotulo: "Selecionar tipo" },
                  ]}
                />
                {formaJustificativa === "texto" ? (
                  <Campo id="entrada-motivo" rotulo="Texto da justificativa">
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
                  </Campo>
                ) : (
                  <>
                    <Campo id="entrada-justificativa" rotulo="Tipo">
                      <Selecionar
                        id="entrada-justificativa"
                        value={justificativa}
                        disabled={executando}
                        onValueChange={setJustificativa}
                        placeholder="Selecione a justificativa"
                        opcoes={opcoesJustificativa}
                      />
                    </Campo>
                    <Campo id="entrada-observacao" rotulo="Observação">
                      <Input
                        id="entrada-observacao"
                        value={observacao}
                        disabled={executando}
                        maxLength={100}
                        onChange={(e) => setObservacao(e.target.value)}
                        placeholder="Opcional: descreva brevemente o motivo"
                        className="h-11"
                      />
                    </Campo>
                  </>
                )}
              </fieldset>
              <Campo
                id="entrada-responsavel"
                rotulo="Responsável pelo registro"
                descricao={
                  opcoesResponsavel.length === 0
                    ? "Nenhum responsável cadastrado. Cadastre em Gestão, Configurações."
                    : undefined
                }
              >
                <Selecionar
                  id="entrada-responsavel"
                  value={responsavelCodigo}
                  disabled={executando}
                  onValueChange={setResponsavelCodigo}
                  placeholder="Selecione quem registrou"
                  opcoes={opcoesResponsavel}
                />
              </Campo>
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
              <p className="text-muted-foreground text-sm">
                Nenhuma entrada registrada neste recorte.
              </p>
            ) : (
              entradas.map((entrada) => (
                <article
                  key={entrada.id}
                  className="superficie flex items-start justify-between gap-3 p-4"
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
                    variant="secondary"
                    size="icon"
                    className="text-falta-texto"
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
        </>
      )}
      <DialogoConfirmarMovimentacao
        aberto={confirmacaoAberta}
        onAbrir={setConfirmacaoAberta}
        titulo="Registrar entrada?"
        descricao="Confira os dados antes de registrar. Depois de salvo, o lançamento aparece na lista do dia e nos relatórios."
        rotuloConfirmar="Registrar entrada"
        onConfirmar={() => void registrarEntrada()}
        itens={[
          { rotulo: "Aluno", valor: alunoConfirmacao?.nome ?? "" },
          {
            rotulo: "Turma",
            valor: alunoConfirmacao ? (turmasPorId.get(alunoConfirmacao.turmaId) ?? "") : "",
          },
          { rotulo: "Dia", valor: rotuloData(dia) },
          { rotulo: "Momento", valor: momento ? rotuloMomento(momento) : "" },
          { rotulo: "Horário", valor: horario },
          { rotulo: "Justificativa", valor: justificativaConfirmacao },
          {
            rotulo: "Observação",
            valor: formaJustificativa === "catalogo" ? observacao.trim() : "",
          },
          { rotulo: "Responsável", valor: responsavelConfirmacao },
        ]}
      />
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
