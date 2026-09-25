"use client";

// Frequência diária: todos presentes por padrão; toque no aluno para marcar
// falta e de novo para voltar. Rascunho local e proteção de conflito.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
  LoaderCircle,
  RotateCcw,
  Save,
  School,
  Settings2,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import type { Aluno, Frequencia, Turma } from "@/domain/frequencia";
import { diaSeguinte, horaNoFuso, normalizar, rotuloDiaSemana } from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarraBusca } from "@/components/ui/barra-busca";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type Filtro = "todos" | "faltas" | "presentes";

interface Props {
  usuario: Identidade;
  turmas: Turma[];
  alunos: Aluno[];
  diaCorrente: string;
  fuso: string;
  alvo: { dia: string; turmaId: string } | null;
  onFrequenciasMudaram: (mes: string) => Promise<void>;
  onPendencia: (visoes: "frequencia"[]) => void;
  onAbrirGestao?: () => void;
}

function chaveRascunho(professorId: string, dia: string, turmaId: string): string {
  return `frequencia:rascunho:${professorId}:${dia}:${turmaId}`;
}

interface Rascunho {
  faltas: string[];
  revisao: number;
}

const MARCAS = {
  escondido: { scale: 0.6, opacity: 0 },
  visivel: { scale: 1, opacity: 1 },
} as const;

