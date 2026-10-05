"use client";

// Chamada diária: todos presentes por padrão; toque no aluno para marcar
// falta e de novo para voltar. A falta pode receber uma justificativa do
// catálogo (FJ). Rascunho local e proteção de conflito.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
  LockKeyhole,
  LockKeyholeOpen,
  LoaderCircle,
  RotateCcw,
  Save,
  School,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { avisarErro, avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { useAcaoUnica, useAcoesPorChave } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type {
  AcumuladoAluno,
  Aluno,
  Configuracoes,
  ConfirmacaoSeducAluno,
  Frequencia,
  JustificativaConfigurada,
  ResumoAcumulado,
  Turma,
} from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  diaSeguinte,
  exibirOrigemNaChamada,
  horaNoFuso,
  horariosDoDia,
  JUSTIFICATIVA_OUTROS,
  normalizar,
  nomeNaChamada,
  rotuloCurtoDeTurma,
  rotuloDiaSemana,
  rotuloJustificativa,
  type FaltaAluno,
} from "@/domain/frequencia";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { BarraBusca } from "@/components/ui/barra-busca";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CirculoValor, CirculosAcumulado, fraseAcumulado } from "@/components/ui/circulo-contagem";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { SeletorTurmaChamada } from "@/components/frequencia/seletor-turma-chamada";
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

type Filtro = "todos" | "faltas" | "justificadas" | "presentes";

interface Props {
  usuario: Identidade;
  turmas: Turma[];
  alunos: Aluno[];
  diaCorrente: string;
  fuso: string;
  alvo: { dia: string; turmaId: string } | null;
  configuracoes: Configuracoes;
  catalogoJustificativas: JustificativaConfigurada[];
  resumo: ResumoAcumulado | null;
  onFrequenciasMudaram: (mes: string) => Promise<void>;
  onPendencia: (visoes: "chamada"[]) => void;
  onAbrirGestao?: () => void;
}

function chaveRascunho(usuarioId: string, dia: string, turmaId: string): string {
  return `frequencia:rascunho:${usuarioId}:${dia}:${turmaId}`;
}

interface Rascunho {
  versao: 3;
  faltas: FaltaAluno[];
  revisao: number;
}

/** Converte as faltas agrupadas do servidor em mapa por aluno. */
function paraAusencias(faltas: FaltaAluno[]): Map<string, Set<string>> {
  const mapa = new Map<string, Set<string>>();
  for (const falta of faltas) {
    mapa.set(falta.alunoId, new Set(falta.horarios));
  }
  return mapa;
}

function paraJustificativas(faltas: FaltaAluno[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const falta of faltas) {
    if (falta.justificativa) mapa.set(falta.alunoId, falta.justificativa);
  }
  return mapa;
}

