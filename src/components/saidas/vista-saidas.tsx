"use client";

// Saiu mais cedo: registro da saída antecipada e lista das saídas do dia, com
// remoção para corrigir um registro. Separado da chamada. O relatório por aluno
// fica em Relatórios, Saídas e entradas.
import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type {
  Aluno,
  JustificativaConfigurada,
  LiberadorConfigurado,
  SaidaAntecipada,
  Turma,
} from "@/domain/frequencia";
import {
  diaSeguinte,
  ehMomentoDeAula,
  horaNoFuso,
  JUSTIFICATIVA_OUTROS,
  LIMITE_TEXTO_SAIDA,
  MOMENTOS_SAIDA,
  partesJustificativaSaida,
  rotuloDiaSemana,
  rotuloMomento,
} from "@/domain/frequencia";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { CaixasDeInfo } from "@/components/ui/caixas-de-info";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { SeletorHorario } from "@/components/ui/seletor-horario";

interface Props {
  diaCorrente: string;
  fuso: string;
  mes: string;
  turmas: Turma[];
  alunos: Aluno[];
  catalogoJustificativas: JustificativaConfigurada[];
  liberadores: LiberadorConfigurado[];
  saidas: SaidaAntecipada[];
  onSaidasMudaram: (mes: string) => Promise<void>;
  /** Usado pela área de movimentações; esta vista não precisa dele. */
  ativo?: boolean;
}

type FormaJustificativa = "texto" | "catalogo";

