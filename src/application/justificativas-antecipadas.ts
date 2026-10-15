// Lê propostas de justificativa sem criar chamadas ou presenças antes do salvamento.
import type { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { disciplinasDoHorario } from "@/domain/horarios-semanais";
import { diaLocal, horariosDaChamada } from "@/domain/frequencia";
import type { JustificativaAntecipada } from "@/domain/justificativas-antecipadas";
export async function listarJustificativasAntecipadas(
  dia: string,
  turmaId?: string,
  cliente: Prisma.TransactionClient = banco(),
): Promise<JustificativaAntecipada[]> {
  if (dia > diaLocal(new Date(), ambiente.fuso)) return [];
  const data = new Date(`${dia}T12:00:00Z`);
  const linhas = await cliente.frequenciaParcial.findMany({
    where: {
      dia: data,
      tipo: "JUSTIFICADA",
      justificativa: { not: null },
      aluno: {
        ativo: true,
        ...(turmaId ? { turmaId } : {}),
        OR: [{ desistenteEm: null }, { desistenteEm: { gt: data } }],
      },
    },
    select: {
      id: true,
      revisao: true,
      alunoId: true,
      justificativa: true,
      observacao: true,
      aluno: { select: { turmaId: true } },
    },
  });
  return linhas.flatMap((l) =>
    l.justificativa
      ? [
          {
            id: l.id,
            revisao: l.revisao,
            alunoId: l.alunoId,
            turmaId: l.aluno.turmaId,
            justificativa: l.justificativa,
            observacao: l.observacao,
          },
        ]
      : [],
  );
}

/** Corrige somente o aluno justificado em chamadas existentes, preservando a turma e as demais marcas. */
export async function aplicarJustificativaEmChamadasSalvas(
  tx: Prisma.TransactionClient,
  alunoId: string,
  dias: Date[],
  codigo: string,
  observacao: string | null,
  autorId: string,
): Promise<void> {
  const hoje = new Date(`${diaLocal(new Date(), ambiente.fuso)}T12:00:00Z`);
  const chamadas = await tx.frequencia.findMany({
    where: { dia: { in: dias, lte: hoje }, alunos: { some: { alunoId } } },
    include: {
      aulas: true,
      faltas: { where: { alunoId } },
      turma: { include: { horarios: true } },
    },
    orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
  });
  const tratadas = new Set<string>();
  for (const chamada of chamadas) {
    const dia = chamada.dia.toISOString().slice(0, 10);
    if (tratadas.has(dia)) continue;
    tratadas.add(dia);
    const aulas = chamada.aulas.length
      ? chamada.aulas.map((a) => a.horarioId)
      : horariosDaChamada(
          chamada.turma.horarios.map((h) => ({
            ...h,
            disciplinas: disciplinasDoHorario(h.disciplinas),
          })),
          dia,
          true,
        ).map((h) => h.id);
    if (!aulas.length)
      throw new ErroHttp(
        "A chamada salva está sem aulas de referência. Confira a grade antes de justificar.",
        409,
      );
    if (
      chamada.faltas.length === aulas.length &&
      chamada.faltas.every(
        (f) =>
          aulas.includes(f.horarioId) && f.justificativa === codigo && f.observacao === observacao,
      )
    )
      continue;
    await tx.frequencia.update({
      where: { id: chamada.id, revisao: chamada.revisao },
      data: { revisao: { increment: 1 }, atualizadoPorId: autorId },
    });
    await tx.falta.deleteMany({ where: { frequenciaId: chamada.id, alunoId } });
    await tx.falta.createMany({
      data: aulas.map((horarioId) => ({
        frequenciaId: chamada.id,
        alunoId,
        horarioId,
        justificativa: codigo,
        observacao,
      })),
    });
    await tx.alunoDaChamada.updateMany({
      where: { frequenciaId: chamada.id, alunoId },
      data: {
        registradoSeduc: false,
        registradoSeducEm: null,
        registradoSeducPorId: null,
        registradoSeducPorNome: null,
        revisaoSeduc: { increment: 1 },
      },
    });
    await auditar(tx, autorId, "parcial.aplicarJustificativa", `frequencia:${chamada.id}`);
  }
}

/** Destinos existentes para atualizar a fila após a confirmação da justificativa. */
export async function chamadasDaJustificativa(alunoId: string, dias: string[]) {
  const chamadas = await banco().frequencia.findMany({
    where: {
      dia: { in: dias.map((d) => new Date(`${d}T12:00:00Z`)) },
      alunos: { some: { alunoId } },
    },
    select: { dia: true, turmaId: true },
    orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
  });
  const porDia = new Map<string, { dia: string; turmaId: string }>();
  for (const c of chamadas) {
    const dia = c.dia.toISOString().slice(0, 10);
    if (!porDia.has(dia)) porDia.set(dia, { dia, turmaId: c.turmaId });
  }
  return [...porDia.values()];
}
