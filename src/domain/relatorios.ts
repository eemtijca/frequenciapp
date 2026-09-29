// Indicadores do dia e relatórios por período e por aluno. Regras puras,
// compartilhadas entre servidor, API e interface.
import {
  alunoDesistenteNoDia,
  marcaDoAluno,
  type Aluno,
  type Frequencia,
  type Horario,
  type Marca,
  type SaidaAntecipada,
  type Serie,
  type Turma,
} from "@/domain/frequencia";

/** Contagem de um conjunto de marcas do dia. */
export interface ContagemDia {
  esperados: number;
  registrados: number;
  presentes: number;
  faltas: number;
  justificadas: number;
}

/** Marca de cada aluno no dia, pela mesma derivação da grade. */
export function marcasDoDia(
  alunos: Aluno[],
  dia: string,
  frequenciasDoDia: Frequencia[],
  horarios: Horario[] = [],
): Map<string, Marca> {
  const marcas = new Map<string, Marca>();
  for (const aluno of alunos) {
    const marca = marcaDoAluno(aluno, dia, frequenciasDoDia, horarios);
    if (marca) marcas.set(aluno.id, marca);
  }
  return marcas;
}

/** Contagem de marcas com o total de alunos esperados. */
export function contagemDeMarcas(marcas: Map<string, Marca>, esperados: number): ContagemDia {
  const contagem: ContagemDia = {
    esperados,
    registrados: 0,
    presentes: 0,
    faltas: 0,
    justificadas: 0,
  };
  for (const marca of marcas.values()) {
    contagem.registrados += 1;
    if (marca === "P") contagem.presentes += 1;
    else if (marca === "F") contagem.faltas += 1;
    else if (marca === "FJ") contagem.justificadas += 1;
  }
  return contagem;
}

/** Ausências do dia, somando falta e falta justificada. */
export function ausencias(contagem: ContagemDia): number {
  return contagem.faltas + contagem.justificadas;
}

/** Taxa de infrequência sobre os alunos com chamada salva no dia. */
export function infrequencia(contagem: ContagemDia): number {
  return contagem.registrados > 0 ? ausencias(contagem) / contagem.registrados : 0;
}

/** Resumo do dia com ausências, saídas e taxa. */
export interface ResumoDia extends ContagemDia {
  ausencias: number;
  saidas: number;
  infrequencia: number;
}

export function resumoDoDia(
  marcas: Map<string, Marca>,
  esperados: number,
  saidasDoDia: SaidaAntecipada[] = [],
): ResumoDia {
  const contagem = contagemDeMarcas(marcas, esperados);
  return {
    ...contagem,
    ausencias: ausencias(contagem),
    saidas: new Set(saidasDoDia.map((saida) => saida.alunoId)).size,
    infrequencia: infrequencia(contagem),
  };
}

/** Cobertura do dia: quanto do total já tem chamada salva e o que falta. */
export interface CoberturaDia {
  esperados: number;
  registrados: number;
  turmasPendentes: Turma[];
}

export function coberturaDoDia(
  turmas: Turma[],
  alunos: Aluno[],
  frequenciasDoDia: Frequencia[],
): CoberturaDia {
  const ativos = alunos.filter((aluno) => aluno.ativo);
  const turmasComAlunos = turmas.filter((turma) =>
    ativos.some((aluno) => aluno.turmaId === turma.id),
  );
  const salvas = new Set(frequenciasDoDia.map((frequencia) => frequencia.turmaId));
  return {
    esperados: ativos.length,
    registrados: ativos.filter((aluno) => salvas.has(aluno.turmaId)).length,
    turmasPendentes: turmasComAlunos.filter((turma) => !salvas.has(turma.id)),
  };
}

/** Desistências vigentes no dia, agrupadas pela turma atual. */
export function desistenciasNoDia(series: Serie[], turmas: Turma[], alunos: Aluno[], dia: string) {
  const desistentes = alunos.filter((aluno) => aluno.ativo && alunoDesistenteNoDia(aluno, dia));
  return {
    total: desistentes.length,
    series: series.map((serie) => ({
      serieId: serie.id,
      nome: serie.nome,
      turmas: turmas
        .filter((turma) => turma.serieId === serie.id)
        .map((turma) => ({
          turmaId: turma.id,
          rotulo: turma.rotulo,
          quantidade: desistentes.filter((aluno) => aluno.turmaId === turma.id).length,
        })),
    })),
  };
}

