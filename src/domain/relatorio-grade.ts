// Relatório da Grade: modelo puro com totais do período e ocorrências
// detalhadas por aluno, compartilhado pelo servidor e pelos testes.
import {
  type Aluno,
  type Frequencia,
  type Horario,
  type Justificativa,
  type LinhaGrade,
  type Marca,
  type ReferenciaDasAulas,
  type ResumoAcumulado,
  type Turma,
  classificarDiaDoAluno,
  normalizar,
  rotuloAula,
  rotuloJustificativa,
} from "@/domain/frequencia";

/** Uma falta ou presença parcial de um aluno em um dia. */
export interface OcorrenciaGrade {
  dia: string;
  marca: "F" | "FJ" | "S";
  aulasPrevistas: number | null;
  aulasFaltadas: number;
  aulasFaltadasRotulos: string[];
  justificativas: string[];
  referenciaAulas: ReferenciaDasAulas;
}

/** Linha do relatório com os totais do período e o acumulado histórico. */
export interface AlunoRelatorioGrade {
  alunoId: string;
  nome: string;
  turmaAtual: string;
  desistente: boolean;
  faltas: number;
  justificadas: number;
  parciais: number;
  diasComRegistro: number;
  totalHistorico: number;
  ocorrencias: OcorrenciaGrade[];
}

/** Modelo imutável usado para desenhar o PDF. */
export interface RelatorioGrade {
  versao: 1;
  turmaOriginalId: string;
  turmaOriginal: string;
  de: string;
  ate: string;
  dias: string[];
  alunos: AlunoRelatorioGrade[];
  totais: {
    alunos: number;
    faltas: number;
    justificadas: number;
    parciais: number;
  };
}

/**
 * Resposta completa da rota de retrato. Fica no domínio porque o cliente
 * também precisa do tipo, e src/application não pode ser importado pelo
 * navegador.
 */
export interface RetratoGrade {
  versao: 1;
  retrato: {
    em: string;
    emTexto: string;
    fuso: string;
    hash: string;
  };
  relatorio: RelatorioGrade;
}

export interface EntradaRelatorioGrade {
  turmaOriginalId: string;
  turmaOriginal: string;
  turmas: Turma[];
  dias: string[];
  linhas: LinhaGrade[];
  frequencias: Frequencia[];
  horarios: Horario[];
  resumo: ResumoAcumulado | null;
  justificativas: readonly Justificativa[];
  /**
   * Códigos de justificativa por aluno e dia, lidos das linhas cruas de
   * faltas antes do agrupamento do domínio. Chave: `${alunoId}:${dia}`.
   */
  justificativasPorAlunoDia?: ReadonlyMap<string, string[]>;
}

function rotulosDasAulas(
  ids: string[],
  horarios: Horario[],
  indicePorId: ReadonlyMap<string, number>,
): string[] {
  const porOrdem: { ordem: number; rotulo: string }[] = [];
  for (const id of ids) {
    const indice = indicePorId.get(id);
    if (indice === undefined) continue;
    const horario = horarios[indice];
    if (!horario) continue;
    porOrdem.push({ ordem: indice, rotulo: rotuloAula(horario) });
  }
  porOrdem.sort((a, b) => a.ordem - b.ordem);
  return [...new Set(porOrdem.map((item) => item.rotulo))];
}

