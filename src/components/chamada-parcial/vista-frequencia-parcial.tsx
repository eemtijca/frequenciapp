"use client";

// Conferência personalizada da chamada salva, com ajustes por aluno e confirmação na Seduc.
// A lista adapta a tabela do desktop aos cartões do celular conforme a largura disponível.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventBusyRoundedIcon from "@mui/icons-material/EventBusyRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import type { Theme } from "@mui/material/styles";
import type {
  Aluno,
  ConfirmacaoSeducAluno,
  JustificativaConfigurada,
  Serie,
  Turma,
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
  type FrequenciaDaSaida,
} from "@/domain/frequencia-personalizada";
import { VistaResumoParcial } from "@/components/chamada-parcial/resumo-semana-parcial";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { mensagemAmigavel, useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { BarraBusca } from "@/components/ui/mui/barra-busca";
import { Botao, BotaoIcone } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { Selo, type TomSelo } from "@/components/ui/mui/selo";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { useLeituraDaVisao } from "@/components/layout/quadro-das-visoes";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { TOKENS_LAYOUT } from "@/theme/layout";
import {
  DialogoFrequenciaParcial,
  assinaturaDaEdicao,
  edicaoDoRegistro,
  type EdicaoParcial,
} from "./dialogo-frequencia-parcial";
import { TextoDeCarregamento } from "@/components/ui/mui/texto-de-carregamento";
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
  onAbrirChamada?: (dia: string, turmaId: string) => void;
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

// Limites de conteúdo, não de viewport: a lista ocupa a largura de leitura de 840 px.
const LARGURA_TABELA = 768;
const LARGURA_PAINEL = 576;
const LARGURA_FILTROS = 544;

type CategoriaSituacao = "neutro" | "falta" | "justificada" | "presente";

function categoriaDaSituacao(
  registro: RegistroPersonalizado | undefined,
  desistente: boolean,
): CategoriaSituacao {
  if (desistente || !registro) return "neutro";
  if (registro.tipo === "SAIDA") {
    if (!registro.aulasConferiveis) return "neutro";
    return registro.aulas.length === 0 ? "falta" : "presente";
  }
  if (registro.tipo === "JUSTIFICADA") return "justificada";
  if (registro.tipo !== "CHAMADA" || registro.marca === "P") return "presente";
  if (registro.marca === "FJ") return "justificada";
  return "falta";
}

function tomDaSituacao(categoria: CategoriaSituacao): TomSelo {
  if (categoria === "falta") return "perigo";
  if (categoria === "justificada") return "informacao";
  if (categoria === "presente") return "sucesso";
  return "neutro";
}

function estiloAcaoBase(tema: Theme) {
  return {
    minWidth: 0,
    minHeight: 48,
    whiteSpace: "normal",
    backgroundColor: tema.vars.palette.background.paper,
    border: `1px solid ${tema.vars.palette.grey[300]}`,
    "&:hover": {
      backgroundColor: tema.vars.palette.grey[100],
      borderColor: tema.vars.palette.grey[400],
    },
    "&:focus-visible": {
      outline: `3px solid ${tema.vars.palette.primary.main}`,
      outlineOffset: 2,
    },
    ...tema.applyStyles("dark", {
      backgroundColor: tema.vars.palette.background.paper,
      borderColor: tema.vars.palette.grey[700],
      "&:hover": {
        backgroundColor: tema.vars.palette.action.hover,
        borderColor: tema.vars.palette.grey[600],
      },
    }),
  };
}

const ESTILO_ACAO = (tema: Theme) => estiloAcaoBase(tema);

const ESTILO_COLUNA_ALUNO = {
  position: "sticky",
  left: 0,
  zIndex: 2,
  bgcolor: "background.paper",
} as const;

const ESTILO_ACAO_ICONE = (tema: Theme) => ({
  ...estiloAcaoBase(tema),
  width: 48,
  height: 48,
});

const ESTILO_SELO = {
  maxWidth: "100%",
  height: "auto",
  "& .MuiChip-label": {
    display: "-webkit-box",
    overflow: "hidden",
    whiteSpace: "normal",
    overflowWrap: "anywhere",
    WebkitBoxOrient: "vertical",
    WebkitLineClamp: 2,
  },
} as const;

function useLarguraDoElemento() {
  const [elemento, setElemento] = useState<HTMLElement | null>(null);
  const [largura, setLargura] = useState(0);
  const registrar = useCallback((no: HTMLElement | null) => setElemento(no), []);

  useEffect(() => {
    if (!elemento || typeof ResizeObserver === "undefined") return;
    const observador = new ResizeObserver(() => {
      const proxima = elemento.getBoundingClientRect().width;
      setLargura((atual) => (Math.abs(atual - proxima) < 0.5 ? atual : proxima));
    });
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento]);

  return { largura, registrar };
}

function resumoDoRegistro(
  registro: RegistroPersonalizado | undefined,
  catalogo: JustificativaConfigurada[],
): string {
  if (!registro) return "Sem registro";
  if (registro.tipo === "SAIDA") return rotuloFrequenciaPersonalizada(registro);
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
  if (registro.marca === "D") return "D";
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

function SeloDaSituacao({ resumo, categoria }: { resumo: string; categoria: CategoriaSituacao }) {
  return <Selo rotulo={resumo} tom={tomDaSituacao(categoria)} title={resumo} sx={ESTILO_SELO} />;
}

function StatusSeduc({
  registro,
  formatador,
}: {
  registro: RegistroPersonalizado;
  formatador: Intl.DateTimeFormat;
}) {
  if (!exigeConferenciaSeduc(registro) || !registro.registradoSeduc) return null;
  const momento = momentoDaConfirmacao(registro, formatador);
  return (
    <Typography
      component="p"
      role="status"
      variant="caption"
      sx={{ mt: 0.5, display: "block", color: "text.secondary" }}
    >
      {`Confirmado por ${registro.registradoSeducPorNome ?? "registro anterior"}${momento ? ` em ${momento}` : ""}`}
    </Typography>
  );
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
  onAbrirChamada,
}: Props) {
  const { avisarErro, avisarInfo, avisarSucesso } = useAvisosDaSessao();
  // No domingo, a abertura é o resumo da semana encerrada.
  const limite = limiteAgendamentoParcial(diaInicial);
  const nav = useNavegacaoDoDia({
    diaCorrente: diaInicial,
    max: limite,
    domingoComoResumo: true,
    resumoMax: diaInicial,
  });
  const [calendarioAberto, setCalendarioAberto] = useState(false);
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
  const { largura, registrar } = useLarguraDoElemento();
  const tabela = largura >= LARGURA_TABELA;
  const painelEmLinha = largura >= LARGURA_PAINEL;
  const filtrosEmLinha = largura >= LARGURA_FILTROS;
  const feriadoCadastrado = feriadoNaData(feriados, dia);
  const nomeFeriadoNoCadastro = feriadoCadastrado?.nome ?? "";
  const chaveCarga = JSON.stringify([dia, turmaId, recarregar, nomeFeriadoNoCadastro]);
  const feriado =
    carga.chave === chaveCarga && carga.feriado !== undefined ? carga.feriado : feriadoCadastrado;
  const registros = carga.chave === chaveCarga ? carga.registros : REGISTROS_VAZIOS;
  const carregando = !nav.resumo && turmaId !== "" && carga.chave !== chaveCarga;
  useLeituraDaVisao(carregando);
  const erro = carga.chave === chaveCarga ? carga.erro : "";
  const [editorAberto, setEditorAberto] = useState(false);
  const [baseEdicao, setBaseEdicao] = useState<FrequenciaDaChamada | null>(null);
  const [baseSaida, setBaseSaida] = useState<FrequenciaDaSaida | null>(null);
  const [registroEditado, setRegistroEditado] = useState<FrequenciaParcial | null>(null);
  const [edicao, setEdicao] = useState<EdicaoParcial>(edicaoDoRegistro());
  const [assinaturaInicial, setAssinaturaInicial] = useState(
    assinaturaDaEdicao(edicaoDoRegistro()),
  );
  const [erroEdicao, setErroEdicao] = useState("");
  const [conflito, setConflito] = useState(false);
  const [descartarAberto, setDescartarAberto] = useState(false);
  const [revisarChamada, setRevisarChamada] = useState<{ dia: string; turmaId: string } | null>(
    null,
  );
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
  }, [sujo, avisarInfo]);
  const marcarParcialAtualizada = useAtualizacaoTela("chamada-parcial", atualizarTela);

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
        if (!atual) return;
        setCarga({
          chave: chaveCarga,
          registros: dados.registros,
          erro: "",
          variante: "indisponivel",
          feriado: dados.feriado,
        });
        marcarParcialAtualizada();
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
  }, [ativa, dia, turmaId, chaveCarga, nav.resumo, marcarParcialAtualizada]);

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
    const saida = registro?.tipo === "SAIDA" ? registro : null;
    const personalizado =
      registro?.tipo === "CHAMADA" || registro?.tipo === "SAIDA" ? null : registro;
    const inicial: EdicaoParcial = { ...edicaoDoRegistro(personalizado ?? undefined), alunoId };
    if (saida) {
      inicial.tipo = "AULAS";
      inicial.aulas = saida.aulas;
      inicial.observacao = saida.observacao ?? "";
    }
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
    setBaseSaida(saida);
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
          turmaId: registroEditado?.turmaId ?? baseSaida?.turmaId ?? turmaId,
          tipo: edicao.tipo,
          turno: edicao.tipo === "TURNO" ? edicao.turno : null,
          aulas: edicao.tipo === "AULAS" ? edicao.aulas : [],
          observacao: edicao.observacao.trim() || null,
          revisao: registroEditado?.revisao ?? 0,
          ...(baseSaida
            ? { baseSaida: { id: baseSaida.id, assinatura: baseSaida.assinatura } }
            : {}),
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
        } else if (registro.tipo === "SAIDA") {
          const dados = await pedir<{ registro: FrequenciaDaSaida }>(
            `/api/saidas/${registro.id}/seduc`,
            corpoJson({
              registrado,
              revisao: registro.revisaoSeduc,
              assinatura: registro.assinatura,
            }),
          );
          atualizarRegistro(dados.registro);
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
      const resultado = await pedir<{ revisarChamada: { dia: string; turmaId: string } | null }>(
        `/api/frequencias-parciais/${registroRemover.id}`,
        {
          ...corpoJson({ revisao: registroRemover.revisao }),
          method: "DELETE",
        },
      );
      setRecarregar((valor) => valor + 1);
      setRegistroRemover(null);
      setRevisarChamada(resultado.revisarChamada);
      avisarSucesso(
        "Frequência parcial removida.",
        registroRemover.tipo === "JUSTIFICADA"
          ? "As marcas da chamada foram preservadas. A revisão precisa ser feita na chamada de origem."
          : undefined,
      );
    } catch (excecao) {
      avisarErro(excecao, { contexto: "Não foi possível remover a frequência parcial." });
      if (excecao instanceof ErroApi && excecao.status === 409) {
        setRegistroRemover(null);
        setRecarregar((valor) => valor + 1);
      }
    }
  });
  const ocupado = salvando || recarregandoEdicao || removendo || chaveAtiva !== null;
  const dataAberta = dia ? dia.split("-").reverse().join("/") : "";

  function situacaoDoAluno(aluno: (typeof listaAlunos)[number]): string {
    return aluno.desistente ? "D" : resumoDoRegistro(aluno.registro, justificativas);
  }

  function acoesDoAluno(aluno: (typeof listaAlunos)[number]): ReactNode {
    const registro = aluno.registro;
    return (
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ flexWrap: "wrap", justifyContent: "flex-end" }}
      >
        <Botao
          type="button"
          variante="contorno"
          tamanho="pequeno"
          onClick={() => abrirEditor(registro ?? null, aluno.id)}
          aria-label={`${registro ? "Editar" : "Registrar"} frequência parcial de ${aluno.nome}`}
          disabled={ocupado || editorAberto || Boolean(feriado) || aluno.desistente}
          icone={registro ? <EditRoundedIcon /> : <AddRoundedIcon />}
          sx={ESTILO_ACAO}
        >
          {registro ? "Editar" : "Registrar"}
        </Botao>
        {registro && registro.tipo !== "CHAMADA" && registro.tipo !== "SAIDA" ? (
          <Botao
            type="button"
            variante="destrutivo"
            tamanho="pequeno"
            onClick={() => setRegistroRemover(registro)}
            aria-label={`Remover frequência parcial de ${aluno.nome}`}
            disabled={ocupado || editorAberto}
            icone={<DeleteOutlineRoundedIcon />}
            sx={{ minHeight: 48 }}
          >
            Remover
          </Botao>
        ) : null}
      </Stack>
    );
  }

  function controleSeduc(
    aluno: (typeof listaAlunos)[number],
    id: string,
    rotulo?: string,
  ): ReactNode {
    const registro = aluno.registro;
    if (!exigeConferenciaSeduc(registro)) return null;
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        {rotulo ? (
          <Typography
            component="label"
            htmlFor={id}
            variant="caption"
            title="Registro na Seduc"
            sx={{ color: "text.secondary" }}
          >
            {rotulo}
          </Typography>
        ) : null}
        <Switch
          id={id}
          checked={registro.registradoSeduc}
          disabled={
            ocupado || editorAberto || (registro.tipo === "SAIDA" && !registro.aulasConferiveis)
          }
          onChange={(evento) => confirmarSeduc(registro, evento.target.checked)}
          slotProps={{
            input: { "aria-label": `Registro na Seduc: ${aluno.nome}`, title: "Registro na Seduc" },
          }}
        />
      </Stack>
    );
  }

  function detalhesDoAluno(aluno: (typeof listaAlunos)[number]): ReactNode {
    const registro = aluno.registro;
    if (!registro) return null;
    return (
      <>
        <StatusSeduc registro={registro} formatador={formatadorConfirmacao} />
        {registro.tipo !== "CHAMADA" && registro.tipo !== "JUSTIFICADA" && registro.observacao ? (
          <Typography
            component="p"
            variant="caption"
            sx={{ mt: 0.5, display: "block", color: "text.secondary", overflowWrap: "anywhere" }}
          >
            {registro.observacao}
          </Typography>
        ) : null}
      </>
    );
  }

  return (
    <Box
      component="section"
      ref={registrar}
      aria-label="Chamada Parcial"
      aria-busy={carregando}
      data-testid="chamada-parcial"
      data-layout={tabela ? "tabela" : "cartoes"}
      sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
    >
      <CabecalhoPagina
        titulo="Chamada parcial"
        compacto
        acoes={
          <Botao
            type="button"
            variante="secundario"
            onClick={() => setEnvioAberto(true)}
            disabled={!estadoPlanilha?.podeEnviar || ocupado || sujo}
            icone={<FileDownloadRoundedIcon />}
            sx={{ minHeight: TOKENS_LAYOUT.alvoToque, maxWidth: "100%", whiteSpace: "normal" }}
          >
            Enviar para a planilha
          </Botao>
        }
      />

      <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Stack
          direction={painelEmLinha ? "row" : "column"}
          spacing={{ xs: 1.5, sm: 2 }}
          useFlexGap
          sx={{
            ...(painelEmLinha && {
              alignItems: "flex-end",
              "& > :first-child": { flex: 1 },
              "& > :last-child": { flex: 1.35 },
            }),
            "& .MuiSelect-select": { whiteSpace: "normal", overflowWrap: "anywhere" },
          }}
        >
          <Campo id="parcial-turma" rotulo="Turma">
            <Selecionar
              valor={turmaId}
              onValor={setTurmaId}
              opcoes={opcoesTurma}
              disabled={ocupado || editorAberto}
              placeholder="Selecione a turma"
            />
          </Campo>
          <Campo id="dia-chamada-parcial" rotulo="Data">
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
              <BotaoIcone
                rotulo="Dia anterior da chamada parcial"
                variante="contorno"
                icone={<ChevronLeftRoundedIcon />}
                onClick={() => nav.anterior()}
                disabled={ocupado || editorAberto}
                sx={ESTILO_ACAO_ICONE}
              />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <SeletorPeriodo
                  id="dia-chamada-parcial"
                  modo="dia"
                  valor={nav.resumo ? (nav.domingo ?? "") : dia}
                  max={limite}
                  atual={diaInicial}
                  calendarioSemanal
                  mostrarSelo={!nav.resumo}
                  rotulo={
                    nav.resumo ? (nav.rotuloResumo ?? "") : dia.split("-").reverse().join("/")
                  }
                  detalhe={nav.resumo ? "semana" : rotuloDiaSemana(dia).replace("-feira", "")}
                  rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da chamada parcial"}
                  onValor={(proximo) => nav.escolherDia(proximo)}
                  aoHoje={() => nav.voltarParaHoje()}
                  hojeAtivo={nav.hojeAtivo}
                  onAbertoChange={setCalendarioAberto}
                  disabled={ocupado || editorAberto}
                />
              </Box>
              <BotaoIcone
                rotulo="Dia seguinte da chamada parcial"
                variante="contorno"
                icone={<ChevronRightRoundedIcon />}
                onClick={() => nav.seguinte()}
                disabled={ocupado || editorAberto || nav.seguinteDesabilitado}
                sx={ESTILO_ACAO_ICONE}
              />
            </Stack>
          </Campo>
        </Stack>
        {(!nav.resumo || nav.mostrarVoltar) && (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{ mt: 1, flexWrap: "wrap", alignItems: "center" }}
          >
            {nav.mostrarVoltar ? (
              <Botao
                type="button"
                variante="texto"
                disabled={ocupado || editorAberto || sujo}
                onClick={() => nav.voltarParaHoje()}
                sx={{ px: 0 }}
              >
                Voltar para hoje
              </Botao>
            ) : null}
            {!nav.resumo ? (
              <Box sx={{ ml: "auto", minWidth: 0 }}>
                <AtualizadoDaVisao fuso={fuso} sx={{ whiteSpace: "normal" }} />
              </Box>
            ) : null}
          </Stack>
        )}
      </Paper>

      {!nav.semana && feriado ? (
        <Paper
          role="status"
          variant="outlined"
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 2,
            py: 1.5,
            color: "text.secondary",
          }}
        >
          <EventBusyRoundedIcon fontSize="small" aria-hidden="true" />
          <Typography variant="body2" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>
            Feriado · {feriado.nome}
          </Typography>
        </Paper>
      ) : null}

      {nav.semana ? (
        <VistaResumoParcial
          turma={turma ?? null}
          alunos={alunos}
          dias={nav.semana}
          domingo={nav.domingo}
          feriados={feriados}
          mostrarSaidas={mostrarSaidas}
          versao={recarregar}
          ativa={ativa}
          pausado={calendarioAberto}
          fuso={fuso}
          onAbrirDia={(proximo) => nav.escolherDia(proximo)}
          onAbrirChamada={(diaAberto) => onAbrirChamada?.(diaAberto, turmaId)}
        />
      ) : (
        <Stack component="section" aria-label="Alunos da chamada parcial" spacing={1} useFlexGap>
          <Stack spacing={0.5} useFlexGap>
            <Stack
              direction={filtrosEmLinha ? "row" : "column"}
              spacing={1.5}
              useFlexGap
              sx={{
                ...(filtrosEmLinha && {
                  alignItems: "center",
                  "& > :first-child": { flex: 1, minWidth: 0 },
                  "& > :last-child": { flex: "0 0 13rem" },
                }),
              }}
            >
              <BarraBusca
                id="parcial-busca"
                valor={busca}
                onValor={setBusca}
                placeholder="Buscar aluno"
              />
              <Selecionar
                id="parcial-filtro"
                ariaLabel="Situação da frequência parcial"
                valor={filtro}
                onValor={setFiltro}
                opcoes={[
                  { valor: "todos", rotulo: "Todos os alunos" },
                  { valor: "sem-registro", rotulo: "Sem registro" },
                  { valor: "pendentes", rotulo: "Pendentes na Seduc" },
                  { valor: "registrados", rotulo: "Registrados na Seduc" },
                ]}
              />
            </Stack>
            <Stack
              direction="row"
              spacing={1}
              useFlexGap
              sx={{ flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography
                variant="caption"
                role="status"
                sx={{ color: "text.secondary", fontVariantNumeric: "tabular-nums" }}
              >
                {alunosFiltrados.length} {alunosFiltrados.length === 1 ? "aluno" : "alunos"}
              </Typography>
              {filtro !== "todos" || busca !== "" ? (
                <Botao
                  type="button"
                  variante="texto"
                  tamanho="pequeno"
                  onClick={() => {
                    setFiltro("todos");
                    setBusca("");
                  }}
                  sx={{ px: 1, minHeight: TOKENS_LAYOUT.alvoToque }}
                >
                  Ver todos
                </Botao>
              ) : null}
            </Stack>
          </Stack>

          {erro ? (
            <AlertaCompacto
              variante={carga.variante}
              titulo="Chamada parcial indisponível"
              descricao={erro}
              acao={{
                rotulo: "Tentar de novo",
                onClick: () => setRecarregar((valor) => valor + 1),
              }}
            />
          ) : carregando ? (
            <Paper
              variant="outlined"
              role="status"
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                py: 4,
                color: "text.secondary",
              }}
            >
              <CircularProgress size={18} aria-hidden="true" />
              <TextoDeCarregamento>Carregando chamada parcial...</TextoDeCarregamento>
            </Paper>
          ) : alunosFiltrados.length === 0 ? (
            <Paper variant="outlined" sx={{ px: 3, py: 4, textAlign: "center" }}>
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                {listaAlunos.length === 0
                  ? "Nenhum aluno ativo nesta turma."
                  : "Nenhum aluno encontrado com estes filtros."}
              </Typography>
            </Paper>
          ) : tabela ? (
            <TabelaPadrao
              caption={`Alunos da chamada parcial de ${turma?.rotulo ?? "turma"} em ${dataAberta}.`}
            >
              <TableHead>
                <TableRow>
                  <TableCell scope="col" sx={{ ...ESTILO_COLUNA_ALUNO, minWidth: 200, zIndex: 3 }}>
                    Aluno
                  </TableCell>
                  <TableCell scope="col" sx={{ width: 176 }}>
                    Situação
                  </TableCell>
                  <TableCell scope="col" sx={{ width: 144 }}>
                    Registro na Seduc
                  </TableCell>
                  <TableCell scope="col" align="right" sx={{ width: 208 }}>
                    Ações
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {alunosFiltrados.map((aluno) => {
                  const registro = aluno.registro;
                  const resumo = situacaoDoAluno(aluno);
                  const categoria = categoriaDaSituacao(registro, aluno.desistente);
                  return (
                    <TableRow
                      key={aluno.id}
                      data-testid={`parcial-aluno-${aluno.id}`}
                      hover
                      sx={{ verticalAlign: "middle" }}
                    >
                      <TableCell
                        component="th"
                        scope="row"
                        sx={{ ...ESTILO_COLUNA_ALUNO, fontWeight: 400 }}
                      >
                        <Typography
                          component="span"
                          variant="body2"
                          sx={{
                            display: "block",
                            maxWidth: 240,
                            overflowWrap: "anywhere",
                            fontWeight: 600,
                          }}
                        >
                          {aluno.nome}
                        </Typography>
                        {aluno.desistente ? (
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{ display: "block", color: "text.secondary" }}
                          >
                            Desistente
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <SeloDaSituacao resumo={resumo} categoria={categoria} />
                        {detalhesDoAluno(aluno)}
                      </TableCell>
                      <TableCell>{controleSeduc(aluno, `parcial-seduc-${aluno.id}`)}</TableCell>
                      <TableCell align="right">{acoesDoAluno(aluno)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </TabelaPadrao>
          ) : (
            <Paper variant="outlined" sx={{ overflow: "hidden" }}>
              <List disablePadding>
                {alunosFiltrados.map((aluno) => {
                  const resumo = situacaoDoAluno(aluno);
                  const categoria = categoriaDaSituacao(aluno.registro, aluno.desistente);
                  return (
                    <ListItem
                      key={aluno.id}
                      divider
                      data-testid={`parcial-aluno-${aluno.id}`}
                      sx={{ display: "block", px: { xs: 1.5, sm: 2 }, py: 1.5 }}
                    >
                      <Box
                        sx={{
                          display: "flex",
                          gap: 1,
                          alignItems: "flex-start",
                        }}
                      >
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography component="h2" variant="body2" sx={{ fontWeight: 600 }}>
                            {aluno.nome}
                          </Typography>
                          {aluno.desistente ? (
                            <Typography
                              component="p"
                              variant="caption"
                              sx={{ color: "text.secondary" }}
                            >
                              Desistente
                            </Typography>
                          ) : null}
                          <Box sx={{ mt: 1 }}>
                            <SeloDaSituacao resumo={resumo} categoria={categoria} />
                          </Box>
                        </Box>
                        <Box sx={{ minWidth: 0, width: 136, flexShrink: 0 }}>
                          {acoesDoAluno(aluno)}
                        </Box>
                      </Box>
                      {exigeConferenciaSeduc(aluno.registro) ? (
                        <Box sx={{ mt: 1 }}>
                          {controleSeduc(aluno, `parcial-seduc-${aluno.id}`, "Registro na Seduc")}
                          <StatusSeduc
                            registro={aluno.registro}
                            formatador={formatadorConfirmacao}
                          />
                        </Box>
                      ) : null}
                      {aluno.registro &&
                      aluno.registro.tipo !== "CHAMADA" &&
                      aluno.registro.tipo !== "JUSTIFICADA" &&
                      aluno.registro.observacao ? (
                        <Typography
                          component="p"
                          variant="caption"
                          sx={{ mt: 1, display: "block", color: "text.secondary" }}
                        >
                          {aluno.registro.observacao}
                        </Typography>
                      ) : null}
                    </ListItem>
                  );
                })}
              </List>
            </Paper>
          )}
        </Stack>
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
      <DialogoConfirmacao
        aberto={ativa && descartarAberto}
        titulo="Descartar as alterações?"
        descricao="As alterações desta frequência parcial ainda não foram salvas."
        rotuloConfirmar="Descartar"
        rotuloCancelar="Continuar editando"
        destrutivo
        onCancelar={() => setDescartarAberto(false)}
        onConfirmar={() => {
          setEditorAberto(false);
          setDescartarAberto(false);
        }}
      />
      {revisarChamada && onAbrirChamada ? (
        <AlertaCompacto
          variante="conflito"
          titulo="Marcas consolidadas preservadas"
          descricao="Abrir a chamada não altera as faltas nem recupera confirmações anteriores."
          acao={{
            rotulo: "Revisar chamada de origem",
            onClick: () => onAbrirChamada(revisarChamada.dia, revisarChamada.turmaId),
          }}
          tamanho="linha"
        />
      ) : null}
      <DialogoConfirmacao
        aberto={ativa && registroRemover !== null}
        titulo="Remover a frequência parcial?"
        descricao={
          <>
            O registro de {registroRemover?.alunoNome} em {dataAberta} será removido.{" "}
            {registroRemover?.tipo === "JUSTIFICADA"
              ? "Justificativas já aplicadas na Chamada serão preservadas. Para corrigir essas faltas, altere também a Chamada do dia."
              : "A base da Chamada, quando disponível, voltará a aparecer com Registro na SEDUC pendente."}{" "}
            Confira também os lançamentos na Seduc e na planilha.
          </>
        }
        rotuloConfirmar="Remover"
        destrutivo
        operacaoEmAndamento={removendo}
        onCancelar={() => {
          if (!removendo) setRegistroRemover(null);
        }}
        onConfirmar={() => void remover()}
      />
      {envioAberto ? (
        <DialogoEnviarParciais
          aberto={ativa && envioAberto}
          turmas={turmasOrdenadas}
          diaCorrente={diaInicial}
          diaInicial={dia}
          turmaInicial={turmaId}
          planilhaNome={estadoPlanilha?.planilhaNome ?? null}
          onFechar={() => setEnvioAberto(false)}
        />
      ) : null}
    </Box>
  );
}
