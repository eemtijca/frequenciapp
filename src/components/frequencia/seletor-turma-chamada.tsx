"use client";

// Seletores com barras de progresso das chamadas salvas por série e turma.
// A seleção continua independente da conclusão, com nomes e estados acessíveis.
import { useId, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
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
  const reduzir = useReducedMotion();
  const id = useId();
  const [recolhido, setRecolhido] = useState(false);

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

  function aoTocarSerie(grupoId: string) {
    if (grupoId === ativa?.id) {
      setRecolhido((atual) => !atual);
      return;
    }
    const primeira = series.find((grupo) => grupo.id === grupoId)?.turmas[0];
    if (!primeira) return;
    setRecolhido(false);
    onEscolher(primeira.id);
  }

  return (
    <div role="group" aria-label="Turma atual" className="flex flex-col gap-3">
      <div className={estilos.faixa}>
        {series.map((grupo) => {
          const ehAtiva = grupo.id === ativa?.id;
          const total = grupo.turmas.reduce(
            (soma, opcao) => soma + (contagem.get(opcao.id) ?? 0),
            0,
          );
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
          const nome = nomeDaSerie(grupo.nome);
          const descricao = `${total} ${total === 1 ? "aluno" : "alunos"}. ${ROTULOS[situacao]}${feriado ? `. ${feriado}.` : coberturaDisponivel && total > 0 ? `. ${progresso}% concluído. ${turmasDaSerie.map((item) => `${item.turma.rotulo}: ${item.concluida ? "chamada salva" : "chamada pendente"}`).join("; ")}` : "."}`;
          return (
            <Button
              key={grupo.id}
              type="button"
              variant="outline"
              aria-label={nome}
              aria-describedby={`${id}-serie-${grupo.id}`}
              title={`${nome}: ${ROTULOS[situacao]}`}
              data-situacao={situacao}
              aria-pressed={ehAtiva}
              aria-expanded={ehAtiva ? !recolhido : undefined}
              aria-controls={ehAtiva ? `${id}-turmas` : undefined}
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
              <BarraProgresso progresso={percentual} />
              <span id={`${id}-serie-${grupo.id}`} className="sr-only">
                {descricao}
              </span>
            </Button>
          );
        })}
      </div>

      {ativa && !recolhido && (
        <motion.div
          key={ativa.id}
          id={`${id}-turmas`}
          role="group"
          aria-label={`Turmas de ${nomeDaSerie(ativa.nome)}`}
          initial={reduzir ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15 }}
          className={estilos.faixa}
        >
          {ativa.turmas.map((opcao) => {
            const ativo = opcao.id === turmaId;
            const total = contagem.get(opcao.id) ?? 0;
            const salva = cobertura.find((item) => item.turma.id === opcao.id)?.concluida ?? false;
            const situacao = situacaoDe(total, salva);
            const progresso = situacao === "concluida" ? 100 : situacao === "pendente" ? 0 : null;
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
                <span className={estilos.percentual} aria-hidden="true">
                  {progresso === null ? "-" : `${progresso}%`}
                </span>
                <BarraProgresso progresso={progresso} />
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
        </motion.div>
      )}
    </div>
  );
}
