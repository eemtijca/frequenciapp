// Cópia de segurança em JSON: exporta cadastro, frequências regulares e parciais e
// importa mesclando sem sobrescrever, com resultado e auditoria.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ehDiaValido, ehMomentoValido, ordenarPorRotulo } from "@/domain/frequencia";
import { ehHorarioEntrada } from "@/domain/entradas";
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
const instante = z.iso.datetime({ offset: true });
const esquemaSeducChamada = z
  .object({
    alunoId: uuid,
    registradoSeduc: z.boolean(),
    registradoSeducEm: instante.nullish(),
    registradoSeducPorId: uuid.nullish(),
    registradoSeducPorNome: z.string().trim().min(1).max(200).nullish(),
    revisaoSeduc: z.number().int().min(0).max(999999),
  })
  .refine(
    (item) =>
      item.registradoSeduc
        ? item.registradoSeducEm != null &&
          item.registradoSeducPorNome != null &&
          item.revisaoSeduc > 0
        : item.registradoSeducEm == null &&
          item.registradoSeducPorId == null &&
          item.registradoSeducPorNome == null,
    "A confirmação da Seduc deve corresponder à data e ao responsável.",
  );
const esquemaParcial = z
  .object({
    id: uuid,
    alunoId: uuid,
    turmaId: uuid,
    dia,
    alunoNome: z.string().trim().min(2).max(200),
    turmaNome: z.string().trim().min(1).max(200),
    tipo: z.enum(["DIA_INTEIRO", "TURNO", "AULAS"]),
    turno: z.enum(["MANHA", "TARDE"]).nullish(),
    aulas: z.array(z.number().int().min(1).max(30)).max(30),
    observacao: z.string().trim().max(300).nullish(),
    registradoSeduc: z.boolean(),
    registradoSeducEm: instante.nullish(),
    registradoSeducPorId: uuid.nullish(),
    registradoSeducPorNome: z.string().trim().min(1).max(200).nullish(),
    revisao: z.number().int().min(1).max(999999),
    criadoPorId: uuid.nullish(),
    atualizadoPorId: uuid.nullish(),
    criadoEm: instante.optional(),
    atualizadoEm: instante.optional(),
  })
  .refine((item) => {
    if (item.tipo === "DIA_INTEIRO") return item.turno == null && item.aulas.length === 0;
    if (item.tipo === "TURNO") return item.turno != null && item.aulas.length === 0;
    return item.turno == null && item.aulas.length > 0;
  }, "A presença deve informar o dia inteiro, um turno ou as aulas frequentadas.")
  .refine(
    (item) =>
      item.aulas.every((aula, indice) => indice === 0 || aula > (item.aulas[indice - 1] ?? 0)),
    "As aulas devem estar em ordem e sem repetição.",
  )
  .refine(
    (item) =>
      item.registradoSeduc
        ? item.registradoSeducEm != null && item.registradoSeducPorNome != null
        : item.registradoSeducEm == null &&
          item.registradoSeducPorId == null &&
          item.registradoSeducPorNome == null,
    "A confirmação da Seduc deve corresponder à data e ao responsável.",
  )
  .refine(
    (item) =>
      !item.criadoEm ||
      !item.atualizadoEm ||
      new Date(item.atualizadoEm).getTime() >= new Date(item.criadoEm).getTime(),
    "A atualização deve ser posterior à criação.",
  );

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
        desistenteEm: dia.nullish(),
      }),
    )
    .max(50000),
  frequencias: z
    .array(
      z
        .object({
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
          // Lista da chamada. Cópias antigas não trazem; a importação a deduz.
          alunos: z.array(uuid).max(5000).optional(),
          confirmacoesSeduc: z.array(esquemaSeducChamada).max(5000).optional(),
        })
        .refine((item) => {
          const ids = (item.confirmacoesSeduc ?? []).map((confirmacao) => confirmacao.alunoId);
          return (
            new Set(ids).size === ids.length &&
            (!item.alunos || ids.every((id) => item.alunos?.includes(id)))
          );
        }, "As confirmações da Seduc devem pertencer à lista da chamada, sem repetição."),
    )
    .max(50000),
  // Campo novo na versão 1; cópias anteriores continuam válidas.
  frequenciasParciais: z.array(esquemaParcial).max(50000).optional(),
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
        horario: z.string().refine(ehHorarioEntrada, "Horário da saída inválido.").nullish(),
        justificativa: z.string().trim().min(1).max(10).nullish(),
        observacao: z.string().trim().max(200).nullish(),
        texto: z.string().trim().max(100).nullish(),
        liberadoPorId: uuid.nullish(),
        liberadoPorCodigo: z.string().trim().max(20).nullish(),
      }),
    )
    .max(50000),
  entradas: z
    .array(
      z.object({
        id: uuid,
        alunoId: uuid,
        turmaId: uuid,
        turmaRotulo: z.string().trim().min(1).max(100),
        dia,
        horario: z.string().refine(ehHorarioEntrada, "Horário inválido."),
        motivo: z.string().trim().min(2).max(200),
        registradoPorNome: z.string().trim().min(1).max(100),
        momento: z.string().refine(ehMomentoValido, "Momento da entrada inválido.").nullish(),
        responsavelRegistroCodigo: z.string().trim().min(1).max(20).nullish(),
        responsavelRegistroNome: z.string().trim().min(1).max(100).nullish(),
      }),
    )
    .max(50000)
    .optional(),
  justificativas: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(10),
        rotulo: z.string().trim().min(2).max(60),
        ativo: z.boolean(),
      }),
    )
    .max(1000),
  liberadores: z
    .array(
      z.object({
        codigo: z.string().trim().min(1).max(20),
        rotulo: z.string().trim().min(2).max(60),
        ativo: z.boolean(),
      }),
    )
    .max(1000)
    .optional(),
  configuracoes: z
    .object({
      frequenciaPorAula: z.boolean(),
      saidaAntecipada: z.boolean(),
      origemNaChamada: z.boolean().optional(),
      origemNaChamadaSerieIds: z.array(z.uuid()).optional(),
      origemNaChamadaTurmaIds: z.array(z.uuid()).optional(),
    })
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

