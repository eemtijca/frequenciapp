// Projeta saídas na conferência parcial e confirma somente as aulas que foram exibidas.
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { ehDomingo, horariosDaChamada, rotuloMomento } from "@/domain/frequencia";
import type { FrequenciaDaSaida } from "@/domain/frequencia-personalizada";
import { aulasConcluidasNaSaida } from "@/domain/saida-parcial";
import type { Identidade } from "@/domain/usuarios";
import { disciplinasDoHorario } from "@/domain/horarios-semanais";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";

export async function consultarSaidasParciais(
  tx: Prisma.TransactionClient,
  periodo: { gte: Date; lte: Date },
): Promise<FrequenciaDaSaida[]> {
  const saidas = await tx.saidaAntecipada.findMany({
    where: { dia: periodo },
    include: { aluno: { include: { turma: { include: { serie: true, horarios: true } } } } },
  });
  if (saidas.length === 0) return [];
  const chamadas = await tx.frequencia.findMany({
    where: { dia: periodo, alunos: { some: { alunoId: { in: saidas.map((s) => s.alunoId) } } } },
    include: {
      turma: { include: { serie: true, horarios: true } },
      aulas: { include: { horario: true } },
      alunos: { select: { alunoId: true } },
      faltas: { select: { alunoId: true, horarioId: true } },
    },
    orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
  });
  const feriados = new Set(
    (await tx.feriado.findMany({ where: { dia: periodo }, select: { dia: true } })).map((f) =>
      f.dia.toISOString().slice(0, 10),
    ),
  );
  return saidas.map((saida) => {
    const dia = saida.dia.toISOString().slice(0, 10);
    const chamada = chamadas.find(
      (c) =>
        c.dia.getTime() === saida.dia.getTime() &&
        c.alunos.some((a) => a.alunoId === saida.alunoId),
    );
    const turma = chamada?.turma ?? saida.aluno.turma;
    const grade = horariosDaChamada(
      turma.horarios.map((h) => ({ ...h, disciplinas: disciplinasDoHorario(h.disciplinas) })),
      dia,
      Boolean(chamada),
    );
    const aulas = chamada?.aulas.length ? chamada.aulas.map((a) => a.horario) : grade;
    const ausentes =
      chamada?.faltas.filter((f) => f.alunoId === saida.alunoId).map((f) => f.horarioId) ?? [];
    const concluidas =
      feriados.has(dia) || ehDomingo(dia)
        ? null
        : aulasConcluidasNaSaida(saida.horario, aulas, ausentes);
    const turmaNome = `${turma.serie.nome} ${turma.nome}`;
    const observacao = [
      saida.horario ? `Saída às ${saida.horario}` : "Saída sem horário registrado",
      rotuloMomento(saida.momento),
      saida.texto ?? saida.observacao ?? saida.justificativa,
    ]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 300);
    const assinatura = createHash("sha256")
      .update(
        JSON.stringify({
          id: saida.id,
          alunoId: saida.alunoId,
          dia,
          turmaId: turma.id,
          alunoNome: saida.aluno.nome,
          turmaNome,
          horario: saida.horario,
          observacao,
          concluidas,
          aulas: aulas.map((a) => [a.id, a.ordem, a.inicio, a.fim]),
          ausentes: [...ausentes].sort(),
        }),
      )
      .digest("hex");
    const registradoSeduc =
      assinatura === saida.assinaturaSeduc && saida.registradoSeducEm !== null;
    return {
      tipo: "SAIDA",
      id: saida.id,
      alunoId: saida.alunoId,
      dia,
      turmaId: turma.id,
      alunoNome: saida.aluno.nome,
      turmaNome,
      horario: saida.horario,
      aulas: concluidas ?? [],
      aulasConferiveis: concluidas !== null,
      assinatura,
      observacao,
      registradoSeduc,
      registradoSeducEm: registradoSeduc ? (saida.registradoSeducEm?.toISOString() ?? null) : null,
      registradoSeducPorNome: registradoSeduc ? saida.registradoSeducPorNome : null,
      revisao: saida.revisaoSeduc,
      revisaoSeduc: saida.revisaoSeduc,
      criadoEm: saida.criadoEm.toISOString(),
      atualizadoEm: saida.registradoSeducEm?.toISOString() ?? saida.criadoEm.toISOString(),
    };
  });
}

