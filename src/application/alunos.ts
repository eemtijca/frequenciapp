// Alunos: gestão completa pelo administrador e listagem pelo escopo de quem
// pede. A turma de origem é preservada para a Grade do mês.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ambiente } from "@/infra/ambiente";
import { diaLocal, type Aluno } from "@/domain/frequencia";

const nomeAluno = z
  .string()
  .trim()
  .min(2, "O nome do aluno deve ter ao menos 2 caracteres.")
  .max(100, "O nome do aluno deve ter no máximo 100 caracteres.");

const idTurma = z.string().uuid("Turma inválida.");

export const esquemaCriarAluno = z.object({
  nome: nomeAluno,
  turmaId: idTurma,
  turmaOriginalId: idTurma.optional(),
});

export const esquemaAtualizarAluno = z
  .object({
    nome: nomeAluno.optional(),
    turmaId: idTurma.optional(),
    turmaOriginalId: idTurma.optional(),
    ordem: z.number().int().min(1).max(9999).optional(),
    ativo: z.boolean().optional(),
    desistente: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaAluno {
  id: string;
  nome: string;
  turmaId: string;
  turmaOriginalId: string;
  ordem: number;
  ativo: boolean;
  desistenteEm: Date | null;
}

function paraAluno(linha: LinhaAluno): Aluno {
  return {
    id: linha.id,
    nome: linha.nome,
    turmaId: linha.turmaId,
    turmaOriginalId: linha.turmaOriginalId,
    ordem: linha.ordem,
    ativo: linha.ativo,
    desistenteEm: linha.desistenteEm?.toISOString().slice(0, 10) ?? null,
  };
}

/** Todos os alunos, ordenados por turma e ordem. */
export async function listarTodosAlunos(): Promise<Aluno[]> {
  const linhas = await banco().aluno.findMany({
    orderBy: [{ turma: { serie: { ordem: "asc" } } }, { turma: { nome: "asc" } }, { ordem: "asc" }],
  });
  return linhas.map(paraAluno);
}

/** Cria um aluno no fim da ordem da turma. */
export async function criarAluno(admin: { id: string }, entrada: unknown): Promise<Aluno> {
  const dados = esquemaCriarAluno.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const turma = await banco().turma.findUnique({ where: { id: dados.data.turmaId } });
  if (!turma) throw new ErroHttp("Turma não encontrada.", 404);
  if (dados.data.turmaOriginalId) {
    const origem = await banco().turma.findUnique({ where: { id: dados.data.turmaOriginalId } });
    if (!origem) throw new ErroHttp("Turma de origem não encontrada.", 404);
  }
  const linha = await comTransacao(async (tx) => {
    const ultimo = await tx.aluno.findFirst({
      where: { turmaId: dados.data.turmaId },
      orderBy: { ordem: "desc" },
      select: { ordem: true },
    });
    const criado = await tx.aluno.create({
      data: {
        nome: dados.data.nome,
        turmaId: dados.data.turmaId,
        turmaOriginalId: dados.data.turmaOriginalId ?? dados.data.turmaId,
        ordem: (ultimo?.ordem ?? 0) + 1,
      },
    });
    await auditar(tx, admin.id, "aluno.criar", `aluno:${criado.id}`);
    return criado;
  });
  return paraAluno(linha);
}

/** Atualiza campos do aluno. Mudar de turma preserva a origem. */
export async function atualizarAluno(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<Aluno> {
  const dados = esquemaAtualizarAluno.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().aluno.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Aluno não encontrado.", 404);
  if (dados.data.desistente === true && (!existente.ativo || dados.data.ativo === false)) {
    throw new ErroHttp("Reative o aluno antes de registrar a desistência.", 400);
  }
  if (dados.data.ativo === false && existente.desistenteEm && dados.data.desistente !== false) {
    throw new ErroHttp("Desfaça a desistência antes de desativar o aluno.", 400);
  }
  if (dados.data.turmaId) {
    const turma = await banco().turma.findUnique({ where: { id: dados.data.turmaId } });
    if (!turma) throw new ErroHttp("Turma não encontrada.", 404);
  }
  if (dados.data.turmaOriginalId) {
    const origem = await banco().turma.findUnique({ where: { id: dados.data.turmaOriginalId } });
    if (!origem) throw new ErroHttp("Turma de origem não encontrada.", 404);
  }
  const linha = await comTransacao(async (tx) => {
    const turmaMudou = dados.data.turmaId !== undefined && dados.data.turmaId !== existente.turmaId;
    const ultimoDaTurma = turmaMudou
      ? await tx.aluno.findFirst({
          where: { turmaId: dados.data.turmaId },
          orderBy: { ordem: "desc" },
          select: { ordem: true },
        })
      : null;
    const atualizado = await tx.aluno.update({
      where: { id },
      data: {
        ...(dados.data.nome !== undefined ? { nome: dados.data.nome } : {}),
        ...(dados.data.turmaId !== undefined ? { turmaId: dados.data.turmaId } : {}),
        ...(dados.data.turmaOriginalId !== undefined
          ? { turmaOriginalId: dados.data.turmaOriginalId }
          : {}),
        ...(dados.data.ordem !== undefined
          ? { ordem: dados.data.ordem }
          : turmaMudou
            ? { ordem: (ultimoDaTurma?.ordem ?? 0) + 1 }
            : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
        ...(dados.data.desistente !== undefined
          ? {
              desistenteEm: dados.data.desistente
                ? (existente.desistenteEm ??
                  new Date(`${diaLocal(new Date(), ambiente.fuso)}T12:00:00Z`))
                : null,
              ...(Boolean(existente.desistenteEm) !== dados.data.desistente
                ? { situacaoAtualizadaEm: new Date() }
                : {}),
            }
          : {}),
      },
    });
    await auditar(tx, admin.id, "aluno.atualizar", `aluno:${id}`);
    return atualizado;
  });
  return paraAluno(linha);
}

/**
 * Exclui o aluno e, em cascata, os registros de falta dele. A exclusão
 * é definitiva: para preservar o histórico, desative.
 */
export async function removerAluno(admin: { id: string }, id: string): Promise<void> {
  const existente = await banco().aluno.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Aluno não encontrado.", 404);
  await comTransacao(async (tx) => {
    await tx.aluno.delete({ where: { id } });
    await auditar(tx, admin.id, "aluno.excluir", `aluno:${id}`);
  });
}

export const esquemaOrigemEmMassa = z.object({
  ids: z
    .array(z.string().uuid("Aluno inválido."))
    .min(1, "Selecione ao menos um aluno.")
    .max(500, "Selecione no máximo 500 alunos."),
  turmaOriginalId: idTurma,
});

/**
 * Define a turma de origem de vários alunos de uma vez. A turma atual não
 * muda; a Grade e a planilha passam a agrupar o histórico pela nova origem.
 */
export async function definirOrigemEmMassa(
  admin: { id: string },
  entrada: unknown,
): Promise<{ atualizados: number }> {
  const dados = esquemaOrigemEmMassa.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const origem = await banco().turma.findUnique({ where: { id: dados.data.turmaOriginalId } });
  if (!origem) throw new ErroHttp("Turma de origem não encontrada.", 404);
  const atualizados = await comTransacao(async (tx) => {
    const existentes = await tx.aluno.count({ where: { id: { in: dados.data.ids } } });
    if (existentes !== dados.data.ids.length) {
      throw new ErroHttp("Algum aluno selecionado não foi encontrado.", 404);
    }
    const resultado = await tx.aluno.updateMany({
      where: { id: { in: dados.data.ids } },
      data: { turmaOriginalId: dados.data.turmaOriginalId },
    });
    await auditar(tx, admin.id, "aluno.origem_em_massa", `turma:${dados.data.turmaOriginalId}`);
    return resultado.count;
  });
  return { atualizados };
}
