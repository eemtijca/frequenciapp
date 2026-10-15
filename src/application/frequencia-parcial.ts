// Presenças personalizadas e justificativas por período, com revisão otimista
// e confirmação manual do lançamento na SEDUC invalidada após correções.
import { aplicarJustificativaEmChamadasSalvas } from "@/application/justificativas-antecipadas";
import { z } from "zod";
import type { Prisma, FrequenciaParcial as LinhaParcial } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import {
  diaLocal,
  ehDiaValido,
  ehDomingo,
  diasEntre,
  JUSTIFICATIVA_OUTROS,
} from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";
import { exigirDiaLetivo, travarCalendario } from "@/application/calendario-letivo";
import {
  limiteAgendamentoParcial,
  LIMITE_AULAS_PARCIAL,
  LIMITE_OBSERVACAO_PARCIAL,
  normalizarAulas,
  type FrequenciaParcial,
} from "@/domain/frequencia-parcial";

export const esquemaRegistroParcial = z
  .object({
    alunoId: z.uuid("Aluno inválido."),
    turmaId: z.uuid("Turma inválida.").optional(),
    dia: z.string().refine(ehDiaValido, "Data inválida."),
    ate: z.string().refine(ehDiaValido, "Data final inválida.").optional(),
    justificativa: z.string().trim().min(1).max(10).nullable().optional(),
    tipo: z.enum(
      ["DIA_INTEIRO", "TURNO", "AULAS", "JUSTIFICADA"],
      "Escolha a presença personalizada ou a justificativa.",
    ),
    turno: z.enum(["MANHA", "TARDE"]).nullable().optional(),
    aulas: z
      .array(z.number().int().min(1).max(LIMITE_AULAS_PARCIAL))
      .max(LIMITE_AULAS_PARCIAL)
      .default([]),
    observacao: z.string().trim().max(LIMITE_OBSERVACAO_PARCIAL).nullable().optional(),
    revisao: z.number().int().min(0).optional(),
    baseChamada: z
      .object({ turmaId: z.uuid("Turma inválida."), revisao: z.number().int().min(1) })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((dados, ctx) => {
    if (
      dados.tipo === "JUSTIFICADA" &&
      (!dados.justificativa ||
        dados.turno ||
        dados.aulas.length ||
        (dados.observacao?.length ?? 0) > 200)
    )
      ctx.addIssue({
        code: "custom",
        message: "Escolha a justificativa do dia inteiro, com observação de até 200 caracteres.",
      });
    if (
      dados.tipo !== "JUSTIFICADA" &&
      (dados.justificativa || (dados.ate && dados.ate !== dados.dia))
    )
      ctx.addIssue({
        code: "custom",
        message: "O período e a justificativa são exclusivos da ausência justificada.",
      });
    if (
      dados.ate &&
      (dados.ate < dados.dia || (Date.parse(dados.ate) - Date.parse(dados.dia)) / 86_400_000 > 30)
    )
      ctx.addIssue({
        code: "custom",
        message: "Escolha um período de até 31 dias, em ordem de data.",
      });
    if (dados.tipo === "DIA_INTEIRO" && (dados.turno || dados.aulas.length))
      ctx.addIssue({
        code: "custom",
        message: "Escolha o dia inteiro, sem combinar com turno ou aulas.",
      });
    if (dados.tipo === "TURNO" && (!dados.turno || dados.aulas.length))
      ctx.addIssue({
        code: "custom",
        message: "Escolha um turno inteiro, sem combinar com aulas.",
      });
    if (dados.tipo === "AULAS" && (dados.turno || !dados.aulas.length))
      ctx.addIssue({
        code: "custom",
        message: "Escolha as aulas frequentadas, sem combinar com turno.",
      });
  });

export const esquemaFiltrosParciais = z
  .object({
    dia: z.string().refine(ehDiaValido, "Data inválida.").optional(),
    de: z.string().refine(ehDiaValido, "Data inicial inválida.").optional(),
    ate: z.string().refine(ehDiaValido, "Data final inválida.").optional(),
    turmaId: z.uuid("Turma inválida.").optional(),
  })
  .refine((dados) => Boolean(dados.de) === Boolean(dados.ate), "Informe as duas datas do período.")
  .refine((dados) => !(dados.dia && dados.de), "Escolha um dia ou um período.")
  .refine((dados) => !dados.de || !dados.ate || dados.ate >= dados.de, "Confira a ordem das datas.")
  .refine(
    (dados) =>
      !dados.de || !dados.ate || (Date.parse(dados.ate) - Date.parse(dados.de)) / 86400000 < 92,
    "Consulte períodos de até três meses por vez.",
  );

/** DTO sem identificadores de autoria internos; datas civis não mudam de fuso. */
function apresentar(linha: LinhaParcial): FrequenciaParcial {
  return {
    id: linha.id,
    alunoId: linha.alunoId,
    turmaId: linha.turmaId,
    alunoNome: linha.alunoNome,
    turmaNome: linha.turmaNome,
    dia: linha.dia.toISOString().slice(0, 10),
    tipo: linha.tipo,
    justificativa: linha.justificativa,
    turno: linha.turno,
    aulas: linha.aulas,
    observacao: linha.observacao,
    revisao: linha.revisao,
    registradoSeduc: linha.registradoSeduc,
    registradoSeducEm: linha.registradoSeducEm?.toISOString() ?? null,
    registradoSeducPorNome: linha.registradoSeducPorNome,
    criadoEm: linha.criadoEm.toISOString(),
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

export async function listarFrequenciasParciais(
  entrada: z.input<typeof esquemaFiltrosParciais>,
): Promise<FrequenciaParcial[]> {
  const dados = esquemaFiltrosParciais.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Período inválido.", 400);
  const dia = dados.data.dia ?? diaLocal(new Date(), ambiente.fuso);
  const de = dados.data.de ?? dia;
  const ate = dados.data.ate ?? dia;
  const linhas = await banco().frequenciaParcial.findMany({
    where: {
      dia: { gte: new Date(`${de}T12:00:00Z`), lte: new Date(`${ate}T12:00:00Z`) },
      ...(dados.data.turmaId ? { turmaId: dados.data.turmaId } : {}),
    },
    orderBy: [{ dia: "asc" }, { alunoNome: "asc" }, { id: "asc" }],
  });
  return linhas.map(apresentar);
}

function validarDataParcial(dados: z.output<typeof esquemaRegistroParcial>) {
  const hoje = diaLocal(new Date(), ambiente.fuso);
  if (dados.dia > hoje && dados.tipo !== "JUSTIFICADA")
    throw new ErroHttp(
      "Datas futuras permitem apenas justificativas, sem antecipar presenças.",
      400,
    );
  if ((dados.ate ?? dados.dia) > limiteAgendamentoParcial(hoje))
    throw new ErroHttp("Agende justificativas para até um ano à frente.", 400);
}
async function conferirJustificativa(tx: Prisma.TransactionClient, codigo: string | null) {
  if (
    codigo &&
    !(await tx.justificativa.findFirst({ where: { codigo }, select: { codigo: true } }))
  )
    throw new ErroHttp("A justificativa não está no catálogo. Recarregue a lista e confira.", 400);
}

/** Grava o intervalo inteiro ou nada, sem sobrescrever registros já existentes. */
export async function salvarPeriodoParcial(
  identidade: Identidade,
  entrada: unknown,
): Promise<FrequenciaParcial[]> {
  const validacao = esquemaRegistroParcial.safeParse(entrada);
  if (!validacao.success)
    throw new ErroHttp(validacao.error.issues[0]?.message ?? "Registro inválido.", 400);
  const dados = validacao.data;
  if (!dados.ate || dados.ate === dados.dia)
    return [await salvarFrequenciaParcial(identidade, entrada)];
  validarDataParcial(dados);
  if (dados.tipo !== "JUSTIFICADA" || !dados.justificativa || dados.revisao || dados.baseChamada)
    throw new ErroHttp(
      "Crie o período como uma nova justificativa; edite registros existentes por dia.",
      400,
    );
  try {
    const linhas = await comTransacao(
      async (tx) => {
        // A trava compartilhada cobre todo o intervalo e vem antes das consultas.
        await travarCalendario(tx, "SHARE");
        await conferirJustificativa(tx, dados.justificativa ?? null);
        const aluno = await tx.aluno.findUnique({
          where: { id: dados.alunoId },
          include: { turma: { include: { serie: true } } },
        });
        if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
        if (!aluno.ativo || (dados.turmaId && aluno.turmaId !== dados.turmaId))
          throw new ErroHttp("O cadastro do aluno mudou. Recarregue a lista.", 409);
        const feriados = new Set(
          (
            await tx.feriado.findMany({
              where: {
                dia: {
                  gte: new Date(`${dados.dia}T12:00:00Z`),
                  lte: new Date(`${dados.ate}T12:00:00Z`),
                },
              },
              select: { dia: true },
            })
          ).map((f) => f.dia.toISOString().slice(0, 10)),
        );
        const dias = diasEntre(dados.dia, dados.ate ?? dados.dia).filter(
          (dia) => !ehDomingo(dia) && !feriados.has(dia),
        );
        if (!dias.length)
          throw new ErroHttp("O período não tem dias disponíveis para justificar.", 400);
        const desistenteEm = aluno.desistenteEm?.toISOString().slice(0, 10);
        if (desistenteEm && dias.some((dia) => dia >= desistenteEm))
          throw new ErroHttp("O aluno está desistente em parte do período. Confira as datas.", 409);
        const datas = dias.map((dia) => new Date(`${dia}T12:00:00Z`));
        if (await tx.frequenciaParcial.count({ where: { alunoId: aluno.id, dia: { in: datas } } }))
          throw new ErroHttp(
            "Já há registros no período. Ajuste as datas ou edite cada dia, sem sobrescrever o histórico.",
            409,
          );
        const criadas = await tx.frequenciaParcial.createManyAndReturn({
          data: datas.map((dia) => ({
            alunoId: aluno.id,
            dia,
            turmaId: aluno.turmaId,
            alunoNome: aluno.nome,
            turmaNome: `${aluno.turma.serie.nome} ${aluno.turma.nome}`,
            tipo: "JUSTIFICADA",
            justificativa: dados.justificativa,
            turno: null,
            aulas: [],
            observacao:
              dados.justificativa === JUSTIFICATIVA_OUTROS ? dados.observacao || null : null,
            criadoPorId: identidade.id,
            atualizadoPorId: identidade.id,
          })),
        });
        await aplicarJustificativaEmChamadasSalvas(
          tx,
          aluno.id,
          datas,
          dados.justificativa ?? "",
          dados.justificativa === JUSTIFICATIVA_OUTROS ? dados.observacao || null : null,
          identidade.id,
        );
        await auditar(
          tx,
          identidade.id,
          "parcial.justificarPeriodo",
          `aluno:${aluno.id}:${dados.dia}:${dados.ate}`,
        );
        return criadas;
      },
      { timeout: 15_000 },
    );
    return linhas.sort((a, b) => a.dia.getTime() - b.dia.getTime()).map(apresentar);
  } catch (erro) {
    if (ehDuplicidade(erro))
      throw new ErroHttp("O período recebeu outro registro. Recarregue antes de continuar.", 409);
    throw erro;
  }
}

export async function salvarFrequenciaParcial(
  identidade: Identidade,
  entrada: unknown,
): Promise<FrequenciaParcial> {
  const dados = esquemaRegistroParcial.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Registro inválido.", 400);
  if (ehDomingo(dados.data.dia)) throw new ErroHttp("Domingo não tem aula nem chamada.", 400);
  validarDataParcial(dados.data);

  const valores = {
    tipo: dados.data.tipo,
    justificativa: dados.data.tipo === "JUSTIFICADA" ? (dados.data.justificativa ?? null) : null,
    turno: dados.data.tipo === "TURNO" ? (dados.data.turno ?? null) : null,
    aulas: dados.data.tipo === "AULAS" ? normalizarAulas(dados.data.aulas) : [],
    observacao:
      dados.data.tipo === "JUSTIFICADA" && dados.data.justificativa !== JUSTIFICATIVA_OUTROS
        ? null
        : dados.data.observacao || null,
  };
  const dia = new Date(`${dados.data.dia}T12:00:00Z`);
  try {
    const salva = await comTransacao(async (tx) => {
      await exigirDiaLetivo(dados.data.dia, tx);
      await conferirJustificativa(tx, valores.justificativa);
      const existente = await tx.frequenciaParcial.findUnique({
        where: { alunoId_dia: { alunoId: dados.data.alunoId, dia } },
      });
      if (existente) {
        if (dados.data.revisao !== existente.revisao)
          throw new ErroHttp("Este registro mudou. Recarregue a lista antes de corrigir.", 409);
        if (dados.data.turmaId && dados.data.turmaId !== existente.turmaId)
          throw new ErroHttp("A turma do registro mudou. Recarregue a lista.", 409);
        if (
          existente.tipo === valores.tipo &&
          existente.justificativa === valores.justificativa &&
          existente.turno === valores.turno &&
          JSON.stringify(existente.aulas) === JSON.stringify(valores.aulas) &&
          existente.observacao === valores.observacao
        )
          return existente;
        const atualizada = await tx.frequenciaParcial.update({
          where: { id: existente.id, revisao: existente.revisao },
          data: {
            ...valores,
            revisao: { increment: 1 },
            atualizadoPorId: identidade.id,
            registradoSeduc: false,
            registradoSeducEm: null,
            registradoSeducPorId: null,
            registradoSeducPorNome: null,
          },
        });
        if (valores.justificativa)
          await aplicarJustificativaEmChamadasSalvas(
            tx,
            existente.alunoId,
            [dia],
            valores.justificativa,
            valores.observacao,
            identidade.id,
          );
        await auditar(tx, identidade.id, "parcial.corrigir", `parcial:${existente.id}`);
        return atualizada;
      }
      if (dados.data.revisao !== undefined && dados.data.revisao !== 0)
        throw new ErroHttp("O registro foi removido. Recarregue a lista antes de salvar.", 409);
      const base = dados.data.baseChamada
        ? await tx.frequencia.findUnique({
            where: { turmaId_dia: { turmaId: dados.data.baseChamada.turmaId, dia } },
            include: {
              turma: { include: { serie: true } },
              alunos: { where: { alunoId: dados.data.alunoId }, select: { alunoId: true } },
            },
          })
        : null;
      if (
        dados.data.baseChamada &&
        (!base ||
          base.revisao !== dados.data.baseChamada.revisao ||
          base.alunos.length !== 1 ||
          (dados.data.turmaId && dados.data.turmaId !== base.turmaId))
      )
        throw new ErroHttp(
          "A chamada do dia mudou. Recarregue a lista antes de personalizar.",
          409,
        );
      if (base) {
        const vigente = await tx.frequencia.findFirst({
          where: { dia, alunos: { some: { alunoId: dados.data.alunoId } } },
          orderBy: [{ atualizadoEm: "desc" }, { id: "asc" }],
          select: { id: true },
        });
        if (vigente?.id !== base.id)
          throw new ErroHttp(
            "A chamada usada como base mudou. Recarregue a lista antes de personalizar.",
            409,
          );
      }
      const aluno = await tx.aluno.findUnique({
        where: { id: dados.data.alunoId },
        include: { turma: { include: { serie: true } } },
      });
      if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
      if (
        !base &&
        (!aluno.ativo ||
          (aluno.desistenteEm && aluno.desistenteEm.toISOString().slice(0, 10) <= dados.data.dia))
      )
        throw new ErroHttp("Este aluno está desativado ou desistente nesta data.", 409);
      if (!base && dados.data.turmaId && dados.data.turmaId !== aluno.turmaId)
        throw new ErroHttp(
          "Este aluno mudou de turma. Recarregue a lista antes de registrar.",
          409,
        );
      const turma = base?.turma ?? aluno.turma;
      const criada = await tx.frequenciaParcial.create({
        data: {
          ...valores,
          alunoId: aluno.id,
          dia,
          turmaId: turma.id,
          alunoNome: aluno.nome,
          turmaNome: `${turma.serie.nome} ${turma.nome}`,
          criadoPorId: identidade.id,
          atualizadoPorId: identidade.id,
        },
      });
      if (valores.justificativa)
        await aplicarJustificativaEmChamadasSalvas(
          tx,
          aluno.id,
          [dia],
          valores.justificativa,
          valores.observacao,
          identidade.id,
        );
      await auditar(tx, identidade.id, "parcial.criar", `parcial:${criada.id}`);
      return criada;
    });
    return apresentar(salva);
  } catch (erro) {
    if (ehDuplicidade(erro))
      throw new ErroHttp(
        "Este aluno já tem um registro neste dia. Recarregue a lista para corrigir.",
        409,
      );
    throw erro;
  }
}

export async function confirmarSeduc(
  identidade: Identidade,
  id: string,
  entrada: unknown,
): Promise<FrequenciaParcial> {
  const dados = z
    .object({ registrado: z.boolean(), revisao: z.number().int().min(1) })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a confirmação e recarregue a lista.", 400);
  const salva = await comTransacao(async (tx) => {
    const existente = await tx.frequenciaParcial.findUnique({ where: { id } });
    if (!existente) throw new ErroHttp("Registro parcial não encontrado.", 404);
    if (existente.revisao !== dados.data.revisao)
      throw new ErroHttp(
        "Este registro mudou. Confira a frequência antes de confirmar na Seduc.",
        409,
      );
    if (existente.registradoSeduc === dados.data.registrado) return existente;
    const alterada = await tx.frequenciaParcial.update({
      where: { id, revisao: existente.revisao },
      data: {
        registradoSeduc: dados.data.registrado,
        registradoSeducEm: dados.data.registrado ? new Date() : null,
        registradoSeducPorId: dados.data.registrado ? identidade.id : null,
        registradoSeducPorNome: dados.data.registrado ? identidade.nome : null,
        atualizadoPorId: identidade.id,
        revisao: { increment: 1 },
      },
    });
    await auditar(
      tx,
      identidade.id,
      dados.data.registrado ? "parcial.confirmarSeduc" : "parcial.reabrirSeduc",
      `parcial:${id}`,
    );
    return alterada;
  });
  return apresentar(salva);
}

export async function removerFrequenciaParcial(
  identidade: Identidade,
  id: string,
  entrada: unknown,
): Promise<void> {
  const dados = z
    .object({ revisao: z.number().int().min(1) })
    .strict()
    .safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Recarregue a lista antes de remover.", 400);
  await comTransacao(async (tx) => {
    const existente = await tx.frequenciaParcial.findUnique({ where: { id } });
    if (!existente) throw new ErroHttp("Registro parcial não encontrado.", 404);
    if (existente.revisao !== dados.data.revisao)
      throw new ErroHttp("Este registro mudou. Recarregue a lista antes de remover.", 409);
    await tx.frequenciaParcial.delete({ where: { id, revisao: existente.revisao } });
    // Voltar à presença da chamada exige nova conferência do lançamento na Seduc.
    await tx.alunoDaChamada.updateMany({
      where: {
        alunoId: existente.alunoId,
        frequencia: { dia: existente.dia },
      },
      data: {
        registradoSeduc: false,
        registradoSeducEm: null,
        registradoSeducPorId: null,
        registradoSeducPorNome: null,
        revisaoSeduc: { increment: 1 },
      },
    });
    await auditar(tx, identidade.id, "parcial.remover", `parcial:${id}`);
  });
}
