// Entradas atrasadas: validação, consulta e correção auditada sem alterar faltas.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import { diaLocal, ehDiaValido } from "@/domain/frequencia";
import { ehHorarioEntrada, type EntradaAtrasada } from "@/domain/entradas";
import type { Identidade } from "@/domain/usuarios";

export const esquemaCriarEntrada = z.object({
  alunoId: z.uuid("Aluno inválido."),
  dia: z.string().refine(ehDiaValido, "Data inválida."),
  horario: z.string().refine(ehHorarioEntrada, "Horário inválido. Informe hora e minuto."),
  motivo: z
    .string()
    .trim()
    .min(2, "Informe o motivo do atraso.")
    .max(200, "O motivo deve ter no máximo 200 caracteres."),
});

export const esquemaFiltroEntradas = z
  .object({
    de: z.string().refine(ehDiaValido, "Data inicial inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida."),
    turmaId: z.uuid("Turma inválida.").optional(),
  })
  .refine((dados) => dados.ate >= dados.de, "A data final deve ser igual ou posterior à inicial.");

export async function listarEntradas(
  filtros: z.infer<typeof esquemaFiltroEntradas>,
): Promise<EntradaAtrasada[]> {
  const linhas = await banco().entradaAtrasada.findMany({
    where: {
      dia: { gte: new Date(`${filtros.de}T12:00:00Z`), lte: new Date(`${filtros.ate}T12:00:00Z`) },
      ...(filtros.turmaId ? { turmaId: filtros.turmaId } : {}),
    },
    select: {
      id: true,
      alunoId: true,
      turmaId: true,
      turmaRotulo: true,
      dia: true,
      horario: true,
      motivo: true,
      registradoPorNome: true,
      criadoEm: true,
      aluno: { select: { nome: true } },
    },
    orderBy: [{ dia: "asc" }, { horario: "asc" }, { id: "asc" }],
  });
  return linhas.map(({ aluno, ...linha }) => ({
    ...linha,
    nome: aluno.nome,
    dia: linha.dia.toISOString().slice(0, 10),
    criadoEm: linha.criadoEm.toISOString(),
  }));
}

export async function criarEntrada(identidade: Identidade, entrada: unknown): Promise<void> {
  const dados = esquemaCriarEntrada.safeParse(entrada);
  if (!dados.success) throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  if (dados.data.dia > diaLocal(new Date(), ambiente.fuso))
    throw new ErroHttp("Não é possível registrar entrada em dia futuro.", 400);
  try {
    await comTransacao(async (tx) => {
      const aluno = await tx.aluno.findUnique({
        where: { id: dados.data.alunoId },
        include: { turma: { include: { serie: true } } },
      });
      if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
      if (
        !aluno.ativo ||
        (aluno.desistenteEm && aluno.desistenteEm.toISOString().slice(0, 10) <= dados.data.dia)
      )
        throw new ErroHttp("Este aluno está desativado ou desistente nesta data.", 409);
      const criada = await tx.entradaAtrasada.create({
        data: {
          ...dados.data,
          dia: new Date(`${dados.data.dia}T12:00:00Z`),
          turmaId: aluno.turmaId,
          turmaRotulo: `${aluno.turma.serie.nome} ${aluno.turma.nome}`,
          registradoPorNome: identidade.nome,
          criadoPorId: identidade.id,
        },
      });
      await auditar(tx, identidade.id, "entrada.criar", `entrada:${criada.id}`);
    });
  } catch (erro) {
    if (ehDuplicidade(erro))
      throw new ErroHttp(
        "Este aluno já tem uma entrada nesta data. Remova o registro anterior para corrigir.",
        409,
      );
    throw erro;
  }
}

export async function removerEntrada(identidade: Identidade, id: string): Promise<void> {
  await comTransacao(async (tx) => {
    if (!(await tx.entradaAtrasada.findUnique({ where: { id } })))
      throw new ErroHttp("Entrada não encontrada.", 404);
    await tx.entradaAtrasada.delete({ where: { id } });
    await auditar(tx, identidade.id, "entrada.remover", `entrada:${id}`);
  });
}
