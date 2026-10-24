"use client";

// Grade semanal por turma: consulta para todos e, em Gestão, edição confirmada com rascunho preservado.
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  CalendarDays,
  Clock,
  Coffee,
  LoaderCircle,
  Pencil,
  Sun,
  Sunset,
  Utensils,
} from "lucide-react";
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
import { avisarErro, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import DialogoAulas from "@/components/gestao/dialogo-aulas";
import { EditorAula, type RascunhoAula } from "@/components/horarios/editor-aula";
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Selecionar } from "@/components/ui/selecionar";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import AbasDeslizantes, { type AbaItem } from "@/components/ui/abas-deslizantes";
import { useAtualizacaoTela } from "@/components/atualizacao/contexto-atualizacao";

const TURNOS: AbaItem<"manha" | "tarde">[] = [
  { valor: "manha", rotulo: "Manhã", icone: Sun },
  { valor: "tarde", rotulo: "Tarde", icone: Sunset },
];

interface Props {
  turmas: Turma[];
  diaCorrente: string;
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
  const Icone = pausa.id === "almoco" ? Utensils : Coffee;
  return <Icone size={16} aria-hidden="true" className="shrink-0" />;
}

function PausaDoDia({ pausa }: { pausa: Pausa }) {
  return (
    <li className="bg-secondary/30 text-muted-foreground flex min-w-0 items-center gap-3 px-4 py-3 text-sm">
      <span className="flex size-11 shrink-0 items-center justify-center">
        <IconePausa pausa={pausa} />
      </span>
      <span className="min-w-0 flex-1 font-medium">{pausa.rotulo}</span>
      <span className="numerais-tabulares shrink-0 text-xs">
        {pausa.inicio} às {pausa.fim}
      </span>
    </li>
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
    <section
      aria-label={`Ordem do almoço de ${rotuloDia(dia)}`}
      className="superficie-vidro overflow-hidden"
    >
      <h2 className="bg-secondary/50 flex items-center gap-2 border-b px-4 py-3 text-sm font-medium">
        <Utensils size={16} aria-hidden="true" className="shrink-0" />
        Ordem do almoço · {rotuloDia(dia)}
      </h2>
      <ol className="divide-y">
        {itens.map((item) => {
          const selecionada = item.turmaId === turmaSelecionada;
          return (
            <li
              key={item.turmaId}
              aria-current={selecionada ? "true" : undefined}
              className={`flex min-w-0 items-center gap-3 px-4 py-3 text-sm ${selecionada ? "vidro-selecionado" : ""}`}
            >
              <span className="controle-vidro numerais-tabulares flex size-11 shrink-0 items-center justify-center font-semibold">
                <span aria-hidden="true">{item.posicao}º</span>
                <span className="sr-only">{item.posicao}º lugar</span>
              </span>
              <span className="min-w-0 flex-1 font-medium break-words">
                {rotuloDe.get(item.turmaId) ?? "Turma"}
                {selecionada ? <span className="sr-only">, turma consultada</span> : null}
              </span>
              {item.inicio ? (
                <span className="numerais-tabulares text-muted-foreground flex shrink-0 items-center gap-1.5 text-xs">
                  <Clock size={14} aria-hidden="true" className="shrink-0" />
                  {item.inicio}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
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
  if (!itens.some((item) => item.tipo === "aula"))
    return (
      <p className="text-muted-foreground px-4 py-6 text-sm">
        {turno ? "Sem aulas neste turno." : "Sem aulas neste dia."}
      </p>
    );

  return (
    <ol aria-label={`Aulas de ${rotuloDia(dia)}${turno ? ` · ${turno}` : ""}`} className="divide-y">
      {itens.map((item) => {
        if (item.tipo === "pausa") return <PausaDoDia key={item.pausa.id} pausa={item.pausa} />;
        const aula = item.aula;
        return (
          <li key={aula.id} className="flex min-w-0 flex-col gap-3 px-4 py-4">
            <div className="flex items-start gap-3">
              <span className="controle-vidro numerais-tabulares flex size-11 shrink-0 items-center justify-center text-sm font-semibold">
                <span aria-hidden="true">{aula.ordem}ª</span>
                <span className="sr-only">{aula.ordem}ª aula</span>
              </span>
              <div className="min-w-0 flex-1">
                <p
                  className={`text-sm font-medium break-words ${aula.disciplinas?.[String(dia)] ? "" : "text-muted-foreground"}`}
                >
                  {nomeDisciplina(aula, dia)}
                </p>
                <p className="numerais-tabulares text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
                  <Clock size={14} aria-hidden="true" className="shrink-0" />
                  {aula.inicio} às {aula.fim}
                </p>
              </div>
              {editavel ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${aula.ordem}ª aula de ${rotuloDia(dia)}`}
                  aria-expanded={aulaEmEdicao === aula.id}
                  disabled={bloqueado}
                  onClick={() => onEditar(aula, dia)}
                >
                  <Pencil size={16} aria-hidden="true" />
                </Button>
              ) : null}
            </div>
            {editor(aula, dia)}
          </li>
        );
      })}
    </ol>
  );
}

export default function VistaHorarios({
  turmas,
  diaCorrente,
  editavel,
  onMudanca,
  onPendencia,
}: Props) {
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
  useAtualizacaoTela("horarios", async () => {
    await onMudanca();
    setVersaoOrdem((versao) => versao + 1);
  });
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
  const itensPorTurno = {
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
  const aulasDoTurno = (turno: "manha" | "tarde") =>
    itensPorTurno[turno].filter((item) => item.tipo === "aula").length;
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

  return (
    // A página rola sem folga inferior: o pb-6 deixa o último cartão respirar acima da borda.
    <section
      aria-label={editavel ? "Edição de horários" : "Horários semanais"}
      className={`flex min-w-0 flex-col gap-5 ${editavel ? "" : "pb-6"}`}
    >
      {editavel ? (
        <h2 className="sr-only">Horários das turmas</h2>
      ) : (
        <h1 className="sr-only">Horários</h1>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${base}-turma`}>Turma</Label>
          <Selecionar
            id={`${base}-turma`}
            value={turma?.id ?? ""}
            onValueChange={setTurmaId}
            opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
            disabled={turmas.length === 0 || navegacaoBloqueada}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={`${base}-dia`}>Dia da semana</Label>
          <Selecionar
            id={`${base}-dia`}
            value={diaSelecionado}
            onValueChange={setDiaSelecionado}
            opcoes={[
              { valor: "0", rotulo: "Semana completa" },
              ...DIAS_DA_SEMANA.map((item) => ({
                valor: String(item.valor),
                rotulo: rotuloDia(item.valor),
              })),
            ]}
            disabled={turmas.length === 0 || navegacaoBloqueada}
          />
        </div>
      </div>

      {editavel ? (
        <div className="flex">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 min-w-0"
            aria-label={`Editar horários de ${turma?.rotulo ?? "turma"}`}
            disabled={!turma || navegacaoBloqueada}
            onClick={() => setEditorCompleto(true)}
          >
            <Pencil size={16} aria-hidden="true" />
            Editar horários
          </Button>
        </div>
      ) : null}

      {editavel && rascunho && !contextoDisponivel ? (
        <div className="flex min-w-0 flex-col gap-3">
          <AvisoCompacto
            variante="dados_invalidos"
            titulo="Esta aula não está mais disponível na grade."
            descricao={`${rascunho.turmaRotulo} · ${rascunho.ordem}ª aula. O rascunho permanece abaixo até o descarte.`}
            tamanho="linha"
          />
          {renderizarFormulario("indisponivel")}
        </div>
      ) : null}

      {aulas.length === 0 ? (
        <div className="superficie-vidro flex min-h-44 flex-col items-center justify-center gap-3 px-5 text-center">
          <CalendarDays size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">
            {turmas.length === 0 ? "Nenhuma turma cadastrada" : "Nenhum horário configurado"}
          </p>
        </div>
      ) : semanaCompleta ? (
        <>
          <div className="superficie-vidro hidden overflow-hidden lg:block">
            <div className="overflow-x-auto overscroll-contain">
              <table className="w-full table-fixed text-left text-sm">
                <caption className="sr-only">Grade semanal de {turma?.rotulo}</caption>
                <thead className="bg-secondary/50">
                  <tr>
                    <th scope="col" className="w-28 px-3 py-3 font-medium">
                      Aula
                    </th>
                    {diasDaGrade.map((item) => (
                      <th key={item.valor} scope="col" className="px-3 py-3 font-medium">
                        {item.abreviacao}
                        <span className="sr-only">: {rotuloDia(item.valor)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {sequenciaDaGrade.map((entrada) => {
                    if (entrada.tipo === "pausa") {
                      return (
                        <tr
                          key={entrada.pausa.id}
                          className="bg-secondary/30 text-muted-foreground"
                        >
                          <td colSpan={diasDaGrade.length + 1} className="px-3 py-2.5 text-xs">
                            <span className="flex items-center gap-2 font-medium">
                              <IconePausa pausa={entrada.pausa} />
                              {entrada.pausa.rotulo}
                              <span className="numerais-tabulares ml-auto font-normal">
                                {entrada.pausa.inicio} às {entrada.pausa.fim}
                              </span>
                            </span>
                          </td>
                        </tr>
                      );
                    }
                    const aula = entrada.aula;
                    return (
                      <Fragment key={aula.id}>
                        <tr>
                          <th scope="row" className="numerais-tabulares px-3 py-4 font-medium">
                            {aula.ordem}ª aula
                            <span className="text-muted-foreground mt-1 block text-xs font-normal">
                              {aula.inicio} às {aula.fim}
                            </span>
                            {editavel ? (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="mt-1"
                                aria-label={`Editar horário da ${aula.ordem}ª aula`}
                                disabled={navegacaoBloqueada}
                                onClick={() => abrirEdicao(aula, null)}
                              >
                                <Pencil size={16} aria-hidden="true" />
                              </Button>
                            ) : null}
                          </th>
                          {diasDaGrade.map((item) => (
                            <td key={item.valor} className="px-3 py-4 align-top break-words">
                              {aula.diasSemana.includes(item.valor) ? (
                                <div className="flex min-w-0 flex-col items-start gap-1">
                                  <span
                                    className={
                                      aula.disciplinas?.[String(item.valor)]
                                        ? "font-medium"
                                        : "text-muted-foreground"
                                    }
                                  >
                                    {nomeDisciplina(aula, item.valor)}
                                  </span>
                                  {editavel ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      aria-label={`Editar disciplina da ${aula.ordem}ª aula de ${rotuloDia(item.valor)}`}
                                      disabled={navegacaoBloqueada}
                                      onClick={() => abrirEdicao(aula, item.valor)}
                                    >
                                      <Pencil size={16} aria-hidden="true" />
                                    </Button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="sr-only">Sem aula</span>
                              )}
                            </td>
                          ))}
                        </tr>
                        {editavel && rascunho?.aulaId === aula.id ? (
                          <tr>
                            <td colSpan={diasDaGrade.length + 1} className="px-3 py-4">
                              {renderizarEditor(aula, null, "grade")}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:hidden">
            {diasDaGrade.map((item) => (
              <section
                key={item.valor}
                aria-label={`Aulas de ${rotuloDia(item.valor)}`}
                className="superficie-vidro overflow-hidden"
              >
                <h2 className="bg-secondary/50 border-b px-4 py-3 text-sm font-medium">
                  {rotuloDia(item.valor)}
                </h2>
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
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="flex min-w-0 flex-col gap-3">
          <AbasDeslizantes
            key={`${turma?.id}-${dia}`}
            rotuloAcessivel="Turnos do dia"
            abaInicial={
              aulasDoTurno("manha") === 0 && aulasDoTurno("tarde") > 0 ? "tarde" : "manha"
            }
            abas={TURNOS}
            chaveIndicador={editavel ? "horarios-turno-edicao" : "horarios-turno"}
            dataPager={editavel ? "horarios-turnos-edicao" : "horarios-turnos"}
            bloqueada={navegacaoBloqueada}
          >
            {(turno) => (
              <section
                aria-label={`Aulas de ${rotuloDia(dia)} · ${turno === "manha" ? "Manhã" : "Tarde"}`}
                className="superficie-vidro mt-3 overflow-hidden"
              >
                <h2 className="bg-secondary/50 border-b px-4 py-3 text-sm font-medium">
                  {rotuloDia(dia)}
                </h2>
                <AulasDoDia
                  dia={dia}
                  itens={itensPorTurno[turno]}
                  turno={turno === "manha" ? "Manhã" : "Tarde"}
                  editavel={editavel}
                  bloqueado={navegacaoBloqueada}
                  aulaEmEdicao={rascunho?.aulaId}
                  onEditar={abrirEdicao}
                  editor={(aula, diaDaAula) => renderizarEditor(aula, diaDaAula, `dia-${turno}`)}
                />
              </section>
            )}
          </AbasDeslizantes>
        </div>
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
          <AlertDialog
            open={confirmando}
            onOpenChange={(aberto) => {
              if (!enviando) setConfirmando(aberto);
            }}
          >
            <AlertDialogContent
              aria-busy={enviando}
              onEscapeKeyDown={(evento) => {
                if (enviando) evento.preventDefault();
              }}
            >
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar alterações na aula</AlertDialogTitle>
                <AlertDialogDescription>
                  {rascunho?.turmaRotulo} · {rascunho?.ordem}ª aula
                  {rascunho?.dia ? ` · ${rotuloDia(rascunho.dia)}` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              {rascunho ? (
                <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  {disciplinaAlterada ? (
                    <>
                      <dt className="text-muted-foreground">Disciplina</dt>
                      <dd className="break-words">
                        {rascunho.disciplinaInicial || "Sem disciplina"} para{" "}
                        {rascunho.disciplina.trim() || "Sem disciplina"}
                      </dd>
                    </>
                  ) : null}
                  {inicioAlterado ? (
                    <>
                      <dt className="text-muted-foreground">Início</dt>
                      <dd className="numerais-tabulares">
                        {rascunho.inicioInicial} para {rascunho.inicio}
                      </dd>
                    </>
                  ) : null}
                  {fimAlterado ? (
                    <>
                      <dt className="text-muted-foreground">Fim</dt>
                      <dd className="numerais-tabulares">
                        {rascunho.fimInicial} para {rascunho.fim}
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              {inicioAlterado || fimAlterado ? (
                <p className="text-muted-foreground text-sm">
                  O horário vale para todos os dias desta aula.
                </p>
              ) : null}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={enviando}>Voltar à edição</AlertDialogCancel>
                <AlertDialogAction
                  disabled={enviando || !contextoDisponivel}
                  onClick={(evento) => {
                    evento.preventDefault();
                    void salvar();
                  }}
                >
                  {enviando ? <LoaderCircle size={16} className="animate-spin" /> : null}
                  Confirmar alterações
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={descartando} onOpenChange={setDescartando}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
                <AlertDialogDescription>
                  As alterações do formulário serão descartadas. Os horários salvos serão mantidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Continuar editando</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    setRascunho(null);
                    setErro("");
                  }}
                >
                  Descartar alterações
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </section>
  );
}
