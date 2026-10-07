// Ordena a chamada de cada turma em português, mantendo os inativos após os ativos.
export interface AlunoParaOrdenacao {
  id: string;
  nome: string;
  turmaId: string;
  ordem: number;
  ativo: boolean;
}

/** Devolve somente as mudanças de numeração, sem alterar cadastro ou vínculos. */
export function planejarOrdenacaoAlunos(alunos: readonly AlunoParaOrdenacao[]) {
  const grupos = new Map<string, AlunoParaOrdenacao[]>();
  for (const aluno of alunos) {
    const grupo = grupos.get(aluno.turmaId) ?? [];
    grupo.push(aluno);
    grupos.set(aluno.turmaId, grupo);
  }
  const comparar = new Intl.Collator("pt-BR", { sensitivity: "base" });
  const mudancas: { id: string; ordem: number }[] = [];
  for (const grupo of grupos.values()) {
    grupo.sort(
      (a, b) =>
        Number(b.ativo) - Number(a.ativo) ||
        comparar.compare(a.nome.trim(), b.nome.trim()) ||
        a.ordem - b.ordem ||
        a.id.localeCompare(b.id),
    );
    grupo.forEach((aluno, indice) => {
      if (aluno.ordem !== indice + 1) mudancas.push({ id: aluno.id, ordem: indice + 1 });
    });
  }
  return { turmas: grupos.size, alunos: alunos.length, mudancas };
}
