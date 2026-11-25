"use client";

// Grade semanal por turma: consulta para todos e, em Gestão, edição confirmada com rascunho preservado.
import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import CalendarMonthRoundedIcon from "@mui/icons-material/CalendarMonthRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LightModeRoundedIcon from "@mui/icons-material/LightModeRounded";
import LocalCafeRoundedIcon from "@mui/icons-material/LocalCafeRounded";
import RestaurantRoundedIcon from "@mui/icons-material/RestaurantRounded";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import WbTwilightRoundedIcon from "@mui/icons-material/WbTwilightRounded";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Stack from "@mui/material/Stack";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { ehHoraValida, type Horario, type Turma } from "@/domain/frequencia";
import {
  DIAS_DA_SEMANA,
  sequenciaDoDia,
  turnoDoHorario,
  type ItemDoDia,
  type Pausa,
} from "@/domain/horarios-semanais";
import { ordemDoDia, type OrdemAlmocoDoDia } from "@/domain/ordem-almoco";
import { corpoAlteracao, pedir } from "@/lib/api-cliente";
import { ouvirOrdemAlmocoMudou } from "@/lib/eventos-ordem-almoco";
import { ouvirProvasBimestraisMudaram } from "@/lib/eventos-provas-bimestrais";
import type { ProvaBimestral } from "@/domain/provas-bimestrais";
import { mensagemAmigavel, useAvisosDaSessao } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";
import DialogoAulas from "@/components/gestao/cadastros/dialogo-aulas";
import { EditorAula, type RascunhoAula } from "@/components/horarios/editor-aula";
import CartaoProvasBimestrais from "@/components/horarios/cartao-provas-bimestrais";
import { Abas, type ItemAba } from "@/components/ui/mui/abas";
import { AtualizadoDaVisao } from "@/components/ui/mui/atualizado-em";
import { Botao } from "@/components/ui/mui/botao";
import { Campo } from "@/components/ui/mui/campo";
import { Cartao } from "@/components/ui/mui/cartao";
import { DialogoConfirmacao } from "@/components/ui/mui/dialogo-confirmacao";
import { Selecionar } from "@/components/ui/mui/selecionar";
import { AlertaCompacto, type VarianteEstado } from "@/components/ui/mui/tela-estado";
import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { TabelaPadrao } from "@/components/layout/tabela-padrao";
import { TOKENS_LAYOUT } from "@/theme/layout";

type Turno = "manha" | "tarde";

const TEXTO_INVISIVEL = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const ESTILO_BOTAO_ICONE = {
  minWidth: TOKENS_LAYOUT.alvoToque,
  width: TOKENS_LAYOUT.alvoToque,
  height: TOKENS_LAYOUT.alvoToque,
  padding: 0,
  "& .MuiButton-startIcon": { margin: 0 },
} as const;

const ESTILO_CABECALHO_CARTAO = {
  display: "flex",
  alignItems: "center",
  gap: 1,
  px: 2,
  py: 1.5,
  backgroundColor: "action.hover",
  borderBottom: 1,
  borderColor: "divider",
} as const;

interface Props {
  turmas: Turma[];
  diaCorrente: string;
  fuso: string;
  /** Falso na consulta (aba Horários); verdadeiro na edição, em Gestão, Configurações. */
  editavel: boolean;
  onMudanca: () => Promise<void> | void;
  onPendencia?: (pendente: boolean) => void;
}

function diaDaSemana(dia: string): number {
  const valor = new Date(`${dia}T12:00:00Z`).getUTCDay();
  return Number.isNaN(valor) ? 1 : valor || 7;
}

function rotuloDia(valor: number): string {
  const rotulo = DIAS_DA_SEMANA.find((dia) => dia.valor === valor)?.rotulo ?? "dia";
  return rotulo.charAt(0).toUpperCase() + rotulo.slice(1);
}

function nomeDisciplina(aula: Horario, dia: number): string {
  return aula.disciplinas?.[String(dia)]?.trim() || "Sem disciplina";
}

function IconePausa({ pausa }: { pausa: Pausa }) {
  const Icone = pausa.id === "almoco" ? RestaurantRoundedIcon : LocalCafeRoundedIcon;
  return <Icone fontSize="small" aria-hidden="true" />;
}