export default function VistaFrequencia({
  usuario,
  turmas,
  alunos,
  diaCorrente,
  fuso,
  alvo,
  onFrequenciasMudaram,
  onPendencia,
  onAbrirGestao,
}: Props) {
  const [turmaId, setTurmaId] = useState(() => alvo?.turmaId ?? turmas[0]?.id ?? "");
  const [dia, setDia] = useState(() => alvo?.dia ?? diaCorrente);
  const [faltas, setFaltas] = useState<Set<string>>(new Set());
  const [revisaoSalva, setRevisaoSalva] = useState(0);
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState("");
  const [conflito, setConflito] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [recarregar, setRecarregar] = useState(0);
  const chaveCarregada = useRef("");

  // Sincroniza quando o histórico pede para abrir uma frequência específica.
  useEffect(() => {
    if (!alvo) return;
    setTurmaId(alvo.turmaId);
    setDia(alvo.dia);
  }, [alvo]);

  useEffect(() => {
    const primeira = turmas[0];
    if (turmaId === "" && primeira !== undefined) setTurmaId(primeira.id);
  }, [turmaId, turmas]);

  const turma = turmas.find((t) => t.id === turmaId);
  const chave = `${dia}|${turmaId}`;

  // Carrega a frequência salva do dia e turma, e recupera rascunho local.
  // Sem turma não há o que carregar: o estado vazio assume o lugar.
  useEffect(() => {
    if (!dia || !turmaId) {
      setCarregando(false);
      setErro("");
      setConflito(false);
      return;
    }
    let viva = true;
    setCarregando(true);
    setErro("");
    setConflito(false);
    setSujo(false);
    setBusca("");
    setFiltro("todos");
    setFaltas(new Set());
    setRevisaoSalva(0);
    setAtualizadoEm("");
    chaveCarregada.current = chave;

    pedir<{ frequencia: Frequencia | null }>(
      `/api/frequencias?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
    )
      .then((dados) => {
        if (!viva) return;
        const frequencia = dados.frequencia;
        setFaltas(new Set((frequencia?.faltas ?? []).map((falta) => falta.alunoId)));
        setRevisaoSalva(frequencia?.revisao ?? 0);
        setAtualizadoEm(frequencia?.atualizadoEm ?? "");

        try {
          const bruto = sessionStorage.getItem(chaveRascunho(usuario.id, dia, turmaId));
          if (bruto) {
            const rascunho = JSON.parse(bruto) as Rascunho;
            setFaltas(new Set(rascunho.faltas));
            setSujo(true);
            if (rascunho.revisao === (frequencia?.revisao ?? 0)) {
              toast("Rascunho recuperado. Confira as faltas e salve a frequência.");
            } else {
              setConflito(true);
              setErro(
                "Há um rascunho neste aparelho e uma versão mais nova salva. Confira antes de recarregar.",
              );
            }
          }
        } catch {
          sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
        }
      })
      .catch((excecao: unknown) => {
        if (!viva) return;
        setErro(
          excecao instanceof ErroApi ? excecao.message : "Não foi possível carregar a frequência.",
        );
      })
      .finally(() => {
        if (viva) setCarregando(false);
      });

    return () => {
      viva = false;
    };
  }, [chave, recarregar, usuario.id, dia, turmaId]);

  // Grava rascunho enquanto houver marcação não salva.
  useEffect(() => {
    if (!sujo || !dia || !turmaId) return;
    try {
      const rascunho: Rascunho = { faltas: [...faltas], revisao: revisaoSalva };
      sessionStorage.setItem(chaveRascunho(usuario.id, dia, turmaId), JSON.stringify(rascunho));
    } catch {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    }
  }, [sujo, faltas, revisaoSalva, usuario.id, dia, turmaId]);

  useEffect(() => {
    onPendencia(sujo ? ["frequencia"] : []);
  }, [sujo, onPendencia]);

  const ativosDaTurma = useMemo(
    () =>
      alunos
        .filter((aluno) => aluno.ativo && aluno.turmaId === turmaId)
        .sort((a, b) => a.ordem - b.ordem),
    [alunos, turmaId],
  );

  const contagemFaltas = ativosDaTurma.filter((aluno) => faltas.has(aluno.id)).length;
  const contagemPresencas = ativosDaTurma.length - contagemFaltas;

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return ativosDaTurma.filter((aluno) => {
      const combinaBusca = termo === "" || normalizar(aluno.nome).includes(termo);
      const combinaFiltro =
        filtro === "todos" ||
        (filtro === "faltas" && faltas.has(aluno.id)) ||
        (filtro === "presentes" && !faltas.has(aluno.id));
      return combinaBusca && combinaFiltro;
    });
  }, [ativosDaTurma, busca, filtro, faltas]);

  const bloqueado = carregando || salvando || conflito;
  const travado = bloqueado || sujo;
  const podeSalvar = !bloqueado && (sujo || revisaoSalva === 0);

  const alternarFalta = useCallback(
    (alunoId: string) => {
      if (bloqueado || chaveCarregada.current !== chave) return;
      setFaltas((atuais) => {
        const proximos = new Set(atuais);
        if (proximos.has(alunoId)) proximos.delete(alunoId);
        else proximos.add(alunoId);
        return proximos;
      });
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave],
  );

  async function salvar() {
    if (!podeSalvar || !dia || !turmaId) return;
    setSalvando(true);
    setErro("");
    try {
      const dados = await pedir<{ frequencia: Frequencia }>(
        "/api/frequencias",
        corpoJson({
          dia,
          turmaId,
          faltas: [...faltas],
          revisao: revisaoSalva,
        }),
      );
      setFaltas(new Set(dados.frequencia.faltas.map((falta) => falta.alunoId)));
      setRevisaoSalva(dados.frequencia.revisao);
      setAtualizadoEm(dados.frequencia.atualizadoEm);
      setSujo(false);
      setConflito(false);
      try {
        sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
      } catch {
        // rascunho já removido
      }
      const total = dados.frequencia.faltas.length;
      toast.success(
        total === 0
          ? "Frequência salva. Todos presentes."
          : `Frequência salva com ${total} ${total === 1 ? "falta" : "faltas"}.`,
      );
      await onFrequenciasMudaram(dia.slice(0, 7));
    } catch (excecao) {
      const falha = excecao instanceof ErroApi ? excecao : null;
      if (falha?.conflito) {
        const vigente = (falha.corpo as { frequencia?: Frequencia }).frequencia;
        if (vigente) {
          setRevisaoSalva(vigente.revisao);
          setAtualizadoEm(vigente.atualizadoEm);
        }
        setConflito(true);
      }
      setErro(falha?.message ?? "Não foi possível salvar a frequência.");
      toast.error(falha?.message ?? "Não foi possível salvar a frequência.");
    } finally {
      setSalvando(false);
    }
  }

  function descartar() {
    try {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    } catch {
      // rascunho já removido
    }
    setRecarregar((valor) => valor + 1);
  }

  const rotuloDia = dia ? dia.split("-").reverse().join("/") : "";
  const diaDaSemana = dia ? rotuloDiaSemana(dia) : "";
  const horaSalva = atualizadoEm ? horaNoFuso(atualizadoEm, fuso) : "";

  const tituloEstado = carregando
    ? "Carregando frequência"
    : conflito
      ? "Confira o conflito"
      : salvando
        ? "Salvando frequência"
        : erro
          ? sujo
            ? "Falha ao salvar"
            : "Falha ao carregar"
          : sujo
            ? "Alterações por salvar"
            : atualizadoEm
              ? "Salva na nuvem"
              : "Nova frequência";

  const detalheEstado = carregando
    ? "Buscando o registro salvo."
    : conflito
      ? "Recarregue para resolver."
      : salvando
        ? "Enviando as marcações."
        : sujo
          ? `Turma ${turma?.rotulo ?? ""} · ${rotuloDia}`
          : atualizadoEm
            ? `Às ${horaSalva} · ${contagemFaltas === 0 ? "todos presentes" : `${contagemFaltas} ${contagemFaltas === 1 ? "falta" : "faltas"}`}`
            : "Confira as faltas e toque em Salvar.";

  // Sem turmas cadastradas ou visíveis, o estado vazio explica o próximo passo.
  if (turmas.length === 0) {
    return (
      <section aria-label="Registrar frequência" className="flex flex-col gap-4 pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Frequência diária</h1>
          <p className="text-muted-foreground text-sm">Nenhuma turma disponível</p>
        </div>
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <School size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma turma cadastrada</p>
          <p className="text-muted-foreground text-sm">
            {usuario.papel === "ADMIN"
              ? "Cadastre séries, turmas e alunos na área de Gestão para começar."
              : "Peça à administração para cadastrar as turmas e os alunos da escola."}
          </p>
          {usuario.papel === "ADMIN" && onAbrirGestao && (
            <Button variant="outline" className="mt-2" onClick={onAbrirGestao}>
              <Settings2 size={16} />
              Ir para a Gestão
            </Button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Registrar frequência" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Frequência diária</h1>
          <p className="text-muted-foreground text-sm">
            {carregando ? "" : `${ativosDaTurma.length} alunos ativos`}
          </p>
        </div>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CalendarDays size={16} aria-hidden="true" />
          <span>
            <span className="numerais-tabulares">{rotuloDia}</span>
            {diaDaSemana && <span className="hidden sm:inline"> · {diaDaSemana}</span>}
          </span>
        </span>
      </div>

      {turmas.length > 1 && (
        <div role="group" aria-label="Turma atual" className="flex flex-wrap gap-2">
          {turmas.map((opcao) => {
            const ativo = opcao.id === turmaId;
            const quantidade = alunos.filter((a) => a.ativo && a.turmaId === opcao.id).length;
            return (
              <button
                key={opcao.id}
                type="button"
                aria-pressed={ativo}
                disabled={travado}
                onClick={() => setTurmaId(opcao.id)}
                className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors active:scale-[0.98] disabled:opacity-50"
              >
                <span>{opcao.rotulo}</span>
                <span className="numerais-tabulares text-xs opacity-70">{quantidade}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg"
          aria-label="Dia anterior"
          disabled={travado || !dia}
          onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
        >
          <ChevronLeft size={18} />
        </Button>
        <div className="relative flex-1">
          <label htmlFor="dia-frequencia" className="sr-only">
            Data da frequência
          </label>
          <Input
            id="dia-frequencia"
            type="date"
            value={dia}
            max={diaCorrente}
            disabled={travado}
            onChange={(evento) => {
              if (evento.target.value) setDia(evento.target.value);
            }}
            className="numerais-tabulares h-11 rounded-lg text-center font-medium"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="size-11 rounded-lg"
          aria-label="Dia seguinte"
          disabled={travado || !dia || dia >= diaCorrente}
          onClick={() => setDia((atual) => diaSeguinte(atual, 1))}
        >
          <ChevronRight size={18} />
        </Button>
      </div>
      {dia !== diaCorrente && (
        <button
          type="button"
          disabled={travado}
          onClick={() => setDia(diaCorrente)}
          className="text-primary self-start text-sm font-medium hover:underline disabled:opacity-50"
        >
          Voltar para hoje
        </button>
      )}
      {sujo && (
        <p className="text-muted-foreground text-xs">
          Salve ou descarte as alterações para mudar a data ou a turma.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3" aria-label="Resumo da frequência">
        <button
          type="button"
          aria-pressed={filtro === "faltas"}
          onClick={() => setFiltro((atual) => (atual === "faltas" ? "todos" : "faltas"))}
          className="bg-card aria-[pressed=true]:border-falta aria-[pressed=true]:bg-falta-fraca flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors active:scale-[0.98]"
        >
          <span className="numerais-tabulares text-falta-texto text-2xl font-semibold">
            {carregando ? "" : contagemFaltas}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Faltas</span>
        </button>
        <button
          type="button"
          aria-pressed={filtro === "presentes"}
          onClick={() => setFiltro((atual) => (atual === "presentes" ? "todos" : "presentes"))}
          className="bg-card aria-[pressed=true]:border-primary aria-[pressed=true]:bg-accent flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 transition-colors active:scale-[0.98]"
        >
          <span className="numerais-tabulares text-primary text-2xl font-semibold">
            {carregando ? "" : contagemPresencas}
          </span>
          <span className="text-muted-foreground text-xs font-medium">Presentes</span>
        </button>
      </div>
      <p className="text-muted-foreground text-xs">
        Todos começam presentes. Toque no aluno somente para marcar falta.
      </p>

      {(erro || conflito) && (
        <div
          role="alert"
          className="border-falta/40 bg-falta-fraca text-falta-texto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
        >
          <TriangleAlert size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
          <div className="flex-1">
            <p>{erro}</p>
            {conflito && (
              <Button variant="outline" size="sm" className="mt-2" onClick={descartar}>
                Recarregar versão salva
              </Button>
            )}
            {!conflito && !sujo && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setRecarregar((valor) => valor + 1)}
              >
                Tentar novamente
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="bg-card overflow-hidden rounded-lg border">
        <BarraBusca
          id="busca-aluno"
          valor={busca}
          onValor={setBusca}
          placeholder="Buscar aluno"
          className="rounded-none border-0 border-b px-3 py-1.5"
        />

        <div className="text-muted-foreground flex items-center justify-between px-4 py-2 text-xs">
          <span className="numerais-tabulares">
            {carregando
              ? ""
              : `${visiveis.length} ${
                  filtro === "faltas"
                    ? "com falta"
                    : filtro === "presentes"
                      ? "presentes"
                      : "alunos"
                }`}
          </span>
          {(filtro !== "todos" || busca !== "") && (
            <button
              type="button"
              className="text-primary font-medium hover:underline"
              onClick={() => {
                setFiltro("todos");
                setBusca("");
              }}
            >
              Ver todos
            </button>
          )}
        </div>

        {carregando ? (
          <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
            <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
            Carregando frequência...
          </div>
        ) : ativosDaTurma.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="font-medium">Nenhum aluno ativo nesta turma</p>
            <p className="text-muted-foreground text-sm">
              {usuario.papel === "ADMIN"
                ? "Cadastre alunos na área de Gestão."
                : "Peça ao administrador para cadastrar os alunos desta turma."}
            </p>
          </div>
        ) : visiveis.length === 0 ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="font-medium">
              {filtro === "faltas" && busca === ""
                ? "Nenhuma falta nesta frequência."
                : "Nenhum aluno neste filtro."}
            </p>
            <button
              type="button"
              className="text-primary text-sm font-medium hover:underline"
              onClick={() => {
                setFiltro("todos");
                setBusca("");
              }}
            >
              Mostrar todos
            </button>
          </div>
        ) : (
          <ul className="divide-y">
            {visiveis.map((aluno) => {
              const faltando = faltas.has(aluno.id);
              return (
                <li key={aluno.id}>
                  <button
                    type="button"
                    aria-pressed={faltando}
                    disabled={bloqueado}
                    aria-label={`${aluno.nome}: ${faltando ? "falta" : "presente"}. Toque para ${faltando ? "voltar a presente" : "marcar falta"}.`}
                    onClick={() => alternarFalta(aluno.id)}
                    className={`faixa-toque flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:scale-[0.99] disabled:opacity-60 ${
                      faltando ? "bg-falta-fraca" : "hover:bg-secondary/60"
                    }`}
                  >
                    <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
                      {String(aluno.ordem).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate ${faltando ? "font-semibold" : "font-medium"}`}
                      >
                        {aluno.nome}
                      </span>
                    </span>
                    <motion.span
                      key={faltando ? "F" : "P"}
                      initial={MARCAS.escondido}
                      animate={MARCAS.visivel}
                      transition={{ type: "spring", stiffness: 500, damping: 28 }}
                      className={
                        faltando
                          ? "bg-falta text-falta-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                          : "text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold"
                      }
                    >
                      {faltando ? "F" : "P"}
                    </motion.span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        Toque de novo em um aluno marcado para voltar a presente.
      </p>

      <div
        aria-label="Barra de salvamento"
        className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-0 z-20 -mx-4 border-t px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div aria-live="polite" className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{tituloEstado}</p>
            <p className="text-muted-foreground truncate text-xs">{detalheEstado}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {sujo && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-11 rounded-lg"
                    disabled={salvando}
                  >
                    <RotateCcw size={16} />
                    Descartar
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
                    <AlertDialogDescription>
                      As marcações não salvas serão descartadas e a última versão salva será
                      recarregada.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Continuar marcando</AlertDialogCancel>
                    <AlertDialogAction onClick={descartar}>Descartar</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button
              size="lg"
              className="h-11 rounded-lg px-6"
              onClick={salvar}
              disabled={!podeSalvar}
            >
              {salvando ? (
                <LoaderCircle size={16} className="animate-spin" />
              ) : atualizadoEm && !sujo ? (
                <CloudCheck size={16} />
              ) : (
                <Save size={16} />
              )}
              {salvando ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