/** Monta a cópia completa do cadastro e dos registros de frequência, saída e entrada. */
export async function exportarCopia(admin: { id: string }): Promise<CopiaFrequenciapp> {
  const [
    series,
    turmas,
    horarios,
    alunos,
    frequencias,
    frequenciasParciais,
    saidas,
    entradas,
    justificativas,
    liberadores,
    configuracoes,
  ] = await Promise.all([
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
        desistenteEm: true,
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
        alunos: {
          select: {
            alunoId: true,
            registradoSeduc: true,
            registradoSeducEm: true,
            registradoSeducPorId: true,
            registradoSeducPorNome: true,
            revisaoSeduc: true,
          },
        },
      },
    }),
    banco().frequenciaParcial.findMany({
      orderBy: [{ dia: "asc" }, { turmaId: "asc" }, { alunoNome: "asc" }],
      select: {
        id: true,
        alunoId: true,
        turmaId: true,
        dia: true,
        alunoNome: true,
        turmaNome: true,
        tipo: true,
        turno: true,
        aulas: true,
        observacao: true,
        registradoSeduc: true,
        registradoSeducEm: true,
        registradoSeducPorId: true,
        registradoSeducPorNome: true,
        revisao: true,
        criadoPorId: true,
        atualizadoPorId: true,
        criadoEm: true,
        atualizadoEm: true,
      },
    }),
    banco().saidaAntecipada.findMany({
      orderBy: [{ dia: "asc" }, { criadoEm: "asc" }],
      select: {
        id: true,
        alunoId: true,
        dia: true,
        momento: true,
        horario: true,
        justificativa: true,
        observacao: true,
        texto: true,
        liberadoPorId: true,
        liberadoPorCodigo: true,
      },
    }),
    banco().entradaAtrasada.findMany({
      orderBy: [{ dia: "asc" }, { horario: "asc" }],
      select: {
        id: true,
        alunoId: true,
        turmaId: true,
        turmaRotulo: true,
        dia: true,
        horario: true,
        motivo: true,
        registradoPorNome: true,
        momento: true,
        responsavelRegistroCodigo: true,
        responsavelRegistroNome: true,
      },
    }),
    banco().justificativa.findMany({
      select: { codigo: true, rotulo: true, ativo: true },
    }),
    banco().liberador.findMany({
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
    alunos: alunos.map((aluno) => ({
      ...aluno,
      desistenteEm: aluno.desistenteEm?.toISOString().slice(0, 10) ?? null,
    })),
    frequencias: frequencias.map((frequencia) => ({
      dia: frequencia.dia.toISOString().slice(0, 10),
      turmaId: frequencia.turmaId,
      revisao: frequencia.revisao,
      faltas: frequencia.faltas,
      alunos: frequencia.alunos.map((item) => item.alunoId),
      confirmacoesSeduc: frequencia.alunos.map((item) => ({
        ...item,
        registradoSeducEm: item.registradoSeducEm?.toISOString() ?? null,
      })),
    })),
    frequenciasParciais: frequenciasParciais.map((parcial) => ({
      ...parcial,
      dia: parcial.dia.toISOString().slice(0, 10),
      registradoSeducEm: parcial.registradoSeducEm?.toISOString() ?? null,
      criadoEm: parcial.criadoEm.toISOString(),
      atualizadoEm: parcial.atualizadoEm.toISOString(),
    })),
    saidas: saidas.map((saida) => ({
      ...saida,
      dia: saida.dia.toISOString().slice(0, 10),
    })),
    entradas: entradas.map((entrada) => ({
      ...entrada,
      dia: entrada.dia.toISOString().slice(0, 10),
    })),
    justificativas: ordenarPorRotulo(justificativas),
    liberadores: ordenarPorRotulo(liberadores),
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

    // Liberadores do catálogo; cópias antigas não trazem o campo.
    const liberadoresAtuais = new Map(
      (
        await tx.liberador.findMany({
          select: { id: true, codigo: true, rotulo: true, ativo: true },
        })
      ).map((item) => [item.codigo.toLowerCase(), item]),
    );
    for (const item of copia.liberadores ?? []) {
      const atual = liberadoresAtuais.get(item.codigo.toLowerCase());
      if (!atual) {
        await tx.liberador.create({ data: item });
        resultado.adicionadas += 1;
      } else if (atual.rotulo === item.rotulo && atual.ativo === item.ativo) {
        resultado.identicas += 1;
      } else {
        resultado.conflitos += 1;
      }
    }
    const codigosDeLiberacao = new Set(
      (await tx.liberador.findMany({ select: { codigo: true } })).map((item) => item.codigo),
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
            desistenteEm: true,
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
    if (alunosNovos.length > 0)
      await tx.aluno.createMany({
        data: alunosNovos.map((aluno) => ({
          ...aluno,
          ...(aluno.desistenteEm ? { situacaoAtualizadaEm: new Date() } : {}),
        })),
      });
    for (const aluno of copia.alunos) {
      const atual = alunosAtuais.get(aluno.id);
      if (atual) {
        const igual =
          atual.turmaId === aluno.turmaId &&
          atual.turmaOriginalId === aluno.turmaOriginalId &&
          atual.nome === aluno.nome &&
          atual.ordem === aluno.ordem &&
          atual.ativo === aluno.ativo &&
          (atual.desistenteEm?.toISOString().slice(0, 10) ?? null) === (aluno.desistenteEm ?? null);
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
              in: [
                ...copia.saidas.map((saida) => saida.liberadoPorId),
                ...copia.frequencias.flatMap((frequencia) =>
                  (frequencia.confirmacoesSeduc ?? []).map((item) => item.registradoSeducPorId),
                ),
                ...(copia.frequenciasParciais ?? []).flatMap((parcial) => [
                  parcial.criadoPorId,
                  parcial.atualizadoPorId,
                  parcial.registradoSeducPorId,
                ]),
              ].filter((valor): valor is string => Boolean(valor)),
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
          alunos: {
            select: {
              alunoId: true,
              registradoSeduc: true,
              registradoSeducEm: true,
              registradoSeducPorNome: true,
              revisaoSeduc: true,
            },
          },
          faltas: {
            select: { alunoId: true, horarioId: true, justificativa: true, observacao: true },
          },
        },
      });
      if (atual) {
        const confirmacoesIguais =
          !frequencia.confirmacoesSeduc ||
          frequencia.confirmacoesSeduc.every((item) => {
            const salva = atual.alunos.find((aluno) => aluno.alunoId === item.alunoId);
            return (
              salva &&
              salva.registradoSeduc === item.registradoSeduc &&
              (salva.registradoSeducEm?.toISOString() ?? null) ===
                (item.registradoSeducEm ?? null) &&
              salva.registradoSeducPorNome === (item.registradoSeducPorNome ?? null) &&
              salva.revisaoSeduc === item.revisaoSeduc
            );
          });
        if (faltasIguais(atual.faltas, frequencia.faltas) && confirmacoesIguais)
          resultado.identicas += 1;
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
      // Sem lista na cópia, vale o que ela diz da turma: ativos dela e quem
      // tem falta na chamada.
      const lista = new Set(
        (
          frequencia.alunos ??
          copia.alunos
            .filter((aluno) => aluno.ativo && aluno.turmaId === frequencia.turmaId)
            .map((aluno) => aluno.id)
        ).concat(frequencia.faltas.map((falta) => falta.alunoId)),
      );
      if (
        (frequencia.confirmacoesSeduc ?? []).some(
          (item) => !lista.has(item.alunoId) || !idsAlunos.has(item.alunoId),
        )
      ) {
        resultado.conflitos += 1;
        continue;
      }
      const confirmacoes = new Map(
        (frequencia.confirmacoesSeduc ?? []).map((item) => [item.alunoId, item]),
      );
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
          alunos: {
            create: [...lista]
              .filter((alunoId) => idsAlunos.has(alunoId))
              .map((alunoId) => {
                const confirmacao = confirmacoes.get(alunoId);
                return {
                  alunoId,
                  registradoSeduc: confirmacao?.registradoSeduc ?? false,
                  registradoSeducEm: confirmacao?.registradoSeducEm
                    ? new Date(confirmacao.registradoSeducEm)
                    : null,
                  registradoSeducPorNome: confirmacao?.registradoSeducPorNome ?? null,
                  registradoSeducPorId:
                    confirmacao?.registradoSeducPorId &&
                    idsUsuarios.has(confirmacao.registradoSeducPorId)
                      ? confirmacao.registradoSeducPorId
                      : null,
                  revisaoSeduc: confirmacao?.revisaoSeduc ?? 0,
                };
              }),
          },
        },
      });
      resultado.adicionadas += 1;
    }

    // Registros parciais têm identidade própria e não alteram a chamada regular.
    for (const parcial of copia.frequenciasParciais ?? []) {
      if (!idsAlunos.has(parcial.alunoId) || !idsTurmas.has(parcial.turmaId)) {
        resultado.conflitos += 1;
        continue;
      }
      const diaRepositorio = new Date(`${parcial.dia}T12:00:00Z`);
      const usuarioExistente = (id: string | null | undefined) =>
        id && idsUsuarios.has(id) ? id : null;
      const data = {
        ...parcial,
        dia: diaRepositorio,
        turno: parcial.turno ?? null,
        observacao: parcial.observacao ?? null,
        registradoSeducEm: parcial.registradoSeducEm ? new Date(parcial.registradoSeducEm) : null,
        registradoSeducPorId: usuarioExistente(parcial.registradoSeducPorId),
        registradoSeducPorNome: parcial.registradoSeducPorNome ?? null,
        criadoPorId: usuarioExistente(parcial.criadoPorId),
        atualizadoPorId: usuarioExistente(parcial.atualizadoPorId),
        ...(parcial.criadoEm ? { criadoEm: new Date(parcial.criadoEm) } : {}),
        ...(parcial.atualizadoEm ? { atualizadoEm: new Date(parcial.atualizadoEm) } : {}),
      };
      const existentes = await tx.frequenciaParcial.findMany({
        where: {
          OR: [{ id: parcial.id }, { alunoId: parcial.alunoId, dia: diaRepositorio }],
        },
        take: 2,
      });
      const atual = existentes[0];
      if (atual) {
        const igual =
          existentes.length === 1 &&
          atual.alunoId === data.alunoId &&
          atual.dia.toISOString().slice(0, 10) === parcial.dia &&
          atual.turmaId === data.turmaId &&
          atual.alunoNome === data.alunoNome &&
          atual.turmaNome === data.turmaNome &&
          atual.tipo === data.tipo &&
          atual.turno === data.turno &&
          atual.aulas.join(",") === data.aulas.join(",") &&
          atual.observacao === data.observacao &&
          atual.registradoSeduc === data.registradoSeduc &&
          (atual.registradoSeducEm?.getTime() ?? null) ===
            (data.registradoSeducEm?.getTime() ?? null) &&
          atual.registradoSeducPorId === data.registradoSeducPorId &&
          atual.registradoSeducPorNome === data.registradoSeducPorNome &&
          atual.revisao === data.revisao &&
          atual.criadoPorId === data.criadoPorId &&
          atual.atualizadoPorId === data.atualizadoPorId &&
          (!data.criadoEm || atual.criadoEm.getTime() === new Date(data.criadoEm).getTime()) &&
          (!data.atualizadoEm ||
            atual.atualizadoEm.getTime() === new Date(data.atualizadoEm).getTime());
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
        continue;
      }
      await tx.frequenciaParcial.create({ data });
      resultado.adicionadas += 1;
    }

    // Saídas
    for (const saida of copia.saidas) {
      const codigo = saida.justificativa ?? null;
      const texto = saida.texto?.trim() ? saida.texto.trim() : null;
      const codigoLiberacao = saida.liberadoPorCodigo ?? null;
      const codigoLiberacaoInvalido =
        codigoLiberacao !== null && !codigosDeLiberacao.has(codigoLiberacao);
      if (
        !idsAlunos.has(saida.alunoId) ||
        codigoLiberacaoInvalido ||
        (codigo !== null && !codigosDeJustificativa.has(codigo)) ||
        (codigo === null && !texto)
      ) {
        resultado.conflitos += 1;
        continue;
      }
      const diaRepositorio = new Date(`${saida.dia}T12:00:00Z`);
      const atual = await tx.saidaAntecipada.findUnique({
        where: { alunoId_dia: { alunoId: saida.alunoId, dia: diaRepositorio } },
        select: {
          id: true,
          momento: true,
          horario: true,
          justificativa: true,
          observacao: true,
          texto: true,
          liberadoPorCodigo: true,
        },
      });
      if (atual) {
        const igual =
          atual.momento === saida.momento &&
          (atual.horario ?? null) === (saida.horario ?? null) &&
          atual.justificativa === codigo &&
          (atual.observacao ?? null) === (saida.observacao ?? null) &&
          (atual.texto ?? null) === texto &&
          (atual.liberadoPorCodigo ?? null) === codigoLiberacao;
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
        continue;
      }
      await tx.saidaAntecipada.create({
        data: {
          alunoId: saida.alunoId,
          dia: diaRepositorio,
          momento: saida.momento,
          horario: saida.horario ?? null,
          justificativa: codigo,
          observacao: saida.observacao ?? null,
          texto,
          liberadoPorId:
            saida.liberadoPorId && idsUsuarios.has(saida.liberadoPorId)
              ? saida.liberadoPorId
              : null,
          liberadoPorCodigo: codigoLiberacao,
          criadoPorId: admin.id,
        },
      });
      resultado.adicionadas += 1;
    }

    // Entradas ausentes em cópias antigas continuam preservadas.
    for (const entrada of copia.entradas ?? []) {
      if (!idsAlunos.has(entrada.alunoId) || !idsTurmas.has(entrada.turmaId)) {
        resultado.conflitos += 1;
        continue;
      }
      const diaRepositorio = new Date(`${entrada.dia}T12:00:00Z`);
      const atual = await tx.entradaAtrasada.findUnique({
        where: { alunoId_dia: { alunoId: entrada.alunoId, dia: diaRepositorio } },
      });
      if (atual) {
        const igual =
          atual.horario === entrada.horario &&
          atual.motivo === entrada.motivo &&
          atual.turmaId === entrada.turmaId &&
          atual.turmaRotulo === entrada.turmaRotulo &&
          atual.registradoPorNome === entrada.registradoPorNome &&
          (atual.momento ?? null) === (entrada.momento ?? null) &&
          (atual.responsavelRegistroCodigo ?? null) ===
            (entrada.responsavelRegistroCodigo ?? null) &&
          (atual.responsavelRegistroNome ?? null) === (entrada.responsavelRegistroNome ?? null);
        if (igual) resultado.identicas += 1;
        else resultado.conflitos += 1;
        continue;
      }
      // O código exportado é preservado. Um código já usado não substitui outro registro.
      if (await tx.entradaAtrasada.findUnique({ where: { id: entrada.id } })) {
        resultado.conflitos += 1;
        continue;
      }
      await tx.entradaAtrasada.create({
        data: { ...entrada, dia: diaRepositorio, criadoPorId: admin.id },
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
