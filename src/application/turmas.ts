// Turmas: gestão completa pelo administrador e listagem pelo escopo de quem
// pede. Professor vê as atribuídas; administrador vê todas.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { rotuloDeTurma } from "@/domain/frequencia";
import type { Turma } from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const nomeTurma = z
  .string()
  .trim()
  .min(1, "Informe o nome da turma.")
  .max(40, "O nome da turma deve ter no máximo 40 caracteres.");

export const esquemaCriarTurma = z.object({
  serieId: z.string().uuid("Série inválida."),
  nome: nomeTurma,
});

export const esquemaAtualizarTurma = z
  .object({
    nome: nomeTurma.optional(),
    serieId: z.string().uuid("Série inválida.").optional(),
  })
  .refine((dados) => dados.nome !== undefined || dados.serieId !== undefined, {
    message: "Nada a atualizar.",
  });

interface LinhaTurma {
  id: string;
  nome: string;
  serieId: string;
  serie: { nome: string };
}

function paraTurma(linha: LinhaTurma): Turma {
  return {
    id: linha.id,
    nome: linha.nome,
    serieId: linha.serieId,
    serieNome: linha.serie.nome,
    rotulo: rotuloDeTurma(linha.serie.nome, linha.nome),
  };
}

const COM_SERIE = { include: { serie: { select: { nome: true } } } } as const;

/** Todas as turmas, na ordem das séries. Uso do administrador. */
export async function listarTodasTurmas(): Promise<Turma[]> {
  const linhas = await banco().turma.findMany({
    orderBy: [{ serie: { ordem: "asc" } }, { nome: "asc" }],
    ...COM_SERIE,
  });
  return linhas.map(paraTurma);
}

/** Turmas atribuídas a um professor. */
export async function listarTurmasDoProfessor(professorId: string): Promise<Turma[]> {
  const linhas = await banco().turma.findMany({
    where: { atribuicoes: { some: { professorId } } },
    orderBy: [{ serie: { ordem: "asc" } }, { nome: "asc" }],
    ...COM_SERIE,
  });
  return linhas.map(paraTurma);
}

/** Escopo de turmas visível para a identidade: as próprias turmas e as
 * origens referenciadas pelos alunos delas (para a grade Originais). */
export interface EscopoTurmas {
  turmas: Turma[];
  origens: Turma[];
}

/** Turmas visíveis para a identidade: todas para admin, atribuídas
 * para professor, mais as origens referenciadas pelos alunos. */
export async function escopoDeTurmas(identidade: Identidade): Promise<EscopoTurmas> {
  if (identidade.papel === "ADMIN") {
    const todas = await listarTodasTurmas();
    return { turmas: todas, origens: todas };
  }
  const turmas = await listarTurmasDoProfessor(identidade.id);
  const idsDeTurma = turmas.map((turma) => turma.id);
  const origensReferenciadas = await banco().aluno.findMany({
    where: { turmaId: { in: idsDeTurma } },
    select: { turmaOriginalId: true },
    distinct: ["turmaOriginalId"],
  });
  const idsDeOrigem = origensReferenciadas.map((aluno) => aluno.turmaOriginalId);
  const faltantes = idsDeOrigem.filter((id) => !idsDeTurma.includes(id));
  let origens = turmas;
  if (faltantes.length > 0) {
    const extras = await banco().turma.findMany({
      where: { id: { in: faltantes } },
      orderBy: [{ serie: { ordem: "asc" } }, { nome: "asc" }],
      ...COM_SERIE,
    });
    origens = [...turmas, ...extras.map(paraTurma)];
  }
  return { turmas, origens };
}