export const esquemaBaseSaida = z
  .object({
    id: z.uuid("Saída inválida."),
    assinatura: z.string().regex(/^[a-f0-9]{64}$/, "Recarregue a saída antes de continuar."),
  })
  .strict();

/** Um ajuste manual exige nova conferência se a saída voltar a ser a base. */
export async function invalidarConfirmacaoSaida(
  tx: Prisma.TransactionClient,
  alunoId: string,
  dias: Date[],
): Promise<void> {
  await tx.saidaAntecipada.updateMany({
    where: { alunoId, dia: { in: dias }, assinaturaSeduc: { not: null } },
    data: {
      assinaturaSeduc: null,
      registradoSeducEm: null,
      registradoSeducPorNome: null,
      revisaoSeduc: { increment: 1 },
    },
  });
}

export async function conferirBaseSaida(
  tx: Prisma.TransactionClient,
  base: z.infer<typeof esquemaBaseSaida>,
): Promise<FrequenciaDaSaida> {
  const origem = await tx.saidaAntecipada.findUnique({
    where: { id: base.id },
    select: { dia: true },
  });
  if (!origem) throw new ErroHttp("A saída foi removida. Recarregue a lista.", 409);
  const registro = (await consultarSaidasParciais(tx, { gte: origem.dia, lte: origem.dia })).find(
    (s) => s.id === base.id,
  );
  if (!registro || registro.assinatura !== base.assinatura)
    throw new ErroHttp("As aulas da saída mudaram. Recarregue a lista antes de continuar.", 409);
  return registro;
}

export async function confirmarSaidaSeduc(
  identidade: Identidade,
  id: string,
  entrada: unknown,
): Promise<FrequenciaDaSaida> {
  const dados = esquemaBaseSaida
    .omit({ id: true })
    .extend({
      registrado: z.boolean(),
      revisao: z.number().int().min(0),
    })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Confira a saída e recarregue a lista.", 400);
  return comTransacao(async (tx) => {
    const registro = await conferirBaseSaida(tx, { id, assinatura: dados.data.assinatura });
    const dia = new Date(`${registro.dia}T12:00:00Z`);
    if (
      !registro.aulasConferiveis ||
      (await tx.frequenciaParcial.findUnique({
        where: { alunoId_dia: { alunoId: registro.alunoId, dia } },
        select: { id: true },
      }))
    )
      throw new ErroHttp("Confira a frequência personalizada antes de confirmar na Seduc.", 409);
    if (registro.revisaoSeduc !== dados.data.revisao)
      throw new ErroHttp("A confirmação mudou. Recarregue a lista.", 409);
    if (registro.registradoSeduc === dados.data.registrado) return registro;
    const salva = await tx.saidaAntecipada.update({
      where: { id, revisaoSeduc: dados.data.revisao },
      data: {
        assinaturaSeduc: dados.data.registrado ? registro.assinatura : null,
        registradoSeducEm: dados.data.registrado ? new Date() : null,
        registradoSeducPorNome: dados.data.registrado ? identidade.nome : null,
        revisaoSeduc: { increment: 1 },
      },
    });
    await auditar(
      tx,
      identidade.id,
      dados.data.registrado ? "saida.confirmarSeduc" : "saida.reabrirSeduc",
      `saida:${id}`,
    );
    return {
      ...registro,
      registradoSeduc: dados.data.registrado,
      registradoSeducEm: salva.registradoSeducEm?.toISOString() ?? null,
      registradoSeducPorNome: salva.registradoSeducPorNome,
      revisao: salva.revisaoSeduc,
      revisaoSeduc: salva.revisaoSeduc,
    };
  });
}
