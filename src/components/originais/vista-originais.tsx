"use client";

// Originais: grade pela turma de origem, com alunos nas linhas, dias nas
// colunas e células P, F ou vazias.
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { LoaderCircle, RefreshCw, Table2 } from "lucide-react";
import type { Aluno, Frequencia, Turma } from "@/domain/frequencia";
import { montarGrade } from "@/domain/frequencia";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Props {
  alunos: Aluno[];
  frequencias: Frequencia[];
  mes: string;
  onMes: (mes: string) => void;
  onRecarregar: (mes: string) => Promise<void>;
  origens: Turma[];
}

export default function VistaOriginais({
  alunos,
  frequencias,
  mes,
  onMes,
  onRecarregar,
  origens,
}: Props) {
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");

  const rotuloDe = useMemo(() => {
    const mapa = new Map(origens.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [origens]);

  const turmasOriginais = useMemo(() => {
    const distintas = new Set(alunos.filter((a) => a.ativo).map((a) => a.turmaOriginalId));
    return origens
      .filter((turma) => distintas.has(turma.id))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [alunos, origens]);

  const [turmaId, setTurmaId] = useState(() => turmasOriginais[0]?.id ?? "");

  const turmaEfetiva = turmasOriginais.some((t) => t.id === turmaId)
    ? turmaId
    : (turmasOriginais[0]?.id ?? "");

  const grade = useMemo(() => {
    const alunosDaTurma = alunos.filter(
      (aluno) => aluno.ativo && aluno.turmaOriginalId === turmaEfetiva,
    );
    return montarGrade(alunosDaTurma, frequencias, mes);
  }, [alunos, turmaEfetiva, frequencias, mes]);

  async function atualizar() {
    setAtualizando(true);
    setErro("");
    try {
      await onRecarregar(mes);
    } catch {
      setErro("Não foi possível buscar os registros.");
    } finally {
      setAtualizando(false);
    }
  }

  const totalFaltas = grade.linhas.reduce((soma, linha) => soma + linha.faltas, 0);
  const turmaAtualDe = useMemo(() => {
    const mapa = new Map(origens.map((turma) => [turma.id, turma.rotulo]));
    return (id: string) => mapa.get(id) ?? "";
  }, [origens]);

  return (
    <section aria-label="Frequência por turma original" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Originais</h1>
          <p className="text-muted-foreground text-sm">
            {frequencias.length === 0
              ? "Consulta pelas turmas de origem"
              : `${frequencias.length} ${frequencias.length === 1 ? "frequência no mês" : "frequências no mês"}${totalFaltas > 0 ? ` · ${totalFaltas} ${totalFaltas === 1 ? "falta" : "faltas"}` : ""}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-10"
          aria-label="Atualizar consulta"
          onClick={atualizar}
          disabled={atualizando}
        >
          {atualizando ? (
            <LoaderCircle size={18} className="animate-spin" />
          ) : (
            <RefreshCw size={18} />
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {turmasOriginais.map((turma) => {
          const ativo = turma.id === turmaEfetiva;
          const quantidade = alunos.filter((a) => a.ativo && a.turmaOriginalId === turma.id).length;
          return (
            <button
              key={turma.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => setTurmaId(turma.id)}
              className="aria-[pressed=true]:border-primary aria-[pressed=true]:bg-primary aria-[pressed=true]:text-primary-foreground flex h-11 items-center gap-2 rounded-lg border px-4 text-sm font-medium transition-colors active:scale-[0.98]"
            >
              <span>{turma.rotulo}</span>
              <span className="numerais-tabulares text-xs opacity-70">{quantidade}</span>
            </button>
          );
        })}
        <div className="ml-auto">
          <label htmlFor="mes-originais" className="sr-only">
            Mês da consulta
          </label>
          <Input
            id="mes-originais"
            type="month"
            value={mes}
            onChange={(evento) => {
              if (evento.target.value) onMes(evento.target.value);
            }}
            className="numerais-tabulares h-11 w-44 rounded-lg font-medium"
          />
        </div>
      </div>

      {erro && (
        <p role="alert" className="bg-falta-fraca text-falta-texto rounded-lg px-4 py-3 text-sm">
          {erro}
        </p>
      )}

      {turmasOriginais.length === 0 ? (
        <div className="bg-card flex min-h-52 flex-col items-center justify-center gap-2 rounded-lg border px-6 text-center">
          <Table2 size={28} className="text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Sem alunos ativos</p>
          <p className="text-muted-foreground text-sm">
            Quando houver alunos nas suas turmas, a consulta aparece aqui.
          </p>
        </div>
      ) : (
        <motion.div
          key={turmaEfetiva}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="bg-card overflow-hidden rounded-lg border"
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Frequência dos alunos da turma original {rotuloDe(turmaEfetiva)} no período
              </caption>
              <thead>
                <tr className="border-b">
                  <th
                    scope="col"
                    className="coluna-fixa bg-card text-muted-foreground min-w-36 px-3 py-2 text-left text-xs font-medium"
                  >
                    Aluno
                  </th>
                  {grade.dias.map((dia) => (
                    <th
                      key={dia}
                      scope="col"
                      className="numerais-tabulares text-muted-foreground w-8 px-1 py-2 text-center text-[11px] font-medium"
                    >
                      {dia.slice(8)}
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="numerais-tabulares text-muted-foreground px-2 py-2 text-center text-[11px] font-medium"
                  >
                    F
                  </th>
                </tr>
              </thead>
              <tbody>
                {grade.linhas.map((linha) => (
                  <tr key={linha.aluno.id} className="border-b last:border-b-0">
                    <th
                      scope="row"
                      className="coluna-fixa bg-card max-w-44 truncate px-3 py-1.5 text-left font-normal"
                    >
                      <span className="block truncate text-sm">{linha.aluno.nome}</span>
                      <span className="text-muted-foreground block truncate text-[10px]">
                        atual {turmaAtualDe(linha.aluno.turmaId)}
                      </span>
                    </th>
                    {grade.dias.map((dia) => {
                      const marca = linha.marcas[dia];
                      return (
                        <td key={dia} className="px-1 py-1.5 text-center">
                          {marca === "F" ? (
                            <span
                              className="bg-falta text-falta-foreground inline-flex size-5 items-center justify-center rounded-[4px] text-[10px] font-bold"
                              aria-label={`${linha.aluno.nome} com falta em ${dia}`}
                            >
                              F
                            </span>
                          ) : marca === "P" ? (
                            <span
                              className="bg-primary/60 inline-flex size-1.5 rounded-full"
                              role="img"
                              aria-label={`${linha.aluno.nome} presente em ${dia}`}
                            />
                          ) : (
                            <span
                              className="text-muted-foreground/50 text-[10px]"
                              aria-label="sem frequência"
                            />
                          )}
                        </td>
                      );
                    })}
                    <td className="numerais-tabulares text-falta-texto px-2 py-1.5 text-center text-sm font-semibold">
                      {linha.faltas > 0 ? linha.faltas : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-muted-foreground flex flex-wrap items-center gap-4 border-t px-4 py-2.5 text-xs">
            <span className="flex items-center gap-1.5">
              <span
                className="bg-primary/60 inline-flex size-1.5 rounded-full"
                aria-hidden="true"
              />
              presente
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="bg-falta text-falta-foreground inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] font-bold"
                aria-hidden="true"
              >
                F
              </span>
              falta
            </span>
            <span>célula vazia: turma sem frequência no dia</span>
          </div>
        </motion.div>
      )}
    </section>
  );
}
