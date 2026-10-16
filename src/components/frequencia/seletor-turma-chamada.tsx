"use client";

// Painel Turmas recolhível, com séries que agrupam as turmas e seu progresso.
// A seleção continua independente da conclusão, com nomes e estados acessíveis.
import { useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import * as Collapsible from "@radix-ui/react-collapsible";
import { alunoDesistenteNoDia, type Aluno, type Frequencia, type Turma } from "@/domain/frequencia";
import { coberturaDoDia } from "@/domain/relatorios";
import { Button } from "@/components/ui/button";
import estilos from "./seletor-turma-chamada.module.css";

interface Props {
  turmas: Turma[];
  alunos: Aluno[];
  turmaId: string;
  dia: string;
  frequencias: Frequencia[];
  coberturaDisponivel: boolean;
  carregando: boolean;
  temAlteracoes: boolean;
  feriado?: string;
  /** Bloqueia a troca (alterações por salvar, carregamento ou salvamento). */
  travado: boolean;
  onEscolher: (turmaId: string) => void;
}

type Situacao = "carregando" | "indisponivel" | "sem-alunos" | "pendente" | "concluida" | "feriado";

const ROTULOS: Record<Situacao, string> = {
  carregando: "Conferindo chamadas",
  indisponivel: "Não foi possível conferir as chamadas",
  "sem-alunos": "Sem alunos para a chamada",
  pendente: "Chamada pendente",
  concluida: "Chamada salva",
  feriado: "Feriado, sem chamada prevista",
};

function nomeDaSerie(nome: string): string {
  return nome.replace(/^(\d+)[º°]?\s+ano$/i, "$1ª série");
}

function BarraProgresso({ progresso }: { progresso: number | null }) {
  return (
    <span
      aria-hidden="true"
      className={estilos.barra}
      data-disponivel={progresso !== null}
      data-progresso={progresso ?? undefined}
    >
      <span className={estilos.preenchimento} style={{ width: `${progresso ?? 0}%` }} />
    </span>
  );
}

export function SeletorTurmaChamada({
  turmas,
  alunos,
  turmaId,
  dia,
  frequencias,
  coberturaDisponivel,
  carregando,
  temAlteracoes,
  feriado,
  travado,
  onEscolher,
}: Props) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const gatilho = useRef<HTMLButtonElement>(null);
  const [serieRecolhida, setSerieRecolhida] = useState<string | null>(null);

  const series = useMemo(() => {
    const grupos: { id: string; nome: string; turmas: Turma[] }[] = [];
    for (const opcao of turmas) {
      const existente = grupos.find((grupo) => grupo.id === opcao.serieId);
      if (existente) existente.turmas.push(opcao);
      else grupos.push({ id: opcao.serieId, nome: opcao.serieNome, turmas: [opcao] });
    }
    return grupos;
  }, [turmas]);

  const participantes = useMemo(
    () => alunos.filter((aluno) => aluno.ativo && !alunoDesistenteNoDia(aluno, dia)),
    [alunos, dia],
  );

  const cobertura = useMemo(
    () =>
      coberturaDoDia(
        turmas,
        participantes,
        frequencias.filter((item) => item.dia === dia),
        Boolean(feriado),
      ).turmas.map((item) => ({
        ...item,
        concluida: item.concluida && !(item.turma.id === turmaId && temAlteracoes),
      })),
    [turmas, participantes, frequencias, dia, turmaId, temAlteracoes, feriado],
  );

  const contagem = useMemo(() => {
    const porTurma = new Map<string, number>();
    for (const aluno of participantes) {
      porTurma.set(aluno.turmaId, (porTurma.get(aluno.turmaId) ?? 0) + 1);
    }
    return porTurma;
  }, [participantes]);

  function situacaoDe(total: number, concluida: boolean): Situacao {
    if (feriado) return "feriado";
    if (total === 0) return "sem-alunos";
    if (!coberturaDisponivel) return carregando ? "carregando" : "indisponivel";
    return concluida ? "concluida" : "pendente";
  }

  const ativa = series.find((grupo) => grupo.turmas.some((opcao) => opcao.id === turmaId));

  const resumos = series.map((grupo) => {
    const total = grupo.turmas.reduce((soma, opcao) => soma + (contagem.get(opcao.id) ?? 0), 0);
    const turmasDaSerie = cobertura.filter((item) => item.turma.serieId === grupo.id);
    const registrados = turmasDaSerie.reduce(
      (soma, item) => soma + (item.concluida ? item.esperados : 0),
      0,
    );
    const progresso = total > 0 ? Math.floor((registrados * 100) / total) : 0;
    const situacao = situacaoDe(
      total,
      turmasDaSerie.every((item) => item.concluida),
    );
    const percentual = !feriado && coberturaDisponivel && total > 0 ? progresso : null;
    const descricao = `${total} ${total === 1 ? "aluno" : "alunos"}. ${ROTULOS[situacao]}${feriado ? `. ${feriado}.` : coberturaDisponivel && total > 0 ? `. ${progresso}% concluído. ${turmasDaSerie.map((item) => `${item.turma.rotulo}: ${item.concluida ? "chamada salva" : "chamada pendente"}`).join("; ")}` : "."}`;
    return {
      grupo,
      nome: nomeDaSerie(grupo.nome),
      percentual,
      situacao,
      descricao,
      total,
      registrados,
    };
  });
  const totalGeral = resumos.reduce((soma, resumo) => soma + resumo.total, 0);
  const registradosGeral = resumos.reduce((soma, resumo) => soma + resumo.registrados, 0);
  const progressoGeral =
    !feriado && coberturaDisponivel && totalGeral > 0
      ? Math.floor((registradosGeral * 100) / totalGeral)
      : null;
  const situacaoGeral = situacaoDe(totalGeral, registradosGeral === totalGeral);

  function aoTocarSerie(grupoId: string) {
    if (travado && grupoId !== ativa?.id) return;
    if (grupoId === ativa?.id) {
      setSerieRecolhida((anterior) => (anterior === grupoId ? null : grupoId));
      return;
    }
    setSerieRecolhida(null);
    const primeira = series.find((grupo) => grupo.id === grupoId)?.turmas[0];
    if (primeira) onEscolher(primeira.id);
  }

  return (
    <Collapsible.Root
      open={aberto}
      onOpenChange={setAberto}
      role="group"
      aria-label="Turma atual"
      className={estilos.seletor}
      onKeyDown={(evento) => {
        if (evento.key === "Escape" && aberto) {
          evento.preventDefault();
          evento.stopPropagation();
          setAberto(false);
          gatilho.current?.focus();
        }
      }}
    >
      <Collapsible.Trigger asChild>
        <Button
          ref={gatilho}
          type="button"
          variant="outline"
          aria-label="Turmas"
          aria-describedby={`${id}-progresso-geral`}
          data-situacao={situacaoGeral}
          disabled={series.length === 0}
          className={estilos.gatilho}
        >
          <span className={estilos.nome} aria-hidden="true">
            Turmas
          </span>
          <BarraProgresso progresso={progressoGeral} />
          <span className={estilos.percentual} aria-hidden="true">
            {progressoGeral === null ? "-" : `${progressoGeral}%`}
          </span>
          <ChevronDown aria-hidden="true" className={estilos.seta} />
          <span id={`${id}-progresso-geral`} className="sr-only">
            {totalGeral} {totalGeral === 1 ? "aluno" : "alunos"}. {ROTULOS[situacaoGeral]}.
            {progressoGeral !== null
              ? ` Progresso geral do dia: ${progressoGeral}%, considerando os alunos de todas as séries.`
              : ""}
            {feriado ? ` ${feriado}.` : ""}
          </span>
        </Button>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div role="group" aria-label="Séries" className={estilos.lista}>
          {resumos.map(({ grupo, nome, situacao, percentual, descricao }) => {
            const ehAtiva = grupo.id === ativa?.id;
            return (
              <Collapsible.Root
                key={grupo.id}
                open={ehAtiva && serieRecolhida !== grupo.id}
                className={estilos.blocoSerie}
                data-selecionada={ehAtiva}
              >
                <Collapsible.Trigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label={nome}
                    aria-describedby={`${id}-serie-${grupo.id}`}
                    aria-pressed={ehAtiva}
                    data-situacao={situacao}
                    disabled={travado && !ehAtiva}
                    onClick={() => aoTocarSerie(grupo.id)}
                    className={estilos.serie}
                  >
                    <span className={estilos.nome} aria-hidden="true">
                      {nome}
                    </span>
                    <span className={estilos.percentual} aria-hidden="true">
                      {percentual === null ? "-" : `${percentual}%`}
                    </span>
                    <ChevronDown aria-hidden="true" className={estilos.seta} />
                    <span id={`${id}-serie-${grupo.id}`} className="sr-only">
                      {descricao}
                    </span>
                  </Button>
                </Collapsible.Trigger>
                <Collapsible.Content>
                  <div role="group" aria-label={`Turmas de ${nome}`} className={estilos.faixa}>
                    {grupo.turmas.map((opcao) => {
                      const ativo = opcao.id === turmaId;
                      const total = contagem.get(opcao.id) ?? 0;
                      const salva =
                        cobertura.find((item) => item.turma.id === opcao.id)?.concluida ?? false;
                      const situacao = situacaoDe(total, salva);
                      const progresso =
                        situacao === "concluida" ? 100 : situacao === "pendente" ? 0 : null;
                      return (
                        <Button
                          key={opcao.id}
                          type="button"
                          variant="outline"
                          aria-label={opcao.rotulo}
                          aria-describedby={`${id}-turma-${opcao.id}`}
                          title={`${opcao.rotulo}: ${ROTULOS[situacao]}`}
                          data-situacao={situacao}
                          aria-pressed={ativo}
                          disabled={travado}
                          onClick={() => onEscolher(opcao.id)}
                          className={estilos.turma}
                        >
                          <span className={estilos.nome} aria-hidden="true">
                            {opcao.nome}
                          </span>
                          <span
                            aria-hidden="true"
                            className={estilos.anel}
                            data-progresso={progresso ?? undefined}
                          />
                          <span id={`${id}-turma-${opcao.id}`} className="sr-only">
                            {total} {total === 1 ? "aluno" : "alunos"}. {ROTULOS[situacao]}
                            {progresso !== null ? `. ${progresso}% concluído` : ""}
                            {feriado
                              ? `. ${feriado}.`
                              : temAlteracoes && ativo
                                ? ". Alterações por salvar"
                                : "."}
                          </span>
                        </Button>
                      );
                    })}
                  </div>
                </Collapsible.Content>
              </Collapsible.Root>
            );
          })}
        </div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
