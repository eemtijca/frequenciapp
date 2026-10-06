// Consulta a chamada salva como base de conferência, sem criar ou alterar registros.
// A personalização prevalece por aluno e dia, inclusive após uma transferência.
import { z } from "zod";
import type { FrequenciaParcial as LinhaParcial } from "../../generated/prisma/client";
import { esquemaFiltrosParciais } from "./frequencia-parcial";
import {
  diaLocal,
  horariosDoDia,
  JUSTIFICATIVA_OUTROS,
  type Horario,
  type Marca,
} from "@/domain/frequencia";
import type { FrequenciaParcial } from "@/domain/frequencia-parcial";
import type { RegistroPersonalizado } from "@/domain/frequencia-personalizada";
import { ambiente } from "@/infra/ambiente";
import { ErroHttp } from "@/infra/erros";
import { comTransacao } from "@/infra/transacoes";

function apresentarPersonalizacao(linha: LinhaParcial): FrequenciaParcial {
  return {
    id: linha.id,
    alunoId: linha.alunoId,
    turmaId: linha.turmaId,
    alunoNome: linha.alunoNome,
    turmaNome: linha.turmaNome,
    dia: linha.dia.toISOString().slice(0, 10),
    tipo: linha.tipo,
    turno: linha.turno,
    aulas: linha.aulas,
    observacao: linha.observacao,
    registradoSeduc: linha.registradoSeduc,
    registradoSeducEm: linha.registradoSeducEm?.toISOString() ?? null,
    registradoSeducPorNome: linha.registradoSeducPorNome,
    revisao: linha.revisao,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

function descreverChamada(
  faltas: { horarioId: string; justificativa: string | null }[],
  horarios: Horario[],
  dia: string,
): { marca: Marca; descricao: string } {
  if (faltas.length === 0) return { marca: "P", descricao: "Dia inteiro" };
  const aulasDoDia = horariosDoDia(horarios, dia);
  const idsAusentes = new Set(faltas.map((falta) => falta.horarioId));
  const aulasAusentes = aulasDoDia.filter((aula) => idsAusentes.has(aula.id));
  if (aulasAusentes.length > 0 && aulasAusentes.length < aulasDoDia.length) {
    const todasMapeadas = aulasAusentes.length === idsAusentes.size;
    return {
      marca: "S",
      descricao: todasMapeadas
        ? aulasAusentes.length === 1
          ? `Falta na ${aulasAusentes[0]?.ordem}ª aula da Chamada`
          : `Falta nas aulas ${aulasAusentes.map((aula) => `${aula.ordem}ª`).join(", ")} da Chamada`
        : "Falta em parte das aulas na Chamada",
    };
  }
  return faltas.every((falta) => Boolean(falta.justificativa))
    ? { marca: "FJ", descricao: "Falta justificada na Chamada" }
    : { marca: "F", descricao: "Falta na Chamada" };
}

function motivosDasFaltas(
  faltas: { justificativa: string | null; observacao: string | null }[],
  catalogo: ReadonlyMap<string, string>,
): string[] {
  const motivos = faltas.flatMap((falta) => {
    if (!falta.justificativa) return [];
    const rotulo = catalogo.get(falta.justificativa) ?? falta.justificativa;
    const observacao =
      falta.justificativa === JUSTIFICATIVA_OUTROS ? falta.observacao?.trim() : null;
    return [observacao ? `${rotulo}: ${observacao}` : rotulo];
  });
  return [...new Set(motivos)].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

export async function listarFrequenciasPersonalizadas(
  entrada: z.input<typeof esquemaFiltrosParciais>,
): Promise<RegistroPersonalizado[]> {
  const dados = esquemaFiltrosParciais.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Período inválido.", 400);
  const dia = dados.data.dia ?? diaLocal(new Date(), ambiente.fuso);
  const periodo = {
    gte: new Date(`${dados.data.de ?? dia}T12:00:00Z`),
    lte: new Date(`${dados.data.ate ?? dia}T12:00:00Z`),
  };
  return comTransacao(async (tx) => {
    const personalizadas = await tx.frequenciaParcial.findMany({ where: { dia: periodo } });
    const chamadas = await tx.frequencia.findMany({
      where: { dia: periodo },
      include: {
        turma: { include: { serie: true, horarios: true } },
        faltas: {
          select: { alunoId: true, horarioId: true, justificativa: true, observacao: true },
        },
        alunos: { include: { aluno: { select: { nome: true } } } },
      },
      // Se o aluno integrou mais de uma lista no dia, a chamada mais recente é a base.
      orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
    });
    const catalogo = new Map(
      (await tx.justificativa.findMany({ select: { codigo: true, rotulo: true } })).map((item) => [
        item.codigo,
        item.rotulo,
      ]),
    );
    const porAlunoDia = new Map<string, RegistroPersonalizado>();
    for (const personalizada of personalizadas) {
      const registro = apresentarPersonalizacao(personalizada);
      porAlunoDia.set(`${registro.alunoId}:${registro.dia}`, registro);
    }
    for (const chamada of chamadas) {
      const dia = chamada.dia.toISOString().slice(0, 10);
      for (const aluno of chamada.alunos) {
        const chave = `${aluno.alunoId}:${dia}`;
        if (porAlunoDia.has(chave)) continue;
        const faltas = chamada.faltas.filter((falta) => falta.alunoId === aluno.alunoId);
        porAlunoDia.set(chave, {
          tipo: "CHAMADA",
          id: `chamada:${chave}`,
          alunoId: aluno.alunoId,
          dia,
          turmaId: chamada.turmaId,
          alunoNome: aluno.aluno.nome,
          turmaNome: `${chamada.turma.serie.nome} ${chamada.turma.nome}`,
          ...descreverChamada(faltas, chamada.turma.horarios, dia),
          justificativas: motivosDasFaltas(faltas, catalogo),
          registradoSeduc: aluno.registradoSeduc,
          registradoSeducEm: aluno.registradoSeducEm?.toISOString() ?? null,
          registradoSeducPorNome: aluno.registradoSeducPorNome,
          revisao: chamada.revisao,
          revisaoSeduc: aluno.revisaoSeduc,
          criadoEm: chamada.criadoEm.toISOString(),
          atualizadoEm: chamada.atualizadoEm.toISOString(),
        });
      }
    }
    return [...porAlunoDia.values()]
      .filter((registro) => !dados.data.turmaId || registro.turmaId === dados.data.turmaId)
      .sort(
        (a, b) =>
          a.dia.localeCompare(b.dia) ||
          a.alunoNome.localeCompare(b.alunoNome, "pt-BR") ||
          a.id.localeCompare(b.id),
      );
  });
}