function PausaDoDia({ pausa, editavel }: { pausa: Pausa; editavel: boolean }) {
  return (
    <ListItem
      divider
      sx={{
        gap: editavel ? 2 : 1.5,
        py: editavel ? 1.5 : 1,
        ...(!editavel && { px: { xs: 3, sm: 2 } }),
        backgroundColor: "action.hover",
      }}
    >
      <Box
        aria-hidden="true"
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: editavel ? 44 : 32,
          height: editavel ? 44 : 32,
          flexShrink: 0,
        }}
      >
        <IconePausa pausa={pausa} />
      </Box>
      <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
        {pausa.rotulo}
      </Typography>
      <Typography
        variant="caption"
        sx={{
          flexShrink: 0,
          color: "text.secondary",
          fontVariantNumeric: "tabular-nums",
          whiteSpace: "nowrap",
        }}
      >
        {pausa.inicio} às {pausa.fim}
      </Typography>
    </ListItem>
  );
}

interface PropsOrdemAlmoco {
  dias: OrdemAlmocoDoDia[];
  dia: number;
  turmas: Turma[];
  turmaSelecionada: string | undefined;
}

/** Ordem das turmas no almoço do dia, com a turma consultada em destaque. */
function OrdemAlmocoDoDiaCartao({ dias, dia, turmas, turmaSelecionada }: PropsOrdemAlmoco) {
  const itens = ordemDoDia(dias, dia);
  if (itens.length === 0) return null;
  const rotuloDe = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));

  return (
    <Cartao
      component="section"
      aria-label={`Ordem do almoço de ${rotuloDia(dia)}`}
      sx={{ padding: 0, overflow: "hidden" }}
    >
      <Box sx={ESTILO_CABECALHO_CARTAO}>
        <RestaurantRoundedIcon fontSize="small" aria-hidden="true" />
        <Typography component="h2" variant="subtitle2">
          Ordem do almoço · {rotuloDia(dia)}
        </Typography>
      </Box>
      <List component="ol" aria-label={`Ordem do almoço de ${rotuloDia(dia)}`} disablePadding>
        {itens.map((item) => {
          const selecionada = item.turmaId === turmaSelecionada;
          return (
            <ListItem
              key={item.turmaId}
              divider
              aria-current={selecionada ? "true" : undefined}
              sx={{
                gap: 2,
                py: 1.5,
                backgroundColor: selecionada ? "action.selected" : undefined,
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 44,
                  height: 44,
                  flexShrink: 0,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                }}
              >
                <Box component="span" aria-hidden="true">
                  {item.posicao}º
                </Box>
                <Box component="span" sx={TEXTO_INVISIVEL}>
                  {item.posicao}º lugar
                </Box>
              </Box>
              <Typography variant="body2" sx={{ flex: 1, minWidth: 0, fontWeight: 500 }}>
                {rotuloDe.get(item.turmaId) ?? "Turma"}
                {selecionada ? (
                  <Box component="span" sx={TEXTO_INVISIVEL}>
                    , turma consultada
                  </Box>
                ) : null}
              </Typography>
              {item.inicio ? (
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", flexShrink: 0 }}>
                  <ScheduleRoundedIcon
                    aria-hidden="true"
                    sx={{ fontSize: 14, color: "text.secondary" }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {item.inicio}
                  </Typography>
                </Stack>
              ) : null}
            </ListItem>
          );
        })}
      </List>
    </Cartao>
  );
}

interface PropsAulasDoDia {
  itens: ItemDoDia<Horario>[];
  dia: number;
  editavel: boolean;
  bloqueado: boolean;
  aulaEmEdicao: string | undefined;
  onEditar: (aula: Horario, dia: number) => void;
  editor: (aula: Horario, dia: number) => ReactNode;
  turno?: string;
}

