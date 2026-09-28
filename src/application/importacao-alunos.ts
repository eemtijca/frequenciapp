// Importação da relação de alunos em CSV: prévia do que muda e aplicação em uma
// transação, mantendo o id de cada aluno para o histórico acompanhar.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao, type Transacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import {
  lerRelacaoCsv,
  planejarImportacao,
  type PlanoDeImportacao,
} from "@/domain/importacao-alunos";
import { rotuloDeTurma } from "@/domain/frequencia";

export const esquemaImportacao = z.object({
  csv: z
    .string()
    .trim()
    .min(1, "Escolha ou cole a relação em CSV.")
    .max(500_000, "Arquivo grande demais. Importe as turmas em partes."),
  aplicar: z.boolean().optional(),
});

/** Resultado para a interface: o plano e, depois de aplicar, as contagens. */
export interface ResultadoImportacao {
  plano: PlanoDeImportacao;
  aplicado: { criados: number; atualizados: number; desativados: number } | null;
}

async function planejar(
  cliente: Parameters<Transacao<unknown>>[0],
  csv: string,
): Promise<PlanoDeImportacao> {
  const [turmas, alunos] = await Promise.all([
    cliente.turma.findMany({ select: { id: true, nome: true, serie: { select: { nome: true } } } }),
    cliente.aluno.findMany({
      select: {
        id: true,
        nome: true,
        turmaId: true,
        turmaOriginalId: true,
        ordem: true,
        ativo: true,
      },
    }),
  ]);
  return planejarImportacao(
    lerRelacaoCsv(csv),
    turmas.map((turma) => ({ id: turma.id, rotulo: rotuloDeTurma(turma.serie.nome, turma.nome) })),
    alunos,
  );
}

/**
 * Sem `aplicar`, devolve só a prévia. Com `aplicar`, refaz o plano dentro da
 * transação serializável e grava: turma atual, turma original e ordem de cada
 * aluno, os novos no fim, e desativa, sem excluir, quem saiu das turmas.
 */
export async function importarRelacoes(
  admin: { id: string },
  entrada: unknown,
): Promise<ResultadoImportacao> {
  const dados = esquemaImportacao.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const csv = dados.data.csv;
  if (!dados.data.aplicar) return { plano: await planejar(banco(), csv), aplicado: null };

  return comTransacao(async (tx) => {
    // O plano é refeito com o cadastro lido na própria transação.
    const plano = await planejar(tx, csv);
    if (plano.bloqueios.length > 0) {
      throw new ErroHttp("Corrija os pontos indicados na prévia antes de aplicar.", 400);
    }
    let criados = 0;
    let atualizados = 0;
    for (const item of plano.itens) {
      if (item.alunoId === null) {
        await tx.aluno.create({
          data: {
            nome: item.nome,
            turmaId: item.turmaId,
            turmaOriginalId: item.turmaOriginalId,
            ordem: item.ordem,
          },
        });
        criados += 1;
      } else if (item.mudancas.length > 0) {
        await tx.aluno.update({
          where: { id: item.alunoId },
          data: {
            turmaId: item.turmaId,
            turmaOriginalId: item.turmaOriginalId,
            ordem: item.ordem,
            ativo: true,
          },
        });
        atualizados += 1;
      }
    }
    const desativados = plano.desativar.length
      ? (
          await tx.aluno.updateMany({
            where: { id: { in: plano.desativar.map((aluno) => aluno.alunoId) } },
            data: { ativo: false },
          })
        ).count
      : 0;
    // A trilha não guarda nomes de alunos, só as contagens.
    await auditar(
      tx,
      admin.id,
      "alunos.importar",
      `${plano.turmas.length} turmas: ${criados} criados, ${atualizados} atualizados, ${desativados} desativados`,
    );
    return { plano, aplicado: { criados, atualizados, desativados } };
  });
}