function paraObservacoes(faltas: FaltaAluno[]): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const falta of faltas) {
    if (falta.observacao) mapa.set(falta.alunoId, falta.observacao);
  }
  return mapa;
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
  configuracoes,
  catalogoJustificativas,
  resumo,
  onFrequenciasMudaram,
  onPendencia,
  onAbrirGestao,
}: Props) {
  const podeAdministrar = temCapacidade(usuario.papel, "administrar");
  const [turmaId, setTurmaId] = useState(() => alvo?.turmaId ?? turmas[0]?.id ?? "");
  const [dia, setDia] = useState(() => alvo?.dia ?? diaCorrente);
  const [ausencias, setAusencias] = useState<Map<string, Set<string>>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [observacoes, setObservacoes] = useState<Map<string, string>>(new Map());
  const [aulasAbertas, setAulasAbertas] = useState<string | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const idResumo = useId();
  const [revisaoSalva, setRevisaoSalva] = useState(0);
  const [confirmacoesSeduc, setConfirmacoesSeduc] = useState<ConfirmacaoSeducAluno[]>([]);
  const { chaveAtiva: confirmandoSeduc, executar: executarSeduc } = useAcoesPorChave();
  const [edicaoLiberada, setEdicaoLiberada] = useState(false);
  // Lista gravada da chamada; nula enquanto o dia não foi salvo.
  const [listaGravada, setListaGravada] = useState<string[] | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [conflito, setConflito] = useState(false);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [recarregar, setRecarregar] = useState(0);
  const chaveCarregada = useRef("");
  const semMovimento = useReducedMotion() ?? false;

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
    setAusencias(new Map());
    setJustificativas(new Map());
    setObservacoes(new Map());
    setAulasAbertas(null);
    setResumoAberto(false);
    setRevisaoSalva(0);
    setConfirmacoesSeduc([]);
    setEdicaoLiberada(false);
    setListaGravada(null);
    setAtualizadoEm("");
    chaveCarregada.current = chave;

    pedir<{ frequencia: Frequencia | null }>(
      `/api/frequencias?dia=${dia}&turmaId=${encodeURIComponent(turmaId)}`,
    )
      .then((dados) => {
        if (!viva) return;
        const frequencia = dados.frequencia;
        setAusencias(paraAusencias(frequencia?.faltas ?? []));
        setJustificativas(paraJustificativas(frequencia?.faltas ?? []));
        setObservacoes(paraObservacoes(frequencia?.faltas ?? []));
        setRevisaoSalva(frequencia?.revisao ?? 0);
        setConfirmacoesSeduc(frequencia?.confirmacoesSeduc ?? []);
        setListaGravada(frequencia?.alunos ?? null);
        setAtualizadoEm(frequencia?.atualizadoEm ?? "");

        try {
          const bruto = sessionStorage.getItem(chaveRascunho(usuario.id, dia, turmaId));
          if (bruto) {
            const rascunho = JSON.parse(bruto) as Rascunho;
            if (rascunho.versao !== 3) {
              sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
            } else {
              setAusencias(paraAusencias(rascunho.faltas));
              setJustificativas(paraJustificativas(rascunho.faltas));
              setObservacoes(paraObservacoes(rascunho.faltas));
              setSujo(true);
              if (rascunho.revisao === (frequencia?.revisao ?? 0)) {
                toast(
                  frequencia
                    ? "Rascunho recuperado. Desbloqueie a chamada, confira e salve."
                    : "Rascunho recuperado. Confira as faltas e salve a frequência.",
                );
              } else {
                setConflito(true);
                setErro(
                  "Há um rascunho neste dispositivo e uma versão mais nova salva. Confira antes de recarregar.",
                );
              }
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
        setErroVariante(estadoDeErro(excecao));
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
      const rascunho: Rascunho = {
        versao: 3,
        faltas: [...ausencias.entries()].map(([alunoId, horarios]) => ({
          alunoId,
          horarios: [...horarios],
          justificativa: justificativas.get(alunoId) ?? null,
          observacao: observacoes.get(alunoId) ?? null,
        })),
        revisao: revisaoSalva,
      };
      sessionStorage.setItem(chaveRascunho(usuario.id, dia, turmaId), JSON.stringify(rascunho));
    } catch {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    }
  }, [sujo, ausencias, justificativas, observacoes, revisaoSalva, usuario.id, dia, turmaId]);

  useEffect(() => {
    onPendencia(sujo ? ["chamada"] : []);
  }, [sujo, onPendencia]);

  // Dia novo: a relação atual da turma. Dia salvo: quem estava na chamada,
  // mesmo que tenha mudado de turma depois; hoje também recebe quem entrou.
  const ativosDaTurma = useMemo(() => {
    const daTurma = (aluno: Aluno) => aluno.ativo && aluno.turmaId === turmaId;
    const naLista = new Set(listaGravada ?? []);
    return alunos
      .filter((aluno) =>
        listaGravada === null
          ? daTurma(aluno)
          : naLista.has(aluno.id) || (dia === diaCorrente && daTurma(aluno)),
      )
      .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [alunos, turmaId, listaGravada, dia, diaCorrente]);
  const desistentesDaTurma = useMemo(
    () =>
      new Set(
        ativosDaTurma.filter((aluno) => alunoDesistenteNoDia(aluno, dia)).map((aluno) => aluno.id),
      ),
    [ativosDaTurma, dia],
  );
  const participantes = ativosDaTurma.filter((aluno) => !desistentesDaTurma.has(aluno.id));

  const mostrarOrigem = exibirOrigemNaChamada(configuracoes, turma);
  const rotuloCurtoDe = useMemo(() => {
    const mapa = new Map(
      turmas.map((item) => [item.id, rotuloCurtoDeTurma(item.serieNome, item.nome)]),
    );
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const aulasDoDia = useMemo(() => (turma ? horariosDoDia(turma.horarios, dia) : []), [turma, dia]);
  const acumuladoDe = useMemo(() => {
    const mapa = new Map((resumo?.porAluno ?? []).map((item) => [item.alunoId, item]));
    return (alunoId: string): AcumuladoAluno | null => mapa.get(alunoId) ?? null;
  }, [resumo]);

  const rotuloOrigemDe = useMemo(() => {
    const mapa = new Map(turmas.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const opcoesJustificativa = useMemo(
    () => [
      { valor: "", rotulo: "Sem justificativa" },
      ...catalogoJustificativas
        .filter((item) => item.ativo)
        .map((item) => ({ valor: item.codigo, rotulo: `${item.codigo} · ${item.rotulo}` })),
    ],
    [catalogoJustificativas],
  );

  const contagemFaltas = participantes.filter((aluno) => ausencias.has(aluno.id)).length;
  const contagemJustificadas = participantes.filter((aluno) => justificativas.has(aluno.id)).length;
  const contagemPresencas = participantes.length - contagemFaltas;
  const contagemParciais = participantes.filter((aluno) => {
    const marcadas = ausencias.get(aluno.id)?.size ?? 0;
    return marcadas > 0 && aulasDoDia.length > 0 && marcadas < aulasDoDia.length;
  }).length;

  const visiveis = useMemo(() => {
    const termo = normalizar(busca);
    return ativosDaTurma.filter((aluno) => {
      const origem = rotuloOrigemDe(aluno.turmaOriginalId);
      const combinaBusca =
        termo === "" ||
        normalizar(aluno.nome).includes(termo) ||
        (origem !== "" && normalizar(origem).includes(termo));
      const combinaFiltro =
        filtro === "todos" ||
        (!desistentesDaTurma.has(aluno.id) &&
          ((filtro === "faltas" && ausencias.has(aluno.id)) ||
            (filtro === "justificadas" && justificativas.has(aluno.id)) ||
            (filtro === "presentes" && !ausencias.has(aluno.id))));
      return combinaBusca && combinaFiltro;
    });
  }, [ativosDaTurma, busca, filtro, ausencias, justificativas, rotuloOrigemDe, desistentesDaTurma]);

  const chamadaBloqueada = revisaoSalva > 0 && !edicaoLiberada;
  const ocupado = carregando || salvando || conflito || confirmandoSeduc !== null;
  const bloqueado = ocupado || chamadaBloqueada;
  const travado = ocupado || sujo;
  const podeSalvar = !bloqueado && (sujo || revisaoSalva === 0);

  const seducPorAluno = useMemo(
    () => new Map(confirmacoesSeduc.map((confirmacao) => [confirmacao.alunoId, confirmacao])),
    [confirmacoesSeduc],
  );
  async function confirmarSeduc(alunoId: string, registrado: boolean) {
    if (ocupado || sujo || !chamadaBloqueada || chaveCarregada.current !== chave) return;
    const anterior = seducPorAluno.get(alunoId);
    if (!anterior) return;
    await executarSeduc("seduc", async () => {
      try {
        const dados = await pedir<{ confirmacao: ConfirmacaoSeducAluno }>(
          "/api/frequencias/seduc",
          corpoJson({
            dia,
            turmaId,
            alunoId,
            registrado,
            revisao: revisaoSalva,
            revisaoSeduc: anterior.revisaoSeduc,
          }),
        );
        if (chaveCarregada.current !== chave) return;
        setConfirmacoesSeduc((atuais) =>
          atuais.map((item) => (item.alunoId === alunoId ? dados.confirmacao : item)),
        );
        avisarSucesso(
          registrado ? "Lançamento na Seduc confirmado." : "Confirmação da Seduc desmarcada.",
        );
      } catch (excecao) {
        avisarErro(excecao, { contexto: "Não foi possível atualizar a confirmação da Seduc." });
        if (excecao instanceof ErroApi && excecao.status === 409)
          setRecarregar((valor) => valor + 1);
      }
    });
  }

  const alternarFalta = useCallback(
    (alunoId: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setAusencias((atuais) => {
        const proximas = new Map(atuais);
        if (proximas.has(alunoId)) {
          proximas.delete(alunoId);
        } else {
          proximas.set(alunoId, new Set(aulasDoDia.map((aula) => aula.id)));
        }
        return proximas;
      });
      if (ausencias.has(alunoId)) {
        setJustificativas((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
        setObservacoes((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
      }
      setSujo(true);
      setErro("");
    },
    [aulasDoDia, ausencias, bloqueado, chave, desistentesDaTurma],
  );

  const definirJustificativa = useCallback(
    (alunoId: string, codigo: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setJustificativas((atuais) => {
        const proximas = new Map(atuais);
        if (codigo === "") proximas.delete(alunoId);
        else proximas.set(alunoId, codigo);
        return proximas;
      });
      if (codigo !== JUSTIFICATIVA_OUTROS) {
        setObservacoes((atuais) => {
          if (!atuais.has(alunoId)) return atuais;
          const proximas = new Map(atuais);
          proximas.delete(alunoId);
          return proximas;
        });
      }
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  const definirObservacao = useCallback(
    (alunoId: string, texto: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setObservacoes((atuais) => {
        const proximas = new Map(atuais);
        if (texto === "") proximas.delete(alunoId);
        else proximas.set(alunoId, texto);
        return proximas;
      });
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  const alternarAula = useCallback(
    (alunoId: string, horarioId: string) => {
      if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
      setAusencias((atuais) => {
        const proximas = new Map(atuais);
        const aulas = new Set(proximas.get(alunoId) ?? []);
        if (aulas.has(horarioId)) aulas.delete(horarioId);
        else aulas.add(horarioId);
        if (aulas.size === 0) proximas.delete(alunoId);
        else proximas.set(alunoId, aulas);
        return proximas;
      });
      setSujo(true);
      setErro("");
    },
    [bloqueado, chave, desistentesDaTurma],
  );

  function definirAulas(alunoId: string, ids: string[]) {
    if (bloqueado || desistentesDaTurma.has(alunoId) || chaveCarregada.current !== chave) return;
    setAusencias((atuais) => {
      const proximas = new Map(atuais);
      if (ids.length === 0) proximas.delete(alunoId);
      else proximas.set(alunoId, new Set(ids));
      return proximas;
    });
    setSujo(true);
    setErro("");
  }

  const { executar: salvar } = useAcaoUnica(async () => {
    if (!podeSalvar || !dia || !turmaId) return;
    setSalvando(true);
    setErro("");
    try {
      const dados = await pedir<{ frequencia: Frequencia }>(
        "/api/frequencias",
        corpoJson({
          dia,
          turmaId,
          faltas: [...ausencias.entries()].map(([alunoId, horarios]) => ({
            alunoId,
            horarios: [...horarios],
            justificativa: justificativas.get(alunoId) ?? null,
            observacao:
              justificativas.get(alunoId) === JUSTIFICATIVA_OUTROS
                ? (observacoes.get(alunoId) ?? null)
                : null,
          })),
          revisao: revisaoSalva,
        }),
      );
      setAusencias(paraAusencias(dados.frequencia.faltas));
      setJustificativas(paraJustificativas(dados.frequencia.faltas));
      setObservacoes(paraObservacoes(dados.frequencia.faltas));
      setAulasAbertas(null);
      setRevisaoSalva(dados.frequencia.revisao);
      setConfirmacoesSeduc(dados.frequencia.confirmacoesSeduc ?? []);
      setEdicaoLiberada(false);
      setListaGravada(dados.frequencia.alunos ?? null);
      setAtualizadoEm(dados.frequencia.atualizadoEm);
      setSujo(false);
      setConflito(false);
      try {
        sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
      } catch {
        // rascunho já removido
      }
      const total = dados.frequencia.faltas.length;
      const justificadas = dados.frequencia.faltas.filter((falta) => falta.justificativa).length;
      avisarSucesso(
        total === 0
          ? "Chamada salva. Todos presentes."
          : `Chamada salva com ${total} ${total === 1 ? "falta" : "faltas"}${
              justificadas > 0
                ? ` (${justificadas} ${justificadas === 1 ? "justificada" : "justificadas"})`
                : ""
            }.`,
        "Pode conferir no Histórico ou seguir para outra turma.",
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
      setErro(falha?.message ?? "Não foi possível salvar a chamada.");
      setErroVariante(falha?.conflito ? "conflito" : estadoDeErro(excecao));
      if (falha?.status !== 401) {
        toast.error(falha?.message ?? "Não foi possível salvar a chamada.", {
          description: falha?.conflito
            ? "A chamada foi salva por outra pessoa enquanto esta tela estava aberta. Revise as marcações."
            : undefined,
          duration: falha?.conflito ? 8000 : undefined,
        });
      }
    } finally {
      setSalvando(false);
    }
  });

  function descartar() {
    try {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    } catch {
      // rascunho já removido
    }
    setRecarregar((valor) => valor + 1);
    toast("Rascunho descartado.", {
      description: "As marcações voltaram para a última versão salva.",
    });
  }

  const rotuloDia = dia ? dia.split("-").reverse().join("/") : "";
  const diaDaSemana = dia ? rotuloDiaSemana(dia) : "";
  const tituloResumo = dia === diaCorrente ? "Resumo de hoje" : "Resumo do dia";
  const horaSalva = atualizadoEm ? horaNoFuso(atualizadoEm, fuso) : "";

  const tituloEstado = carregando
    ? "Carregando chamada"
    : conflito
      ? "Confira o conflito"
      : salvando
        ? "Salvando chamada"
        : erro
          ? sujo
            ? "Falha ao salvar"
            : "Falha ao carregar"
          : sujo
            ? "Alterações por salvar"
            : atualizadoEm
              ? "Salva na nuvem"
              : "Nova chamada";

  const detalheEstado = carregando
    ? "Buscando o registro salvo."
    : conflito
      ? "Recarregue para resolver."
      : salvando
        ? "Enviando as marcações."
        : sujo
          ? `Turma ${turma?.rotulo ?? ""} · ${rotuloDia}`
          : atualizadoEm
            ? `Às ${horaSalva} · ${
                contagemFaltas === 0
                  ? "todos presentes"
                  : `${contagemFaltas} ${contagemFaltas === 1 ? "falta" : "faltas"}`
              }`
            : "Confira as faltas e toque em Salvar.";

  // Sem turmas cadastradas ou visíveis, o estado vazio explica o próximo passo.
  if (turmas.length === 0) {
    return (
      <section aria-label="Fazer chamada" className="flex flex-col gap-4 pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chamada</h1>
          <p className="text-muted-foreground text-sm">Nenhuma turma disponível</p>
        </div>
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <School size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma turma cadastrada</p>
          <p className="text-muted-foreground text-sm">
            {podeAdministrar
              ? "Cadastre séries, turmas e alunos na área de Gestão para começar."
              : "Peça à administração para cadastrar as turmas e os alunos da escola."}
          </p>
          {podeAdministrar && onAbrirGestao && (
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
    <section aria-label="Fazer chamada" className="flex flex-col gap-4">
      <h1 className="sr-only">Chamada</h1>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4 xl:order-2">
          {turmas.length > 1 && (
            <SeletorTurmaChamada
              turmas={turmas}
              alunos={alunos}
              turmaId={turmaId}
              travado={travado}
              onEscolher={setTurmaId}
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 rounded-lg"
              aria-label="Dia anterior"
              disabled={travado || !dia}
              onClick={() => setDia((atual) => diaSeguinte(atual, -1))}
            >
              <ChevronLeft size={18} />
            </Button>
            <div className="min-w-0 flex-1">
              <SeletorPeriodo
                id="dia-frequencia"
                modo="dia"
                valor={dia}
                max={diaCorrente}
                disabled={travado}
                rotuloAcessivel="Data da chamada"
                rotulo={rotuloDia}
                detalhe={diaDaSemana}
                onValor={setDia}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0 rounded-lg"
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
              className="text-primary pressionavel self-start text-sm font-medium hover:underline disabled:opacity-50"
            >
              Voltar para hoje
            </button>
          )}
          {revisaoSalva > 0 && (
            <div
              className="bg-card flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5"
              role="group"
              aria-label="Bloqueio da chamada"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {chamadaBloqueada ? "Chamada bloqueada" : "Edição liberada"}
                </p>
                <p className="text-muted-foreground text-xs">
                  {chamadaBloqueada
                    ? "Desbloqueie para corrigir a frequência."
                    : sujo
                      ? "Salve ou descarte antes de bloquear."
                      : "Ao salvar, a chamada será bloqueada."}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-10 shrink-0"
                aria-label={`${chamadaBloqueada ? "Desbloquear" : "Bloquear"} chamada de ${turma?.rotulo ?? ""} em ${rotuloDia}`}
                disabled={ocupado || (edicaoLiberada && sujo)}
                onClick={() => {
                  if (ocupado || (edicaoLiberada && sujo)) return;
                  setEdicaoLiberada((atual) => !atual);
                  setAulasAbertas(null);
                }}
              >
                {chamadaBloqueada ? <LockKeyholeOpen size={16} /> : <LockKeyhole size={16} />}
                {chamadaBloqueada ? "Desbloquear" : "Bloquear"}
              </Button>
            </div>
          )}
          {sujo && (
            <p className="text-muted-foreground text-xs">
              Salve ou descarte as alterações para mudar a data ou a turma.
            </p>
          )}

          {configuracoes.frequenciaPorAula && aulasDoDia.length > 1 && (
            <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
              <span>Aulas do dia:</span>
              {aulasDoDia.map((aula) => (
                <span
                  key={aula.id}
                  className="bg-secondary text-secondary-foreground numerais-tabulares rounded-md px-1.5 py-0.5 font-medium"
                >
                  {aula.ordem}ª {aula.inicio}
                </span>
              ))}
            </div>
          )}
          {!carregando && contagemParciais > 0 && (
            <p className="text-muted-foreground text-xs">
              {contagemParciais === 1
                ? "1 aluno saiu em parte das aulas."
                : `${contagemParciais} alunos saíram em parte das aulas.`}
            </p>
          )}

          <Button
            type="button"
            variant="outline"
            aria-expanded={resumoAberto}
            aria-controls={idResumo}
            onClick={() => setResumoAberto((atual) => !atual)}
            className="text-primary border-primary/25 bg-primary/5 hover:bg-primary/10 hover:text-primary dark:border-primary/25 dark:bg-primary/5 dark:hover:bg-primary/10 self-start rounded-full px-4"
          >
            {tituloResumo}
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform motion-reduce:transition-none ${resumoAberto ? "rotate-180" : ""}`}
            />
          </Button>

          {(erro || conflito) &&
            (conflito ? (
              <AvisoCompacto
                variante="conflito"
                descricao={erro || undefined}
                tamanho="linha"
                acao={{ rotulo: "Recarregar versão salva", onClick: descartar }}
              />
            ) : (
              <AvisoCompacto
                variante={erroVariante}
                descricao={erro}
                tamanho="linha"
                acao={
                  !sujo
                    ? {
                        rotulo: "Tentar novamente",
                        onClick: () => setRecarregar((valor) => valor + 1),
                      }
                    : undefined
                }
              />
            ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:order-1">
          <section
            id={idResumo}
            aria-label={tituloResumo}
            hidden={!resumoAberto}
            className="bg-card overflow-hidden rounded-lg border"
          >
            {resumoAberto && (
              <>
                <div className="bg-secondary/50 flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
                  <h2 className="font-medium">{tituloResumo}</h2>
                  <span className="text-muted-foreground numerais-tabulares text-xs">
                    {rotuloDia}
                  </span>
                </div>
                <div className="border-b p-3">
                  <div className="grid grid-cols-3 gap-2" aria-label="Resumo da chamada">
                    <button
                      type="button"
                      aria-pressed={filtro === "faltas"}
                      onClick={() =>
                        setFiltro((atual) => (atual === "faltas" ? "todos" : "faltas"))
                      }
                      className="bg-card aria-[pressed=true]:border-falta aria-[pressed=true]:bg-falta-fraca pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 transition-colors"
                    >
                      <span className="numerais-tabulares text-falta-texto text-2xl font-semibold">
                        {carregando ? "" : contagemFaltas}
                      </span>
                      <span className="text-muted-foreground text-xs font-medium">Faltas</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={filtro === "justificadas"}
                      onClick={() =>
                        setFiltro((atual) => (atual === "justificadas" ? "todos" : "justificadas"))
                      }
                      className="bg-card aria-[pressed=true]:border-justificada aria-[pressed=true]:bg-justificada-fraca pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 transition-colors"
                    >
                      <span className="numerais-tabulares text-justificada-texto text-2xl font-semibold">
                        {carregando ? "" : contagemJustificadas}
                      </span>
                      <span className="text-muted-foreground text-xs font-medium">
                        Justificadas
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={filtro === "presentes"}
                      onClick={() =>
                        setFiltro((atual) => (atual === "presentes" ? "todos" : "presentes"))
                      }
                      className="bg-card aria-[pressed=true]:border-primary aria-[pressed=true]:bg-accent pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-2 transition-colors"
                    >
                      <span className="numerais-tabulares text-primary text-2xl font-semibold">
                        {carregando ? "" : contagemPresencas}
                      </span>
                      <span className="text-muted-foreground text-xs font-medium">Presentes</span>
                    </button>
                  </div>
                </div>
                {(() => {
                  const ausentes = ativosDaTurma.filter((aluno) => ausencias.has(aluno.id));
                  if (ausentes.length === 0) {
                    return (
                      <p className="text-muted-foreground px-4 py-3 text-sm">
                        Nenhuma falta nesta chamada.
                      </p>
                    );
                  }
                  return (
                    <ul className="divide-y">
                      {ausentes.map((aluno) => {
                        const acumulado = acumuladoDe(aluno.id);
                        const codigo = justificativas.get(aluno.id);
                        return (
                          <li
                            key={aluno.id}
                            className="flex items-start gap-3 px-4 py-2.5 last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)]"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">
                                {nomeNaChamada(
                                  aluno.nome,
                                  mostrarOrigem,
                                  aluno.turmaOriginalId !== turmaId,
                                )}
                                {codigo && (
                                  <span className="text-primary ml-2 text-xs font-semibold">
                                    {codigo}
                                  </span>
                                )}
                              </span>
                              {(mostrarOrigem || codigo) && (
                                <span className="text-muted-foreground block truncate text-xs">
                                  {mostrarOrigem
                                    ? `Origem ${rotuloOrigemDe(aluno.turmaOriginalId)}`
                                    : ""}
                                  {codigo
                                    ? `${mostrarOrigem ? " · " : ""}${rotuloJustificativa(codigo, catalogoJustificativas)}`
                                    : ""}
                                </span>
                              )}
                            </span>
                            <span className="flex shrink-0 flex-col items-end gap-1">
                              {acumulado ? (
                                <>
                                  <CirculosAcumulado
                                    faltas={acumulado.faltas}
                                    justificadas={acumulado.faltasJustificadas}
                                  />
                                  <span className="text-muted-foreground text-xs">acumulado</span>
                                </>
                              ) : (
                                <span className="text-muted-foreground text-xs">sem acumulado</span>
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })()}
              </>
            )}
          </section>

          <div className="bg-card overflow-hidden rounded-lg border">
            <BarraBusca
              id="busca-aluno"
              valor={busca}
              onValor={setBusca}
              placeholder="Buscar aluno ou turma de origem"
              className="rounded-none border-0 border-b px-3 py-1.5"
            />

            <div className="text-muted-foreground flex items-center justify-between px-4 py-2 text-xs">
              <span className="numerais-tabulares">
                {carregando
                  ? ""
                  : `${visiveis.length} ${
                      filtro === "faltas"
                        ? "com falta"
                        : filtro === "justificadas"
                          ? "justificadas"
                          : filtro === "presentes"
                            ? "presentes"
                            : "alunos"
                    }`}
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

            {carregando ? (
              <div className="text-muted-foreground flex min-h-40 items-center justify-center gap-2 text-sm">
                <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                Carregando chamada...
              </div>
            ) : ativosDaTurma.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="font-medium">Nenhum aluno ativo nesta turma</p>
                <p className="text-muted-foreground text-sm">
                  {podeAdministrar
                    ? "Cadastre alunos na área de Gestão."
                    : "Peça ao administrador para cadastrar os alunos desta turma."}
                </p>
              </div>
            ) : visiveis.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="font-medium">
                  {filtro === "faltas" && busca === ""
                    ? "Nenhuma falta nesta chamada."
                    : "Nenhum aluno neste filtro."}
                </p>
                <button
                  type="button"
                  className="text-primary pressionavel text-sm font-medium hover:underline"
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
                  const nomeExibido = nomeNaChamada(
                    aluno.nome,
                    mostrarOrigem,
                    aluno.turmaOriginalId !== turmaId,
                  );
                  const confirmacaoSeduc = seducPorAluno.get(aluno.id);
                  const desistente = desistentesDaTurma.has(aluno.id);
                  const faltando = !desistente && ausencias.has(aluno.id);
                  const marcadas = ausencias.get(aluno.id)?.size ?? 0;
                  const parcial = faltando && aulasDoDia.length > 0 && marcadas < aulasDoDia.length;
                  const codigo = justificativas.get(aluno.id) ?? "";
                  const acumulado = acumuladoDe(aluno.id);
                  const temAcumulado = Boolean(
                    acumulado && (acumulado.faltas > 0 || acumulado.faltasJustificadas > 0),
                  );
                  return (
                    <li
                      key={aluno.id}
                      className="last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)]"
                    >
                      <div className={faltando ? "bg-falta-fraca" : ""}>
                        <div className="flex items-stretch">
                          <button
                            type="button"
                            aria-pressed={faltando}
                            disabled={bloqueado || desistente}
                            aria-label={`${nomeExibido}${
                              mostrarOrigem
                                ? `, turma original ${rotuloOrigemDe(aluno.turmaOriginalId)}`
                                : ""
                            }: ${
                              desistente
                                ? "desistente. Marcação bloqueada."
                                : faltando
                                  ? `falta em ${marcadas} de ${aulasDoDia.length} aulas. Toque para voltar a presente.`
                                  : "presente. Toque para marcar falta."
                            }${
                              temAcumulado && acumulado
                                ? ` ${fraseAcumulado(acumulado.faltas, acumulado.faltasJustificadas)}`
                                : ""
                            }`}
                            onClick={() => alternarFalta(aluno.id)}
                            className={`faixa-toque pressionavel flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-60 ${
                              faltando ? "" : "hover:bg-secondary/60"
                            }`}
                          >
                            <span className="numerais-tabulares text-muted-foreground w-7 shrink-0 text-sm">
                              {String(aluno.ordem).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-2">
                                <span
                                  className={`min-w-0 truncate ${faltando ? "font-semibold" : "font-medium"}`}
                                >
                                  {nomeExibido}
                                </span>
                                {desistente && (
                                  <span className="bg-secondary text-secondary-foreground shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold">
                                    DESISTENTE
                                  </span>
                                )}
                                {mostrarOrigem && rotuloCurtoDe(aluno.turmaOriginalId) && (
                                  <CirculoValor
                                    texto={rotuloCurtoDe(aluno.turmaOriginalId)}
                                    rotulo={`Turma original ${rotuloOrigemDe(aluno.turmaOriginalId)}`}
                                  />
                                )}
                              </span>
                              {parcial ? (
                                <span className="text-falta-texto block truncate text-xs">
                                  saiu em parte das aulas
                                </span>
                              ) : temAcumulado && acumulado ? (
                                <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                  <span className="text-muted-foreground text-xs">Acumulado</span>
                                  <CirculosAcumulado
                                    faltas={acumulado.faltas}
                                    justificadas={acumulado.faltasJustificadas}
                                  />
                                </span>
                              ) : null}
                            </span>
                            <motion.span
                              key={desistente ? "D" : faltando ? codigo || "F" : "P"}
                              initial={semMovimento ? false : MARCAS.escondido}
                              animate={MARCAS.visivel}
                              transition={
                                semMovimento
                                  ? { duration: 0 }
                                  : { type: "spring", stiffness: 500, damping: 28 }
                              }
                              className={
                                desistente
                                  ? "bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                                  : faltando
                                    ? codigo
                                      ? "bg-justificada text-justificada-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                                      : "bg-falta text-falta-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                                    : "text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold"
                              }
                            >
                              {desistente ? "D" : faltando ? (codigo ? "FJ" : "F") : "P"}
                            </motion.span>
                          </button>
                          {faltando && configuracoes.frequenciaPorAula && aulasDoDia.length > 1 && (
                            <button
                              type="button"
                              aria-expanded={aulasAbertas === aluno.id}
                              aria-label={`Aulas em que ${nomeExibido} faltou`}
                              disabled={bloqueado}
                              onClick={() =>
                                setAulasAbertas((atual) => (atual === aluno.id ? null : aluno.id))
                              }
                              className="text-muted-foreground hover:bg-secondary border-border pressionavel my-2 mr-2 h-9 shrink-0 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50"
                            >
                              Aulas
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2 pr-4 pb-1 pl-14">
                          <Label
                            htmlFor={`chamada-seduc-${aluno.id}`}
                            className="min-h-11 text-xs"
                            title="Registrado na Seduc"
                          >
                            RS
                          </Label>
                          <Switch
                            id={`chamada-seduc-${aluno.id}`}
                            aria-label={`RS, Registrado na Seduc: ${nomeExibido}`}
                            title="Registrado na Seduc"
                            checked={confirmacaoSeduc?.registradoSeduc ?? false}
                            disabled={ocupado || sujo || !chamadaBloqueada || !confirmacaoSeduc}
                            onCheckedChange={(valor) => confirmarSeduc(aluno.id, valor)}
                          />
                        </div>
                      </div>
                      {confirmacaoSeduc?.registradoSeduc && (
                        <p className="text-muted-foreground px-4 pb-2 text-xs break-words">
                          Registrado na Seduc por{" "}
                          {confirmacaoSeduc.registradoSeducPorNome ?? "registro anterior"}
                          {confirmacaoSeduc.registradoSeducEm &&
                            ` em ${new Intl.DateTimeFormat("pt-BR", {
                              dateStyle: "short",
                              timeStyle: "short",
                              timeZone: fuso,
                            }).format(new Date(confirmacaoSeduc.registradoSeducEm))}`}
                        </p>
                      )}
                      {faltando && (
                        <div className="border-t px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-muted-foreground text-xs font-medium">
                              Justificativa
                            </span>
                            <Selecionar
                              id={`justificativa-${aluno.id}`}
                              value={codigo}
                              onValueChange={(valor) => definirJustificativa(aluno.id, valor)}
                              disabled={bloqueado}
                              ariaLabel={`Justificativa da falta de ${nomeExibido}`}
                              opcoes={opcoesJustificativa}
                              className="h-9 max-w-64"
                            />
                            {codigo === JUSTIFICATIVA_OUTROS && (
                              <Input
                                value={observacoes.get(aluno.id) ?? ""}
                                maxLength={200}
                                disabled={bloqueado}
                                onChange={(evento) =>
                                  definirObservacao(aluno.id, evento.target.value)
                                }
                                placeholder="Observação"
                                aria-label={`Observação da falta de ${nomeExibido}`}
                                className="h-9 max-w-64"
                              />
                            )}
                            {codigo && (
                              <span className="text-primary text-xs font-medium">
                                {rotuloJustificativa(codigo, catalogoJustificativas)}
                              </span>
                            )}
                          </div>
                          {configuracoes.frequenciaPorAula &&
                            aulasAbertas === aluno.id &&
                            aulasDoDia.length > 1 && (
                              <div className="mt-2.5">
                                <div className="flex flex-wrap gap-1.5">
                                  {aulasDoDia.map((aula) => {
                                    const marcada = ausencias.get(aluno.id)?.has(aula.id) ?? false;
                                    return (
                                      <button
                                        key={aula.id}
                                        type="button"
                                        aria-pressed={marcada}
                                        disabled={bloqueado}
                                        onClick={() => alternarAula(aluno.id, aula.id)}
                                        className={`numerais-tabulares pressionavel h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                                          marcada
                                            ? "border-falta bg-falta text-falta-foreground"
                                            : "text-muted-foreground hover:border-foreground/30"
                                        }`}
                                      >
                                        {aula.ordem}ª {aula.inicio}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                                  <button
                                    type="button"
                                    disabled={bloqueado}
                                    className="text-primary pressionavel font-medium hover:underline disabled:opacity-50"
                                    onClick={() =>
                                      definirAulas(
                                        aluno.id,
                                        aulasDoDia.map((aula) => aula.id),
                                      )
                                    }
                                  >
                                    Todas
                                  </button>
                                  <button
                                    type="button"
                                    disabled={bloqueado}
                                    className="text-primary pressionavel font-medium hover:underline disabled:opacity-50"
                                    onClick={() => definirAulas(aluno.id, [])}
                                  >
                                    Nenhuma
                                  </button>
                                </div>
                              </div>
                            )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {chamadaBloqueada
              ? "Chamada salva e bloqueada. Desbloqueie para corrigir as marcações."
              : "Toque de novo em um aluno marcado para voltar a presente. Escolha a justificativa para registrar falta justificada (FJ)."}
          </p>

          <div
            aria-label="Barra de salvamento"
            className="bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-3 z-20 rounded-xl border px-4 py-3 shadow-lg backdrop-blur"
          >
            <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-stretch">
              <div aria-live="polite" className="min-w-0 flex-1 xl:flex-none">
                <p className="truncate text-sm font-medium">{tituloEstado}</p>
                <p className="text-muted-foreground truncate text-xs">{detalheEstado}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 xl:w-full">
                {sujo && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="lg"
                        className="h-11 rounded-lg xl:flex-1"
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
                  className="h-11 rounded-lg px-6 xl:flex-1 xl:px-0"
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
        </div>
      </div>
    </section>
  );
}
