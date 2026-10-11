"use client";

// Grade semanal por turma, com edição administrativa confirmada e rascunho preservado.
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Clock, LoaderCircle, Pencil } from "lucide-react";
import { ehHoraValida, type Horario, type Turma } from "@/domain/frequencia";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";
import { corpoAlteracao, pedir } from "@/lib/api-cliente";
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

interface Props {
  turmas: Turma[];
  diaCorrente: string;
  admin: boolean;
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

interface PropsAulasDoDia {
  aulas: Horario[];
  dia: number;
  admin: boolean;
  bloqueado: boolean;
  aulaEmEdicao: string | undefined;
  onEditar: (aula: Horario, dia: number) => void;
  editor: (aula: Horario, dia: number) => ReactNode;
}

function AulasDoDia({
  aulas,
  dia,
  admin,
  bloqueado,
  aulaEmEdicao,
  onEditar,
  editor,
}: PropsAulasDoDia) {
  if (aulas.length === 0)
    return <p className="text-muted-foreground px-4 py-6 text-sm">Sem aulas neste dia.</p>;

  return (
    <ol aria-label={`Aulas de ${rotuloDia(dia)}`} className="divide-y">
      {aulas.map((aula) => (
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
            {admin ? (
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
      ))}
    </ol>
  );
}

export default function VistaHorarios({
  turmas,
  diaCorrente,
  admin,
  onMudanca,
  onPendencia,
}: Props) {
  const [turmaId, setTurmaId] = useState(turmas[0]?.id ?? "");
  const [diaSelecionado, setDiaSelecionado] = useState(String(diaDaSemana(diaCorrente)));
  const [editorCompleto, setEditorCompleto] = useState(false);
  const [rascunho, setRascunho] = useState<RascunhoAula | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("dados_invalidos");
  const gatilhoEdicao = useRef<HTMLElement | null>(null);
  const turma = turmas.find((item) => item.id === turmaId) ?? turmas[0];
  const aulas = (turma?.horarios ?? [])
    .filter((aula) => aula.ativo)
    .sort((a, b) => a.ordem - b.ordem || a.inicio.localeCompare(b.inicio));
  const semanaCompleta = diaSelecionado === "0";
  const diasDaGrade = DIAS_DA_SEMANA.filter(
    (dia) => dia.valor <= 5 || aulas.some((aula) => aula.diasSemana.includes(dia.valor)),
  );
  const dia = Number(diaSelecionado);
  const aulasDoDia = aulas.filter((aula) => aula.diasSemana.includes(dia));
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
    if (!admin || rascunho || editorCompleto) return;
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
    if (!admin || !rascunho || !contextoDisponivel || !confirmando || !alterado) return;
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
    if (!admin || !rascunho || !contextoDisponivel || rascunho.aulaId !== aula.id) return null;
    if (diaDaAula !== null && diaDaAula !== diaDoEditor) return null;
    return renderizarFormulario(versao);
  }

  function renderizarFormulario(versao: string) {
    if (!admin || !rascunho) return null;
    return (
      <EditorAula
        rascunho={rascunho}
        identificador={`horarios-${versao}-${rascunho.aulaId}`}
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
    <section aria-label="Horários semanais" className="flex min-w-0 flex-col gap-5">
      <h1 className="sr-only">Horários</h1>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="horarios-turma">Turma</Label>
          <Selecionar
            id="horarios-turma"
            value={turma?.id ?? ""}
            onValueChange={setTurmaId}
            opcoes={turmas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
            disabled={turmas.length === 0 || navegacaoBloqueada}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="horarios-dia">Dia da semana</Label>
          <Selecionar
            id="horarios-dia"
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
        <Button
          variant="outline"
          className="min-h-11 self-end"
          aria-pressed={semanaCompleta}
          onClick={() => setDiaSelecionado("0")}
          disabled={turmas.length === 0 || navegacaoBloqueada}
        >
          <CalendarDays size={16} aria-hidden="true" />
          Semana completa
        </Button>
      </div>

      {admin ? (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          aria-label={`Editar horários de ${turma?.rotulo ?? "turma"}`}
          disabled={!turma || navegacaoBloqueada}
          onClick={() => setEditorCompleto(true)}
        >
          <Pencil size={16} aria-hidden="true" />
          Editar horários
        </Button>
      ) : null}

      {admin && rascunho && !contextoDisponivel ? (
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
                  {aulas.map((aula) => (
                    <Fragment key={aula.id}>
                      <tr>
                        <th scope="row" className="numerais-tabulares px-3 py-4 font-medium">
                          {aula.ordem}ª aula
                          <span className="text-muted-foreground mt-1 block text-xs font-normal">
                            {aula.inicio} às {aula.fim}
                          </span>
                          {admin ? (
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
                                {admin ? (
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
                      {admin && rascunho?.aulaId === aula.id ? (
                        <tr>
                          <td colSpan={diasDaGrade.length + 1} className="px-3 py-4">
                            {renderizarEditor(aula, null, "grade")}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
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
                  aulas={aulas.filter((aula) => aula.diasSemana.includes(item.valor))}
                  admin={admin}
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
        <div className="superficie-vidro overflow-hidden">
          <h2 className="bg-secondary/50 border-b px-4 py-3 text-sm font-medium">
            {rotuloDia(dia)}
          </h2>
          <AulasDoDia
            dia={dia}
            aulas={aulasDoDia}
            admin={admin}
            bloqueado={navegacaoBloqueada}
            aulaEmEdicao={rascunho?.aulaId}
            onEditar={abrirEdicao}
            editor={(aula, diaDaAula) => renderizarEditor(aula, diaDaAula, "dia")}
          />
        </div>
      )}

      {admin ? (
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
