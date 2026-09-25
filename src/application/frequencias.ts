// Frequência diária: uma por turma e dia, compartilhada pela coordenação,
// com faltas por aula, proteção de duplicata e conflito por revisão.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { ErroHttp, ehConflitoDeSerializacao, ehDuplicidade } from "@/infra/erros";
import {
  diaLocal,
  ehDiaValido,
  ehMesValido,
  horariosDoDia,
  type Frequencia,
  type ResultadoSalvamento,
} from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const faltaEntrada = z.object({
  alunoId: z.string().uuid("Aluno inválido."),
  horarios: z.array(z.string().uuid("Aula inválida.")).max(20, "Lista de aulas grande demais."),
});

export const esquemaSalvarFrequencia = z.object({
  dia: z.string().refine(ehDiaValido, "Data inválida."),
  turmaId: z.string().uuid("Turma inválida."),
  // Lista simples de alunos significa falta em todas as aulas do dia.
  faltas: z.union([
    z.array(z.string().uuid()).max(500, "Lista de faltas grande demais."),
    z.array(faltaEntrada).max(500, "Lista de faltas grande demais."),
  ]),
  revisao: z.number().int().min(0, "Revisão inválida.").max(999999),
});

interface LinhaFrequencia {
  dia: Date;
  turmaId: string;
  revisao: number;
  atualizadoEm: Date;
  criadoPor: { nome: string } | null;
  atualizadoPor: { nome: string } | null;
  faltas: { alunoId: string; horarioId: string }[];
}

function paraFrequencia(linha: LinhaFrequencia): Frequencia {
  const porAluno = new Map<string, string[]>();
  for (const falta of linha.faltas) {
    const aulas = porAluno.get(falta.alunoId) ?? [];
    aulas.push(falta.horarioId);
    porAluno.set(falta.alunoId, aulas);
  }
  return {
    dia: linha.dia.toISOString().slice(0, 10),
    turmaId: linha.turmaId,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    atualizadoPorNome: linha.atualizadoPor?.nome ?? linha.criadoPor?.nome ?? null,
    faltas: [...porAluno.entries()].map(([alunoId, horarios]) => ({ alunoId, horarios })),
  };
}

const COMPLEMENTO = {
  include: {
    faltas: { select: { alunoId: true, horarioId: true } },
    criadoPor: { select: { nome: true } },
    atualizadoPor: { select: { nome: true } },
  },
} as const;

/** Frequência de um dia e turma, ou null quando inexistente. */
export async function carregarFrequencia(turmaId: string, dia: string): Promise<Frequencia | null> {
  const linha = await banco().frequencia.findUnique({
    where: { turmaId_dia: { turmaId, dia: new Date(`${dia}T12:00:00Z`) } },
    ...COMPLEMENTO,
  });
  return linha ? paraFrequencia(linha) : null;
}

/** Todas as frequências de um mês, com filtros opcionais de turma e autoria. */
export async function listarFrequenciasDoMes(
  mes: string,
  filtros: { turmaId?: string; registradoPor?: string } = {},
): Promise<Frequencia[]> {
  const [anoTexto = "0", numeroTexto = "0"] = mes.split("-");
  const inicio = new Date(Date.UTC(Number(anoTexto), Number(numeroTexto) - 1, 1));
  const fim = new Date(Date.UTC(Number(anoTexto), Number(numeroTexto), 1));
  const linhas = await banco().frequencia.findMany({
    where: {
      dia: { gte: inicio, lt: fim },
      ...(filtros.turmaId ? { turmaId: filtros.turmaId } : {}),
      ...(filtros.registradoPor
        ? {
            OR: [
              { criadoPorId: filtros.registradoPor },
              { atualizadoPorId: filtros.registradoPor },
            ],
          }
        : {}),
    },
    orderBy: [{ dia: "asc" }, { turma: { nome: "asc" } }],
    ...COMPLEMENTO,
  });
  return linhas.map(paraFrequencia);
}

/**
 * Salva a frequência de um dia e turma, compartilhada pela coordenação.
 * revisao 0 cria a primeira versão; duplicata devolve conflito.
 * revisao N atualiza apenas se a versão vigente for N: edições de outra
 * pessoa no intervalo são recusadas sem sobrescrita.
 * As aulas precisam pertencer à turma e acontecer no dia informado, e a
 * lista de alunos é revalidada dentro da própria transação.
 */
