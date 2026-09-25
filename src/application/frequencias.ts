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
  ehJustificativaValida,
  ehMesValido,
  horariosDoDia,
  type Frequencia,
  type ResumoAcumulado,
  type ResultadoSalvamento,
} from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";

const faltaEntrada = z.object({
  alunoId: z.string().uuid("Aluno inválido."),
  // Sem a lista de aulas, a falta cobre todas as aulas do dia.
  horarios: z
    .array(z.string().uuid("Aula inválida."))
    .max(20, "Lista de aulas grande demais.")
    .optional(),
  justificativa: z
    .string()
    .trim()
    .max(10, "Justificativa inválida.")
    .refine((codigo) => ehJustificativaValida(codigo), "Justificativa inválida.")
    .nullish(),
  observacao: z
    .string()
    .trim()
    .max(200, "A observação deve ter no máximo 200 caracteres.")
    .nullish(),
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
  faltas: {
    alunoId: string;
    horarioId: string;
    justificativa: string | null;
    observacao: string | null;
  }[];
}

/**
 * Agrupa as faltas por aluno. A justificativa só vale quando todas as faltas
 * do aluno no dia têm o mesmo código; qualquer falta sem justificativa deixa
 * o aluno como falta simples.
 */
function paraFrequencia(linha: LinhaFrequencia): Frequencia {
  interface Grupo {
    horarios: string[];
    justificativas: Set<string>;
    semJustificativa: boolean;
    observacao: string | null;
  }
  const porAluno = new Map<string, Grupo>();
  for (const falta of linha.faltas) {
    const grupo = porAluno.get(falta.alunoId) ?? {
      horarios: [],
      justificativas: new Set<string>(),
      semJustificativa: false,
      observacao: null,
    };
    grupo.horarios.push(falta.horarioId);
    if (falta.justificativa) {
      grupo.justificativas.add(falta.justificativa);
      grupo.observacao ??= falta.observacao ?? null;
    } else {
      grupo.semJustificativa = true;
    }
    porAluno.set(falta.alunoId, grupo);
  }
  return {
    dia: linha.dia.toISOString().slice(0, 10),
    turmaId: linha.turmaId,
    revisao: linha.revisao,
    atualizadoEm: linha.atualizadoEm.toISOString(),
    atualizadoPorNome: linha.atualizadoPor?.nome ?? linha.criadoPor?.nome ?? null,
    faltas: [...porAluno.entries()].map(([alunoId, grupo]) => {
      const unica = !grupo.semJustificativa && grupo.justificativas.size === 1;
      const justificativa = unica ? ([...grupo.justificativas][0] ?? null) : null;
      if (!justificativa) return { alunoId, horarios: grupo.horarios };
      return {
        alunoId,
        horarios: grupo.horarios,
        justificativa,
        observacao: grupo.observacao,
      };
    }),
  };
}

const COMPLEMENTO = {
  include: {
    faltas: {
      select: { alunoId: true, horarioId: true, justificativa: true, observacao: true },
    },
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

/** Todas as frequências de um período inclusivo, com filtro opcional de turma. */
export async function listarFrequenciasDoPeriodo(
  de: string,
  ate: string,
  filtros: { turmaId?: string } = {},
): Promise<Frequencia[]> {
  const linhas = await banco().frequencia.findMany({
    where: {
      dia: { gte: new Date(`${de}T12:00:00Z`), lte: new Date(`${ate}T12:00:00Z`) },
      ...(filtros.turmaId ? { turmaId: filtros.turmaId } : {}),
    },
    orderBy: [{ dia: "asc" }, { turma: { nome: "asc" } }],
    ...COMPLEMENTO,
  });
  return linhas.map(paraFrequencia);
}

/**
 * Acumulado por aluno desde a primeira chamada salva até o dia informado:
 * dias distintos com falta simples, com falta justificada e com registro.
 * Um dia parcial no modo por aula conta como falta simples.
 */
export async function resumoAcumulado(ate: string): Promise<ResumoAcumulado> {
  const linhas = await banco().frequencia.findMany({
    where: { dia: { lte: new Date(`${ate}T12:00:00Z`) } },
    select: {
      dia: true,
      faltas: { select: { alunoId: true, justificativa: true } },
    },
    orderBy: { dia: "asc" },
  });
  const porAluno = new Map<string, { dias: Set<string>; faltas: number; justificadas: number }>();
  const diasLetivos = new Set<string>();
  for (const linha of linhas) {
    const dia = linha.dia.toISOString().slice(0, 10);
    diasLetivos.add(dia);
    const porDia = new Map<string, { total: number; justificadas: number }>();
    for (const falta of linha.faltas) {
      const registro = porDia.get(falta.alunoId) ?? { total: 0, justificadas: 0 };
      registro.total += 1;
      if (falta.justificativa) registro.justificadas += 1;
      porDia.set(falta.alunoId, registro);
    }
    for (const [alunoId, registro] of porDia) {
      const acumulado = porAluno.get(alunoId) ?? {
        dias: new Set<string>(),
        faltas: 0,
        justificadas: 0,
      };
      acumulado.dias.add(dia);
      if (registro.justificadas === registro.total) acumulado.justificadas += 1;
      else acumulado.faltas += 1;
      porAluno.set(alunoId, acumulado);
    }
  }
  const dias = [...diasLetivos].sort();
  return {
    primeiroDia: dias[0] ?? null,
    diasLetivos: dias.length,
    porAluno: [...porAluno.entries()].map(([alunoId, valor]) => ({
      alunoId,
      faltas: valor.faltas,
      faltasJustificadas: valor.justificadas,
      diasComRegistro: valor.dias.size,
    })),
  };
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
  interface Ausencia {
    horarios: Set<string>;
    justificativa: string | null;
    observacao: string | null;
  }
  const porAluno = new Map<string, Ausencia>();
  if (typeof faltasBrutas[0] === "string") {
    for (const alunoId of faltasBrutas as string[]) {
      porAluno.set(alunoId, {
        horarios: new Set(idsDeAulaAtiva),
        justificativa: null,
        observacao: null,
      });
    }
  } else {
    for (const falta of faltasBrutas as {
      alunoId: string;
      horarios?: string[];
      justificativa?: string | null;
      observacao?: string | null;
    }[]) {
      const ausencia = porAluno.get(falta.alunoId) ?? {
        horarios: new Set<string>(),
        justificativa: null,
        observacao: null,
      };
      if (falta.horarios && falta.horarios.length > 0) {
        for (const horarioId of falta.horarios) ausencia.horarios.add(horarioId);
      } else {
        for (const horarioId of idsDeAulaAtiva) ausencia.horarios.add(horarioId);
      }
      ausencia.justificativa = falta.justificativa ?? null;
      ausencia.observacao = falta.justificativa ? (falta.observacao ?? null) : null;
      porAluno.set(falta.alunoId, ausencia);
    }
  }
  // Aluno sem nenhuma aula marcada não gera falta.
  const ausencias = [...porAluno.entries()]
    .filter(([, ausencia]) => ausencia.horarios.size > 0)
    .map(([alunoId, ausencia]) => ({
      alunoId,
      horarios: [...ausencia.horarios],
      justificativa: ausencia.justificativa,
      observacao: ausencia.observacao,
    }));

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
                ausencia.horarios.map((horarioId) => ({
                  alunoId: ausencia.alunoId,
                  horarioId,
                  justificativa: ausencia.justificativa,
                  observacao: ausencia.observacao,
                })),
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
              justificativa: ausencia.justificativa,
              observacao: ausencia.observacao,
            })),
          ),
        });
      }
      return {
        situacao: "salvo" as const,
        frequencia: {
          ...paraFrequencia(linha),
          faltas: ausencias.map((ausencia) => {
            if (!ausencia.justificativa)
              return { alunoId: ausencia.alunoId, horarios: ausencia.horarios };
            return {
              alunoId: ausencia.alunoId,
              horarios: ausencia.horarios,
              justificativa: ausencia.justificativa,
              observacao: ausencia.observacao,
            };
          }),
        },
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
