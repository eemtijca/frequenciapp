// Cópia de segurança em JSON: exporta cadastro, frequências e saídas e
// importa mesclando sem sobrescrever, com resultado e auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ehDiaValido, ehMomentoValido, ordenarJustificativas } from "@/domain/frequencia";
import { lerConfiguracoes } from "@/application/configuracoes";

export const FORMATO_COPIA = "frequenciapp";
export const VERSAO_COPIA = 1;

const uuid = z.string().uuid();
const dia = z.string().refine(ehDiaValido, "Data inválida.");
const justificativa = z
  .string()
  .trim()
  .min(1, "Justificativa inválida.")
  .max(10, "Justificativa inválida.");

const esquemaCopia = z.object({
  formato: z.literal(FORMATO_COPIA),
  versao: z.literal(VERSAO_COPIA),
  exportadoEm: z.string().optional(),
  series: z
    .array(
      z.object({
        id: uuid,
        nome: z.string().trim().min(1).max(40),
        ordem: z.number().int().min(1).max(999),
      }),
    )
    .max(1000),
  turmas: z
    .array(z.object({ id: uuid, serieId: uuid, nome: z.string().trim().min(1).max(40) }))
    .max(5000),
  horarios: z
    .array(
      z.object({
        id: uuid,
        turmaId: uuid,
        ordem: z.number().int().min(1).max(999),
        inicio: z.string().max(5),
        fim: z.string().max(5),
        diasSemana: z.array(z.number().int().min(1).max(7)).max(7),
        ativo: z.boolean(),
      }),
    )
    .max(50000),
  alunos: z
    .array(
      z.object({
        id: uuid,
        turmaId: uuid,
        turmaOriginalId: uuid,
        nome: z.string().trim().min(2).max(100),
        ordem: z.number().int().min(1).max(9999),
        ativo: z.boolean(),
      }),
    )
    .max(50000),
  frequencias: z
    .array(
      z.object({
        dia,
        turmaId: uuid,
        revisao: z.number().int().min(1).max(999999),
        faltas: z
          .array(
            z.object({
              alunoId: uuid,
              horarioId: uuid,
              justificativa: justificativa.nullish(),
              observacao: z.string().trim().max(200).nullish(),
            }),
          )
          .max(50000),
      }),
    )
    .max(50000),
  saidas: z
    .array(
      z.object({
        id: uuid,
        alunoId: uuid,
        dia,
        momento: z
          .string()
          .trim()
          .max(20)
          .refine((codigo) => ehMomentoValido(codigo), "Momento da saída inválido."),
        justificativa,
        observacao: z.string().trim().max(200).nullish(),
        texto: z.string().trim().max(100).nullish(),
        liberadoPorId: uuid.nullish(),
      }),
    )
    .max(50000),
  justificativas: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(10),
        rotulo: z.string().trim().min(2).max(60),
        ativo: z.boolean(),
      }),
    )
    .max(1000),
  configuracoes: z
    .object({ frequenciaPorAula: z.boolean(), saidaAntecipada: z.boolean() })
    .optional(),
});

export type CopiaFrequenciapp = z.infer<typeof esquemaCopia>;

export interface ResultadoImportacao {
  adicionadas: number;
  identicas: number;
  conflitos: number;
}

function faltasIguais(
  atuais: {
    alunoId: string;
    horarioId: string;
    justificativa: string | null;
    observacao: string | null;
  }[],
  novas: {
    alunoId: string;
    horarioId: string;
    justificativa?: string | null | undefined;
    observacao?: string | null | undefined;
  }[],
): boolean {
  if (atuais.length !== novas.length) return false;
  const chave = (falta: {
    alunoId: string;
    horarioId: string;
    justificativa?: string | null;
    observacao?: string | null;
  }) =>
    `${falta.alunoId}|${falta.horarioId}|${falta.justificativa ?? ""}|${falta.observacao ?? ""}`;
  const ordemAtual = atuais.map(chave).sort();
  const ordemNova = novas.map(chave).sort();
  return ordemAtual.every((valor, indice) => valor === ordemNova[indice]);
}

