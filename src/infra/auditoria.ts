// Trilha de auditoria: registra quem fez o quê, sem dados pessoais de
// alunos. Chamada sempre dentro da mesma transação da ação auditada:
// ou a ação e o registro acontecem juntos, ou nada acontece.
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";

type Cliente = Prisma.TransactionClient | ReturnType<typeof banco>;

/** Registra uma ação administrativa na trilha de auditoria. */
export async function auditar(
  tx: Cliente,
  usuarioId: string | null,
  acao: string,
  alvo: string,
): Promise<void> {
  await tx.auditoria.create({ data: { usuarioId, acao, alvo } }).catch(() => undefined);
}