function AulasDoDia({
  itens,
  dia,
  editavel,
  bloqueado,
  aulaEmEdicao,
  onEditar,
  editor,
  turno,
}: PropsAulasDoDia) {
  if (!itens.some((item) => item.tipo === "aula")) {
    return (
      <Typography variant="body2" sx={{ px: 2, py: 3, color: "text.secondary" }}>
        {turno ? "Sem aulas neste turno." : "Sem aulas neste dia."}
      </Typography>
    );
  }

  return (
    <List
      component="ol"
      aria-label={`Aulas de ${rotuloDia(dia)}${turno ? ` · ${turno}` : ""}`}
      disablePadding
      sx={editavel ? undefined : { px: { xs: 0, sm: 1 } }}
    >
      {itens.map((item) => {
        if (item.tipo === "pausa")
          return <PausaDoDia key={item.pausa.id} pausa={item.pausa} editavel={editavel} />;
        const aula = item.aula;
        const disciplina = aula.disciplinas?.[String(dia)]?.trim();
        return (
          <ListItem
            key={aula.id}
            divider
            sx={{
              display: "block",
              py: editavel ? 2 : 1,
              // Preserva o recuo das aulas; só as faixas de pausa ocupam a largura toda.
              ...(!editavel && { mx: { xs: 1, sm: 0 }, width: { xs: "auto", sm: "100%" } }),
            }}
          >
            <Stack
              direction="row"
              spacing={editavel ? 2 : 1.5}
              sx={{ alignItems: editavel ? "flex-start" : "center" }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: editavel ? 44 : 32,
                  height: editavel ? 44 : 32,
                  flexShrink: 0,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  fontWeight: 600,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <Box component="span" aria-hidden="true">
                  {aula.ordem}ª
                </Box>
                <Box component="span" sx={TEXTO_INVISIVEL}>
                  {aula.ordem}ª aula
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 500,
                    overflowWrap: "anywhere",
                    color: disciplina ? "text.primary" : "text.secondary",
                  }}
                >
                  {nomeDisciplina(aula, dia)}
                </Typography>
                <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mt: 0.5 }}>
                  <ScheduleRoundedIcon
                    aria-hidden="true"
                    sx={{ fontSize: 14, color: "text.secondary" }}
                  />
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      fontVariantNumeric: "tabular-nums",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {aula.inicio} às {aula.fim}
                  </Typography>
                </Stack>
              </Box>
              {editavel ? (
                <Botao
                  variante="texto"
                  type="button"
                  aria-label={`Editar ${aula.ordem}ª aula de ${rotuloDia(dia)}`}
                  aria-expanded={aulaEmEdicao === aula.id}
                  disabled={bloqueado}
                  icone={<EditRoundedIcon />}
                  onClick={() => onEditar(aula, dia)}
                  sx={ESTILO_BOTAO_ICONE}
                />
              ) : null}
            </Stack>
            {editor(aula, dia)}
          </ListItem>
        );
      })}
    </List>
  );
}

interface PropsTurnos {
  dia: number;
  itensPorTurno: Record<Turno, ItemDoDia<Horario>[]>;
  editavel: boolean;
  bloqueado: boolean;
  aulaEmEdicao: string | undefined;
  onEditar: (aula: Horario, dia: number) => void;
  editor: (aula: Horario, dia: number, turno: Turno) => ReactNode;
  dataPager: string;
}

function TurnosDoDia({
  dia,
  itensPorTurno,
  editavel,
  bloqueado,
  aulaEmEdicao,
  onEditar,
  editor,
  dataPager,
}: PropsTurnos) {
  function aulasNoTurno(turno: Turno): number {
    return itensPorTurno[turno].filter((item) => item.tipo === "aula").length;
  }

  const [turno, setTurno] = useState<Turno>(() =>
    aulasNoTurno("manha") === 0 && aulasNoTurno("tarde") > 0 ? "tarde" : "manha",
  );

  function aoTeclar(evento: KeyboardEvent<HTMLDivElement>) {
    if (bloqueado) return;
    const alvo = evento.target;
    if (!(alvo instanceof HTMLElement) || alvo.getAttribute("role") !== "tab") return;
    if (evento.key === "ArrowRight") setTurno(turno === "manha" ? "tarde" : "manha");
    else if (evento.key === "ArrowLeft") setTurno(turno === "tarde" ? "manha" : "tarde");
  }

  function conteudo(qual: Turno): ReactNode {
    const nome = qual === "manha" ? "Manhã" : "Tarde";
    return (
      <Cartao
        component="section"
        aria-label={`Aulas de ${rotuloDia(dia)} · ${nome}`}
        sx={{
          // Completa os 16 px já usados na grade diária; Abas fornece os primeiros 12 px.
          mt: 0.5,
          padding: 0,
          overflow: "hidden",
        }}
      >
        <Box sx={ESTILO_CABECALHO_CARTAO}>
          <Typography component="h2" variant="subtitle2">
            {rotuloDia(dia)}
          </Typography>
        </Box>
        <AulasDoDia
          dia={dia}
          itens={itensPorTurno[qual]}
          turno={nome}
          editavel={editavel}
          bloqueado={bloqueado}
          aulaEmEdicao={aulaEmEdicao}
          onEditar={onEditar}
          editor={(aula, diaDaAula) => editor(aula, diaDaAula, qual)}
        />
      </Cartao>
    );
  }

  const itens: ItemAba<Turno>[] = [
    {
      valor: "manha",
      rotulo: "Manhã",
      icone: <LightModeRoundedIcon fontSize="small" />,
      desabilitado: bloqueado,
      conteudo: conteudo("manha"),
    },
    {
      valor: "tarde",
      rotulo: "Tarde",
      icone: <WbTwilightRoundedIcon fontSize="small" />,
      desabilitado: bloqueado,
      conteudo: conteudo("tarde"),
    },
  ];

  return (
    <Box onKeyDown={aoTeclar}>
      <Abas
        itens={itens}
        ativo={turno}
        onChange={setTurno}
        rotuloAcessivel="Turnos do dia"
        dataPager={dataPager}
      />
    </Box>
  );
}