export async function salvarFrequencia(
  identidade: Identidade,
  entrada: unknown,
): Promise<ResultadoSalvamento> {
  const dados = esquemaSalvarFrequencia.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const { dia, turmaId, revisao } = dados.data;

  // O dia corrente vem do fuso da escola, nunca do relógio do cliente.
  if (dia > diaLocal(new Date(), ambiente.fuso)) {
    throw new ErroHttp("Não é possível registrar frequência em dia futuro.", 400);
  }

  const turma = await banco().turma.findUnique({
    where: { id: turmaId },
    include: { horarios: { orderBy: { ordem: "asc" } } },
  });
  if (!turma) throw new ErroHttp("Turma não encontrada.", 404);

  const aulasDoDia = horariosDoDia(turma.horarios, dia);
  if (aulasDoDia.length === 0) {
    throw new ErroHttp(
      "Não há aulas programadas para este dia nesta turma. Ajuste a grade na Gestão.",
      400,
    );
  }
  const idsDeAulaAtiva = aulasDoDia.map((aula) => aula.id);

  const faltasBrutas = dados.data.faltas;
  const porAluno = new Map<string, Set<string>>();
  if (typeof faltasBrutas[0] === "string") {
    for (const alunoId of faltasBrutas as string[]) {
      porAluno.set(alunoId, new Set(idsDeAulaAtiva));
    }
  } else {
    for (const falta of faltasBrutas as { alunoId: string; horarios: string[] }[]) {
      const aulas = porAluno.get(falta.alunoId) ?? new Set<string>();
      for (const horarioId of falta.horarios) {
        aulas.add(horarioId);
      }
      porAluno.set(falta.alunoId, aulas);
    }
  }
  // Aluno sem nenhuma aula marcada não gera falta.
  const ausencias = [...porAluno.entries()]
    .filter(([, aulas]) => aulas.size > 0)
    .map(([alunoId, aulas]) => ({ alunoId, horarios: [...aulas] }));

  const diaUtc = new Date(`${dia}T12:00:00Z`);
  const filtroFrequencia = { turmaId, dia: diaUtc } as const;

  try {
    return await comTransacao(async (tx) => {
      const existente = await tx.frequencia.findUnique({
        where: { turmaId_dia: filtroFrequencia },
        ...COMPLEMENTO,
      });

      // Aulas ativas do dia mais as que já tinham falta registrada: uma aula
      // desativada depois do registro continua aceita na edição.
      const idsPermitidos = new Set([
        ...idsDeAulaAtiva,
        ...(existente?.faltas.map((falta) => falta.horarioId) ?? []),
      ]);
      const aulaInvalida = ausencias.some((ausencia) =>
        ausencia.horarios.some((horarioId) => !idsPermitidos.has(horarioId)),
      );
      if (aulaInvalida) {
        throw new ErroHttp(
          "Há aulas que não pertencem a esta turma ou não acontecem neste dia. Recarregue e confira.",
          400,
        );
      }

      // A lista de alunos não pode ter mudado entre a leitura da tela e o
      // salvamento, mas quem já tinha falta registrada continua aceito mesmo
      // que tenha sido desativado depois.
      const comFaltaRegistrada = new Set(existente?.faltas.map((falta) => falta.alunoId) ?? []);
      const alunosDaTurma = await tx.aluno.findMany({
        where: { turmaId, ativo: true },
        select: { id: true },
      });
      const idsValidos = new Set([
        ...alunosDaTurma.map((aluno) => aluno.id),
        ...comFaltaRegistrada,
      ]);
      const invalidos = ausencias
        .map((ausencia) => ausencia.alunoId)
        .filter((alunoId) => !idsValidos.has(alunoId));
      if (invalidos.length > 0) {
        throw new ErroHttp(
          "A lista de alunos mudou enquanto você marcava. Recarregue a frequência e confira.",
          400,
        );
      }

      if (revisao === 0) {
        if (existente) {
          return { situacao: "conflito" as const, frequencia: paraFrequencia(existente) };
        }
        const criada = await tx.frequencia.create({
          data: {
            turmaId,
            dia: diaUtc,
            revisao: 1,
            criadoPorId: identidade.id,
            atualizadoPorId: identidade.id,
            faltas: {
              create: ausencias.flatMap((ausencia) =>
                ausencia.horarios.map((horarioId) => ({ alunoId: ausencia.alunoId, horarioId })),
              ),
            },
          },
          ...COMPLEMENTO,
        });
        return { situacao: "salvo" as const, frequencia: paraFrequencia(criada) };
      }

      const atualizada = await tx.frequencia.updateMany({
        where: { ...filtroFrequencia, revisao },
        data: { revisao: { increment: 1 }, atualizadoPorId: identidade.id },
      });
      if (atualizada.count === 0) {
        const vigente = await tx.frequencia.findUnique({
          where: { turmaId_dia: filtroFrequencia },
          ...COMPLEMENTO,
        });
        if (!vigente) throw new ErroHttp("Frequência não encontrada para atualizar.", 404);
        return { situacao: "conflito" as const, frequencia: paraFrequencia(vigente) };
      }
      const linha = await tx.frequencia.findUnique({
        where: { turmaId_dia: filtroFrequencia },
        ...COMPLEMENTO,
      });
      if (!linha) throw new ErroHttp("Frequência não encontrada para atualizar.", 404);
      await tx.falta.deleteMany({ where: { frequenciaId: linha.id } });
      if (ausencias.length > 0) {
        await tx.falta.createMany({
          data: ausencias.flatMap((ausencia) =>
            ausencia.horarios.map((horarioId) => ({
              frequenciaId: linha.id,
              alunoId: ausencia.alunoId,
              horarioId,
            })),
          ),
        });
      }
      return {
        situacao: "salvo" as const,
        frequencia: { ...paraFrequencia(linha), faltas: ausencias },
      };
    });
  } catch (erro) {
    if (ehConflitoDeSerializacao(erro) || ehDuplicidade(erro)) {
      const vigente = await banco().frequencia.findUnique({
        where: { turmaId_dia: filtroFrequencia },
        ...COMPLEMENTO,
      });
      if (vigente) return { situacao: "conflito", frequencia: paraFrequencia(vigente) };
    }
    throw erro;
  }
}

/** Valida parâmetros de mês e devolve o valor ou null. */
export function mesValidoOuParametro(valor: string | null): string | null {
  if (valor === null) return null;
  return ehMesValido(valor) ? valor : null;
}

/** Valida parâmetros de dia e devolve o valor ou null. */
export function diaValidoOuParametro(valor: string | null): string | null {
  if (valor === null) return null;
  return ehDiaValido(valor) ? valor : null;
}