/** Monta a cópia completa do cadastro, das frequências e das saídas. */
export async function exportarCopia(admin: { id: string }): Promise<CopiaFrequenciapp> {
  const [series, turmas, horarios, alunos, frequencias, saidas, justificativas, configuracoes] =
    await Promise.all([
      banco().serie.findMany({
        orderBy: [{ ordem: "asc" }, { nome: "asc" }],
        select: { id: true, nome: true, ordem: true },
      }),
      banco().turma.findMany({
        orderBy: { nome: "asc" },
        select: { id: true, serieId: true, nome: true },
      }),
      banco().horario.findMany({
        orderBy: [{ turmaId: "asc" }, { ordem: "asc" }],
        select: {
          id: true,
          turmaId: true,
          ordem: true,
          inicio: true,
          fim: true,
          diasSemana: true,
          ativo: true,
        },
      }),
      banco().aluno.findMany({
        orderBy: [{ turmaId: "asc" }, { ordem: "asc" }],
        select: {
          id: true,
          turmaId: true,
          turmaOriginalId: true,
          nome: true,
          ordem: true,
          ativo: true,
        },
      }),
      banco().frequencia.findMany({
        orderBy: [{ dia: "asc" }, { turmaId: "asc" }],
        select: {
          dia: true,
          turmaId: true,
          revisao: true,
          faltas: {
            select: { alunoId: true, horarioId: true, justificativa: true, observacao: true },
          },
        },
      }),
      banco().saidaAntecipada.findMany({
        orderBy: [{ dia: "asc" }, { criadoEm: "asc" }],
        select: {
          id: true,
          alunoId: true,
          dia: true,
          momento: true,
          justificativa: true,
          observacao: true,
          texto: true,
          liberadoPorId: true,
        },
      }),
      banco().justificativa.findMany({
        select: { codigo: true, rotulo: true, ativo: true },
      }),
      lerConfiguracoes(),
    ]);

  await auditar(banco(), admin.id, "backup.exportar", "copia");

  return {
    formato: FORMATO_COPIA,
    versao: VERSAO_COPIA,
    exportadoEm: new Date().toISOString(),
    series,
    turmas,
    horarios,
    alunos,
    frequencias: frequencias.map((frequencia) => ({
      dia: frequencia.dia.toISOString().slice(0, 10),
      turmaId: frequencia.turmaId,
      revisao: frequencia.revisao,
      faltas: frequencia.faltas,
    })),
    saidas: saidas.map((saida) => ({
      ...saida,
      dia: saida.dia.toISOString().slice(0, 10),
    })),
    justificativas: ordenarJustificativas(justificativas),
    configuracoes,
  };
}

/**
 * Mescla a cópia na base: cria o que falta por identificador, mantém o que
 * já existe e conta os conflitos sem sobrescrever nada.
 */