/** Ocorrências de um aluno no período, em ordem de data. */
export function montarOcorrenciasDoAluno(
  aluno: Aluno,
  dias: string[],
  marcas: Record<string, Marca | undefined>,
  porDia: ReadonlyMap<string, Frequencia[]>,
  horarios: Horario[],
  justificativas: readonly Justificativa[],
  justificativasPorAlunoDia?: ReadonlyMap<string, string[]>,
): OcorrenciaGrade[] {
  const indicePorId = new Map(horarios.map((horario, indice) => [horario.id, indice]));
  const ocorrencias: OcorrenciaGrade[] = [];
  for (const dia of dias) {
    const marca = marcas[dia];
    if (marca !== "F" && marca !== "FJ" && marca !== "S") continue;
    const detalhe = classificarDiaDoAluno(aluno, dia, porDia.get(dia) ?? [], horarios);
    if (detalhe.marca !== "F" && detalhe.marca !== "FJ" && detalhe.marca !== "S") continue;
    const codigos = justificativasPorAlunoDia?.get(`${aluno.id}:${dia}`) ?? detalhe.justificativas;
    const rotulos = [
      ...new Set(
        codigos
          .map((codigo) => rotuloJustificativa(codigo, justificativas) || codigo)
          .filter((rotulo) => rotulo !== ""),
      ),
    ].sort((a, b) => a.localeCompare(b, "pt-BR"));
    ocorrencias.push({
      dia,
      marca: detalhe.marca,
      aulasPrevistas: detalhe.aulasPrevistas,
      aulasFaltadas: detalhe.aulasFaltadas,
      aulasFaltadasRotulos: rotulosDasAulas(detalhe.aulasFaltadasIds, horarios, indicePorId),
      justificativas: rotulos,
      referenciaAulas: detalhe.referenciaAulas,
    });
  }
  return ocorrencias;
}

/** Monta o modelo do relatório a partir da Grade já calculada. */
export function montarRelatorioGrade(entrada: EntradaRelatorioGrade): RelatorioGrade {
  const porDia = new Map<string, Frequencia[]>();
  for (const frequencia of entrada.frequencias) {
    const lista = porDia.get(frequencia.dia) ?? [];
    lista.push(frequencia);
    porDia.set(frequencia.dia, lista);
  }
  const turmaAtual = new Map(entrada.turmas.map((turma) => [turma.id, turma.rotulo]));
  const historico = new Map(
    (entrada.resumo?.porAluno ?? []).map((item) => [
      item.alunoId,
      item.faltas + item.faltasJustificadas,
    ]),
  );
  const alunos = entrada.linhas.map((linha) => ({
    alunoId: linha.aluno.id,
    nome: linha.aluno.nome,
    turmaAtual: turmaAtual.get(linha.aluno.turmaId) ?? "Sem turma",
    desistente: Boolean(linha.aluno.desistenteEm),
    faltas: linha.faltas,
    justificadas: linha.justificadas,
    parciais: linha.parciais,
    diasComRegistro: linha.frequencias,
    totalHistorico: historico.get(linha.aluno.id) ?? 0,
    ocorrencias: montarOcorrenciasDoAluno(
      linha.aluno,
      entrada.dias,
      linha.marcas,
      porDia,
      entrada.horarios,
      entrada.justificativas,
      entrada.justificativasPorAlunoDia,
    ),
  }));
  return {
    versao: 1,
    turmaOriginalId: entrada.turmaOriginalId,
    turmaOriginal: entrada.turmaOriginal,
    de: entrada.dias[0] ?? "",
    ate: entrada.dias[entrada.dias.length - 1] ?? "",
    dias: entrada.dias,
    alunos,
    totais: {
      alunos: alunos.length,
      faltas: alunos.reduce((soma, aluno) => soma + aluno.faltas, 0),
      justificadas: alunos.reduce((soma, aluno) => soma + aluno.justificadas, 0),
      parciais: alunos.reduce((soma, aluno) => soma + aluno.parciais, 0),
    },
  };
}

/** Nome estável do PDF, sem acento nem espaço. */
export function nomeArquivoRelatorioPdf(turmaOriginal: string, dias: string[]): string {
  const turmaSegura = normalizar(turmaOriginal)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const primeiro = dias[0] ?? "periodo";
  const ultimo = dias[dias.length - 1] ?? primeiro;
  return `frequenciapp-relatorio-${turmaSegura || "turma"}-${primeiro}-a-${ultimo}.pdf`;
}
