// Turmas: gestão completa pela administração e listagem para toda a
// coordenação. Toda turma nasce com uma aula padrão que cobre o dia.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { rotuloDeTurma } from "@/domain/frequencia";
import type { Horario, Turma } from "@/domain/frequencia";

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

/** Aula padrão de uma turma nova: cobre o dia inteiro, todos os dias. */
export const AULA_PADRAO: {
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
} = {
  ordem: 1,
  inicio: "00:00",
  fim: "23:59",
  diasSemana: [1, 2, 3, 4, 5, 6, 7],
};

interface LinhaHorario {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
}

interface LinhaTurma {
  id: string;
  nome: string;
  serieId: string;
  serie: { nome: string };
  horarios: LinhaHorario[];
}

function paraHorario(linha: LinhaHorario): Horario {
  return {
    id: linha.id,
    turmaId: linha.turmaId,
    ordem: linha.ordem,
    inicio: linha.inicio,
    fim: linha.fim,
    diasSemana: linha.diasSemana,
    ativo: linha.ativo,
  };
}

function paraTurma(linha: LinhaTurma): Turma {
  return {
    id: linha.id,
    nome: linha.nome,
    serieId: linha.serieId,
    serieNome: linha.serie.nome,
    rotulo: rotuloDeTurma(linha.serie.nome, linha.nome),
    horarios: linha.horarios.map(paraHorario),
  };
}

const COM_SERIE_E_HORARIOS = {
  include: {
    serie: { select: { nome: true } },
    horarios: { orderBy: { ordem: "asc" } },
  },
} as const;

/** Todas as turmas, na ordem das séries. */
export async function listarTodasTurmas(): Promise<Turma[]> {
  const linhas = await banco().turma.findMany({
    orderBy: [{ serie: { ordem: "asc" } }, { nome: "asc" }],
    ...COM_SERIE_E_HORARIOS,
  });
  return linhas.map(paraTurma);
}

/** Cria uma turma em uma série e a aula padrão que cobre o dia inteiro. */
export async function criarTurma(admin: { id: string }, entrada: unknown): Promise<Turma> {
  const dados = esquemaCriarTurma.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const serie = await banco().serie.findUnique({ where: { id: dados.data.serieId } });
  if (!serie) throw new ErroHttp("Série não encontrada.", 404);
  const duplicada = await banco().turma.findFirst({
    where: { serieId: dados.data.serieId, nome: { equals: dados.data.nome, mode: "insensitive" } },
  });
  if (duplicada) {
    throw new ErroHttp(`Já existe a turma ${rotuloDeTurma(serie.nome, dados.data.nome)}.`, 409);
  }
  const linha = await comTransacao(async (tx) => {
    const criada = await tx.turma.create({
      data: {
        serieId: dados.data.serieId,
        nome: dados.data.nome,
        horarios: { create: { ...AULA_PADRAO } },
      },
      ...COM_SERIE_E_HORARIOS,
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
  const existente = await banco().turma.findUnique({ where: { id }, ...COM_SERIE_E_HORARIOS });
  if (!existente) throw new ErroHttp("Turma não encontrada.", 404);

  const novaSerieId = dados.data.serieId ?? existente.serieId;
  const novoNome = dados.data.nome ?? existente.nome;
  if (novaSerieId !== existente.serieId) {
    const serie = await banco().serie.findUnique({ where: { id: novaSerieId } });
    if (!serie) throw new ErroHttp("Série não encontrada.", 404);
  }
  if (novaSerieId !== existente.serieId || novoNome !== existente.nome) {
    const duplicada = await banco().turma.findFirst({
      where: { serieId: novaSerieId, nome: { equals: novoNome, mode: "insensitive" } },
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
      ...COM_SERIE_E_HORARIOS,
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
    await tx.turma.delete({ where: { id } });
    await auditar(
      tx,
      admin.id,
      "turma.excluir",
      rotuloDeTurma(existente.serie.nome, existente.nome),
    );
  });
}