/** Distribuição das faltas do dia em uma turma. */
export interface ResumoTurmaDia extends ContagemDia {
  turmaId: string;
  rotulo: string;
  percentual: number;
}

/** Distribuição das faltas do dia em uma série, com as turmas. */
export interface ResumoSerieDia extends ContagemDia {
  serieId: string;
  nome: string;
  ordem: number;
  percentual: number;
  turmas: ResumoTurmaDia[];
}

/**
 * Distribuição das faltas do dia por série e por turma atual. O percentual da
 * série usa o total da escola; o da turma usa o total da própria série,
 * como nos gráficos de infrequência do aplicativo de referência.
 */
export function distribuicaoDoDia(
  series: Serie[],
  turmas: Turma[],
  alunos: Aluno[],
  marcas: Map<string, Marca>,
): ResumoSerieDia[] {
  const ativos = alunos.filter((aluno) => aluno.ativo);
  const totalEscola = [...marcas.values()].filter(
    (marca) => marca === "F" || marca === "FJ",
  ).length;
  const percentual = (valor: number, total: number) => (total > 0 ? valor / total : 0);

  return series
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((serie) => {
      const turmasDaSerie = turmas
        .filter((turma) => turma.serieId === serie.id)
        .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
      // O Painel mostra o dia como a chamada aconteceu: pela turma atual.
      // A consolidação pela turma original fica na Grade e na planilha.
      const alunosDaSerie = ativos.filter((aluno) =>
        turmasDaSerie.some((turma) => turma.id === aluno.turmaId),
      );
      const contagensTurma = turmasDaSerie.map((turma) => {
        const alunosDaTurma = alunosDaSerie.filter((aluno) => aluno.turmaId === turma.id);
        const marcasDaTurma = new Map<string, Marca>();
        for (const aluno of alunosDaTurma) {
          const marca = marcas.get(aluno.id);
          if (marca) marcasDaTurma.set(aluno.id, marca);
        }
        return {
          turmaId: turma.id,
          rotulo: turma.rotulo,
          ...contagemDeMarcas(marcasDaTurma, alunosDaTurma.length),
        };
      });
      const contagemSerie = contagensTurma.reduce<ContagemDia>(
        (soma, contagem) => ({
          esperados: soma.esperados + contagem.esperados,
          registrados: soma.registrados + contagem.registrados,
          presentes: soma.presentes + contagem.presentes,
          faltas: soma.faltas + contagem.faltas,
          justificadas: soma.justificadas + contagem.justificadas,
        }),
        { esperados: 0, registrados: 0, presentes: 0, faltas: 0, justificadas: 0 },
      );
      const totalSerie = ausencias(contagemSerie);
      return {
        serieId: serie.id,
        nome: serie.nome,
        ordem: serie.ordem,
        ...contagemSerie,
        percentual: percentual(totalSerie, totalEscola),
        turmas: contagensTurma.map((contagem) => ({
          ...contagem,
          percentual: percentual(ausencias(contagem), totalSerie),
        })),
      };
    });
}

/** Alunos ativos da série pela turma atual, que é como a chamada acontece. */
function alunosAtivosDaSerie(serie: Serie, turmas: Turma[], alunos: Aluno[]): Aluno[] {
  const idsDasTurmas = new Set(
    turmas.filter((turma) => turma.serieId === serie.id).map((turma) => turma.id),
  );
  return alunos.filter((aluno) => aluno.ativo && idsDasTurmas.has(aluno.turmaId));
}

/** A série tem aluno cuja turma original difere da turma atual (turma reorganizada). */
export function serieTemRemanejamento(serie: Serie, turmas: Turma[], alunos: Aluno[]): boolean {
  return alunosAtivosDaSerie(serie, turmas, alunos).some(
    (aluno) => aluno.turmaOriginalId !== aluno.turmaId,
  );
}

/**
 * Faltas do dia de uma série agrupadas pela turma original do aluno, a mesma
 * consolidação da Grade e da planilha. Usa os mesmos alunos e marcas de
 * `distribuicaoDoDia`, então o total de faltas é o mesmo; muda só o agrupamento.
 */
