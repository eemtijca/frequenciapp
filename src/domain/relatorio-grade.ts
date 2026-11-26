// Relatório da Grade: retrato canônico, código e linhas do PDF.
// O hash fica no servidor, sobre este texto canônico, para o arquivo não misturar leituras.
import { linhaDoDetalhe, textoProporcao } from "@/domain/detalhe-grade";
import {
  diasEntre,
  montarGrade,
  rotuloData,
  type Aluno,
  type Frequencia,
  type Horario,
  type Justificativa,
} from "@/domain/frequencia";
import { documentoPdf } from "@/domain/pdf-texto";

/** Falta gravada, uma linha por aula, como está no banco. */
export interface FaltaDoRetrato {
  alunoId: string;
  horarioId: string;
  justificativa: string | null;
  observacao: string | null;
}

/** Chamada lida no mesmo instante das demais linhas do retrato. */
export interface FrequenciaDoRetrato {
  dia: string;
  turmaId: string;
  revisao: number;
  atualizadoEm: string;
  alunos: string[];
  aulas: string[];
  faltas: FaltaDoRetrato[];
}

/** Aula usada para nomear o detalhe. Entra no retrato porque o rótulo sai dela. */
export interface HorarioDoRetrato {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
  disciplinas: Record<string, string>;
}

/** Acumulado histórico do aluno, no mesmo critério da coluna da Grade. */
export interface HistoricoDoRetrato {
  alunoId: string;
  faltas: number;
  faltasJustificadas: number;
}

/**
 * Leitura única da turma de origem. O instante é o do banco, não o do
 * navegador, e o texto canônico é o que o hash identifica.
 */
export interface RetratoDaGrade {
  versao: 1;
  instante: string;
  turmaOriginalId: string;
  rotulo: string;
  de: string;
  ate: string;
  alunos: Pick<Aluno, "id" | "nome" | "ordem" | "turmaId" | "turmaOriginalId" | "desistenteEm">[];
  frequencias: FrequenciaDoRetrato[];
  horarios: HorarioDoRetrato[];
  justificativas: Justificativa[];
  historico: HistoricoDoRetrato[];
}

/** Código curto impresso no PDF, derivado do hash e conferível na auditoria. */
export function codigoDoHash(hash: string): string {
  const curto = hash.slice(0, 8).toUpperCase();
  return `${curto.slice(0, 4)}-${curto.slice(4)}`;
}

/** Texto estável: chaves ordenadas e listas já na ordem de comparação. */
export function canonicoDoRetrato(retrato: RetratoDaGrade): string {
  return JSON.stringify(ordenarValor(retrato));
}

/** Linhas do PDF. As frequências são as da mesma leitura que entrou no retrato. */
export function linhasDoRelatorio(
  retrato: RetratoDaGrade,
  hash: string,
  frequencias: Frequencia[],
  horarios: Horario[],
): string[] {
  const grade = montarGrade(
    retrato.alunos.map(paraAluno),
    frequencias,
    diasEntre(retrato.de, retrato.ate),
    horarios,
  );
  const historico = new Map(
    retrato.historico.map((item) => [item.alunoId, item.faltas + item.faltasJustificadas]),
  );
  const linhas = [
    "Relatório da grade",
    `Turma de origem: ${retrato.rotulo}`,
    `Período: ${rotuloData(retrato.de)} a ${rotuloData(retrato.ate)}`,
    `Retrato: ${retrato.instante}`,
    `Hash: ${hash}`,
    `Código: ${codigoDoHash(hash)}`,
    "",
    "Resumo",
    "Aluno | F | FJ | S | Histórico",
  ];
  for (const linha of grade.linhas) {
    linhas.push(
      `${linha.aluno.nome} | ${linha.faltas} | ${linha.justificadas} | ${linha.parciais} | ${historico.get(linha.aluno.id) ?? 0}`,
    );
  }
  if (grade.linhas.length === 0) linhas.push("Nenhum aluno ativo nesta turma de origem.");
  linhas.push("", "Detalhamento");
  let houveFalta = false;
  for (const linha of grade.linhas) {
    if (linha.detalhes.length === 0) continue;
    houveFalta = true;
    linhas.push(linha.aluno.nome);
    for (const detalhe of linha.detalhes) {
      if (detalhe.aulas.length === 0) {
        linhas.push(
          `${rotuloData(detalhe.dia)} ${detalhe.proporcao ? textoProporcao(detalhe.proporcao) : detalhe.marca}: Sem aula identificada`,
        );
        continue;
      }
      for (const aula of detalhe.aulas) {
        linhas.push(linhaDoDetalhe(detalhe, aula, horarios, retrato.justificativas));
      }
    }
  }
  if (!houveFalta) linhas.push("Nenhuma falta no período.");
  return linhas;
}

/** PDF do retrato. Quem chama precisa ter calculado o hash deste mesmo retrato. */
export function pdfDaGrade(
  retrato: RetratoDaGrade,
  hash: string,
  frequencias: Frequencia[],
  horarios: Horario[],
): Uint8Array {
  return documentoPdf(linhasDoRelatorio(retrato, hash, frequencias, horarios));
}

function paraAluno(aluno: RetratoDaGrade["alunos"][number]): Aluno {
  return { ...aluno, ativo: true, desistenteEm: aluno.desistenteEm ?? null };
}

function ordenarValor(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenarValor);
  if (valor && typeof valor === "object") {
    const saida: Record<string, unknown> = {};
    for (const chave of Object.keys(valor).sort()) {
      saida[chave] = ordenarValor((valor as Record<string, unknown>)[chave]);
    }
    return saida;
  }
  return valor ?? null;
}
