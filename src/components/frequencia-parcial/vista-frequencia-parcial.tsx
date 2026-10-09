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
  RefreshCw,
  Trash2,
} from "lucide-react";
import type { Aluno, ConfirmacaoSeducAluno, Serie, Turma } from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  diaSeguinte,
  normalizar,
  rotuloDiaSemana,
} from "@/domain/frequencia";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import {
  rotuloFrequenciaPersonalizada,
  type RegistroPersonalizado,
  type FrequenciaDaChamada,
} from "@/domain/frequencia-personalizada";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
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
}

const REGISTROS_VAZIOS: RegistroPersonalizado[] = [];

function resumoDoRegistro(registro: RegistroPersonalizado | undefined): string {
  if (!registro) return "Sem registro";
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

function momentoDaConfirmacao(registro: RegistroPersonalizado, fuso: string): string {
  if (!registro.registradoSeducEm) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: fuso,
  }).format(new Date(registro.registradoSeducEm));
}

export default function VistaFrequenciaParcial({
  series,
  turmas,
  alunos,
  diaInicial,
  ativa,
  fuso,
  onPendencia,
}: Props) {
  const [dia, setDia] = useState(diaInicial);
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
  const chaveCarga = `${dia}|${turmaId}|${recarregar}`;
  const registros = carga.chave === chaveCarga ? carga.registros : REGISTROS_VAZIOS;
  const carregando = turmaId !== "" && carga.chave !== chaveCarga;
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

  const turmasOrdenadas = useMemo(() => {
    const ordem = new Map(series.map((serie) => [serie.id, serie.ordem]));
    return [...turmas].sort(
      (a, b) =>
        (ordem.get(a.serieId) ?? 0) - (ordem.get(b.serieId) ?? 0) ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [series, turmas]);
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
  const alunosDaEdicao = origemEdicao
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
    : alunos.filter((aluno) => aluno.id === edicao.alunoId);
  const alunosFiltrados = useMemo(
    () =>
      listaAlunos.filter(
        (aluno) =>
          normalizar(aluno.nome).includes(normalizar(busca)) &&
          (filtro === "todos" ||
            (filtro === "sem-registro"
              ? !aluno.registro
              : filtro === "pendentes"
                ? aluno.registro && !aluno.registro.registradoSeduc
                : aluno.registro?.registradoSeduc)),
      ),
    [listaAlunos, busca, filtro],
  );

  useEffect(() => {
    onPendencia?.(sujo);
  }, [sujo, onPendencia]);

  useEffect(() => () => onPendencia?.(false), [onPendencia]);

  useEffect(() => {
    if (!ativa || !dia || !turmaId) return;
    let atual = true;
    pedir<{ registros: RegistroPersonalizado[] }>(
      `/api/frequencias-personalizadas?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
    )
      .then((dados) => {
        if (atual)
          setCarga({
            chave: chaveCarga,
            registros: dados.registros,
            erro: "",
            variante: "indisponivel",
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
  }, [ativa, dia, turmaId, chaveCarga]);

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
    const base = registro?.tipo === "CHAMADA" ? registro : null;
    const personalizado = registro?.tipo === "CHAMADA" ? null : registro;
    const inicial: EdicaoParcial = { ...edicaoDoRegistro(personalizado ?? undefined), alunoId };
    if (base) inicial.tipo = base.marca === "P" ? "DIA_INTEIRO" : "AULAS";
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
    if (!edicao.alunoId || conflito) return;
    setErroEdicao("");
    try {
      const dados = await pedir<{ registro: FrequenciaParcial }>(
        "/api/frequencias-parciais",
        corpoJson({
          alunoId: edicao.alunoId,
          dia,
          turmaId: registroEditado?.turmaId ?? turmaId,
          tipo: edicao.tipo,
          turno: edicao.tipo === "TURNO" ? edicao.turno : null,
          aulas: edicao.tipo === "AULAS" ? edicao.aulas : [],
          observacao: edicao.observacao.trim() || null,
          revisao: registroEditado?.revisao ?? 0,
          ...(baseEdicao
            ? { baseChamada: { turmaId: baseEdicao.turmaId, revisao: baseEdicao.revisao } }
            : {}),
        }),
      );
      atualizarRegistro(dados.registro);
      setEditorAberto(false);
      avisarSucesso("Frequência parcial salva.");
    } catch (excecao) {
      setErroEdicao(mensagemAmigavel(excecao, "Não foi possível salvar a frequência parcial."));
      setConflito(excecao instanceof ErroApi && excecao.status === 409);
    }
  });

  const { executando: recarregandoEdicao, executar: recarregarEdicao } = useAcaoUnica(async () => {
    try {
      const dados = await pedir<{ registros: RegistroPersonalizado[] }>(
        `/api/frequencias-personalizadas?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
      );
      setCarga({
        chave: chaveCarga,
        registros: dados.registros,
        erro: "",
        variante: "indisponivel",
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="sr-only">Chamada Parcial</h1>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEnvioAberto(true)}
          disabled={!estadoPlanilha?.podeEnviar || ocupado || sujo}
          className="h-11"
        >
          <FileSpreadsheet size={16} />
          Enviar para planilha
        </Button>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="parcial-turma">Turma</Label>
        <Selecionar
          id="parcial-turma"
          value={turmaId}
          onValueChange={setTurmaId}
          opcoes={turmasOrdenadas.map((item) => ({ valor: item.id, rotulo: item.rotulo }))}
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
          onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
          disabled={ocupado || editorAberto}
          className="size-11 shrink-0"
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <SeletorPeriodo
            id="dia-chamada-parcial"
            modo="dia"
            valor={dia}
            max={diaInicial}
            rotulo={dia.split("-").reverse().join("/")}
            detalhe={rotuloDiaSemana(dia)}
            rotuloAcessivel="Data da chamada parcial"
            onValor={setDia}
            disabled={ocupado || editorAberto}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Dia seguinte da chamada parcial"
          onClick={() => setDia((atual) => diaSeguinte(atual, 1))}
          disabled={ocupado || editorAberto || dia >= diaInicial}
          className="size-11 shrink-0"
        >
          <ChevronRight size={18} />
        </Button>
      </div>
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
          acao={{ rotulo: "Tentar de novo", onClick: () => setRecarregar((valor) => valor + 1) }}
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
        <div className="superficie-vidro overflow-hidden">
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
            <ul className="divide-y">
              {alunosFiltrados.map((aluno) => {
                const registro = aluno.registro;
                return (
                  <li
                    key={aluno.id}
                    className="px-4 py-3"
                    data-testid={`parcial-aluno-${aluno.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
                        {aluno.ordem === null ? "-" : String(aluno.ordem).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-medium break-words">{aluno.nome}</h2>
                        {aluno.desistente && (
                          <span className="text-muted-foreground text-xs">DESISTENTE</span>
                        )}
                        <p
                          className={cn(
                            "mt-2 w-fit max-w-full rounded-xl border px-3 py-1.5 text-xs leading-relaxed font-medium wrap-anywhere",
                            !registro
                              ? "bg-muted/30 text-muted-foreground"
                              : registro.tipo !== "CHAMADA" || registro.marca === "P"
                                ? "border-primary/25 bg-primary/10 text-primary"
                                : registro.marca === "FJ"
                                  ? "border-justificada/30 bg-justificada-fraca text-justificada-texto"
                                  : "border-falta/25 bg-falta-fraca text-falta-texto",
                          )}
                        >
                          {resumoDoRegistro(registro)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2 pl-10">
                      <Label
                        htmlFor={`parcial-seduc-${aluno.id}`}
                        className="min-h-11 text-xs"
                        title="Registrado na Seduc"
                      >
                        RS
                      </Label>
                      <Switch
                        id={`parcial-seduc-${aluno.id}`}
                        aria-label={`RS, Registrado na Seduc: ${aluno.nome}`}
                        title="Registrado na Seduc"
                        checked={registro?.registradoSeduc ?? false}
                        disabled={!registro || ocupado || editorAberto}
                        onCheckedChange={(valor) => registro && confirmarSeduc(registro, valor)}
                      />
                    </div>
                    {registro && (
                      <>
                        <p className="mt-3 text-xs" role="status">
                          {registro.registradoSeduc
                            ? `Confirmado por ${registro.registradoSeducPorNome ?? "registro anterior"}${registro.registradoSeducEm ? ` em ${momentoDaConfirmacao(registro, fuso)}` : ""}`
                            : "Pendente de lançamento na Seduc"}
                        </p>
                        {registro.tipo !== "CHAMADA" && registro.observacao && (
                          <p className="text-muted-foreground mt-2 text-sm break-words">
                            {registro.observacao}
                          </p>
                        )}
                      </>
                    )}
                    <div className="mt-2 flex justify-end gap-2">
                      <Button
                        type="button"
                        variant={registro ? "ghost" : "outline"}
                        onClick={() => abrirEditor(registro ?? null, aluno.id)}
                        aria-label={`${registro ? "Editar" : "Registrar"} frequência parcial de ${aluno.nome}`}
                        disabled={ocupado || editorAberto || (!registro && aluno.desistente)}
                        className="h-11"
                      >
                        {registro ? <Pencil size={15} /> : <Plus size={15} />}
                        {registro ? "Editar" : "Registrar"}
                      </Button>
                      {registro && registro.tipo !== "CHAMADA" && (
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => setRegistroRemover(registro)}
                          aria-label={`Remover frequência parcial de ${aluno.nome}`}
                          disabled={ocupado || editorAberto}
                          className="text-falta-texto h-11"
                        >
                          <Trash2 size={15} />
                          Remover
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
      {!carregando && !erro && turmaId && (
        <Button
          type="button"
          variant="ghost"
          disabled={ocupado || editorAberto}
          onClick={() => setRecarregar((valor) => valor + 1)}
          className="h-11 self-start"
        >
          <RefreshCw size={16} />
          Atualizar lista
        </Button>
      )}
      <DialogoFrequenciaParcial
        aberto={ativa && editorAberto}
        edicao={edicao}
        registro={registroEditado}
        turma={turma}
        alunos={alunosDaEdicao}
        dia={dia}
        sujo={sujo}
        salvando={salvando || recarregandoEdicao}
        erro={erroEdicao}
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
              será removido. A base da Chamada, quando disponível, voltará a aparecer com RS
              pendente. Confira também os lançamentos na Seduc e na planilha.
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
