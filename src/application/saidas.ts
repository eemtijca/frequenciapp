// Saídas antecipadas: registro separado da chamada, com momento,
// justificativa e responsável pela liberação (direção ou coordenação).
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import {
  diaLocal,
  ehDiaValido,
  ehMomentoValido,
  JUSTIFICATIVA_OUTROS,
  type SaidaAntecipada,
} from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const justificativaSaida = z
  .string()
  .trim()
  .min(1, "Informe a justificativa.")
  .max(10, "Justificativa inválida.");

export const esquemaCriarSaida = z.object({
  alunoId: z.string().uuid("Aluno inválido."),
  dia: z.string().refine(ehDiaValido, "Data inválida."),
  momento: z
    .string()
    .trim()
    .max(20, "Momento da saída inválido.")
    .refine((codigo) => ehMomentoValido(codigo), "Momento da saída inválido."),
  justificativa: justificativaSaida,
  observacao: z
    .string()
    .trim()
    .max(200, "A observação deve ter no máximo 200 caracteres.")
    .nullish(),
  liberadoPorId: z.string().uuid("Responsável pela liberação inválido.").nullish(),
});

export interface FiltrosSaidas {
  dia?: string;
  de?: string;
  ate?: string;
  alunoId?: string;
  turmaId?: string;
}

interface LinhaSaida {
  id: string;
  alunoId: string;
  dia: Date;
  momento: string;
  justificativa: string;
  observacao: string | null;
  liberadoPorId: string | null;
  criadoEm: Date;
  liberadoPor: { nome: string } | null;
}

function paraSaida(linha: LinhaSaida): SaidaAntecipada {
  return {
    id: linha.id,
    alunoId: linha.alunoId,
    dia: linha.dia.toISOString().slice(0, 10),
    momento: linha.momento,
    justificativa: linha.justificativa,
    observacao: linha.observacao,
    liberadoPorId: linha.liberadoPorId,
    liberadoPorNome: linha.liberadoPor?.nome ?? null,
    criadoEm: linha.criadoEm.toISOString(),
  };
}

const COMPLEMENTO = { include: { liberadoPor: { select: { nome: true } } } } as const;

/** Saídas por dia, período, aluno ou turma, em ordem cronológica. */
export async function listarSaidas(filtros: FiltrosSaidas = {}): Promise<SaidaAntecipada[]> {
  const linhas = await banco().saidaAntecipada.findMany({
    where: {
      ...(filtros.dia ? { dia: new Date(`${filtros.dia}T12:00:00Z`) } : {}),
      ...(filtros.de ? { dia: { gte: new Date(`${filtros.de}T12:00:00Z`) } } : {}),
      ...(filtros.ate ? { dia: { lte: new Date(`${filtros.ate}T12:00:00Z`) } } : {}),
      ...(filtros.alunoId ? { alunoId: filtros.alunoId } : {}),
      ...(filtros.turmaId ? { aluno: { turmaId: filtros.turmaId } } : {}),
    },
    orderBy: [{ dia: "asc" }, { criadoEm: "asc" }],
    ...COMPLEMENTO,
  });
  return linhas.map(paraSaida);
}

/**
 * Registra a saída de um aluno. O responsável padrão é quem está usando o
 * aplicativo; outra pessoa da equipe ativa pode ser escolhida. Uma saída
 * por aluno e dia, com remoção para correção.
 */
export async function criarSaida(
  identidade: Identidade,
  entrada: unknown,
): Promise<SaidaAntecipada> {
  const dados = esquemaCriarSaida.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const { alunoId, dia, momento, justificativa } = dados.data;
  if (dia > diaLocal(new Date(), ambiente.fuso)) {
    throw new ErroHttp("Não é possível registrar saída em dia futuro.", 400);
  }
  // O catálogo de justificativas vem do banco e pode ser editado na Gestão.
  const justificativaNoCatalogo = await banco().justificativa.findFirst({
    where: { codigo: justificativa },
    select: { id: true },
  });
  if (!justificativaNoCatalogo) {
    throw new ErroHttp(
      `A justificativa ${justificativa} não está no catálogo. Atualize a página e confira.`,
      400,
    );
  }
  const aluno = await banco().aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
  if (!aluno.ativo) {
    throw new ErroHttp(
      "Este aluno está desativado. Reative o cadastro antes de registrar a saída.",
      409,
    );
  }

  const liberadoPorId = dados.data.liberadoPorId ?? identidade.id;
  const responsavel = await banco().usuario.findFirst({
    where: {
      id: liberadoPorId,
      ativo: true,
      papel: { in: ["ADMIN", "COORDENACAO"] },
    },
    select: { id: true },
  });
  if (!responsavel) {
    throw new ErroHttp("Escolha um responsável pela liberação da equipe.", 400);
  }

  try {
    return await comTransacao(async (tx) => {
      const criada = await tx.saidaAntecipada.create({
        data: {
          alunoId,
          dia: new Date(`${dia}T12:00:00Z`),
          momento,
          justificativa,
          observacao:
            justificativa === JUSTIFICATIVA_OUTROS ? (dados.data.observacao ?? null) : null,
          liberadoPorId,
          criadoPorId: identidade.id,
        },
        ...COMPLEMENTO,
      });
      await auditar(tx, identidade.id, "saida.criar", `saida:${criada.id}`);
      return paraSaida(criada);
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp(
        "Este aluno já tem uma saída nesta data. Remova o registro anterior para corrigir.",
        409,
      );
    }
    throw erro;
  }
}

/** Remove uma saída para correção, com auditoria. */
export async function removerSaida(identidade: Identidade, id: string): Promise<void> {
  const existente = await banco().saidaAntecipada.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Saída não encontrada.", 404);
  await comTransacao(async (tx) => {
    await tx.saidaAntecipada.delete({ where: { id } });
    await auditar(tx, identidade.id, "saida.remover", `saida:${id}`);
  });
}