export function distribuicaoPorOrigem(
  serie: Serie,
  turmas: Turma[],
  alunos: Aluno[],
  marcas: Map<string, Marca>,
): ResumoTurmaDia[] {
  const alunosDaSerie = alunosAtivosDaSerie(serie, turmas, alunos);
  const porOrigem = new Map<string, Aluno[]>();
  for (const aluno of alunosDaSerie) {
    const lista = porOrigem.get(aluno.turmaOriginalId) ?? [];
    lista.push(aluno);
    porOrigem.set(aluno.turmaOriginalId, lista);
  }
  const contagens = [...porOrigem.entries()].map(([turmaId, doGrupo]) => {
    const marcasDoGrupo = new Map<string, Marca>();
    for (const aluno of doGrupo) {
      const marca = marcas.get(aluno.id);
      if (marca) marcasDoGrupo.set(aluno.id, marca);
    }
    return {
      turmaId,
      rotulo: turmas.find((turma) => turma.id === turmaId)?.rotulo ?? "Sem turma de origem",
      ...contagemDeMarcas(marcasDoGrupo, doGrupo.length),
    };
  });
  const totalSerie = contagens.reduce((soma, contagem) => soma + ausencias(contagem), 0);
  return contagens
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map((contagem) => ({
      ...contagem,
      percentual: totalSerie > 0 ? ausencias(contagem) / totalSerie : 0,
    }));
}

/** Índice de frequências por dia, para os relatórios por aluno. */
export function indexarPorDia(frequencias: Frequencia[]): Map<string, Frequencia[]> {
  const porDia = new Map<string, Frequencia[]>();
  for (const frequencia of frequencias) {
    const lista = porDia.get(frequencia.dia) ?? [];
    lista.push(frequencia);
    porDia.set(frequencia.dia, lista);
  }
  return porDia;
}

/** Resumo de um aluno em um período. */
export interface ResumoAlunoPeriodo {
  diasComRegistro: number;
  faltas: number;
  justificadas: number;
  parciais: number;
  saidas: number;
}

export function resumoPorAluno(
  aluno: Aluno,
  dias: string[],
  porDia: Map<string, Frequencia[]>,
  saidas: SaidaAntecipada[],
  horarios: Horario[] = [],
): ResumoAlunoPeriodo {
  let diasComRegistro = 0;
  let faltas = 0;
  let justificadas = 0;
  let parciais = 0;
  for (const dia of dias) {
    const marca = marcaDoAluno(aluno, dia, porDia.get(dia) ?? [], horarios);
    if (marca === null) continue;
    diasComRegistro += 1;
    if (marca === "F") faltas += 1;
    if (marca === "FJ") justificadas += 1;
    if (marca === "S") parciais += 1;
  }
  return {
    diasComRegistro,
    faltas,
    justificadas,
    parciais,
    saidas: saidas.filter((saida) => saida.alunoId === aluno.id && dias.includes(saida.dia)).length,
  };
}

/** Saídas de um aluno em um período, do mais recente para o mais antigo. */
export interface RelatorioSaidaAluno {
  alunoId: string;
  saidas: SaidaAntecipada[];
}

/** Agrupa saídas por aluno, com o filtro de duas ou mais. */
export function relatorioSaidas(
  saidas: SaidaAntecipada[],
  filtro: "todas" | "repetidas" = "todas",
): RelatorioSaidaAluno[] {
  const porAluno = new Map<string, SaidaAntecipada[]>();
  for (const saida of saidas) {
    const lista = porAluno.get(saida.alunoId) ?? [];
    lista.push(saida);
    porAluno.set(saida.alunoId, lista);
  }
  return [...porAluno.entries()]
    .map(([alunoId, lista]) => ({
      alunoId,
      saidas: lista
        .slice()
        .sort((a, b) => b.dia.localeCompare(a.dia) || b.criadoEm.localeCompare(a.criadoEm)),
    }))
    .filter((item) => filtro === "todas" || item.saidas.length >= 2)
    .sort((a, b) => b.saidas.length - a.saidas.length || a.alunoId.localeCompare(b.alunoId));
}
