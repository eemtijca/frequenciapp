// Reorganiza a numeração dos alunos de todas as turmas em uma única transação.
import { z } from "zod";
import { planejarOrdenacaoAlunos } from "@/domain/ordenacao-alunos";
import { objetoDoBanco } from "@/infra/banco";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";

const esquema = z.object({ confirmar: z.literal(true) }).strict();

export async function ordenarAlunosDasTurmas(admin: { id: string }, entrada: unknown) {
  if (!esquema.safeParse(entrada).success)
    throw new ErroHttp("Confirme a reorganização de todas as turmas.", 400);
  return comTransacao(async (tx) => {
    const alunos = await tx.aluno.findMany({
      select: { id: true, nome: true, turmaId: true, ordem: true, ativo: true },
    });
    const plano = planejarOrdenacaoAlunos(alunos);
    // Um único UPDATE evita chamadas por aluno e respeita o schema do ambiente.
    const atualizados = plano.mudancas.length
      ? await tx.$executeRaw`
      UPDATE ${objetoDoBanco("alunos")} AS aluno
      SET ordem = nova.ordem
      FROM jsonb_to_recordset(${JSON.stringify(plano.mudancas)}::jsonb)
        AS nova(id uuid, ordem integer)
      WHERE aluno.id = nova.id
    `
      : 0;
    await auditar(
      tx,
      admin.id,
      "turma.ordenar_alunos",
      `turmas:${plano.turmas}:alunos:${plano.alunos}:atualizados:${atualizados}`,
    );
    return { turmas: plano.turmas, alunos: plano.alunos, atualizados };
  });
}