export default function VistaSaidas({
  diaCorrente,
  fuso,
  mes,
  turmas,
  alunos,
  catalogoJustificativas,
  liberadores,
  saidas,
  onSaidasMudaram,
}: Props) {
  const [dia, setDia] = useState(diaCorrente);
  const [turmaFiltro, setTurmaFiltro] = useState("");
  const [alunoId, setAlunoId] = useState("");
  const [momento, setMomento] = useState("");
  const [horario, setHorario] = useState(() => horaNoFuso(new Date().toISOString(), fuso));
  const [formaJustificativa, setFormaJustificativa] = useState<FormaJustificativa>("catalogo");
  const [justificativa, setJustificativa] = useState("");
  const [texto, setTexto] = useState("");
  const [observacao, setObservacao] = useState("");
  const [responsavelCodigo, setResponsavelCodigo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [doDia, setDoDia] = useState<SaidaAntecipada[] | null>(null);
  const [carregandoDia, setCarregandoDia] = useState(false);
  const [recarregarDia, setRecarregarDia] = useState(0);
  const [saidaRemover, setSaidaRemover] = useState<SaidaAntecipada | null>(null);

  const { chaveAtiva: removendoId, executar: executarRemocao } = useAcoesPorChave();

  const rotuloTurma = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "Sem turma";
  }, [turmas]);

  const opcoesJustificativa = useMemo(
    () =>
      catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: `${item.codigo} · ${item.rotulo}` })),
    [catalogoJustificativas],
  );

  const opcoesLiberador = useMemo(
    () =>
      liberadores
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: item.rotulo })),
    [liberadores],
  );

  const alunosPorId = useMemo(() => new Map(alunos.map((aluno) => [aluno.id, aluno])), [alunos]);

  const compartilhado = dia.startsWith(mes);
  const duranteAula = ehMomentoDeAula(momento);

  useEffect(() => {
    if (compartilhado) {
      setDoDia(null);
      return;
    }
    let viva = true;
    setCarregandoDia(true);
    pedir<{ saidas: SaidaAntecipada[] }>(`/api/saidas?dia=${dia}`)
      .then((dados) => {
        if (viva) setDoDia(dados.saidas);
      })
      .catch((excecao: unknown) => {
        if (viva) {
          setErro(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar as saídas.",
          );
          setErroVariante(estadoDeErro(excecao));
        }
      })
      .finally(() => {
        if (viva) setCarregandoDia(false);
      });
    return () => {
      viva = false;
    };
  }, [compartilhado, dia, recarregarDia]);

  const saidasDoDia = useMemo(
    () => (compartilhado ? saidas.filter((saida) => saida.dia === dia) : (doDia ?? [])),
    [compartilhado, dia, saidas, doDia],
  );

  const opcoesTurma = useMemo(() => {
    const comAlunos = new Set(alunos.filter((aluno) => aluno.ativo).map((aluno) => aluno.turmaId));
    return [
      { valor: "", rotulo: "Todas as turmas" },
      ...turmas
        .filter((turma) => comAlunos.has(turma.id))
        .map((turma) => ({ valor: turma.id, rotulo: turma.rotulo })),
    ];
  }, [alunos, turmas]);

  const alunosFiltrados = useMemo(() => {
    return alunos
      .filter((aluno) => aluno.ativo)
      .filter((aluno) => (turmaFiltro ? aluno.turmaId === turmaFiltro : true))
      .sort(
        (a, b) =>
          rotuloTurma(a.turmaId).localeCompare(rotuloTurma(b.turmaId), "pt-BR") ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [alunos, turmaFiltro, rotuloTurma]);
  const opcoesAluno = useMemo(
    () =>
      alunosFiltrados.map((aluno) => ({
        valor: aluno.id,
        rotulo: `${aluno.nome} · ${rotuloTurma(aluno.turmaId)}`,
      })),
    [alunosFiltrados, rotuloTurma],
  );

  function partesDaSaida(saida: SaidaAntecipada, turma: string): string[] {
    const partes = partesJustificativaSaida(saida, catalogoJustificativas);
    return [
      turma,
      saida.horario ?? "",
      rotuloMomento(saida.momento),
      partes.motivo,
      partes.complemento ?? "",
    ].filter(Boolean);
  }

  async function registrar() {
    if (enviando) return;
    if (!alunoId || !momento || !responsavelCodigo) {
      setErro("Escolha o aluno, o momento da saída e quem liberou.");
      return;
    }
    if (formaJustificativa === "catalogo" && !justificativa) {
      setErro("Escolha o tipo de justificativa.");
      return;
    }
    if (formaJustificativa === "texto" && texto.trim() === "") {
      setErro("Escreva a justificativa em poucas palavras.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      await pedir<{ saida: SaidaAntecipada }>(
        "/api/saidas",
        corpoJson({
          alunoId,
          dia,
          momento,
          horario,
          justificativa: formaJustificativa === "catalogo" ? justificativa : undefined,
          texto:
            formaJustificativa === "texto"
              ? texto.trim()
              : duranteAula && texto.trim() !== ""
                ? texto.trim()
                : undefined,
          observacao:
            formaJustificativa === "catalogo" &&
            !duranteAula &&
            justificativa === JUSTIFICATIVA_OUTROS &&
            observacao.trim() !== ""
              ? observacao
              : undefined,
          liberadoPorCodigo: responsavelCodigo,
        }),
      );
      avisarSucesso(
        "Saída registrada.",
        "O registro aparece em Saídas, no dia de hoje, e nos relatórios.",
      );
      setAlunoId("");
      setMomento("");
      setFormaJustificativa("catalogo");
      setJustificativa("");
      setTexto("");
      setObservacao("");
      setResponsavelCodigo("");
      if (compartilhado) {
        await onSaidasMudaram(dia.slice(0, 7));
      } else {
        setRecarregarDia((valor) => valor + 1);
      }
    } catch (excecao) {
      const mensagem =
        excecao instanceof ErroApi ? excecao.message : "Não foi possível registrar a saída.";
      setErro(mensagem);
      setErroVariante(estadoDeErro(excecao));
      if (!(excecao instanceof ErroApi && excecao.status === 401)) toast.error(mensagem);
    } finally {
      setEnviando(false);
    }
  }

  function remover(saida: SaidaAntecipada) {
    setSaidaRemover(saida);
  }

  function confirmarRemocao() {
    if (!saidaRemover) return;
    const saida = saidaRemover;
    setSaidaRemover(null);
    void executarRemocao(saida.id, async () => {
      try {
        await pedir<{ ok: boolean }>(`/api/saidas/${saida.id}`, { method: "DELETE" });
        toast.success("Saída removida.");
        if (compartilhado) {
          await onSaidasMudaram(dia.slice(0, 7));
        } else {
          setRecarregarDia((valor) => valor + 1);
        }
      } catch (excecao) {
        if (!(excecao instanceof ErroApi && excecao.status === 401)) {
          toast.error(
            excecao instanceof ErroApi ? excecao.message : "Não foi possível remover a saída.",
          );
        }
      }
    });
  }

  const rotuloDia = dia.split("-").reverse().join("/");

  return (
    <section aria-label="Saídas antecipadas" className="flex flex-col gap-4 pb-6">
      <h1 className="sr-only">Saiu mais cedo</h1>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia anterior"
          onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-saidas"
            modo="dia"
            valor={dia}
            max={diaCorrente}
            rotuloAcessivel="Data da saída"
            rotulo={rotuloDia}
            detalhe={rotuloDiaSemana(dia)}
            onValor={setDia}
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          aria-label="Dia seguinte"
          disabled={dia >= diaCorrente}
          onClick={() => setDia((atual) => diaSeguinte(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>

      <form
        className="superficie-vidro flex flex-col gap-3 p-4"
        onSubmit={(evento) => {
          evento.preventDefault();
          void registrar();
        }}
        noValidate
      >
        <h2 className="font-medium">Registro</h2>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="saida-turma">Turma</Label>
          <Selecionar
            id="saida-turma"
            value={turmaFiltro}
            onValueChange={setTurmaFiltro}
            placeholder="Todas as turmas"
            opcoes={opcoesTurma}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saida-aluno">Aluno</Label>
          <Selecionar
            id="saida-aluno"
            value={alunoId}
            onValueChange={setAlunoId}
            buscavel
            placeholder="Selecione o aluno"
            opcoes={opcoesAluno}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="saida-momento">Momento da saída</Label>
          <Selecionar
            id="saida-momento"
            value={momento}
            onValueChange={setMomento}
            placeholder="Selecione a aula ou pausa"
            opcoes={MOMENTOS_SAIDA.map((item) => ({
              valor: item.codigo,
              rotulo: item.rotulo,
            }))}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:max-w-xs">
          <Label htmlFor="saida-horario">Horário da saída</Label>
          <SeletorHorario
            id="saida-horario"
            valor={horario}
            onValor={setHorario}
            rotuloAcessivel="Horário da saída"
            agora={horaNoFuso(new Date().toISOString(), fuso)}
            disabled={enviando}
          />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Justificativa</legend>
          <div
            role="radiogroup"
            aria-label="Forma da justificativa"
            className="flex flex-wrap gap-2"
          >
            <button
              type="button"
              role="radio"
              aria-checked={formaJustificativa === "texto"}
              onClick={() => {
                setFormaJustificativa("texto");
                setJustificativa("");
                setObservacao("");
              }}
              className="controle-vidro pressionavel flex h-11 items-center px-4 text-sm font-medium transition-colors"
            >
              Escrever
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={formaJustificativa === "catalogo"}
              onClick={() => {
                setFormaJustificativa("catalogo");
                setTexto("");
              }}
              className="controle-vidro pressionavel flex h-11 items-center px-4 text-sm font-medium transition-colors"
            >
              Selecionar tipo
            </button>
          </div>
          {formaJustificativa === "texto" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="saida-texto">Texto da justificativa</Label>
                <span className="text-muted-foreground numerais-tabulares text-xs">
                  {texto.length}/{LIMITE_TEXTO_SAIDA}
                </span>
              </div>
              <Input
                id="saida-texto"
                value={texto}
                maxLength={LIMITE_TEXTO_SAIDA}
                onChange={(evento) => setTexto(evento.target.value)}
                placeholder="Descreva o motivo"
                className="h-11"
              />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="saida-justificativa">Tipo</Label>
                <Selecionar
                  id="saida-justificativa"
                  value={justificativa}
                  onValueChange={setJustificativa}
                  placeholder="Selecione a justificativa"
                  opcoes={opcoesJustificativa}
                />
              </div>
              {duranteAula ? (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="saida-texto">Texto da justificativa</Label>
                    <span className="text-muted-foreground numerais-tabulares text-xs">
                      {texto.length}/{LIMITE_TEXTO_SAIDA}
                    </span>
                  </div>
                  <Input
                    id="saida-texto"
                    value={texto}
                    maxLength={LIMITE_TEXTO_SAIDA}
                    onChange={(evento) => setTexto(evento.target.value)}
                    placeholder="Opcional: descreva a saída durante a aula"
                    className="h-11"
                  />
                  <p className="text-muted-foreground text-xs">Opcional. Aparece nos relatórios.</p>
                </div>
              ) : justificativa === JUSTIFICATIVA_OUTROS ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="saida-observacao">Observação</Label>
                  <Input
                    id="saida-observacao"
                    value={observacao}
                    maxLength={200}
                    onChange={(evento) => setObservacao(evento.target.value)}
                    placeholder="Descreva brevemente o motivo"
                    className="h-11"
                  />
                </div>
              ) : null}
            </>
          )}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="saida-responsavel">Responsável pela liberação</Label>
          <Selecionar
            id="saida-responsavel"
            value={responsavelCodigo}
            onValueChange={setResponsavelCodigo}
            placeholder="Selecione quem liberou"
            opcoes={opcoesLiberador}
          />
          {opcoesLiberador.length === 0 && (
            <p className="text-muted-foreground text-xs">
              Nenhum nome cadastrado. A administração cadastra em Gestão, Configurações.
            </p>
          )}
        </div>
        {erro && <AvisoCompacto variante={erroVariante} descricao={erro} tamanho="linha" />}
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full px-6 sm:w-auto"
          disabled={enviando || opcoesLiberador.length === 0}
        >
          {enviando && <LoaderCircle size={16} className="animate-spin" />}
          Registrar saída
        </Button>
      </form>

      {carregandoDia ? (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
          <LoaderCircle size={16} className="animate-spin" aria-hidden="true" />
          Carregando saídas...
        </p>
      ) : (
        saidasDoDia.length > 0 && (
          <ul aria-label={`Saídas de ${rotuloDia}`} className="flex flex-col gap-3">
            {saidasDoDia.map((saida) => {
              const aluno = alunosPorId.get(saida.alunoId);
              const nome = aluno?.nome ?? "Aluno";
              return (
                <li
                  key={saida.id}
                  className="superficie-vidro flex items-start justify-between gap-3 p-4"
                >
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{nome}</p>
                    <CaixasDeInfo
                      partes={partesDaSaida(saida, rotuloTurma(aluno?.turmaOriginalId ?? ""))}
                      className="mt-1"
                    />
                    <p className="text-muted-foreground mt-1 text-xs">
                      Liberado por {saida.liberadoPorNome ?? "registro anterior"}
                      {saida.criadoEm ? ` às ${horaNoFuso(saida.criadoEm, fuso)}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover saída de ${nome}`}
                    disabled={removendoId === saida.id}
                    onClick={() => remover(saida)}
                  >
                    <Trash2 size={18} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )
      )}
      <AlertDialog
        open={saidaRemover !== null}
        onOpenChange={(aberto) => !aberto && setSaidaRemover(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta saída?</AlertDialogTitle>
            <AlertDialogDescription>
              A saída de {alunosPorId.get(saidaRemover?.alunoId ?? "")?.nome ?? "aluno"} em{" "}
              {saidaRemover?.dia.split("-").reverse().join("/") ?? ""} sai da lista do dia e dos
              relatórios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={confirmarRemocao}
              disabled={saidaRemover !== null && removendoId === saidaRemover.id}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
