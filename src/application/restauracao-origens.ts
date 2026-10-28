// Devolve os alunos remanejados de uma série às turmas de origem, numa única transação.
import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";
import { conferirPrevia, planejarRestauracaoOrigens } from "@/domain/restauracao-origens";
import { objetoDoBanco } from "@/infra/banco";
import { auditar, auditarVarios } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";

const id = z.string().uuid();

const esquema = z
  .object({
    serieId: z.string().uuid("Série inválida."),
    // A prévia conferida, aluno por aluno: qualquer diferença exige nova conferência.
    previa: z
      .array(z.object({ id, turmaId: id, turmaOriginalId: id }).strict())
      .min(1)
      .max(1000),
    confirmar: z.literal(true),
  })
  .strict();

export interface ResultadoDaRestauracao {
  alunos: number;
  turmas: number;
  jaAplicado: boolean;
}

export async function restaurarTurmasDeOrigem(
  admin: { id: string },
  entrada: unknown,
): Promise<ResultadoDaRestauracao> {
  const dados = esquema.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira a série e confirme a restauração.", 400);
  return comTransacao(async (tx) => {
    // Primeira instrução: LOCK TABLE não abre o snapshot. Quem grava alunos espera
    // a restauração, e a restauração lê o que já foi gravado antes dela.
    await tx.$executeRaw`LOCK TABLE ${objetoDoBanco("alunos")} IN SHARE ROW EXCLUSIVE MODE`;
    const serie = await tx.serie.findUnique({
      where: { id: dados.data.serieId },
      select: { turmas: { select: { id: true } } },
    });
    if (!serie) throw new ErroHttp("Série não encontrada.", 404);
    const turmasDaSerie = new Set(serie.turmas.map((turma) => turma.id));
    const alunos = await tx.aluno.findMany({
      select: {
        id: true,
        nome: true,
        turmaId: true,
        turmaOriginalId: true,
        ordem: true,
        ativo: true,
      },
    });
    const conferencia = conferirPrevia(alunos, turmasDaSerie, dados.data.previa);
    if (conferencia === "aplicada") return { alunos: 0, turmas: 0, jaAplicado: true };
    if (conferencia === "divergente") {
      throw new ErroHttp("A relação de alunos mudou desde a conferência. Confira de novo.", 409);
    }
    const plano = planejarRestauracaoOrigens(alunos, turmasDaSerie);
    // Dois UPDATEs em lote: a turma dos alunos que voltam e a numeração das turmas afetadas.
    await tx.$executeRaw`
      UPDATE ${objetoDoBanco("alunos")} AS aluno
      SET turma_id = destino.turma_id
      FROM jsonb_to_recordset(${JSON.stringify(
        plano.movidos.map((item) => ({ id: item.id, turma_id: item.para })),
      )}::jsonb) AS destino(id uuid, turma_id uuid)
      WHERE aluno.id = destino.id
    `;
    if (plano.ordens.length > 0) {
      await tx.$executeRaw`
        UPDATE ${objetoDoBanco("alunos")} AS aluno
        SET ordem = nova.ordem
        FROM jsonb_to_recordset(${JSON.stringify(
          plano.ordens.map(({ id: aluno, ordem }) => ({ id: aluno, ordem })),
        )}::jsonb) AS nova(id uuid, ordem integer)
        WHERE aluno.id = nova.id
      `;
    }
    await conferirResultado(tx, [...turmasDaSerie], plano.turmas);
    await auditar(
      tx,
      admin.id,
      "aluno.restaurar_origens",
      `serie:${dados.data.serieId}:alunos:${plano.movidos.length}:turmas:${plano.turmas.length}`,
    );
    // Uma linha por aluno, só com identificadores: turma de antes e de depois e a numeração.
    const ordens = new Map(plano.ordens.map((item) => [item.id, item]));
    const movidos = new Map(plano.movidos.map((item) => [item.id, item]));
    const atingidos = [...new Set([...movidos.keys(), ...ordens.keys()])];
    await auditarVarios(
      tx,
      admin.id,
      "aluno.restaurar_origem",
      atingidos.map((aluno) => {
        const movido = movidos.get(aluno);
        const ordem = ordens.get(aluno);
        return [
          `aluno:${aluno}`,
          ...(movido ? [`de:${movido.de}`, `para:${movido.para}`] : []),
          ...(ordem ? [`ordem:${ordem.antes}:${ordem.ordem}`] : []),
        ].join(":");
      }),
    );
    return { alunos: plano.movidos.length, turmas: plano.turmas.length, jaAplicado: false };
  });
}

/**
 * Confere o resultado antes do commit: ninguém da série fora da origem e nenhuma
 * numeração repetida nas turmas afetadas. Um erro de raciocínio desfaz tudo.
 */
async function conferirResultado(
  tx: Prisma.TransactionClient,
  turmasDaSerie: string[],
  afetadas: string[],
): Promise<void> {
  const [fora] = await tx.$queryRaw<{ total: bigint }[]>`
    SELECT count(*) AS total FROM ${objetoDoBanco("alunos")}
    WHERE turma_id <> turma_original_id
      AND turma_id = ANY(${turmasDaSerie}::uuid[])
      AND turma_original_id = ANY(${turmasDaSerie}::uuid[])
  `;
  const repetidas = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM ${objetoDoBanco("alunos")}
    WHERE turma_id = ANY(${afetadas}::uuid[])
    GROUP BY turma_id, ordem
    HAVING count(*) > 1
    LIMIT 1
  `;
  if (Number(fora?.total ?? 0) > 0 || repetidas.length > 0) {
    throw new ErroHttp("Não foi possível restaurar as turmas de origem. Nada foi alterado.", 500);
  }
}
