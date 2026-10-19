// Ordenação dos nomes em português e movimentos de linhas completas da planilha.
// Mantém as posições de cabeçalhos e de linhas sem identificação de aluno.
export function ordenarAlunosDaPlanilha<T extends { nome: string }>(alunos: readonly T[]): T[] {
  const comparar = new Intl.Collator("pt-BR", { sensitivity: "base" });
  return [...alunos].sort((a, b) => comparar.compare(a.nome.trim(), b.nome.trim()));
}

export interface MovimentoLinhaPlanilha {
  origem: number;
  destino: number;
}

const compararTurma = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
const compararNome = new Intl.Collator("pt-BR", { sensitivity: "base" });

/** Agrupa as saídas por turma e aluno, com datas civis em ordem cronológica. */
export function compararSaidasDaPlanilha(
  a: { turma: string; nome: string; dia: string },
  b: { turma: string; nome: string; dia: string },
): number {
  return (
    compararTurma.compare(a.turma.trim(), b.turma.trim()) ||
    compararNome.compare(a.nome.trim(), b.nome.trim()) ||
    a.dia.localeCompare(b.dia)
  );
}

/** Troca somente as posições dos alunos; as linhas intermediárias voltam ao lugar. */
export function planejarOrdenacaoLinhasPlanilha<T extends { linha: number; nome: string }>(
  linhas: readonly T[],
  comparar?: (a: T, b: T) => number,
): MovimentoLinhaPlanilha[] {
  const atuais = [...linhas].sort((a, b) => a.linha - b.linha);
  const desejadas = comparar ? [...atuais].sort(comparar) : ordenarAlunosDaPlanilha(atuais);
  const posicoes = atuais.map((item) => item.linha);
  const movimentos: MovimentoLinhaPlanilha[] = [];
  desejadas.forEach((desejada, indice) => {
    const encontrada = atuais.findIndex((item) => item.linha === desejada.linha);
    if (encontrada === indice) return;
    const origem = posicoes[encontrada];
    const destino = posicoes[indice];
    const anterior = atuais[indice];
    if (origem === undefined || destino === undefined || !anterior) return;
    movimentos.push({ origem, destino });
    // Um intervalo com lacunas precisa da segunda movimentação para
    // devolver as demais linhas às suas posições, sem reescrever células.
    if (origem > destino + 1) movimentos.push({ origem: destino + 1, destino: origem });
    atuais[indice] = desejada;
    atuais[encontrada] = anterior;
  });
  return movimentos;
}
