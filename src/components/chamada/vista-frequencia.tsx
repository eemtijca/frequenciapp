"use client";

// Chamada diária: todos presentes por padrão; toque no aluno para marcar
// falta e de novo para voltar. A falta pode receber uma justificativa do
// catálogo (FJ). Rascunho local e proteção de conflito.
import {
  mesmasJustificativasAntecipadas,
  type JustificativaAntecipada,
  type RevisaoJustificativaAntecipada,
} from "@/domain/justificativas-antecipadas";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CloudCheck,
  CalendarOff,
  CheckCircle2,
  LockKeyhole,
  LockKeyholeOpen,
  LoaderCircle,
  RotateCcw,
  Save,
  School,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { avisarSucesso } from "@/lib/avisos";
import { estadoDeErro } from "@/lib/estado-http";
import { ouvirBeneficiosMudaram } from "@/lib/eventos-beneficios";
import { useAcaoUnica } from "@/lib/use-acao-unica";
import { AvisoCompacto, type VarianteEstado } from "@/components/ui/tela-estado";
import type {
  AcumuladoAluno,
  Aluno,
  Configuracoes,
  Frequencia,
  JustificativaConfigurada,
  ResumoAcumulado,
  Turma,
} from "@/domain/frequencia";
import {
  alunoDesistenteNoDia,
  diaDaSemanaIso,
  diasDoMes,
  exibirOrigemNaChamada,
  horaNoFuso,
  horariosDaChamada,
  JUSTIFICATIVA_OUTROS,
  nomeNaChamada,
  rotuloCurtoDeTurma,
  rotuloDiaSemana,
  rotuloJustificativa,
  type FaltaAluno,
  ultimoDiaDeChamada,
} from "@/domain/frequencia";
import { temCapacidade, type Identidade } from "@/domain/usuarios";
import { pedir, corpoJson, ErroApi } from "@/lib/api-cliente";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CirculoValor, CirculosAcumulado, fraseAcumulado } from "@/components/ui/circulo-contagem";
import { Selecionar } from "@/components/ui/selecionar";
import { SeletorPeriodo } from "@/components/ui/seletor-periodo";
import { VistaResumoSemana } from "@/components/chamada/resumo-semana";
import { SeletorTurmaChamada } from "@/components/chamada/seletor-turma-chamada";
import { useNavegacaoDoDia } from "@/lib/navegacao-do-dia";
import { feriadoNaData, type Feriado } from "@/domain/calendario-letivo";
import type { AlertaFrequenciaBeneficio } from "@/domain/beneficios-frequencia";
import { AvisoBeneficioFrequencia } from "@/components/chamada/aviso-beneficio-frequencia";
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
  versaoFrequencias: number;
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
  sabadoLetivo?: boolean;
  justificativasAntecipadas?: RevisaoJustificativaAntecipada[];
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
  versaoFrequencias,
  onFrequenciasMudaram,
  onPendencia,
  onAbrirGestao,
}: Props) {
  const podeAdministrar = temCapacidade(usuario.papel, "administrar");
  const [turmaId, setTurmaId] = useState(() => alvo?.turmaId ?? turmas[0]?.id ?? "");
  // No domingo, a abertura é o resumo da semana encerrada. Um atalho de
  // histórico continua abrindo o dia pedido, nunca o resumo.
  const nav = useNavegacaoDoDia({
    diaCorrente,
    max: diaCorrente,
    diaInicial: alvo?.dia ?? null,
  });
  const dia = nav.dia;
  const [ausencias, setAusencias] = useState<Map<string, Set<string>>>(new Map());
  const [justificativas, setJustificativas] = useState<Map<string, string>>(new Map());
  const [observacoes, setObservacoes] = useState<Map<string, string>>(new Map());
  const [aulasAbertas, setAulasAbertas] = useState<string | null>(null);
  const [resumoAberto, setResumoAberto] = useState(false);
  const [sabadoDesbloqueado, setSabadoDesbloqueado] = useState<string | null>(null);
  const idResumo = useId();
  const [revisaoSalva, setRevisaoSalva] = useState(0);
  const [edicaoLiberada, setEdicaoLiberada] = useState(false);
  // Lista gravada da chamada; nula enquanto o dia não foi salvo.
  const [listaGravada, setListaGravada] = useState<string[] | null>(null);
  const [frequenciasDoDia, setFrequenciasDoDia] = useState<{
    chave: string;
    frequencias: Frequencia[];
    feriado?: Feriado | null;
    nomeFeriadoNoCadastro: string;
  } | null>(null);
  const [atualizadoEm, setAtualizadoEm] = useState("");
  const [carregando, setCarregando] = useState(() => !nav.resumo);
  const [salvando, setSalvando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const [erro, setErro] = useState("");
  const [erroVariante, setErroVariante] = useState<VarianteEstado>("indisponivel");
  const [conflito, setConflito] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const justificativasAntecipadasRef = useRef<RevisaoJustificativaAntecipada[]>([]);
  const [recarregar, setRecarregar] = useState(0);
  const chaveCarregada = useRef("");
  const semMovimento = useReducedMotion() ?? false;

  const atualizarTela = useCallback(() => {
    if (sujo) {
      toast.info("Salve ou descarte as alterações antes de atualizar.");
      return;
    }
    setRecarregar((valor) => valor + 1);
  }, [sujo]);
  useAtualizacaoTela("chamada", atualizarTela);

  // Sincroniza quando o histórico pede para abrir uma frequência específica.
  // A prop é comparada durante o render, como o React recomenda para estado
  // derivado, em vez de um efeito que marca o estado depois da pintura.
  const [alvoAnterior, setAlvoAnterior] = useState(alvo);
  if (alvo !== alvoAnterior) {
    setAlvoAnterior(alvo);
    if (alvo) {
      setTurmaId(alvo.turmaId);
      setCarregando(true);
      nav.escolherDia(ultimoDiaDeChamada(alvo.dia));
    }
  }

  // Seleciona a primeira turma quando nada foi escolhido ainda.
  const primeiraTurma = turmas[0];
  if (turmaId === "" && primeiraTurma !== undefined) setTurmaId(primeiraTurma.id);

  const turma = turmas.find((t) => t.id === turmaId);
  const chave = `${dia}|${turmaId}`;
  const ehSabado = diaDaSemanaIso(dia) === 6;
  const leituraConfirmada = frequenciasDoDia?.chave === chave;
  const feriadoCadastrado = feriadoNaData(configuracoes.feriados, dia);
  const nomeFeriadoNoCadastro = feriadoCadastrado?.nome ?? "";
  const feriado =
    leituraConfirmada &&
    frequenciasDoDia.nomeFeriadoNoCadastro === nomeFeriadoNoCadastro &&
    frequenciasDoDia.feriado !== undefined
      ? frequenciasDoDia.feriado
      : feriadoCadastrado;
  const temAulasAtivas = turma?.horarios.some((aula) => aula.ativo) ?? false;
  // Todo sábado começa bloqueado, mesmo com aula na grade: só o botão libera.
  // Uma chamada já salva ou um rascunho recuperado mantêm a liberação.
  const sabadoLiberado =
    ehSabado &&
    leituraConfirmada &&
    (sabadoDesbloqueado === chave ||
      frequenciasDoDia.frequencias.some((item) => item.turmaId === turmaId));

  // Carrega as chamadas do dia, seleciona a turma e recupera o rascunho local.
  // O reinício do estado e o aviso de carregando vêm antes da busca: nenhuma
  // marca do dia anterior pode aparecer enquanto a chamada nova não chega.
  // A regra set-state-in-effect não distingue esse caso, registrado no ADR 047.
  /* eslint-disable react-hooks/set-state-in-effect -- reinício do estado antes da busca da chamada (ADR 047) */
  useEffect(() => {
    if (nav.resumo) return;
    if (!dia || !turmaId) {
      setCarregando(false);
      setErro("");
      setConflito(false);
      return;
    }
    let viva = true;
    setCarregando(true);
    setSabadoDesbloqueado(null);
    setFrequenciasDoDia(null);
    setErro("");
    setConflito(false);
    setSujo(false);
    setFiltro("todos");
    setAusencias(new Map());
    setJustificativas(new Map());
    setObservacoes(new Map());
    setAulasAbertas(null);
    setResumoAberto(false);
    setRevisaoSalva(0);
    setEdicaoLiberada(false);
    setListaGravada(null);
    setAtualizadoEm("");
    chaveCarregada.current = chave;

    pedir<{
      frequencias: Frequencia[];
      feriado?: Feriado | null;
      justificativasAntecipadas?: JustificativaAntecipada[];
    }>(`/api/frequencias?dia=${dia}`)
      .then((dados) => {
        if (!viva) return;
        const frequencias = dados.frequencias.filter((item) => item.dia === dia);
        const frequencia = frequencias.find((item) => item.turmaId === turmaId) ?? null;
        setFrequenciasDoDia({ chave, frequencias, feriado: dados.feriado, nomeFeriadoNoCadastro });
        const agendadas = frequencia
          ? []
          : (dados.justificativasAntecipadas ?? []).filter((j) => j.turmaId === turmaId);
        justificativasAntecipadasRef.current = agendadas.map(({ id, revisao }) => ({
          id,
          revisao,
        }));
        const propostas = agendadas.map((j) => ({
          alunoId: j.alunoId,
          horarios: turma ? horariosDaChamada(turma.horarios, dia, true).map((h) => h.id) : [],
          justificativa: j.justificativa,
          observacao: j.observacao ?? undefined,
        }));
        const faltasIniciais = frequencia?.faltas ?? propostas;
        setAusencias(paraAusencias(faltasIniciais));
        setJustificativas(paraJustificativas(faltasIniciais));
        setObservacoes(paraObservacoes(faltasIniciais));
        setRevisaoSalva(frequencia?.revisao ?? 0);
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
              if (rascunho.sabadoLetivo && diaDaSemanaIso(dia) === 6) setSabadoDesbloqueado(chave);
              const agendasIguais =
                frequencia ||
                mesmasJustificativasAntecipadas(
                  rascunho.justificativasAntecipadas ?? [],
                  justificativasAntecipadasRef.current,
                );
              justificativasAntecipadasRef.current = rascunho.justificativasAntecipadas ?? [];
              setSujo(true);
              if (rascunho.revisao === (frequencia?.revisao ?? 0) && agendasIguais) {
                toast(
                  frequencia
                    ? "Rascunho recuperado. Desbloqueie a chamada, confira e salve."
                    : "Rascunho recuperado. Confira as faltas e salve a frequência.",
                );
              } else {
                setConflito(true);
                setErro(
                  agendasIguais
                    ? "Há um rascunho neste dispositivo e uma versão mais nova salva. Confira antes de recarregar."
                    : "As justificativas antecipadas mudaram desde o rascunho. Recarregue a chamada e confira as marcações.",
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
  }, [chave, recarregar, usuario.id, dia, turmaId, turma, nomeFeriadoNoCadastro, nav.resumo]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Grava rascunho enquanto houver marcação não salva.
  useEffect(() => {
    if (!sujo || !dia || !turmaId) return;
    try {
      const rascunho: Rascunho = {
        versao: 3,
        justificativasAntecipadas: justificativasAntecipadasRef.current,
        faltas: [...ausencias.entries()].map(([alunoId, horarios]) => ({
          alunoId,
          horarios: [...horarios],
          justificativa: justificativas.get(alunoId) ?? null,
          observacao: observacoes.get(alunoId) ?? null,
        })),
        revisao: revisaoSalva,
        ...(sabadoLiberado ? { sabadoLetivo: true } : {}),
      };
      sessionStorage.setItem(chaveRascunho(usuario.id, dia, turmaId), JSON.stringify(rascunho));
    } catch {
      sessionStorage.removeItem(chaveRascunho(usuario.id, dia, turmaId));
    }
  }, [
    sujo,
    ausencias,
    justificativas,
    observacoes,
    revisaoSalva,
    usuario.id,
    dia,
    turmaId,
    sabadoLiberado,
  ]);

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
  const participantes = useMemo(
    () => ativosDaTurma.filter((aluno) => !desistentesDaTurma.has(aluno.id)),
    [ativosDaTurma, desistentesDaTurma],
  );

  const mostrarOrigem = exibirOrigemNaChamada(configuracoes, turma);
  const rotuloCurtoDe = useMemo(() => {
    const mapa = new Map(
      turmas.map((item) => [item.id, rotuloCurtoDeTurma(item.serieNome, item.nome)]),
    );
    return (id: string) => mapa.get(id) ?? "";
  }, [turmas]);

  const aulasDoDia = useMemo(
    () => (turma ? horariosDaChamada(turma.horarios, dia, sabadoLiberado) : []),
    [turma, dia, sabadoLiberado],
  );
  // Retrato congelado da chamada salva: o denominador de aulas do dia e das
  // faltas parciais não muda quando a grade muda depois do registro.
  const aulasRegistradas = useMemo(() => {
    const frequencia = leituraConfirmada
      ? frequenciasDoDia?.frequencias.find((item) => item.turmaId === turmaId)
      : null;
    return frequencia?.aulas && frequencia.aulas.length > 0 ? frequencia.aulas : null;
  }, [leituraConfirmada, frequenciasDoDia, turmaId]);
  const totalAulasDoDia = aulasRegistradas?.length ?? aulasDoDia.length;
  const mesDaChamada = dia.slice(0, 7);
  const chaveResumo = `${mesDaChamada}|${versaoFrequencias}|${recarregar}`;
  const [cargaResumo, setCargaResumo] = useState<{
    chave: string;
    resumo: ResumoAcumulado | null;
  } | null>(null);
  const resumo = cargaResumo?.chave === chaveResumo ? cargaResumo.resumo : null;
  useEffect(() => {
    let atual = true;
    const dias = diasDoMes(mesDaChamada);
    const ate = dias[dias.length - 1];
    if (!ate) return;
    pedir<{ resumo: ResumoAcumulado }>(`/api/frequencias/resumo?de=${mesDaChamada}-01&ate=${ate}`)
      .then((dados) => {
        if (atual) setCargaResumo({ chave: chaveResumo, resumo: dados.resumo });
      })
      .catch(() => {
        if (atual) setCargaResumo({ chave: chaveResumo, resumo: null });
      });
    return () => {
      atual = false;
    };
  }, [mesDaChamada, chaveResumo]);

  // Alunos com faltas do mês acima do limite de algum benefício; falha na leitura apenas omite o aviso.
  const [cargaAlertas, setCargaAlertas] = useState<{
    chave: string;
    alertas: AlertaFrequenciaBeneficio[];
  } | null>(null);
  // A Gestão avisa quando as regras dos benefícios mudam, pois esta tela continua montada.
  const [versaoBeneficios, setVersaoBeneficios] = useState(0);
  useEffect(() => ouvirBeneficiosMudaram(() => setVersaoBeneficios((versao) => versao + 1)), []);
  // Feriados importados e manuais compõem a mesma base mensal. Alterar outra
  // data fora do mês ou apenas o nome do feriado não exige uma nova consulta.
  const calendarioDoMes = configuracoes.feriados
    .filter((feriado) => feriado.dia.startsWith(`${mesDaChamada}-`))
    .map((feriado) => feriado.dia)
    .sort()
    .join(",");
  const chaveAlertas = `${chaveResumo}|${versaoBeneficios}|${calendarioDoMes}`;
  useEffect(() => {
    let atual = true;
    pedir<{ alertas: AlertaFrequenciaBeneficio[] }>(
      `/api/frequencias/alertas-beneficios?mes=${mesDaChamada}`,
    )
      .then((dados) => {
        if (atual) setCargaAlertas({ chave: chaveAlertas, alertas: dados.alertas });
      })
      .catch(() => {
        if (atual) setCargaAlertas({ chave: chaveAlertas, alertas: [] });
      });
    return () => {
      atual = false;
    };
  }, [mesDaChamada, chaveAlertas]);
  const alertasDoAluno = useMemo(() => {
    const mapa = new Map<string, AlertaFrequenciaBeneficio[]>();
    for (const alerta of cargaAlertas?.chave === chaveAlertas ? cargaAlertas.alertas : []) {
      mapa.set(alerta.alunoId, [...(mapa.get(alerta.alunoId) ?? []), alerta]);
    }
    return (alunoId: string): AlertaFrequenciaBeneficio[] => mapa.get(alunoId) ?? [];
  }, [cargaAlertas, chaveAlertas]);

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

  const { contagemFaltas, contagemJustificadas, contagemParciais } = useMemo(() => {
    let contagemFaltas = 0;
    let contagemJustificadas = 0;
    let contagemParciais = 0;
    for (const aluno of participantes) {
      if (ausencias.has(aluno.id)) contagemFaltas += 1;
      if (justificativas.has(aluno.id)) contagemJustificadas += 1;
      const marcadas = ausencias.get(aluno.id)?.size ?? 0;
      if (marcadas > 0 && totalAulasDoDia > 0 && marcadas < totalAulasDoDia) contagemParciais += 1;
    }
    return { contagemFaltas, contagemJustificadas, contagemParciais };
  }, [participantes, ausencias, justificativas, totalAulasDoDia]);
  const contagemPresencas = participantes.length - contagemFaltas;

  const visiveis = useMemo(
    () =>
      ativosDaTurma.filter(
        (aluno) =>
          filtro === "todos" ||
          (!desistentesDaTurma.has(aluno.id) &&
            ((filtro === "faltas" && ausencias.has(aluno.id)) ||
              (filtro === "justificadas" && justificativas.has(aluno.id)) ||
              (filtro === "presentes" && !ausencias.has(aluno.id)))),
      ),
    [ativosDaTurma, filtro, ausencias, justificativas, desistentesDaTurma],
  );

  const chamadaBloqueada = revisaoSalva > 0 && !edicaoLiberada;
  const ocupado = carregando || salvando || conflito;
  const bloqueado =
    ocupado ||
    !leituraConfirmada ||
    chamadaBloqueada ||
    Boolean(feriado) ||
    (ehSabado && !sabadoLiberado);
  const travado = ocupado || sujo;
  const podeSalvar = !bloqueado && (sujo || revisaoSalva === 0);

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
          justificativasAntecipadas: justificativasAntecipadasRef.current,
          ...(sabadoLiberado ? { sabadoLetivo: true } : {}),
        }),
      );
      setFrequenciasDoDia((atual) => {
        if (atual?.chave !== chave) return atual;
        return {
          ...atual,
          frequencias: [
            ...atual.frequencias.filter((item) => item.turmaId !== dados.frequencia.turmaId),
            dados.frequencia,
          ],
        };
      });
      setAusencias(paraAusencias(dados.frequencia.faltas));
      setJustificativas(paraJustificativas(dados.frequencia.faltas));
      setObservacoes(paraObservacoes(dados.frequencia.faltas));
      setAulasAbertas(null);
      setRevisaoSalva(dados.frequencia.revisao);
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
      const agendasMudaram =
        (falha?.corpo as { codigo?: string } | undefined)?.codigo === "JUSTIFICATIVAS_ALTERADAS";
      if (falha?.conflito || agendasMudaram) {
        const vigente = (falha?.corpo as { frequencia?: Frequencia } | undefined)?.frequencia;
        if (vigente) {
          setRevisaoSalva(vigente.revisao);
          setAtualizadoEm(vigente.atualizadoEm);
        }
        setConflito(true);
      }
      setErro(falha?.message ?? "Não foi possível salvar a chamada.");
      setErroVariante(falha?.conflito || agendasMudaram ? "conflito" : estadoDeErro(excecao));
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
  const diaDaSemana = dia ? rotuloDiaSemana(dia).replace("-feira", "") : "";
  const tituloResumo = dia === diaCorrente ? "Resumo de hoje" : "Resumo do dia";
  const horaSalva = atualizadoEm ? horaNoFuso(atualizadoEm, fuso) : "";

  const tituloEstado = carregando
    ? "Carregando..."
    : conflito
      ? "Conflito"
      : salvando
        ? "Salvando..."
        : erro
          ? sujo
            ? "Falha ao salvar"
            : "Falha ao carregar"
          : sujo
            ? "Pendente"
            : atualizadoEm
              ? `Salva às ${horaSalva}`
              : "Nova chamada";

  // Sem turmas cadastradas ou visíveis, o estado vazio explica o próximo passo.
  if (turmas.length === 0) {
    return (
      <section aria-label="Fazer chamada" className="flex flex-col gap-4 pb-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Chamada</h1>
          <p className="text-muted-foreground text-sm">Nenhuma turma disponível</p>
        </div>
        <div className="superficie flex min-h-52 flex-col items-center justify-center gap-2 px-6 text-center">
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
              dia={dia}
              feriado={feriado?.nome}
              frequencias={frequenciasDoDia?.chave === chave ? frequenciasDoDia.frequencias : []}
              coberturaDisponivel={frequenciasDoDia?.chave === chave}
              carregando={carregando}
              temAlteracoes={sujo || conflito}
              travado={travado}
              semCobertura={nav.resumo}
              onEscolher={setTurmaId}
            />
          )}

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Dia anterior"
              disabled={travado || !dia}
              onClick={() => nav.anterior()}
            >
              <ChevronLeft size={18} />
            </Button>
            <div className="min-w-0 flex-1">
              <SeletorPeriodo
                id="dia-frequencia"
                modo="dia"
                valor={nav.resumo ? "" : dia}
                max={diaCorrente}
                semDomingo
                disabled={travado}
                rotuloAcessivel={nav.resumo ? "Resumo da semana" : "Data da chamada"}
                rotulo={nav.resumo ? (nav.rotuloResumo ?? "") : rotuloDia}
                detalhe={nav.resumo ? "semana" : diaDaSemana}
                aoHoje={() => {
                  setCarregando(false);
                  nav.voltarParaHoje();
                }}
                hojeAtivo={nav.resumo || dia === diaCorrente}
                onValor={(proximo) => nav.escolherDia(proximo)}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Dia seguinte"
              disabled={travado || !dia || nav.seguinteDesabilitado}
              onClick={() => nav.seguinte()}
            >
              <ChevronRight size={18} />
            </Button>
          </div>
          {nav.mostrarVoltar && (
            <button
              type="button"
              disabled={travado}
              onClick={() => {
                setCarregando(false);
                nav.voltarParaHoje();
              }}
              className="text-primary pressionavel self-start text-sm font-medium hover:underline disabled:opacity-50"
            >
              Voltar para hoje
            </button>
          )}
          {!nav.resumo && feriado && (
            <div
              role="status"
              className="superficie text-muted-foreground flex items-center gap-2 px-4 py-3 text-sm"
            >
              <CalendarOff size={18} aria-hidden="true" className="shrink-0" />
              <span className="min-w-0 break-words">Feriado · {feriado.nome}</span>
            </div>
          )}
          {!nav.resumo && (
            <>
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

              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  aria-expanded={resumoAberto}
                  aria-controls={idResumo}
                  onClick={() => setResumoAberto((atual) => !atual)}
                  className="selecionado h-11 w-full justify-center rounded-full px-4"
                >
                  <span>{tituloResumo}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`size-4 transition-transform motion-reduce:transition-none ${resumoAberto ? "rotate-180" : ""}`}
                  />
                </Button>
                {ehSabado && !feriado && (
                  <Button
                    type="button"
                    variant="outline"
                    aria-pressed={sabadoLiberado}
                    disabled={ocupado || !leituraConfirmada || sabadoLiberado || !temAulasAtivas}
                    title={
                      !temAulasAtivas
                        ? "Cadastre aulas ativas na Gestão."
                        : !leituraConfirmada
                          ? "Aguarde a leitura da chamada. Em caso de falha, tente novamente."
                          : "Libera a chamada somente para esta turma e este sábado."
                    }
                    className={`h-11 w-full justify-center rounded-full px-4 ${sabadoLiberado ? "selecionado" : ""}`}
                    onClick={() => {
                      if (ocupado || !leituraConfirmada || sabadoLiberado || !temAulasAtivas)
                        return;
                      setSabadoDesbloqueado(chave);
                    }}
                  >
                    {sabadoLiberado ? (
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                    ) : (
                      <LockKeyholeOpen className="size-4 shrink-0" aria-hidden="true" />
                    )}
                    <span>{sabadoLiberado ? "Sábado letivo" : "Desbloquear sábado letivo"}</span>
                  </Button>
                )}
                {revisaoSalva > 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 w-full justify-center rounded-full px-4"
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
                )}
              </div>

              {(erro || conflito) &&
                (conflito ? (
                  <AvisoCompacto
                    variante="conflito"
                    titulo="A chamada foi salva em outro aparelho"
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
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4 pb-24 xl:order-1">
          {nav.resumo && nav.semana ? (
            <VistaResumoSemana
              turmas={turma ? [turma] : []}
              alunos={alunos}
              dias={nav.semana}
              feriados={configuracoes.feriados}
              mostrarSaidas={configuracoes.saidaAntecipada}
              versao={versaoFrequencias + recarregar}
              onAbrirDia={(proximo) => nav.escolherDia(proximo)}
            />
          ) : (
            <>
              <section
                id={idResumo}
                aria-label={tituloResumo}
                hidden={!resumoAberto}
                className="superficie overflow-hidden"
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
                          className="controle aria-[pressed=true]:border-falta aria-[pressed=true]:bg-falta-fraca pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-2"
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
                            setFiltro((atual) =>
                              atual === "justificadas" ? "todos" : "justificadas",
                            )
                          }
                          className="controle aria-[pressed=true]:border-justificada aria-[pressed=true]:bg-justificada-fraca pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-2"
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
                          className="controle pressionavel flex min-h-16 flex-col items-center justify-center gap-0.5 px-2 py-2"
                        >
                          <span className="numerais-tabulares text-primary text-2xl font-semibold">
                            {carregando ? "" : contagemPresencas}
                          </span>
                          <span className="text-muted-foreground text-xs font-medium">
                            Presentes
                          </span>
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
                                      <span className="text-muted-foreground text-xs">no mês</span>
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground text-xs">
                                      {resumo ? "sem faltas no mês" : "-"}
                                    </span>
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

              <div className="superficie overflow-hidden">
                {filtro !== "todos" && (
                  <div className="flex justify-end px-4 py-2 text-xs">
                    <button
                      type="button"
                      className="text-primary pressionavel font-medium hover:underline"
                      onClick={() => setFiltro("todos")}
                    >
                      Ver todos
                    </button>
                  </div>
                )}

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
                      {filtro === "faltas"
                        ? "Nenhuma falta nesta chamada."
                        : "Nenhum aluno neste filtro."}
                    </p>
                    <button
                      type="button"
                      className="text-primary pressionavel text-sm font-medium hover:underline"
                      onClick={() => setFiltro("todos")}
                    >
                      Mostrar todos
                    </button>
                  </div>
                ) : (
                  <ul aria-label="Alunos da chamada" className="divide-y">
                    {visiveis.map((aluno, indice) => {
                      const nomeExibido = nomeNaChamada(
                        aluno.nome,
                        mostrarOrigem,
                        aluno.turmaOriginalId !== turmaId,
                      );
                      const desistente = desistentesDaTurma.has(aluno.id);
                      const faltando = !desistente && ausencias.has(aluno.id);
                      const marcadas = ausencias.get(aluno.id)?.size ?? 0;
                      const parcial = faltando && totalAulasDoDia > 0 && marcadas < totalAulasDoDia;
                      const codigo = justificativas.get(aluno.id) ?? "";
                      const mostrarJustificativa =
                        faltando && (!chamadaBloqueada || Boolean(codigo));
                      const mostrarAulas =
                        faltando &&
                        configuracoes.frequenciaPorAula &&
                        aulasAbertas === aluno.id &&
                        aulasDoDia.length > 1;
                      const acumulado = acumuladoDe(aluno.id);
                      const temAcumulado = Boolean(
                        acumulado && (acumulado.faltas > 0 || acumulado.faltasJustificadas > 0),
                      );
                      const alertasBeneficios = alertasDoAluno(aluno.id);
                      const esmaecida = bloqueado || desistente;
                      return (
                        <li
                          key={aluno.id}
                          className={`last:overflow-hidden last:rounded-b-[calc(var(--radius)-1px)] ${indice % 2 === 0 ? "bg-card" : "bg-secondary/60"}`}
                        >
                          <div
                            className={
                              faltando
                                ? indice % 2 === 0
                                  ? "bg-falta-fraca/65"
                                  : "bg-falta-fraca"
                                : ""
                            }
                          >
                            <div className="flex items-stretch">
                              <div
                                className={`faixa-toque relative flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5 transition-colors ${
                                  faltando ? "" : "hover:bg-secondary/60"
                                }`}
                              >
                                <span className="min-w-0 flex-1">
                                  <span
                                    className={`flex min-w-0 items-center gap-2 ${esmaecida ? "opacity-60" : ""}`}
                                  >
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
                                            ? `falta em ${marcadas} de ${totalAulasDoDia} aulas. Toque para voltar a presente.`
                                            : "presente. Toque para marcar falta."
                                      }${
                                        temAcumulado && acumulado
                                          ? ` No mês. ${fraseAcumulado(acumulado.faltas, acumulado.faltasJustificadas)}`
                                          : ""
                                      }`}
                                      onClick={() => alternarFalta(aluno.id)}
                                      // Sem escala ao pressionar: scale faria do botão o bloco de
                                      // contenção do ::after, e o toque na marca P cairia fora dele.
                                      className="focus-visible:after:ring-ring/50 flex min-w-0 items-center gap-2 text-left outline-none after:absolute after:inset-0 focus-visible:after:ring-[3px] focus-visible:after:ring-inset"
                                    >
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
                                    </button>
                                  </span>
                                  {parcial ||
                                  (temAcumulado && acumulado) ||
                                  alertasBeneficios.length > 0 ? (
                                    <span className="mt-0.5 flex flex-wrap items-center gap-1">
                                      {parcial ? (
                                        <span
                                          className={`text-falta-texto block truncate text-xs ${esmaecida ? "opacity-60" : ""}`}
                                        >
                                          saiu em parte das aulas
                                        </span>
                                      ) : temAcumulado && acumulado ? (
                                        <span
                                          className={`flex flex-wrap items-center gap-1 ${esmaecida ? "opacity-60" : ""}`}
                                        >
                                          <span className="text-muted-foreground text-xs">
                                            No mês
                                          </span>
                                          <CirculosAcumulado
                                            faltas={acumulado.faltas}
                                            justificadas={acumulado.faltasJustificadas}
                                          />
                                        </span>
                                      ) : null}
                                      {alertasBeneficios.length > 0 && (
                                        <AvisoBeneficioFrequencia
                                          nome={nomeExibido}
                                          alertas={alertasBeneficios}
                                        />
                                      )}
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
                                  className={`${
                                    desistente
                                      ? "bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                                      : faltando
                                        ? codigo
                                          ? "bg-justificada text-justificada-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                                          : "bg-falta text-falta-foreground flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                                        : "border-primary/25 bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold"
                                  } ${esmaecida ? "opacity-60" : ""}`}
                                >
                                  {desistente ? "D" : faltando ? (codigo ? "FJ" : "F") : "P"}
                                </motion.span>
                              </div>
                              {faltando &&
                                configuracoes.frequenciaPorAula &&
                                aulasDoDia.length > 1 && (
                                  <button
                                    type="button"
                                    aria-expanded={aulasAbertas === aluno.id}
                                    aria-label={`Aulas em que ${nomeExibido} faltou`}
                                    disabled={bloqueado}
                                    onClick={() =>
                                      setAulasAbertas((atual) =>
                                        atual === aluno.id ? null : aluno.id,
                                      )
                                    }
                                    className="controle text-muted-foreground pressionavel my-2 mr-2 h-9 shrink-0 px-2.5 text-xs font-medium disabled:opacity-50"
                                  >
                                    Aulas
                                  </button>
                                )}
                            </div>
                          </div>
                          {(mostrarJustificativa || mostrarAulas) && (
                            <div className="border-t px-4 py-2.5">
                              {mostrarJustificativa && (
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
                              )}
                              {mostrarAulas && (
                                <div className="mt-2.5">
                                  <div className="flex flex-wrap gap-1.5">
                                    {aulasDoDia.map((aula) => {
                                      const marcada =
                                        ausencias.get(aluno.id)?.has(aula.id) ?? false;
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
              <div
                aria-label="Barra de salvamento"
                className="superficie sticky z-20 mx-auto flex w-fit max-w-full items-center gap-2 rounded-2xl p-2 lg:mr-0 lg:ml-auto"
                style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
              >
                <p
                  aria-live="polite"
                  className="text-muted-foreground max-w-48 min-w-0 truncate px-2 text-xs font-medium"
                  title={feriado?.nome}
                >
                  {feriado ? "Feriado" : tituloEstado}
                </p>
                {sujo && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Descartar"
                        title="Descartar alterações"
                        disabled={salvando}
                        className="size-11 shrink-0"
                      >
                        <RotateCcw size={16} aria-hidden="true" />
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
                <Button className="h-11 shrink-0 px-4" onClick={salvar} disabled={!podeSalvar}>
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
            </>
          )}
        </div>
      </div>
    </section>
  );
}
