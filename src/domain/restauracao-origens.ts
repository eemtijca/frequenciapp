// Volta dos alunos de uma série às turmas de origem, com a chamada das turmas afetadas renumerada.
import { planejarOrdenacaoAlunos } from "@/domain/ordenacao-alunos";

export interface AlunoParaRestauracao {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
}

/** O que a administração conferiu: cada aluno com a turma atual e a de origem vistas na prévia. */
export interface ItemDaPrevia {
  id: string;
  turmaId: string;
  turmaOriginalId: string;
}

/**
 * Alunos remanejados dentro da série: turma atual e turma de origem nas turmas
 * da série, e diferentes. Quem cruzou de série fica de fora, nos dois sentidos.
 */
export function alunosForaDaOrigem<T extends AlunoParaRestauracao>(
  alunos: readonly T[],
  turmasDaSerie: ReadonlySet<string>,
): T[] {
  return alunos.filter(
    (aluno) =>
      turmasDaSerie.has(aluno.turmaId) &&
      turmasDaSerie.has(aluno.turmaOriginalId) &&
      aluno.turmaId !== aluno.turmaOriginalId,
  );
}

const chaveDaPrevia = (item: ItemDaPrevia) => `${item.id}:${item.turmaId}:${item.turmaOriginalId}`;

/**
 * Compara a prévia confirmada com o estado atual, aluno por aluno. `aplicada`
 * quer dizer que todos os alunos da prévia já voltaram e ninguém mais está fora
 * da origem: é a repetição de um pedido que já deu certo.
 */
export function conferirPrevia(
  alunos: readonly AlunoParaRestauracao[],
  turmasDaSerie: ReadonlySet<string>,
  previa: readonly ItemDaPrevia[],
): "igual" | "aplicada" | "divergente" {
  const fora = alunosForaDaOrigem(alunos, turmasDaSerie);
  const esperados = new Set(previa.map(chaveDaPrevia));
  if (
    fora.length === esperados.size &&
    fora.every((aluno) => esperados.has(chaveDaPrevia(aluno)))
  ) {
    return "igual";
  }
  if (fora.length > 0) return "divergente";
  const porId = new Map(alunos.map((aluno) => [aluno.id, aluno]));
  const voltaram = previa.every((item) => {
    const aluno = porId.get(item.id);
    return (
      aluno?.turmaId === item.turmaOriginalId && aluno.turmaOriginalId === item.turmaOriginalId
    );
  });
  return voltaram ? "aplicada" : "divergente";
}

/** Para a prévia: quantos alunos voltam a cada turma e de quais turmas saem. */
export function resumoDaRestauracao(movidos: readonly AlunoParaRestauracao[]) {
  const destinos = new Map<string, { quantidade: number; de: Set<string> }>();
  for (const aluno of movidos) {
    const atual = destinos.get(aluno.turmaOriginalId) ?? { quantidade: 0, de: new Set<string>() };
    atual.quantidade += 1;
    atual.de.add(aluno.turmaId);
    destinos.set(aluno.turmaOriginalId, atual);
  }
  return [...destinos.entries()].map(([turmaId, item]) => ({
    turmaId,
    quantidade: item.quantidade,
    de: [...item.de],
  }));
}

/**
 * Devolve cada aluno fora da origem à turma original e renumera, pela mesma regra
 * da reorganização, só as turmas que perdem ou recebem alunos. Turmas intocadas
 * mantêm a numeração. Movimentos e ordens levam o antes e o depois, para a auditoria.
 */
export function planejarRestauracaoOrigens(
  alunos: readonly AlunoParaRestauracao[],
  turmasDaSerie: ReadonlySet<string>,
) {
  const movidos = alunosForaDaOrigem(alunos, turmasDaSerie);
  const idsMovidos = new Set(movidos.map((aluno) => aluno.id));
  const afetadas = new Set(movidos.flatMap((aluno) => [aluno.turmaId, aluno.turmaOriginalId]));
  const depois = alunos
    .map((aluno) =>
      idsMovidos.has(aluno.id) ? { ...aluno, turmaId: aluno.turmaOriginalId } : aluno,
    )
    .filter((aluno) => afetadas.has(aluno.turmaId));
  const ordemAntes = new Map(alunos.map((aluno) => [aluno.id, aluno.ordem]));
  return {
    movidos: movidos.map((aluno) => ({
      id: aluno.id,
      de: aluno.turmaId,
      para: aluno.turmaOriginalId,
    })),
    ordens: planejarOrdenacaoAlunos(depois).mudancas.map((mudanca) => ({
      ...mudanca,
      antes: ordemAntes.get(mudanca.id) ?? mudanca.ordem,
    })),
    turmas: [...afetadas],
  };
}