/** Cria uma turma em uma série. */
export async function criarTurma(admin: { id: string }, entrada: unknown): Promise<Turma> {
  const dados = esquemaCriarTurma.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const serie = await banco().serie.findUnique({ where: { id: dados.data.serieId } });
  if (!serie) throw new ErroHttp("Série não encontrada.", 404);
  const duplicada = await banco().turma.findFirst({
    where: { serieId: dados.data.serieId, nome: dados.data.nome },
  });
  if (duplicada) {
    throw new ErroHttp(`Já existe a turma ${rotuloDeTurma(serie.nome, dados.data.nome)}.`, 409);
  }
  const linha = await comTransacao(async (tx) => {
    const criada = await tx.turma.create({
      data: { serieId: dados.data.serieId, nome: dados.data.nome },
      ...COM_SERIE,
    });
    await auditar(tx, admin.id, "turma.criar", paraTurma(criada).rotulo);
    return criada;
  });
  return paraTurma(linha);
}

/** Atualiza nome ou série de uma turma. */
export async function atualizarTurma(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<Turma> {
  const dados = esquemaAtualizarTurma.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().turma.findUnique({ where: { id }, ...COM_SERIE });
  if (!existente) throw new ErroHttp("Turma não encontrada.", 404);

  const novaSerieId = dados.data.serieId ?? existente.serieId;
  const novoNome = dados.data.nome ?? existente.nome;
  if (novaSerieId !== existente.serieId) {
    const serie = await banco().serie.findUnique({ where: { id: novaSerieId } });
    if (!serie) throw new ErroHttp("Série não encontrada.", 404);
  }
  if (novaSerieId !== existente.serieId || novoNome !== existente.nome) {
    const duplicada = await banco().turma.findFirst({
      where: { serieId: novaSerieId, nome: novoNome },
    });
    if (duplicada && duplicada.id !== id) {
      const serie = await banco().serie.findUnique({ where: { id: novaSerieId } });
      throw new ErroHttp(`Já existe a turma ${rotuloDeTurma(serie?.nome ?? "", novoNome)}.`, 409);
    }
  }
  const linha = await comTransacao(async (tx) => {
    const atualizada = await tx.turma.update({
      where: { id },
      data: {
        ...(dados.data.nome !== undefined ? { nome: dados.data.nome } : {}),
        ...(dados.data.serieId !== undefined ? { serieId: dados.data.serieId } : {}),
      },
      ...COM_SERIE,
    });
    await auditar(tx, admin.id, "turma.atualizar", paraTurma(atualizada).rotulo);
    return atualizada;
  });
  return paraTurma(linha);
}

/**
 * Exclui uma turma sem alunos e sem frequências. Com histórico, o caminho
 * é preservar: a exclusão é barrada com mensagem orientando o que fazer.
 */
export async function removerTurma(admin: { id: string }, id: string): Promise<void> {
  const existente = await banco().turma.findUnique({
    where: { id },
    include: {
      serie: { select: { nome: true } },
      _count: { select: { alunos: true, frequencias: true } },
    },
  });
  if (!existente) throw new ErroHttp("Turma não encontrada.", 404);
  const { alunos, frequencias } = existente._count;
  if (alunos > 0 || frequencias > 0) {
    const partes: string[] = [];
    if (alunos > 0) partes.push(`${alunos} ${alunos === 1 ? "aluno" : "alunos"}`);
    if (frequencias > 0)
      partes.push(`${frequencias} ${frequencias === 1 ? "frequência" : "frequências"}`);
    throw new ErroHttp(
      `Esta turma ainda tem ${partes.join(" e ")}. Mova ou exclua antes de apagar a turma.`,
      409,
    );
  }
  await comTransacao(async (tx) => {
    await tx.atribuicao.deleteMany({ where: { turmaId: id } });
    await tx.turma.delete({ where: { id } });
    await auditar(tx, admin.id, "turma.excluir", paraTurma(existente).rotulo);
  });
}

/** Confere se o professor pode registrar frequência na turma. */
export async function podeRegistrarFrequencia(
  identidade: Identidade,
  turmaId: string,
): Promise<boolean> {
  if (identidade.papel === "ADMIN") return true;
  const atribuicao = await banco().atribuicao.findUnique({
    where: { professorId_turmaId: { professorId: identidade.id, turmaId } },
  });
  return atribuicao !== null;
}