export default function VistaHorarios({
  turmas,
  diaCorrente,
  fuso,
  editavel,
  onMudanca,
  onPendencia,
}: Props) {
  const { avisarErro, avisarSucesso } = useAvisosDaSessao();
  const base = useId();
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [diaSelecionado, setDiaSelecionado] = useState(String(diaDaSemana(diaCorrente)));
  const [editorCompleto, setEditorCompleto] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoAula | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const gatilhoEdicao = useRef<HTMLElement | null>(null);
  // Ordem do almoço: lida ao montar e de novo quando a Gestão a altera; falha só omite o cartão.
  const [ordemAlmoco, setOrdemAlmoco] = useState<OrdemAlmocoDoDia[]>([]);
  const [versaoOrdem, setVersaoOrdem] = useState(0);
  // Provas bimestrais: só na consulta, relidas com a ordem do almoço; falha só omite o cartão.
  const [provas, setProvas] = useState<ProvaBimestral[]>([]);
  useAtualizacaoTela("horarios", async () => {
    await onMudanca();
    setVersaoOrdem((versao) => versao + 1);
  });
  useEffect(() => ouvirProvasBimestraisMudaram(() => setVersaoOrdem((versao) => versao + 1)), []);
  useEffect(() => {
    if (editavel) return;
    let atual = true;
    pedir<{ provas: ProvaBimestral[] }>("/api/provas-bimestrais")
      .then((dados) => {
        if (atual) setProvas(dados.provas);
      })
      .catch(() => {
        if (atual) setProvas([]);
      });
    return () => {
      atual = false;
    };
  }, [editavel, versaoOrdem]);
  useEffect(() => ouvirOrdemAlmocoMudou(() => setVersaoOrdem((versao) => versao + 1)), []);
  useEffect(() => {
    let atual = true;
    pedir<{ dias: OrdemAlmocoDoDia[] }>("/api/ordem-almoco")
      .then((dados) => {
        if (atual) setOrdemAlmoco(dados.dias);
      })
      .catch(() => {
        if (atual) setOrdemAlmoco([]);
      });
    return () => {
      atual = false;
    };
  }, [versaoOrdem]);
  const turma = turmas.find((item) => item.id === turmaId) ?? turmas[0];
  const aulas = (turma?.horarios ?? [])
    .filter((aula) => aula.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.inicio.localeCompare(b.inicio));
  const semanaCompleta = diaSelecionado === "0";
  const diasDaGrade = DIAS_DA_SEMANA.filter(
    (dia) => dia.valor <= 5 || aulas.some((aula) => aula.diasSemana.includes(dia.valor)),
  );
  const sequenciaDaGrade = sequenciaDoDia(aulas, (aula) => aula.inicio);
  const dia = Number(diaSelecionado);
  const aulasDoDia = aulas.filter((aula) => aula.diasSemana.includes(dia));
  // Uma atualização externa da janela não esconde o formulário ainda em edição.
  const inicioEstavel = (aula: Horario) =>
    rascunho?.aulaId === aula.id ? rascunho.inicioInicial : aula.inicio;
  const turnoDaAula = (aula: Horario) => turnoDoHorario(inicioEstavel(aula));
  const sequenciaDoDiaAtual = sequenciaDoDia(aulasDoDia, inicioEstavel);
  const almocoDoDia = sequenciaDoDiaAtual.find(
    (item) => item.tipo === "pausa" && item.pausa.id === "almoco",
  );
  // Aulas cadastradas na janela do almoço ficam na manhã, logo depois da linha do almoço.
  const itensPorTurno: Record<Turno, ItemDoDia<Horario>[]> = {
    manha: sequenciaDoDiaAtual.filter((item) =>
      item.tipo === "aula"
        ? turnoDaAula(item.aula) !== "tarde"
        : item.pausa.id !== "intervalo-tarde",
    ),
    tarde: sequenciaDoDiaAtual.filter((item) =>
      item.tipo === "aula"
        ? turnoDaAula(item.aula) === "tarde"
        : item.pausa.id === "intervalo-tarde",
    ),
  };
  if (almocoDoDia && itensPorTurno.tarde.length > 0) itensPorTurno.tarde.unshift(almocoDoDia);
  const disciplinaAlterada =
    rascunho !== null && rascunho.disciplina.trim() !== rascunho.disciplinaInicial;
  const inicioAlterado = rascunho !== null && rascunho.inicio !== rascunho.inicioInicial;
  const fimAlterado = rascunho !== null && rascunho.fim !== rascunho.fimInicial;
  const alterado = disciplinaAlterada || inicioAlterado || fimAlterado;
  const emEdicao = rascunho !== null;
  const aulaDoRascunho = turmas
    .find((item) => item.id === rascunho?.turmaId)
    ?.horarios.find((aula) => aula.id === rascunho?.aulaId);
  const contextoDisponivel =
    !rascunho ||
    (turma?.id === rascunho.turmaId &&
      aulaDoRascunho?.ativo === true &&
      (rascunho.dia === null || aulaDoRascunho.diasSemana.includes(rascunho.dia)));
  const diaDoEditor =
    rascunho?.dia ??
    diasDaGrade.find((item) =>
      aulas.find((aula) => aula.id === rascunho?.aulaId)?.diasSemana.includes(item.valor),
    )?.valor;

  useEffect(() => {
    onPendencia?.(alterado);
  }, [alterado, onPendencia]);
  useEffect(() => () => onPendencia?.(false), [onPendencia]);
  useEffect(() => {
    if (emEdicao || !gatilhoEdicao.current) return;
    gatilhoEdicao.current.focus({ preventScroll: true });
    gatilhoEdicao.current = null;
  }, [emEdicao]);

  function abrirEdicao(aula: Horario, diaDaAula: number | null) {
    if (!editavel || rascunho || editorCompleto) return;
    gatilhoEdicao.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const disciplina = diaDaAula ? (aula.disciplinas?.[String(diaDaAula)]?.trim() ?? "") : "";
    setRascunho({
      aulaId: aula.id,
      turmaId: aula.turmaId,
      turmaRotulo: turma?.rotulo ?? "Turma",
      ordem: aula.ordem,
      dia: diaDaAula,
      disciplina,
      disciplinaInicial: disciplina,
      inicio: aula.inicio,
      inicioInicial: aula.inicio,
      fim: aula.fim,
      fimInicial: aula.fim,
    });
    setErro("");
  }

  function revisarAlteracoes() {
    if (!rascunho || !contextoDisponivel || !alterado || enviando) return;
    if (
      !ehHoraValida(rascunho.inicio) ||
      !ehHoraValida(rascunho.fim) ||
      rascunho.inicio >= rascunho.fim
    ) {
      setErro("O horário de fim deve ser posterior ao de início.");
      setErroVariante("dados_invalidos");
      return;
    }
    setErro("");
    setConfirmando(true);
  }

  const { executando: enviando, executar: salvar } = useAcaoUnica(async () => {
    if (!editavel || !rascunho || !contextoDisponivel || !confirmando || !alterado) return;
    setErro("");
    try {
      // Campos omitidos permanecem no servidor, inclusive as disciplinas dos demais dias.
      await pedir<{ horario: Horario }>(
        `/api/horarios/${rascunho.aulaId}`,
        corpoAlteracao("PATCH", {
          ...(disciplinaAlterada && rascunho.dia !== null
            ? { disciplinas: { [String(rascunho.dia)]: rascunho.disciplina.trim() } }
            : {}),
          ...(inicioAlterado ? { inicio: rascunho.inicio } : {}),
          ...(fimAlterado ? { fim: rascunho.fim } : {}),
        }),
      );
    } catch (excecao) {
      setConfirmando(false);
      setErro(mensagemAmigavel(excecao, "Não foi possível salvar a aula."));
      setErroVariante(estadoDeErro(excecao));
      avisarErro(excecao, { contexto: "Não foi possível salvar a aula." });
      return;
    }
    setConfirmando(false);
    setRascunho(null);
    avisarSucesso("Horário atualizado.");
    try {
      await onMudanca();
    } catch (excecao) {
      avisarErro(excecao, { contexto: "A aula foi salva, mas a grade não foi atualizada." });
    }
  });

  function cancelarEdicao() {
    if (enviando) return;
    if (alterado) setDescartando(true);
    else setRascunho(null);
  }

  function renderizarEditor(aula: Horario, diaDaAula: number | null, versao: string) {
    if (!editavel || !rascunho || !contextoDisponivel || rascunho.aulaId !== aula.id) return null;
    if (diaDaAula !== null && diaDaAula !== diaDoEditor) return null;
    return renderizarFormulario(versao);
  }

  function renderizarFormulario(versao: string) {
    if (!editavel || !rascunho) return null;
    return (
      <EditorAula
        rascunho={rascunho}
        identificador={`${base}-${versao}-${rascunho.aulaId}`}
        rotuloDia={rascunho.dia ? rotuloDia(rascunho.dia) : ""}
        ocupado={enviando}
        somenteLeitura={!contextoDisponivel}
        alterado={alterado}
        erro={erro}
        erroVariante={erroVariante}
        onAlterar={(atual) => {
          setRascunho(atual);
          setErro("");
        }}
        onSalvar={revisarAlteracoes}
        onCancelar={cancelarEdicao}
      />
    );
  }

  const navegacaoBloqueada = rascunho !== null || enviando;
  const campoTurma = (
    <Campo id={`${base}-turma`} rotulo="Turma">
      <Selecionar
        valor={turma?.id ?? ""}
        onValor={setTurmaId}
        opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
        buscavel={editavel}
        quebrarRotulosDasOpcoes={!editavel}
        disabled={turmas.length === 0 || navegacaoBloqueada}
      />
    </Campo>
  );
  const campoDia = (
    <Campo id={`${base}-dia`} rotulo="Dia da semana">
      <Selecionar
        valor={diaSelecionado}
        onValor={setDiaSelecionado}
        opcoes={[
          { valor: "0", rotulo: "Semana completa" },
          ...DIAS_DA_SEMANA.map((item) => ({
            valor: String(item.valor),
            rotulo: rotuloDia(item.valor),
          })),
        ]}
        disabled={turmas.length === 0 || navegacaoBloqueada}
      />
    </Campo>
  );

  return (
    <Stack
      component="section"
      aria-label={editavel ? "Edição de horários" : "Horários semanais"}
      spacing={editavel ? 3 : 2}
      useFlexGap={!editavel}
      sx={{ minWidth: 0, pb: editavel ? 0 : 3 }}
    >
      {editavel ? (
        <>
          <Box component="h2" sx={TEXTO_INVISIVEL}>
            Horários das turmas
          </Box>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>{campoTurma}</Grid>
            <Grid size={{ xs: 12, sm: 6 }}>{campoDia}</Grid>
          </Grid>
        </>
      ) : (
        <>
          <CabecalhoPagina titulo="Horários" compacto acoes={<AtualizadoDaVisao fuso={fuso} />} />
          <Stack
            role="group"
            aria-label="Filtros de horários"
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            useFlexGap
            sx={{ alignItems: { sm: "flex-start" } }}
          >
            <Box
              sx={(tema) => ({
                flex: { sm: 2 },
                minWidth: 0,
                // A especificidade extra supera o padding do Select outlined do MUI.
                "&& .MuiSelect-select.MuiSelect-select": {
                  display: "block",
                  paddingInlineEnd: tema.spacing(6),
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                },
              })}
            >
              {campoTurma}
            </Box>
            <Box sx={{ flex: { sm: 1 }, minWidth: 0 }}>{campoDia}</Box>
          </Stack>
        </>
      )}

      {!editavel ? (
        <CartaoProvasBimestrais
          provas={provas}
          turmaId={turma?.id}
          turmaRotulo={turma?.rotulo ?? "Turma"}
          diaCorrente={diaCorrente}
        />
      ) : null}

      {editavel ? (
        <Box sx={{ display: "flex" }}>
          <Botao
            variante="contorno"
            type="button"
            aria-label={`Editar horários de ${turma?.rotulo ?? "turma"}`}
            disabled={!turma || navegacaoBloqueada}
            icone={<EditRoundedIcon />}
            onClick={() => setEditorCompleto(true)}
          >
            Editar horários
          </Botao>
        </Box>
      ) : null}

      {editavel && rascunho && !contextoDisponivel ? (
        <Stack spacing={2} sx={{ minWidth: 0 }}>
          <AlertaCompacto
            variante="dados_invalidos"
            titulo="Esta aula não está mais disponível na grade."
            descricao={`${rascunho.turmaRotulo} · ${rascunho.ordem}ª aula. O rascunho permanece abaixo até o descarte.`}
            tamanho="linha"
          />
          {renderizarFormulario("indisponivel")}
        </Stack>
      ) : null}

      {aulas.length === 0 ? (
        <Stack
          spacing={2}
          sx={{
            alignItems: "center",
            justifyContent: "center",
            minHeight: 176,
            px: 3,
            textAlign: "center",
            border: 1,
            borderColor: "divider",
            borderRadius: 2,
          }}
        >
          <CalendarMonthRoundedIcon
            sx={{ fontSize: 28, color: "text.secondary" }}
            aria-hidden="true"
          />
          <Typography sx={{ fontWeight: 500 }}>
            {turmas.length === 0 ? "Nenhuma turma cadastrada" : "Nenhum horário configurado"}
          </Typography>
        </Stack>
      ) : semanaCompleta ? (
        <>
          <Box
            sx={{
              display: { xs: "none", lg: "block" },
              ...(!editavel && {
                "& table": { tableLayout: "fixed", minWidth: `${7 + diasDaGrade.length * 8}rem` },
                // Cada dia recebe a mesma largura; só o cabeçalho de linha fica fixo.
                "& tr > th:first-child": {
                  position: "sticky",
                  left: 0,
                  zIndex: 1,
                  backgroundColor: "background.paper",
                },
              }),
            }}
          >
            <TabelaPadrao
              caption={`Grade semanal de ${turma?.rotulo ?? "turma"}`}
              primeiraColunaFixa={editavel}
              rotuloRolagem={editavel ? undefined : "Rolagem da grade semanal"}
            >
              <TableHead>
                <TableRow>
                  <TableCell
                    component="th"
                    scope="col"
                    sx={{
                      width: editavel ? 128 : "7rem",
                      fontWeight: 500,
                      backgroundColor: "action.hover",
                    }}
                  >
                    Aula
                  </TableCell>
                  {diasDaGrade.map((item) => (
                    <TableCell
                      key={item.valor}
                      component="th"
                      scope="col"
                      sx={{ fontWeight: 500, backgroundColor: "action.hover" }}
                    >
                      {item.abreviacao}
                      <Box component="span" sx={TEXTO_INVISIVEL}>
                        : {rotuloDia(item.valor)}
                      </Box>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {sequenciaDaGrade.map((entrada) => {
                  if (entrada.tipo === "pausa") {
                    return (
                      <TableRow key={entrada.pausa.id} sx={{ backgroundColor: "action.hover" }}>
                        <TableCell colSpan={diasDaGrade.length + 1} sx={{ py: 1.5 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                            <IconePausa pausa={entrada.pausa} />
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {entrada.pausa.rotulo}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                ml: "auto",
                                color: "text.secondary",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {entrada.pausa.inicio} às {entrada.pausa.fim}
                            </Typography>
                          </Stack>
                        </TableCell>
                      </TableRow>
                    );
                  }
                  const aula = entrada.aula;
                  return (
                    <Fragment key={aula.id}>
                      <TableRow>
                        <TableCell component="th" scope="row" sx={{ verticalAlign: "top" }}>
                          <Typography
                            component="span"
                            variant="body2"
                            sx={{
                              display: "block",
                              fontWeight: 500,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {aula.ordem}ª aula
                          </Typography>
                          <Typography
                            component="span"
                            variant="caption"
                            sx={{
                              display: "block",
                              mt: 0.5,
                              color: "text.secondary",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {aula.inicio} às {aula.fim}
                          </Typography>
                          {editavel ? (
                            <Box sx={{ mt: 0.5 }}>
                              <Botao
                                variante="texto"
                                type="button"
                                aria-label={`Editar horário da ${aula.ordem}ª aula`}
                                disabled={navegacaoBloqueada}
                                icone={<EditRoundedIcon />}
                                onClick={() => abrirEdicao(aula, null)}
                                sx={ESTILO_BOTAO_ICONE}
                              />
                            </Box>
                          ) : null}
                        </TableCell>
                        {diasDaGrade.map((item) => {
                          const temAula = aula.diasSemana.includes(item.valor);
                          const disciplina = aula.disciplinas?.[String(item.valor)]?.trim();
                          return (
                            <TableCell
                              key={item.valor}
                              sx={{ verticalAlign: "top", overflowWrap: "anywhere" }}
                            >
                              {temAula ? (
                                <Stack spacing={0.5} sx={{ alignItems: "flex-start" }}>
                                  <Typography
                                    variant="body2"
                                    sx={{
                                      fontWeight: disciplina ? 500 : 400,
                                      color: disciplina ? "text.primary" : "text.secondary",
                                    }}
                                  >
                                    {nomeDisciplina(aula, item.valor)}
                                  </Typography>
                                  {editavel ? (
                                    <Botao
                                      variante="texto"
                                      type="button"
                                      aria-label={`Editar disciplina da ${aula.ordem}ª aula de ${rotuloDia(item.valor)}`}
                                      disabled={navegacaoBloqueada}
                                      icone={<EditRoundedIcon />}
                                      onClick={() => abrirEdicao(aula, item.valor)}
                                      sx={ESTILO_BOTAO_ICONE}
                                    />
                                  ) : null}
                                </Stack>
                              ) : (
                                <Box component="span" sx={TEXTO_INVISIVEL}>
                                  Sem aula
                                </Box>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                      {editavel && rascunho?.aulaId === aula.id ? (
                        <TableRow>
                          <TableCell colSpan={diasDaGrade.length + 1} sx={{ padding: 2 }}>
                            {renderizarEditor(aula, null, "grade")}
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  );
                })}
              </TableBody>
            </TabelaPadrao>
          </Box>
          <Box sx={{ display: { xs: "block", lg: "none" } }}>
            <Grid container spacing={2}>
              {diasDaGrade.map((item) => (
                <Grid key={item.valor} size={{ xs: 12, sm: 6 }}>
                  <Cartao
                    component="section"
                    aria-label={`Aulas de ${rotuloDia(item.valor)}`}
                    sx={{ padding: 0, overflow: "hidden" }}
                  >
                    <Box sx={ESTILO_CABECALHO_CARTAO}>
                      <Typography component="h2" variant="subtitle2">
                        {rotuloDia(item.valor)}
                      </Typography>
                    </Box>
                    <AulasDoDia
                      dia={item.valor}
                      itens={sequenciaDoDia(
                        aulas.filter((aula) => aula.diasSemana.includes(item.valor)),
                        (aula) => aula.inicio,
                      )}
                      editavel={editavel}
                      bloqueado={navegacaoBloqueada}
                      aulaEmEdicao={diaDoEditor === item.valor ? rascunho?.aulaId : undefined}
                      onEditar={abrirEdicao}
                      editor={(aula, diaDaAula) =>
                        renderizarEditor(aula, diaDaAula, `lista-${item.valor}`)
                      }
                    />
                  </Cartao>
                </Grid>
              ))}
            </Grid>
          </Box>
        </>
      ) : (
        <TurnosDoDia
          key={`${turma?.id}-${dia}`}
          dia={dia}
          itensPorTurno={itensPorTurno}
          editavel={editavel}
          bloqueado={navegacaoBloqueada}
          aulaEmEdicao={rascunho?.aulaId}
          onEditar={abrirEdicao}
          editor={(aula, diaDaAula, turno) => renderizarEditor(aula, diaDaAula, `dia-${turno}`)}
          dataPager={editavel ? "horarios-turnos-edicao" : "horarios-turnos"}
        />
      )}

      {!semanaCompleta ? (
        <OrdemAlmocoDoDiaCartao
          dias={ordemAlmoco}
          dia={dia}
          turmas={turmas}
          turmaSelecionada={turma?.id}
        />
      ) : null}

      {editavel ? (
        <>
          <DialogoAulas
            turma={turma ?? null}
            turmas={turmas}
            aberto={editorCompleto}
            onAbrir={setEditorCompleto}
            onMudanca={async () => {
              await onMudanca();
            }}
          />
          <DialogoConfirmacao
            aberto={confirmando}
            titulo="Confirmar alterações na aula"
            descricao={
              <Box component="div" sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography variant="body2">
                  {rascunho?.turmaRotulo} · {rascunho?.ordem}ª aula
                  {rascunho?.dia ? ` · ${rotuloDia(rascunho.dia)}` : ""}
                </Typography>
                {rascunho ? (
                  <Box component="dl" sx={{ m: 0 }}>
                    {disciplinaAlterada ? (
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                        <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                          Disciplina
                        </Typography>
                        <Typography
                          component="dd"
                          variant="body2"
                          sx={{ m: 0, overflowWrap: "anywhere" }}
                        >
                          {rascunho.disciplinaInicial || "Sem disciplina"} para{" "}
                          {rascunho.disciplina.trim() || "Sem disciplina"}
                        </Typography>
                      </Stack>
                    ) : null}
                    {inicioAlterado ? (
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                        <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                          Início
                        </Typography>
                        <Typography
                          component="dd"
                          variant="body2"
                          sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}
                        >
                          {rascunho.inicioInicial} para {rascunho.inicio}
                        </Typography>
                      </Stack>
                    ) : null}
                    {fimAlterado ? (
                      <Stack direction="row" spacing={1.5} sx={{ alignItems: "baseline" }}>
                        <Typography component="dt" variant="body2" sx={{ color: "text.secondary" }}>
                          Fim
                        </Typography>
                        <Typography
                          component="dd"
                          variant="body2"
                          sx={{ m: 0, fontVariantNumeric: "tabular-nums" }}
                        >
                          {rascunho.fimInicial} para {rascunho.fim}
                        </Typography>
                      </Stack>
                    ) : null}
                  </Box>
                ) : null}
                {inicioAlterado || fimAlterado ? (
                  <Typography variant="body2" sx={{ color: "text.secondary" }}>
                    O horário vale para todos os dias desta aula.
                  </Typography>
                ) : null}
              </Box>
            }
            rotuloConfirmar="Confirmar alterações"
            rotuloCancelar="Voltar à edição"
            operacaoEmAndamento={enviando}
            onCancelar={() => {
              if (!enviando) setConfirmando(false);
            }}
            onConfirmar={() => void salvar()}
          />
          <DialogoConfirmacao
            aberto={descartando}
            titulo="Descartar alterações?"
            descricao="As alterações do formulário serão descartadas. Os horários salvos serão mantidos."
            rotuloConfirmar="Descartar alterações"
            rotuloCancelar="Continuar editando"
            destrutivo
            onCancelar={() => setDescartando(false)}
            onConfirmar={() => {
              setRascunho(null);
              setErro("");
              setDescartando(false);
            }}
          />
        </>
      ) : null}
    </Stack>
  );
}
