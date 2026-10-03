// Confirma o lançamento manual de um aluno na Seduc sem alterar a chamada,
// protegendo a revisão da frequência e a confirmação contra concorrência.
import { z } from "zod";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ehDiaValido, type ConfirmacaoSeducAluno } from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const esquema = z
  .object({
    dia: z.string().refine(ehDiaValido, "Data inválida."),
    turmaId: z.uuid("Turma inválida."),
    alunoId: z.uuid("Aluno inválido."),
    registrado: z.boolean(),
    revisao: z.number().int().min(1).max(999999),
    revisaoSeduc: z.number().int().min(0).max(999999),
  })
  .strict();

export async function confirmarSeducChamada(
  identidade: Identidade,
  entrada: unknown,
): Promise<ConfirmacaoSeducAluno> {
  const dados = esquema.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira a confirmação e salve a chamada primeiro.", 400);
  const { dia, turmaId, alunoId, registrado, revisao, revisaoSeduc } = dados.data;
  const registro = await comTransacao(async (tx) => {
    const chamada = await tx.frequencia.findUnique({
      where: { turmaId_dia: { turmaId, dia: new Date(`${dia}T12:00:00Z`) } },
      select: { id: true, revisao: true },
    });
    if (!chamada) throw new ErroHttp("Salve a chamada antes de confirmar na Seduc.", 409);
    if (chamada.revisao !== revisao)
      throw new ErroHttp("A chamada mudou. Recarregue e confira antes de confirmar na Seduc.", 409);
    const where = { frequenciaId_alunoId: { frequenciaId: chamada.id, alunoId } };
    const aluno = await tx.alunoDaChamada.findUnique({ where });
    if (!aluno) throw new ErroHttp("O aluno não faz parte desta chamada salva.", 400);
    if (aluno.revisaoSeduc !== revisaoSeduc)
      throw new ErroHttp(
        "A confirmação mudou. Recarregue a chamada antes de marcar novamente.",
        409,
      );
    if (aluno.registradoSeduc === registrado) return aluno;
    const confirmado = await tx.alunoDaChamada.update({
      where,
      data: {
        registradoSeduc: registrado,
        registradoSeducEm: registrado ? new Date() : null,
        registradoSeducPorId: registrado ? identidade.id : null,
        registradoSeducPorNome: registrado ? identidade.nome : null,
        revisaoSeduc: { increment: 1 },
      },
    });
    await auditar(
      tx,
      identidade.id,
      registrado ? "chamada.confirmarSeduc" : "chamada.reabrirSeduc",
      `chamada:${chamada.id}:aluno:${alunoId}`,
    );
    return confirmado;
  });
  return {
    alunoId: registro.alunoId,
    registradoSeduc: registro.registradoSeduc,
    registradoSeducEm: registro.registradoSeducEm?.toISOString() ?? null,
    registradoSeducPorNome: registro.registradoSeducPorNome,
    revisaoSeduc: registro.revisaoSeduc,
  };
}
