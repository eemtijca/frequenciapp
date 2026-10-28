// Trilha de auditoria: registra quem fez o quê, sem dados de alunos, sempre
// na mesma transação da ação auditada.
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

/** Registra várias linhas de uma mesma ação, numa única instrução. */
export async function auditarVarios(
  tx: Cliente,
  usuarioId: string | null,
  acao: string,
  alvos: readonly string[],
): Promise<void> {
  if (alvos.length === 0) return;
  await tx.auditoria
    .createMany({ data: alvos.map((alvo) => ({ usuarioId, acao, alvo })) })
    .catch(() => undefined);
}
