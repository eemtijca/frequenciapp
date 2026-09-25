// Aulas da turma: gestão pela administração e leitura pela coordenação.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ehHoraValida, rotuloDeTurma, type Horario } from "@/domain/frequencia";

const horarioBase = z.object({
  ordem: z
    .number()
    .int("A ordem deve ser um número inteiro.")
    .min(1, "A ordem deve ser ao menos 1.")
    .max(99, "A ordem deve ser no máximo 99."),
  inicio: z.string().refine(ehHoraValida, "Horário de início inválido."),
  fim: z.string().refine(ehHoraValida, "Horário de fim inválido."),
  diasSemana: z
    .array(z.number().int().min(1, "Dia inválido.").max(7, "Dia inválido."))
    .min(1, "Escolha ao menos um dia da semana.")
    .refine((dias) => new Set(dias).size === dias.length, "Há dias repetidos na lista."),
  ativo: z.boolean().default(true),
});

export const esquemaCriarHorario = horarioBase.extend({
  turmaId: z.string().uuid("Turma inválida."),
});

export const esquemaAtualizarHorario = horarioBase
  .partial()
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaHorario {
  id: string;
  turmaId: string;
  ordem: number;
  inicio: string;
  fim: string;
  diasSemana: number[];
  ativo: boolean;
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

async function rotuloDaTurma(turmaId: string): Promise<string> {
  const turma = await banco().turma.findUnique({
    where: { id: turmaId },
    include: { serie: { select: { nome: true } } },
  });
  return turma ? rotuloDeTurma(turma.serie.nome, turma.nome) : turmaId;
}

/** Aulas de uma turma, na ordem de exibição. */
export async function listarHorariosDaTurma(turmaId: string): Promise<Horario[]> {
  const linhas = await banco().horario.findMany({
    where: { turmaId },
    orderBy: { ordem: "asc" },
  });
  return linhas.map(paraHorario);
}

/** Cria uma aula em uma turma. */
export async function criarHorario(admin: { id: string }, entrada: unknown): Promise<Horario> {
  const dados = esquemaCriarHorario.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.inicio >= dados.data.fim) {
    throw new ErroHttp("O horário de fim deve ser posterior ao de início.", 400);
  }
  const turma = await banco().turma.findUnique({ where: { id: dados.data.turmaId } });
  if (!turma) throw new ErroHttp("Turma não encontrada.", 404);
  const repetida = await banco().horario.findFirst({
    where: { turmaId: dados.data.turmaId, ordem: dados.data.ordem },
  });
  if (repetida) throw new ErroHttp("Já existe uma aula com esta ordem nesta turma.", 409);

  const linha = await comTransacao(async (tx) => {
    const criada = await tx.horario.create({
      data: {
        turmaId: dados.data.turmaId,
        ordem: dados.data.ordem,
        inicio: dados.data.inicio,
        fim: dados.data.fim,
        diasSemana: dados.data.diasSemana,
        ativo: dados.data.ativo,
      },
    });
    await auditar(
      tx,
      admin.id,
      "horario.criar",
      `aula ${criada.ordem} de ${await rotuloDaTurma(dados.data.turmaId)}`,
    );
    return criada;
  });
  return paraHorario(linha);
}

/** Atualiza uma aula: janela, ordem, dias e situação. */
export async function atualizarHorario(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<Horario> {
  const dados = esquemaAtualizarHorario.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().horario.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Aula não encontrada.", 404);

  const inicio = dados.data.inicio ?? existente.inicio;
  const fim = dados.data.fim ?? existente.fim;
  if (inicio >= fim) {
    throw new ErroHttp("O horário de fim deve ser posterior ao de início.", 400);
  }
  if (dados.data.ordem !== undefined && dados.data.ordem !== existente.ordem) {
    const repetida = await banco().horario.findFirst({
      where: { turmaId: existente.turmaId, ordem: dados.data.ordem },
    });
    if (repetida) throw new ErroHttp("Já existe uma aula com esta ordem nesta turma.", 409);
  }

  const linha = await comTransacao(async (tx) => {
    const atualizada = await tx.horario.update({
      where: { id },
      data: {
        ...(dados.data.ordem !== undefined ? { ordem: dados.data.ordem } : {}),
        ...(dados.data.inicio !== undefined ? { inicio: dados.data.inicio } : {}),
        ...(dados.data.fim !== undefined ? { fim: dados.data.fim } : {}),
        ...(dados.data.diasSemana !== undefined ? { diasSemana: dados.data.diasSemana } : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
      },
    });
    await auditar(
      tx,
      admin.id,
      "horario.atualizar",
      `aula ${atualizada.ordem} de ${await rotuloDaTurma(existente.turmaId)}`,
    );
    return atualizada;
  });
  return paraHorario(linha);
}

/**
 * Exclui uma aula sem faltas registradas. Com histórico, o caminho é
 * desativar: a exclusão é barrada com mensagem orientando.
 */
export async function removerHorario(admin: { id: string }, id: string): Promise<void> {
  const existente = await banco().horario.findUnique({
    where: { id },
    include: { _count: { select: { faltas: true } } },
  });
  if (!existente) throw new ErroHttp("Aula não encontrada.", 404);
  if (existente._count.faltas > 0) {
    throw new ErroHttp(
      "Esta aula já tem faltas registradas e não pode ser excluída. Desative-a para retirá-la das próximas chamadas.",
      409,
    );
  }
  const rotulo = await rotuloDaTurma(existente.turmaId);
  await comTransacao(async (tx) => {
    await tx.horario.delete({ where: { id } });
    await auditar(tx, admin.id, "horario.excluir", `aula ${existente.ordem} de ${rotulo}`);
  });
}
