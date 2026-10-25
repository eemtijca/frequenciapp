"use client";

// Conferência personalizada da chamada salva, com ajustes por aluno e confirmação na Seduc.
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  LoaderCircle,
  Pencil,
  Plus,
  Trash2,
  CalendarOff,
} from "lucide-react";
import type {
  Aluno,
  ConfirmacaoSeducAluno,
  Serie,
  Turma,
  JustificativaConfigurada,
} from "@/domain/frequencia";
import {
  JUSTIFICATIVA_OUTROS,
  alunoDesistenteNoDia,
  normalizar,
  rotuloDiaSemana,
} from "@/domain/frequencia";
import { limiteAgendamentoParcial, type FrequenciaParcial } from "@/domain/frequencia-parcial";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import {
  exigeConferenciaSeduc,
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
  type FrequenciaDaChamada,
} from "@/domain/frequencia-personalizada";
import { VistaResumoSemana } from "@/components/chamada/resumo-semana";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { avisarErro, avisarInfo, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { Switch } from "@/components/ui/switch";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
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
import {
  DialogoFrequenciaParcial,
  assinaturaDaEdicao,
  edicaoDoRegistro,
  type EdicaoParcial,
} from "./dialogo-frequencia-parcial";
import { DialogoEnviarParciais } from "./dialogo-enviar-parciais";

interface Props {
  series: Serie[];
  turmas: Turma[];
  alunos: Aluno[];
  diaInicial: string;
  ativa: boolean;
  fuso: string;
  feriados: Feriado[];
  mostrarSaidas: boolean;
  justificativas: JustificativaConfigurada[];
  onFrequenciasMudaram?: () => Promise<void>;
  onPendencia?: (pendente: boolean) => void;
}

interface EstadoPlanilha {
  podeEnviar: boolean;
  planilhaNome: string | null;
}

interface CargaParcial {
  chave: string;
  registros: RegistroPersonalizado[];
  erro: string;
  variante: VarianteEstado;
  feriado?: Feriado | null;
}

const REGISTROS_VAZIOS: RegistroPersonalizado[] = [];

function resumoDoRegistro(
  registro: RegistroPersonalizado | undefined,
  catalogo: JustificativaConfigurada[],
): string {
  if (!registro) return "Sem registro";
  if (registro.tipo === "JUSTIFICADA") {
    const motivo =
      catalogo.find((j) => j.codigo === registro.justificativa)?.rotulo ??
      registro.justificativaRotulo ??
      registro.justificativa ??
      "Falta justificada";
    return registro.justificativa === JUSTIFICATIVA_OUTROS && registro.observacao
      ? `${motivo}: ${registro.observacao}`
      : motivo;
  }
  if (registro.tipo !== "CHAMADA") {
    return registro.tipo === "DIA_INTEIRO"
      ? "Presente"
      : `Presente · ${rotuloFrequenciaPersonalizada(registro)}`;
  }
  if (registro.marca === "P") return "Presente";
  const motivos = registro.justificativas.join(" · ");
  if (registro.marca === "FJ") return motivos || "Falta justificada";
  return [registro.marca === "F" ? "Falta" : registro.descricao, motivos]
    .filter(Boolean)
    .join(" · ");
}

function momentoDaConfirmacao(
  registro: RegistroPersonalizado,
  formatador: Intl.DateTimeFormat,
): string {
  if (!registro.registradoSeducEm) return "";
  return formatador.format(new Date(registro.registradoSeducEm));
}

export default function VistaFrequenciaParcial({
  series,
  turmas,
  alunos,
  diaInicial,
  ativa,
  fuso,
  feriados,
  mostrarSaidas,
  justificativas,
  onFrequenciasMudaram,
  onPendencia,
}: Props) {
  // No domingo, a abertura é o resumo da semana encerrada.
  const limite = limiteAgendamentoParcial(diaInicial);
  const nav = useNavegacaoDoDia({ diaCorrente: diaInicial, max: limite });
  const dia = nav.dia;
  const formatadorConfirmacao = useMemo(
    () =>
      new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: fuso,
      }),
    [fuso],
  );
  const [turmaSelecionada, setTurmaId] = useState(turmas[0]?.id ?? "");
  const turmaId = turmas.some((item) => item.id === turmaSelecionada)
    ? turmaSelecionada
    : (turmas[0]?.id ?? "");
  const [carga, setCarga] = useState<CargaParcial>({
    chave: "",
    registros: [],
    erro: "",
    variante: "indisponivel",
  });
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [recarregar, setRecarregar] = useState(0);
  const feriadoCadastrado = feriadoNaData(feriados, dia);
  const nomeFeriadoNoCadastro = feriadoCadastrado?.nome ?? "";
  const chaveCarga = JSON.stringify([dia, turmaId, recarregar, nomeFeriadoNoCadastro]);
  const feriado =
    carga.chave === chaveCarga && carga.feriado !== undefined ? carga.feriado : feriadoCadastrado;
  const registros = carga.chave === chaveCarga ? carga.registros : REGISTROS_VAZIOS;
  const carregando = !nav.resumo && turmaId !== "" && carga.chave !== chaveCarga;
  const erro = carga.chave === chaveCarga ? carga.erro : "";
  const [editorAberto, setEditorAberto] = useState(false);
  const [baseEdicao, setBaseEdicao] = useState<FrequenciaDaChamada | null>(null);
  const [registroEditado, setRegistroEditado] = useState<FrequenciaParcial | null>(null);
  const [edicao, setEdicao] = useState<EdicaoParcial>(edicaoDoRegistro());
  const [assinaturaInicial, setAssinaturaInicial] = useState(
    assinaturaDaEdicao(edicaoDoRegistro()),
  );
  const [erroEdicao, setErroEdicao] = useState("");
  const [conflito, setConflito] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);
  const [registroRemover, setRegistroRemover] = useState<FrequenciaParcial | null>(null);
  const [estadoPlanilha, setEstadoPlanilha] = useState<EstadoPlanilha | null>(null);
  const [envioAberto, setEnvioAberto] = useState(false);
  const sujo = editorAberto && assinaturaDaEdicao(edicao) !== assinaturaInicial;

  const atualizarTela = useCallback(() => {
    if (sujo) {
      avisarInfo("Salve ou descarte as alterações antes de atualizar.");
      return;
    }
    setRecarregar((valor) => valor + 1);
  }, [sujo]);
  useAtualizacaoTela("chamada-parcial", atualizarTela);

  const turmasOrdenadas = useMemo(() => {
    const ordem = new Map(series.map((serie) => [serie.id, serie.ordem]));
    return [...turmas].sort(
      (a, b) =>
        (ordem.get(a.serieId) ?? 0) - (ordem.get(b.serieId) ?? 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [series, turmas]);
  const opcoesTurma = useMemo(
    () => turmasOrdenadas.map((item) => ({ valor: item.id, rotulo: item.rotulo })),
    [turmasOrdenadas],
  );
  const turma = turmas.find((item) => item.id === turmaId);
  const listaAlunos = useMemo(() => {
    const registrosPorAluno = new Map(registros.map((registro) => [registro.alunoId, registro]));
    const alunosPorId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
    const ids = new Set(
      alunos.filter((aluno) => aluno.ativo && aluno.turmaId === turmaId).map((aluno) => aluno.id),
    );
    // Registros salvos preservam o aluno e o nome históricos depois de uma transferência.
    for (const registro of registros) ids.add(registro.alunoId);
    return Array.from(ids, (id) => {
      const aluno = alunosPorId.get(id);
      const registro = registrosPorAluno.get(id);
      return {
        id,
        nome: registro?.alunoNome ?? aluno?.nome ?? "Aluno",
        ordem: aluno?.ordem ?? null,
        registro,
        desistente: aluno ? alunoDesistenteNoDia(aluno, dia) : false,
      };
    }).sort(
      (a, b) =>
        (a.ordem ?? Infinity) - (b.ordem ?? Infinity) || a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [alunos, registros, turmaId, dia]);
  const origemEdicao = registroEditado ?? baseEdicao;
  const alunosDaEdicao = useMemo(
    () =>
      origemEdicao
        ? [
            {
              ...(alunos.find((aluno) => aluno.id === origemEdicao.alunoId) ?? {
                turmaId: origemEdicao.turmaId,
                turmaOriginalId: origemEdicao.turmaId,
                ordem: 0,
                ativo: false,
              }),
              id: origemEdicao.alunoId,
              nome: origemEdicao.alunoNome,
            },
          ]
        : alunos.filter((aluno) => aluno.id === edicao.alunoId),
    [alunos, origemEdicao, edicao.alunoId],
  );
  const nomesParaBusca = useMemo(
    () => new Map(listaAlunos.map((aluno) => [aluno.id, normalizar(aluno.nome)])),
    [listaAlunos],
  );
  const alunosFiltrados = useMemo(() => {
    const termo = normalizar(busca);
    return listaAlunos.filter(
      (aluno) =>
        (nomesParaBusca.get(aluno.id) ?? "").includes(termo) &&
        (filtro === "todos" ||
          (filtro === "sem-registro"
            ? !aluno.registro
            : filtro === "pendentes"
              ? exigeConferenciaSeduc(aluno.registro) && !aluno.registro.registradoSeduc
              : exigeConferenciaSeduc(aluno.registro) && aluno.registro.registradoSeduc)),
    );
  }, [listaAlunos, nomesParaBusca, busca, filtro]);

  useEffect(() => {
    onPendencia?.(sujo);
  }, [sujo, onPendencia]);

  useEffect(() => () => onPendencia?.(false), [onPendencia]);

  useEffect(() => {
    if (!ativa || nav.resumo || !dia || !turmaId) return;
    let atual = true;
    pedir<{ registros: RegistroPersonalizado[]; feriado?: Feriado | null }>(
      `/api/frequencias-personalizadas?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
    )
      .then((dados) => {
        if (atual)
          setCarga({
            chave: chaveCarga,
            registros: dados.registros,
            erro: "",
            variante: "indisponivel",
            feriado: dados.feriado,
          });
      })
      .catch((excecao: unknown) => {
        if (!atual) return;
        setCarga({
          chave: chaveCarga,
          registros: [],
          erro: mensagemAmigavel(excecao, "Não foi possível carregar a chamada parcial."),
          variante: estadoDeErro(excecao),
        });
      });
    return () => {
      atual = false;
    };
  }, [ativa, dia, turmaId, chaveCarga, nav.resumo]);

  useEffect(() => {
    if (!ativa) return;
    let atual = true;
    pedir<EstadoPlanilha>("/api/planilha-parcial/estado")
      .then((dados) => {
        if (atual) setEstadoPlanilha(dados);
      })
      .catch(() => {
        if (atual) setEstadoPlanilha(null);
      });
    return () => {
      atual = false;
    };
  }, [ativa]);

  const atualizarRegistro = useCallback((registro: RegistroPersonalizado) => {
    setCarga((atual) => ({
      ...atual,
      registros: [...atual.registros.filter((item) => item.alunoId !== registro.alunoId), registro],
    }));
  }, []);

  function abrirEditor(registro: RegistroPersonalizado | null, alunoId: string) {
    if (feriado) return;
    const base = registro?.tipo === "CHAMADA" ? registro : null;
    const personalizado = registro?.tipo === "CHAMADA" ? null : registro;
    const inicial: EdicaoParcial = { ...edicaoDoRegistro(personalizado ?? undefined), alunoId };
    inicial.de = dia;
    inicial.ate = dia;
    if (base) {
      inicial.tipo =
        base.marca === "P" ? "DIA_INTEIRO" : base.marca === "FJ" ? "JUSTIFICADA" : "AULAS";
      inicial.justificativa = base.justificativa ?? "";
      inicial.observacao = base.observacao ?? "";
    }
    if (dia > diaInicial) inicial.tipo = "JUSTIFICADA";
    setBaseEdicao(base);
    setRegistroEditado(personalizado);
    setEdicao(inicial);
    setAssinaturaInicial(assinaturaDaEdicao(inicial));
    setErroEdicao("");
    setConflito(false);
    setEditorAberto(true);
  }

  function fecharEditor() {
    if (sujo) setDescartarAberto(true);
    else setEditorAberto(false);
  }

  const { executando: salvando, executar: salvar } = useAcaoUnica(async () => {
    if (!edicao.alunoId || conflito || feriado) return;
    setErroEdicao("");
    try {
      const dados = await pedir<{
        registro: FrequenciaParcial;
        registros?: FrequenciaParcial[];
        aviso?: string;
      }>(
        "/api/frequencias-parciais",
        corpoJson({
          alunoId: edicao.alunoId,
          dia: edicao.tipo === "JUSTIFICADA" ? edicao.de : dia,
          ...(edicao.tipo === "JUSTIFICADA"
            ? { ate: edicao.ate, justificativa: edicao.justificativa }
            : {}),
          turmaId: registroEditado?.turmaId ?? turmaId,
          tipo: edicao.tipo,
          turno: edicao.tipo === "TURNO" ? edicao.turno : null,
          aulas: edicao.tipo === "AULAS" ? edicao.aulas : [],
          observacao: edicao.observacao.trim() || null,
          revisao: registroEditado?.revisao ?? 0,
          ...(baseEdicao &&
          (edicao.tipo !== "JUSTIFICADA" || (edicao.de === dia && edicao.ate === dia))
            ? { baseChamada: { turmaId: baseEdicao.turmaId, revisao: baseEdicao.revisao } }
            : {}),
        }),
      );
      atualizarRegistro(dados.registro);
      setEditorAberto(false);
      if (dados.aviso) avisarInfo(dados.aviso);
      if (edicao.tipo === "JUSTIFICADA") {
        nav.escolherDia(dados.registro.dia);
        setRecarregar((v) => v + 1);
        avisarSucesso(
          `${dados.registros?.length ?? 1} ${(dados.registros?.length ?? 1) === 1 ? "dia justificado" : "dias justificados"}.`,
        );
        void onFrequenciasMudaram?.().catch((excecao) =>
          avisarErro(excecao, {
            contexto: "A justificativa foi salva. Não foi possível atualizar os indicadores.",
          }),
        );
      } else avisarSucesso("Frequência parcial salva.");
    } catch (excecao) {
      setErroEdicao(mensagemAmigavel(excecao, "Não foi possível salvar a frequência parcial."));
      setConflito(excecao instanceof ErroApi && excecao.status === 409);
    }
  });

  const { executando: recarregandoEdicao, executar: recarregarEdicao } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ registros: RegistroPersonalizado[]; feriado?: Feriado | null }>(
        `/api/frequencias-personalizadas?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
      );
      setCarga({
        chave: chaveCarga,
        registros: dados.registros,
        erro: "",
        variante: "indisponivel",
        feriado: dados.feriado,
      });
      const vigente = dados.registros.find((registro) => registro.alunoId === edicao.alunoId);
      if (vigente) abrirEditor(vigente, vigente.alunoId);
      else {
        setRegistroEditado(null);
        setBaseEdicao(null);
        setConflito(false);
        setErroEdicao("O registro foi removido. Confira os dados antes de criar novamente.");
      }
    } catch (excecao) {
      setErroEdicao(mensagemAmigavel(excecao, "Não foi possível carregar a versão salva."));
    }
  });

  const { chaveAtiva, executar: alterarPorChave } = useAcoesPorChave();
  function confirmarSeduc(registro: RegistroPersonalizado, registrado: boolean) {
    if (!exigeConferenciaSeduc(registro)) return;
    void alterarPorChave(registro.id, async () => {
      try {
        if (registro.tipo === "CHAMADA") {
          const dados = await pedir<{ confirmacao: ConfirmacaoSeducAluno }>(
            "/api/frequencias/seduc",
            corpoJson({
              dia: registro.dia,
              turmaId: registro.turmaId,
              alunoId: registro.alunoId,
              registrado,
              revisao: registro.revisao,
              revisaoSeduc: registro.revisaoSeduc,
            }),
          );
          atualizarRegistro({ ...registro, ...dados.confirmacao });
        } else {
          const dados = await pedir<{ registro: FrequenciaParcial }>(
            `/api/frequencias-parciais/${registro.id}/seduc`,
            corpoJson({ registrado, revisao: registro.revisao }),
          );
          atualizarRegistro(dados.registro);
        }
        avisarSucesso(
          registrado ? "Registro na Seduc confirmado." : "Registro marcado como pendente na Seduc.",
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível alterar a confirmação na Seduc." });
        if (excecao instanceof ErroApi && excecao.status === 409)
          setRecarregar((valor) => valor + 1);
      }
    });
  }

  const { executando: removendo, executar: remover } = useAcaoUnica(async () => {
    if (!registroRemover) return;
    try {
      await pedir(`/api/frequencias-parciais/${registroRemover.id}`, {
        ...corpoJson({ revisao: registroRemover.revisao }),
        method: "DELETE",
      });
      setRecarregar((valor) => valor + 1);
      setRegistroRemover(null);
      avisarSucesso("Frequência parcial removida.");
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível remover a frequência parcial." });
      if (excecao instanceof ErroApi && excecao.status === 409) {
        setRegistroRemover(null);
        setRecarregar((valor) => valor + 1);
      }
    }
  });
  const ocupado = salvando || recarregandoEdicao || removendo || chaveAtiva !== null;

  return (
    <section
      aria-label="Chamada Parcial"
      data-testid="chamada-parcial"
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chamada parcial</h1>
          <p className="text-muted-foreground text-sm">Ajustes por aluno e conferência na Seduc.</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEnvioAberto(true)}
          disabled={!estadoPlanilha?.podeEnviar || ocupado || sujo}
          className="h-11 shrink-0"
        >
          <FileSpreadsheet size={16} />
          Enviar para a planilha
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parcial-turma">Turma</Label>
        <Selecionar
          id="parcial-turma"
          value={turmaId}
          onValueChange={setTurmaId}
          opcoes={opcoesTurma}
          disabled={ocupado || editorAberto}
          placeholder="Selecione a turma"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dia anterior da chamada parcial"
          onClick={() => nav.anterior()}
          disabled={ocupado || editorAberto}
          className="size-11 shrink-0"
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-chamada-parcial"
            modo="dia"
            valor={nav.resumo ? "" : dia}
            max={limite}
            atual={diaInicial}
            semDomingo
            rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : dia.split("-").reverse().join("/")}
            detalhe={nav.resumo ? "semana" : rotuloDiaSemana(dia).replace("-feira", "")}
            rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da chamada parcial"}
            onValor={(proximo) => nav.escolherDia(proximo)}
            aoHoje={() => nav.voltarParaHoje()}
            hojeAtivo={nav.resumo || dia === diaInicial}
            disabled={ocupado || editorAberto}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dia seguinte da chamada parcial"
          onClick={() => nav.seguinte()}
          disabled={ocupado || editorAberto || nav.seguinteDesabilitado}
          className="size-11 shrink-0"
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {nav.mostrarVoltar && (
        <button
          type="button"
          disabled={ocupado || editorAberto || sujo}
          onClick={() => nav.voltarParaHoje()}
          className="text-primary pressionavel self-start text-sm font-medium hover:underline disabled:opacity-50"
        >
          Voltar para hoje
        </button>
      )}
      {nav.resumo && nav.semana ? (
        <VistaResumoSemana
          turmas={turma ? [turma] : []}
          alunos={alunos}
          dias={nav.semana}
          feriados={feriados}
          mostrarSaidas={mostrarSaidas}
          versao={recarregar}
          onAbrirDia={(proximo) => nav.escolherDia(proximo)}
        />
      ) : (
        <>
          {feriado && (
            <div
              role="status"
              className="superficie text-muted-foreground flex items-center gap-2 px-4 py-3 text-sm"
            >
              <CalendarOff size={18} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 break-words">Feriado · {feriado.nome}</span>
            </div>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <BarraBusca
              id="parcial-busca"
              valor={busca}
              onValor={setBusca}
              placeholder="Buscar aluno"
              className="min-w-0 flex-1"
            />
            <div className="sm:w-48">
              <Selecionar
                id="parcial-filtro"
                ariaLabel="Situação da frequência parcial"
                value={filtro}
                onValueChange={setFiltro}
                opcoes={[
                  { valor: "todos", rotulo: "Todos os alunos" },
                  { valor: "sem-registro", rotulo: "Sem registro" },
                  { valor: "pendentes", rotulo: "Pendentes na Seduc" },
                  { valor: "registrados", rotulo: "Registrados na Seduc" },
                ]}
              />
            </div>
          </div>
          {erro ? (
            <AvisoCompacto
              variante={carga.variante}
              titulo="Chamada parcial indisponível"
              descricao={erro}
              acao={{
                rotulo: "Tentar de novo",
                onClick: () => setRecarregar((valor) => valor + 1),
              }}
            />
          ) : carregando ? (
            <p
              role="status"
              className="text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm"
            >
              <LoaderCircle size={18} className="animate-spin" />
              Carregando chamada parcial...
            </p>
          ) : (
            <div className="superficie overflow-hidden">
              <div className="text-muted-foreground flex items-center justify-between gap-2 px-4 py-2 text-xs">
                <span className="numerais-tabulares">
                  {alunosFiltrados.length} {alunosFiltrados.length === 1 ? "aluno" : "alunos"}
                </span>
                {(filtro !== "todos" || busca !== "") && (
                  <button
                    type="button"
                    className="text-primary pressionavel font-medium hover:underline"
                    onClick={() => {
                      setFiltro("todos");
                      setBusca("");
                    }}
                  >
                    Ver todos
                  </button>
                )}
              </div>
              {alunosFiltrados.length === 0 ? (
                <p className="text-muted-foreground px-6 py-8 text-center text-sm">
                  {listaAlunos.length === 0
                    ? "Nenhum aluno ativo nesta turma."
                    : "Nenhum aluno encontrado com estes filtros."}
                </p>
              ) : (
                <div>
                  <div className="text-muted-foreground bg-secondary/40 hidden grid-cols-[minmax(0,1fr)_11rem_9rem_auto] items-center gap-3 border-b px-4 py-2 text-xs font-medium md:grid">
                    <span>Aluno</span>
                    <span>Situação</span>
                    <span>Registro na Seduc</span>
                    <span className="text-right">Ações</span>
                  </div>
                  <ul className="divide-y">
                    {alunosFiltrados.map((aluno) => {
                      const registro = aluno.registro;
                      const resumo = resumoDoRegistro(registro, justificativas);
                      return (
                        <li
                          key={aluno.id}
                          className="px-4 py-2.5"
                          data-testid={`parcial-aluno-${aluno.id}`}
                        >
                          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 md:grid-cols-[minmax(0,1fr)_11rem_9rem_auto] md:items-center">
                            <div className="min-w-0">
                              <h2 className="text-sm font-medium break-words">{aluno.nome}</h2>
                              {aluno.desistente && (
                                <span className="text-muted-foreground text-xs">Desistente</span>
                              )}
                            </div>
                            <div className="min-w-0 md:col-start-2">
                              <span
                                title={resumo}
                                className={cn(
                                  "line-clamp-2 inline-block max-w-full rounded-lg border px-2 py-0.5 text-xs font-medium wrap-anywhere",
                                  !registro
                                    ? "bg-muted/30 text-muted-foreground"
                                    : registro.tipo === "JUSTIFICADA"
                                      ? "border-justificada/30 bg-justificada-fraca text-justificada-texto"
                                      : registro.tipo !== "CHAMADA" || registro.marca === "P"
                                        ? "border-primary/25 bg-primary/10 text-primary"
                                        : registro.marca === "FJ"
                                          ? "border-justificada/30 bg-justificada-fraca text-justificada-texto"
                                          : "border-falta/25 bg-falta-fraca text-falta-texto",
                                )}
                              >
                                {resumo}
                              </span>
                            </div>
                            <div className="col-span-2 flex min-h-10 items-center gap-2 md:col-span-1 md:col-start-3">
                              {exigeConferenciaSeduc(registro) ? (
                                <>
                                  <Label
                                    htmlFor={`parcial-seduc-${aluno.id}`}
                                    className="text-xs md:sr-only"
                                    title="Registro na Seduc"
                                  >
                                    Registro na Seduc
                                  </Label>
                                  <Switch
                                    id={`parcial-seduc-${aluno.id}`}
                                    aria-label={`Registro na Seduc: ${aluno.nome}`}
                                    title="Registro na Seduc"
                                    checked={registro.registradoSeduc}
                                    disabled={ocupado || editorAberto}
                                    onCheckedChange={(valor) => confirmarSeduc(registro, valor)}
                                  />
                                </>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </div>
                            <div className="col-span-2 flex justify-end gap-1 md:col-span-1 md:col-start-4">
                              <Button
                                type="button"
                                variant={registro ? "ghost" : "outline"}
                                size="sm"
                                onClick={() => abrirEditor(registro ?? null, aluno.id)}
                                aria-label={`${registro ? "Editar" : "Registrar"} frequência parcial de ${aluno.nome}`}
                                disabled={
                                  ocupado ||
                                  editorAberto ||
                                  Boolean(feriado) ||
                                  (!registro && aluno.desistente)
                                }
                                className="h-10"
                              >
                                {registro ? <Pencil size={15} /> : <Plus size={15} />}
                                {registro ? "Editar" : "Registrar"}
                              </Button>
                              {registro && registro.tipo !== "CHAMADA" && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setRegistroRemover(registro)}
                                  aria-label={`Remover frequência parcial de ${aluno.nome}`}
                                  disabled={ocupado || editorAberto}
                                  className="text-falta-texto h-10"
                                >
                                  <Trash2 size={15} />
                                  Remover
                                </Button>
                              )}
                            </div>
                          </div>
                          {exigeConferenciaSeduc(registro) && registro.registradoSeduc && (
                            <p className="text-muted-foreground mt-1 text-xs" role="status">
                              {`Confirmado por ${registro.registradoSeducPorNome ?? "registro anterior"}${registro.registradoSeducEm ? ` em ${momentoDaConfirmacao(registro, formatadorConfirmacao)}` : ""}`}
                            </p>
                          )}
                          {registro &&
                            registro.tipo !== "CHAMADA" &&
                            registro.tipo !== "JUSTIFICADA" &&
                            registro.observacao && (
                              <p className="text-muted-foreground mt-1 text-xs break-words">
                                {registro.observacao}
                              </p>
                            )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <DialogoFrequenciaParcial
        aberto={ativa && editorAberto}
        edicao={edicao}
        registro={registroEditado}
        turma={turma}
        alunos={alunosDaEdicao}
        dia={dia}
        hoje={diaInicial}
        justificativas={justificativas}
        feriados={feriados}
        sujo={sujo}
        salvando={salvando || recarregandoEdicao}
        bloqueado={Boolean(feriado)}
        erro={feriado ? `Feriado · ${feriado.nome}` : erroEdicao}
        conflito={conflito}
        onEdicao={setEdicao}
        onFechar={fecharEditor}
        onSalvar={() => void salvar()}
        onRecarregar={() => void recarregarEdicao()}
      />
      <AlertDialog open={ativa && descartarAberto} onOpenChange={setDescartarAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar as alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              As alterações desta frequência parcial ainda não foram salvas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setEditorAberto(false);
                setDescartarAberto(false);
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={ativa && registroRemover !== null}
        onOpenChange={(aberto) => !aberto && !removendo && setRegistroRemover(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover a frequência parcial?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro de {registroRemover?.alunoNome} em {dia.split("-").reverse().join("/")}{" "}
              será removido.{" "}
              {registroRemover?.tipo === "JUSTIFICADA"
                ? "Justificativas já aplicadas na Chamada serão preservadas. Para corrigir essas faltas, altere também a Chamada do dia."
                : "A base da Chamada, quando disponível, voltará a aparecer com Registro na SEDUC pendente."}{" "}
              Confira também os lançamentos na Seduc e na planilha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={removendo}
              onClick={(evento) => {
                evento.preventDefault();
                void remover();
              }}
            >
              {removendo && <LoaderCircle size={16} className="animate-spin" />}Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {envioAberto && (
        <DialogoEnviarParciais
          aberto={ativa && envioAberto}
          turmas={turmasOrdenadas}
          diaCorrente={diaInicial}
          diaInicial={dia}
          turmaInicial={turmaId}
          planilhaNome={estadoPlanilha?.planilhaNome ?? null}
          onFechar={() => setEnvioAberto(false)}
        />
      )}
    </section>
  );
}
