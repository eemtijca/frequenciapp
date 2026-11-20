// Horário das provas bimestrais: leitura por qualquer sessão e cadastro temporário pela administração, com auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { diaLocal, rotuloDeTurma } from "@/domain/frequencia";
import {
  janelasSeSobrepoem,
  LIMITE_TURMAS_PROVA,
  problemaNaProva,
  type ProvaBimestral,
} from "@/domain/provas-bimestrais";

const esquemaNovaProva = z
  .object({
    turmaIds: z
      .array(z.uuid("Turma inválida."), "Escolha as turmas da prova.")
      .min(1, "Escolha ao menos uma turma.")
      .max(LIMITE_TURMAS_PROVA, `Escolha no máximo ${LIMITE_TURMAS_PROVA} turmas.`)
      .refine((ids) => new Set(ids).size === ids.length, "Há turmas repetidas na lista."),
    dia: z.string("Informe a data da prova."),
    inicio: z.string("Informe o horário de início."),
    fim: z.string("Informe o horário de fim."),
    disciplina: z.string("Informe a disciplina da prova."),
  })
  .strict();

const esquemaEncerrar = z.object({ confirmar: z.literal(true) }).strict();

function hoje(): string {
  return diaLocal(new Date(), ambiente.fuso);
}

function paraProva(linha: {
  id: string;
  turmaId: string;
  dia: Date;
  inicio: string;
  fim: string;
  disciplina: string;
}): ProvaBimestral {
  return {
    id: linha.id,
    turmaId: linha.turmaId,
    dia: linha.dia.toISOString().slice(0, 10),
    inicio: linha.inicio,
    fim: linha.fim,
    disciplina: linha.disciplina,
  };
}

/** Provas de hoje em diante, de todas as turmas, em ordem de data e de início. */
export async function listarProvasBimestrais(): Promise<ProvaBimestral[]> {
  const linhas = await banco().provaBimestral.findMany({
    where: { dia: { gte: new Date(`${hoje()}T12:00:00Z`) } },
    orderBy: [{ dia: "asc" }, { inicio: "asc" }, { disciplina: "asc" }],
  });
  return linhas.map(paraProva);
}

/**
 * Cadastra a mesma prova para várias turmas de uma vez. Recusa a turma que já tem outra
 * prova na mesma janela do dia e apaga, de passagem, as provas de datas passadas.
 */
export async function adicionarProvasBimestrais(
  admin: { id: string },
  entrada: unknown,
): Promise<ProvaBimestral[]> {
  const dados = esquemaNovaProva.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const dataDeHoje = hoje();
  const prova = { ...dados.data, disciplina: dados.data.disciplina.trim() };
  const problema = problemaNaProva(prova, dataDeHoje);
  if (problema) throw new ErroHttp(problema, 400);
  const dia = new Date(`${prova.dia}T12:00:00Z`);

  return comTransacao(async (tx) => {
    const turmas = await tx.turma.findMany({
      where: { id: { in: prova.turmaIds } },
      select: { id: true, nome: true, serie: { select: { nome: true } } },
    });
    if (turmas.length !== prova.turmaIds.length) throw new ErroHttp("Turma não encontrada.", 404);
    const rotulos = new Map(
      turmas.map((turma) => [turma.id, rotuloDeTurma(turma.serie.nome, turma.nome)]),
    );
    const doDia = await tx.provaBimestral.findMany({
      where: { turmaId: { in: prova.turmaIds }, dia },
      select: { turmaId: true, inicio: true, fim: true },
    });
    const conflito = doDia.find((existente) => janelasSeSobrepoem(existente, prova));
    if (conflito) {
      throw new ErroHttp(
        `${rotulos.get(conflito.turmaId) ?? "A turma"} já tem prova nesse horário. Confira o horário de provas.`,
        409,
      );
    }
    await tx.provaBimestral.deleteMany({
      where: { dia: { lt: new Date(`${dataDeHoje}T12:00:00Z`) } },
    });
    const criadas = await tx.provaBimestral.createManyAndReturn({
      data: prova.turmaIds.map((turmaId) => ({
        turmaId,
        dia,
        inicio: prova.inicio,
        fim: prova.fim,
        disciplina: prova.disciplina,
      })),
    });
    await auditar(
      tx,
      admin.id,
      "prova-bimestral.adicionar",
      `dia:${prova.dia}:turmas:${criadas.length}`,
    );
    return criadas.map(paraProva);
  });
}

/** Remove uma prova de uma turma. */
export async function removerProvaBimestral(admin: { id: string }, id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) throw new ErroHttp("Prova não encontrada.", 404);
  await comTransacao(async (tx) => {
    const removidas = await tx.provaBimestral.deleteMany({ where: { id } });
    if (removidas.count === 0) throw new ErroHttp("Prova não encontrada.", 404);
    await auditar(tx, admin.id, "prova-bimestral.remover", `prova:${id}`);
  });
}

/** Encerra o período de provas: apaga o horário de provas de todas as turmas. */
export async function encerrarProvasBimestrais(
  admin: { id: string },
  entrada: unknown,
): Promise<{ removidas: number }> {
  if (!esquemaEncerrar.safeParse(entrada).success) {
    throw new ErroHttp("Confirme o encerramento do período de provas.", 400);
  }
  return comTransacao(async (tx) => {
    const { count } = await tx.provaBimestral.deleteMany({});
    await auditar(tx, admin.id, "prova-bimestral.encerrar", `provas:${count}`);
    return { removidas: count };
  });
}