export async function importarCopia(
  admin: { id: string },
  entrada: unknown,
): Promise<ResultadoImportacao> {
  const analise = esquemaCopia.safeParse(entrada);
  if (!analise.success) {
    throw new ErroHttp(
      "A cópia não está no formato do FrequenciApp. Selecione o arquivo JSON gerado por este aplicativo.",
      400,
    );
  }
  const copia = analise.data;
  const resultado: ResultadoImportacao = { adicionadas: 0, identicas: 0, conflitos: 0 };

  await comTransacao(async (tx) => {
    // Justificativas do catálogo
    const justificativasAtuais = new Map(
      (
        await tx.justificativa.findMany({
          select: { id: true, codigo: true, rotulo: true, ativo: true },
        })
      ).map((item) => [item.codigo.toLowerCase(), item]),
    );
    for (const item of copia.justificativas) {
      const atual = justificativasAtuais.get(item.codigo.toLowerCase());
      if (!atual) {
        await tx.justificativa.create({ data: item });
        resultado.adicionadas += 1;
      } else if (atual.rotulo === item.rotulo && atual.ativo === item.ativo) {
        resultado.identicas += 1;
      } else {
        resultado.conflitos += 1;
      }
    }
    const codigosDeJustificativa = new Set(
      (await tx.justificativa.findMany({ select: { codigo: true } })).map((item) => item.codigo),
    );

    // Séries
    const seriesAtuais = new Map(
      (
        await tx.serie.findMany({
          where: { id: { in: copia.series.map((serie) => serie.id) } },
          select: { id: true, nome: true, ordem: true },
        })
      ).map((serie) => [serie.id, serie]),
    );
    const seriesNovas = copia.series.filter((serie) => !seriesAtuais.has(serie.id));
    if (seriesNovas.length > 0) await tx.serie.createMany({ data: seriesNovas });
    for (const serie of copia.series) {
      const atual = seriesAtuais.get(serie.id);
      if (!atual) resultado.adicionadas += 1;
      else if (atual.nome === serie.nome && atual.ordem === serie.ordem) resultado.identicas += 1;
      else resultado.conflitos += 1;
    }
    const idsSeries = new Set(
      (await tx.serie.findMany({ select: { id: true } })).map((serie) => serie.id),
    );

    // Turmas
    const turmasAtuais = new Map(
      (
        await tx.turma.findMany({
          where: { id: { in: copia.turmas.map((turma) => turma.id) } },
          select: { id: true, serieId: true, nome: true },
        })
      ).map((turma) => [turma.id, turma]),
    );
    const turmasNovas = copia.turmas.filter(
      (turma) => !turmasAtuais.has(turma.id) && idsSeries.has(turma.serieId),
    );
    if (turmasNovas.length > 0) await tx.turma.createMany({ data: turmasNovas });
    for (const turma of copia.turmas) {
      const atual = turmasAtuais.get(turma.id);
      if (atual) {
        if (atual.serieId === turma.serieId && atual.nome === turma.nome) resultado.identicas += 1;
        else resultado.conflitos += 1;
      } else if (idsSeries.has(turma.serieId)) resultado.adicionadas += 1;
      else resultado.conflitos += 1;
    }
    const idsTurmas = new Set(
      (
        await tx.turma.findMany({
          where: { id: { in: copia.turmas.map((turma) => turma.id) } },
          select: { id: true },
        })
      ).map((turma) => turma.id),
    );

    // Aulas
    const horariosAtuais = new Map(
      (
        await tx.horario.findMany({
          where: { id: { in: copia.horarios.map((horario) => horario.id) } },
          select: {
            id: true,
            turmaId: true,
            ordem: true,
            inicio: true,
            fim: true,
            diasSemana: true,
            ativo: true,
          },
        })
      ).map((horario) => [horario.id, horario]),
    );
    const horariosNovos = copia.horarios.filter(
      (horario) => !horariosAtuais.has(horario.id) && idsTurmas.has(horario.turmaId),
    );
    if (horariosNovos.length > 0) await tx.horario.createMany({ data: horariosNovos });
    for (const horario of copia.horarios) {
      const atual = horariosAtuais.get(horario.id);
      if (atual) {
        const igual =
          atual.turmaId === horario.turmaId &&
          atual.ordem === horario.ordem &&
          atual.inicio === horario.inicio &&
          atual.fim === horario.fim &&
          atual.ativo === horario.ativo &&
          [...atual.diasSemana].sort().join(",") === [...horario.diasSemana].sort().join(",");
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
      } else if (idsTurmas.has(horario.turmaId)) resultado.adicionadas += 1;
      else resultado.conflitos += 1;
    }
    const idsHorarios = new Set(
      (
        await tx.horario.findMany({
          where: { id: { in: copia.horarios.map((horario) => horario.id) } },
          select: { id: true },
        })
      ).map((horario) => horario.id),
    );

    // Alunos
    const alunosAtuais = new Map(
      (
        await tx.aluno.findMany({
          where: { id: { in: copia.alunos.map((aluno) => aluno.id) } },
          select: {
            id: true,
            turmaId: true,
            turmaOriginalId: true,
            nome: true,
            ordem: true,
            ativo: true,
          },
        })
      ).map((aluno) => [aluno.id, aluno]),
    );
    const alunosNovos = copia.alunos.filter(
      (aluno) =>
        !alunosAtuais.has(aluno.id) &&
        idsTurmas.has(aluno.turmaId) &&
        idsTurmas.has(aluno.turmaOriginalId),
    );
    if (alunosNovos.length > 0) await tx.aluno.createMany({ data: alunosNovos });
    for (const aluno of copia.alunos) {
      const atual = alunosAtuais.get(aluno.id);
      if (atual) {
        const igual =
          atual.turmaId === aluno.turmaId &&
          atual.turmaOriginalId === aluno.turmaOriginalId &&
          atual.nome === aluno.nome &&
          atual.ordem === aluno.ordem &&
          atual.ativo === aluno.ativo;
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
      } else if (idsTurmas.has(aluno.turmaId) && idsTurmas.has(aluno.turmaOriginalId)) {
        resultado.adicionadas += 1;
      } else resultado.conflitos += 1;
    }
    const idsAlunos = new Set(
      (
        await tx.aluno.findMany({
          where: { id: { in: copia.alunos.map((aluno) => aluno.id) } },
          select: { id: true },
        })
      ).map((aluno) => aluno.id),
    );
    const idsUsuarios = new Set(
      (
        await tx.usuario.findMany({
          where: {
            id: {
              in: copia.saidas
                .map((saida) => saida.liberadoPorId)
                .filter((valor): valor is string => Boolean(valor)),
            },
          },
          select: { id: true },
        })
      ).map((usuario) => usuario.id),
    );

    // Frequências
    for (const frequencia of copia.frequencias) {
      if (!idsTurmas.has(frequencia.turmaId)) {
        resultado.conflitos += 1;
        continue;
      }
      const diaRepositorio = new Date(`${frequencia.dia}T12:00:00Z`);
      const atual = await tx.frequencia.findUnique({
        where: { turmaId_dia: { turmaId: frequencia.turmaId, dia: diaRepositorio } },
        select: {
          id: true,
          faltas: {
            select: { alunoId: true, horarioId: true, justificativa: true, observacao: true },
          },
        },
      });
      if (atual) {
        if (faltasIguais(atual.faltas, frequencia.faltas)) resultado.identicas += 1;
        else resultado.conflitos += 1;
        continue;
      }
      const referenciasOk = frequencia.faltas.every(
        (falta) =>
          idsAlunos.has(falta.alunoId) &&
          idsHorarios.has(falta.horarioId) &&
          (!falta.justificativa || codigosDeJustificativa.has(falta.justificativa)),
      );
      if (!referenciasOk) {
        resultado.conflitos += 1;
        continue;
      }
      await tx.frequencia.create({
        data: {
          turmaId: frequencia.turmaId,
          dia: diaRepositorio,
          revisao: Math.max(1, frequencia.revisao),
          criadoPorId: admin.id,
          atualizadoPorId: admin.id,
          faltas: {
            create: frequencia.faltas.map((falta) => ({
              alunoId: falta.alunoId,
              horarioId: falta.horarioId,
              justificativa: falta.justificativa ?? null,
              observacao: falta.justificativa ? (falta.observacao ?? null) : null,
            })),
          },
        },
      });
      resultado.adicionadas += 1;
    }

    // Saídas
    for (const saida of copia.saidas) {
      if (!idsAlunos.has(saida.alunoId) || !codigosDeJustificativa.has(saida.justificativa)) {
        resultado.conflitos += 1;
        continue;
      }
      const diaRepositorio = new Date(`${saida.dia}T12:00:00Z`);
      const atual = await tx.saidaAntecipada.findUnique({
        where: { alunoId_dia: { alunoId: saida.alunoId, dia: diaRepositorio } },
        select: { id: true, momento: true, justificativa: true, observacao: true },
      });
      if (atual) {
        const igual =
          atual.momento === saida.momento &&
          atual.justificativa === saida.justificativa &&
          (atual.observacao ?? null) === (saida.observacao ?? null);
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
        continue;
      }
      await tx.saidaAntecipada.create({
        data: {
          alunoId: saida.alunoId,
          dia: diaRepositorio,
          momento: saida.momento,
          justificativa: saida.justificativa,
          observacao: saida.observacao ?? null,
          texto: saida.texto ?? null,
          liberadoPorId:
            saida.liberadoPorId && idsUsuarios.has(saida.liberadoPorId)
              ? saida.liberadoPorId
              : null,
          criadoPorId: admin.id,
        },
      });
      resultado.adicionadas += 1;
    }

    await auditar(
      tx,
      admin.id,
      "backup.importar",
      `adicionadas:${resultado.adicionadas} identicas:${resultado.identicas} conflitos:${resultado.conflitos}`,
    );
  });

  return resultado;
}
