"use client";

// Chamada parcial independente, com confirmação manual da frequência na Seduc.
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
import type { Aluno, Serie, Turma } from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  diaSeguinte,
  normalizar,
  rotuloDiaSemana,
} from "@/domain/frequencia";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import { rotuloFrequenciaParcial } from "@/domain/frequencia-parcial";
import { corpoJson, ErroApi, pedir } from "@/lib/api-cliente";
import { avisarErro, avisarSucesso, mensagemAmigavel } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
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
  registros: FrequenciaParcial[];
  erro: string;
  variante: VarianteEstado;
}

const REGISTROS_VAZIOS: FrequenciaParcial[] = [];

function momentoDaConfirmacao(registro: FrequenciaParcial, fuso: string): string {
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
  const alunosDisponiveis = useMemo(() => {
    const registrados = new Set(registros.map((registro) => registro.alunoId));
    return alunos
      .filter(
        (aluno) =>
          aluno.ativo &&
          aluno.turmaId === turmaId &&
          !alunoDesistenteNoDia(aluno, dia) &&
          !registrados.has(aluno.id),
      )
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [alunos, registros, turmaId, dia]);
  const alunosDaEdicao = registroEditado
    ? [
        {
          ...(alunos.find((aluno) => aluno.id === registroEditado.alunoId) ?? {
            turmaId: registroEditado.turmaId,
            turmaOriginalId: registroEditado.turmaId,
            ordem: 0,
            ativo: false,
          }),
          id: registroEditado.alunoId,
          nome: registroEditado.alunoNome,
        },
      ]
    : alunosDisponiveis;
  const registrosFiltrados = useMemo(
    () =>
      registros
        .filter(
          (registro) =>
            normalizar(registro.alunoNome).includes(normalizar(busca)) &&
            (filtro === "todos" ||
              (filtro === "pendentes" ? !registro.registradoSeduc : registro.registradoSeduc)),
        )
        .sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, "pt-BR")),
    [registros, busca, filtro],
  );
  const pendentes = registros.filter((registro) => !registro.registradoSeduc).length;

  useEffect(() => {
    onPendencia?.(sujo);
  }, [sujo, onPendencia]);

  useEffect(() => () => onPendencia?.(false), [onPendencia]);

  useEffect(() => {
    if (!ativa || !dia || !turmaId) return;
    let atual = true;
    pedir<{ registros: FrequenciaParcial[] }>(
      `/api/frequencias-parciais?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
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

  const atualizarRegistro = useCallback((registro: FrequenciaParcial) => {
    setCarga((atual) => ({
      ...atual,
      registros: [...atual.registros.filter((item) => item.id !== registro.id), registro],
    }));
  }, []);

  function abrirEditor(registro: FrequenciaParcial | null = null) {
    const inicial = edicaoDoRegistro(registro ?? undefined);
    setRegistroEditado(registro);
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
      const dados = await pedir<{ registros: FrequenciaParcial[] }>(
        `/api/frequencias-parciais?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
      );
      setCarga({
        chave: chaveCarga,
        registros: dados.registros,
        erro: "",
        variante: "indisponivel",
      });
      const vigente = dados.registros.find((registro) => registro.alunoId === edicao.alunoId);
      if (vigente) abrirEditor(vigente);
      else {
        setRegistroEditado(null);
        setConflito(false);
        setErroEdicao("O registro foi removido. Confira os dados antes de criar novamente.");
      }
    } catch (excecao) {
      setErroEdicao(mensagemAmigavel(excecao, "Não foi possível carregar a versão salva."));
    }
  });

  const { chaveAtiva, executar: alterarPorChave } = useAcoesPorChave();
  function confirmarSeduc(registro: FrequenciaParcial, registrado: boolean) {
    void alterarPorChave(registro.id, async () => {
      try {
        const dados = await pedir<{ registro: FrequenciaParcial }>(
          `/api/frequencias-parciais/${registro.id}/seduc`,
          corpoJson({ registrado, revisao: registro.revisao }),
        );
        atualizarRegistro(dados.registro);
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
      setCarga((atual) => ({
        ...atual,
        registros: atual.registros.filter((registro) => registro.id !== registroRemover.id),
      }));
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
        <div>
          <h1 className="text-xl font-semibold">Chamada Parcial</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Presença por turno ou aulas, independente da chamada diária.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setEnvioAberto(true)}
          disabled={!estadoPlanilha?.podeEnviar || ocupado || sujo}
          className="h-11 rounded-lg"
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
          className="size-11 shrink-0 rounded-lg"
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
          className="size-11 shrink-0 rounded-lg"
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {registros.length} {registros.length === 1 ? "registro" : "registros"} · {pendentes}{" "}
          {pendentes === 1 ? "pendente na Seduc" : "pendentes na Seduc"}
        </p>
        <Button
          type="button"
          onClick={() => abrirEditor()}
          disabled={carregando || ocupado || !turmaId || alunosDisponiveis.length === 0}
          className="h-11 rounded-lg"
        >
          <Plus size={16} />
          Registrar frequência parcial
        </Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <BarraBusca
          id="parcial-busca"
          valor={busca}
          onValor={setBusca}
          placeholder="Buscar aluno"
          className="min-w-0 flex-1 rounded-lg"
        />
        <div className="sm:w-48">
          <Selecionar
            id="parcial-filtro"
            ariaLabel="Situação na Seduc"
            value={filtro}
            onValueChange={setFiltro}
            opcoes={[
              { valor: "todos", rotulo: "Todos os registros" },
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
      ) : registrosFiltrados.length === 0 ? (
        <div className="bg-card rounded-lg border p-6 text-center">
          <p className="text-muted-foreground text-sm">
            {registros.length === 0
              ? "Nenhuma frequência parcial registrada neste dia."
              : "Nenhum registro encontrado com estes filtros."}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {registrosFiltrados.map((registro) => (
            <li
              key={registro.id}
              className="bg-card rounded-lg border p-4"
              data-testid={`parcial-registro-${registro.alunoId}`}
            >
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm font-semibold break-words">{registro.alunoNome}</h2>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {rotuloFrequenciaParcial(registro)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Label htmlFor={`parcial-seduc-${registro.id}`} className="text-xs">
                    Registrado na Seduc
                  </Label>
                  <Switch
                    id={`parcial-seduc-${registro.id}`}
                    aria-label={`Registrado na Seduc: ${registro.alunoNome}`}
                    checked={registro.registradoSeduc}
                    disabled={ocupado || editorAberto}
                    onCheckedChange={(valor) => confirmarSeduc(registro, valor)}
                  />
                </div>
              </div>
              <p className="mt-3 text-xs" role="status">
                {registro.registradoSeduc
                  ? `Confirmado por ${registro.registradoSeducPorNome ?? "registro anterior"}${registro.registradoSeducEm ? ` em ${momentoDaConfirmacao(registro, fuso)}` : ""}`
                  : "Pendente de lançamento na Seduc"}
              </p>
              {registro.observacao && (
                <p className="text-muted-foreground mt-2 text-sm break-words">
                  {registro.observacao}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => abrirEditor(registro)}
                  aria-label={`Editar frequência parcial de ${registro.alunoNome}`}
                  disabled={ocupado}
                  className="h-11 rounded-lg"
                >
                  <Pencil size={15} />
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRegistroRemover(registro)}
                  aria-label={`Remover frequência parcial de ${registro.alunoNome}`}
                  disabled={ocupado}
                  className="text-falta-texto h-11 rounded-lg"
                >
                  <Trash2 size={15} />
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
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
      {!estadoPlanilha?.podeEnviar && (
        <p className="text-muted-foreground text-xs">
          A terceira planilha é conectada em Gestão, Configurações, Chamada Parcial.
        </p>
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
              será removido do aplicativo. Confira também os lançamentos já feitos na Seduc e na
              planilha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removendo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-falta text-falta-foreground hover:bg-falta/90"
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
