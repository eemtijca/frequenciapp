// Avalia composições históricas e diagnostica listas antigas sem tratar
// cadastro ou turma atual como prova de matrícula.

/** Chamada reduzida ao necessário para o diagnóstico de listas antigas. */
export interface ChamadaDiagnostico {
  id: string;
  dia: string;
  turmaId: string;
  alunos: string[];
  faltas: string[];
}

/** Aluno reduzido ao necessário para o diagnóstico de listas antigas. */
export interface AlunoDiagnostico {
  id: string;
  turmaId: string;
  turmaOriginalId: string;
  criadoEm: string;
}

/**
 * Aluno consultado ao avaliar a composição de uma chamada retroativa.
 * As datas civis chegam como YYYY-MM-DD para não depender do fuso do processo.
 */
export interface AlunoComposicao {
  id: string;
  turmaId: string;
  turmaOriginalId: string;
  ativo: boolean;
  criadoEm: string;
  desistenteEm: string | null;
}

/** Razão objetiva para a composição atual não comprovar a composição da data. */
export type RazaoComposicao =
  "TURMA_CRIADA_DEPOIS" | "CADASTRO_POSTERIOR" | "VINCULO_INDETERMINADO";

export interface AvaliacaoComposicao {
  compativel: boolean;
  razoes: RazaoComposicao[];
  alunosDivergentes: string[];
}

/**
 * Compara a composição atual com a data da chamada. Só é compatível quando a
 * turma já existia e todo aluno que poderia estar nela na data continua no
 * mesmo vínculo e ativo, sem desistência anterior. Transferência de entrada,
 * de saída, cadastro posterior ou situação desconhecida exigem confirmação.
 */
export function avaliarComposicaoHistorica(
  turma: { id: string; criadoEm: string },
  alunos: readonly AlunoComposicao[],
  dia: string,
): AvaliacaoComposicao {
  const razoes = new Set<RazaoComposicao>();
  const alunosDivergentes = new Set<string>();
  if (turma.criadoEm > dia) razoes.add("TURMA_CRIADA_DEPOIS");

  for (const aluno of alunos) {
    if (aluno.criadoEm > dia) {
      razoes.add("CADASTRO_POSTERIOR");
      alunosDivergentes.add(aluno.id);
      continue;
    }
    // Quem já havia desistido na data não força divergência: a chamada pode
    // mantê-lo na lista com a marca de desistente, sem presença inventada.
    if (aluno.desistenteEm !== null && aluno.desistenteEm <= dia) continue;
    if (!aluno.ativo || aluno.turmaId !== turma.id || aluno.turmaOriginalId !== turma.id) {
      razoes.add("VINCULO_INDETERMINADO");
      alunosDivergentes.add(aluno.id);
    }
  }

  return {
    compativel: razoes.size === 0,
    razoes: [...razoes],
    alunosDivergentes: [...alunosDivergentes],
  };
}

/** Diagnóstico não destrutivo: divergência cadastral é suspeita, nunca prova de matrícula. */
export function diagnosticarListasHistoricas(
  chamadas: readonly ChamadaDiagnostico[],
  alunos: readonly AlunoDiagnostico[],
) {
  return chamadas.flatMap((c) => {
    const lista = new Set(c.alunos),
      faltas = new Set(c.faltas);
    const candidatos = new Set([
      ...lista,
      ...faltas,
      ...alunos
        .filter((a) => a.turmaId === c.turmaId || a.turmaOriginalId === c.turmaId)
        .map((a) => a.id),
    ]);
    return [...candidatos]
      .sort()
      .map((alunoId) => {
        const aluno = alunos.find((a) => a.id === alunoId);
        const razoes: string[] = [];
        if (faltas.has(alunoId) && !lista.has(alunoId)) razoes.push("FALTA_FORA_DA_LISTA");
        if (!faltas.has(alunoId))
          razoes.push(
            lista.has(alunoId) ? "MATRICULA_NAO_COMPROVADA" : "PARTICIPACAO_DESCONHECIDA",
          );
        if (aluno?.turmaId !== c.turmaId && aluno?.turmaOriginalId !== c.turmaId)
          razoes.push("VINCULO_ATUAL_DIVERGENTE");
        if (aluno && aluno.criadoEm.slice(0, 10) > c.dia) razoes.push("CADASTRO_POSTERIOR");
        return {
          frequenciaId: c.id,
          alunoId,
          dia: c.dia,
          classificacao: razoes.includes("FALTA_FORA_DA_LISTA")
            ? "INCONSISTENCIA_ESTRUTURAL_CONFIRMADA"
            : "INCERTEZA_HISTORICA",
          razoes,
        };
      })
      .filter((r) => r.razoes.length > 0);
  });
}
