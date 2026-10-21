// Ordem das turmas no almoço: leitura por qualquer sessão e definição do dia pela administração, com auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import {
  DIAS_ORDEM_ALMOCO,
  ehDiaOrdemAlmoco,
  itensEmOrdem,
  LIMITE_TURMAS_ORDEM_ALMOCO,
  problemaNaOrdemAlmoco,
  type OrdemAlmocoDoDia,
} from "@/domain/ordem-almoco";
import { DIAS_DA_SEMANA } from "@/domain/horarios-semanais";

export const esquemaOrdemAlmoco = z.object({
  itens: z
    .array(
      z.object({
        turmaId: z.uuid("Turma inválida."),
        inicio: z.string().trim().nullish(),
      }),
      "Informe a lista de turmas.",
    )
    .max(LIMITE_TURMAS_ORDEM_ALMOCO, "Lista de turmas grande demais."),
});

/** Ordem de segunda a sábado; dias sem definição vêm com a lista vazia. */
export async function lerOrdemAlmoco(): Promise<OrdemAlmocoDoDia[]> {
  const linhas = await banco().ordemAlmoco.findMany({
    select: { diaSemana: true, turmaId: true, posicao: true, inicio: true },
    orderBy: [{ diaSemana: "asc" }, { posicao: "asc" }],
  });
  return DIAS_ORDEM_ALMOCO.map((diaSemana) => ({
    diaSemana,
    itens: itensEmOrdem(
      linhas
        .filter((linha) => linha.diaSemana === diaSemana)
        .map(({ turmaId, posicao, inicio }) => ({ turmaId, posicao, inicio })),
    ),
  }));
}

/** Substitui a ordem de um dia inteiro. Lista vazia limpa o dia. */
export async function definirOrdemAlmoco(
  admin: { id: string },
  diaSemana: number,
  entrada: unknown,
): Promise<OrdemAlmocoDoDia> {
  if (!ehDiaOrdemAlmoco(diaSemana)) {
    throw new ErroHttp("Informe um dia da semana de segunda a sábado.", 400);
  }
  const dados = esquemaOrdemAlmoco.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const itens = dados.data.itens.map((item) => ({
    turmaId: item.turmaId,
    inicio: item.inicio ? item.inicio : null,
  }));
  const problema = problemaNaOrdemAlmoco(itens);
  if (problema) throw new ErroHttp(problema, 400);
  const rotulo = DIAS_DA_SEMANA.find((dia) => dia.valor === diaSemana)?.rotulo ?? "dia";

  return comTransacao(async (tx) => {
    const existentes = await tx.turma.count({
      where: { id: { in: itens.map((item) => item.turmaId) } },
    });
    if (existentes !== itens.length) throw new ErroHttp("Turma não encontrada.", 404);
    await tx.ordemAlmoco.deleteMany({ where: { diaSemana } });
    if (itens.length > 0) {
      await tx.ordemAlmoco.createMany({
        data: itens.map((item, indice) => ({
          diaSemana,
          turmaId: item.turmaId,
          posicao: indice + 1,
          inicio: item.inicio,
        })),
      });
    }
    await auditar(
      tx,
      admin.id,
      "ordem-almoco.definir",
      `${rotulo} (${itens.length} ${itens.length === 1 ? "turma" : "turmas"})`,
    );
    return {
      diaSemana,
      itens: itens.map((item, indice) => ({ ...item, posicao: indice + 1 })),
    };
  });
}
