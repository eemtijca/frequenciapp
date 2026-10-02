// Registro independente de presenças parciais, com revisão otimista e
// confirmação manual do lançamento na Seduc invalidada após uma correção.
import { z } from "zod";
import type { FrequenciaParcial as LinhaParcial } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import { diaLocal, ehDiaValido } from "@/domain/frequencia";
import type { Identidade } from "@/domain/usuarios";
import {
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
    tipo: z.enum(["TURNO", "AULAS"], "Escolha o turno ou as aulas frequentadas."),
    turno: z.enum(["MANHA", "TARDE"]).nullable().optional(),
    aulas: z
      .array(z.number().int().min(1).max(LIMITE_AULAS_PARCIAL))
      .max(LIMITE_AULAS_PARCIAL)
      .default([]),
    observacao: z.string().trim().max(LIMITE_OBSERVACAO_PARCIAL).nullable().optional(),
    revisao: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((dados, ctx) => {
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

export async function salvarFrequenciaParcial(
  identidade: Identidade,
  entrada: unknown,
): Promise<FrequenciaParcial> {
  const dados = esquemaRegistroParcial.safeParse(entrada);
  if (!dados.success)
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Registro inválido.", 400);
  if (dados.data.dia > diaLocal(new Date(), ambiente.fuso))
    throw new ErroHttp("Não é possível registrar frequência parcial em dia futuro.", 400);
  const valores = {
    tipo: dados.data.tipo,
    turno: dados.data.tipo === "TURNO" ? (dados.data.turno ?? null) : null,
    aulas: dados.data.tipo === "AULAS" ? normalizarAulas(dados.data.aulas) : [],
    observacao: dados.data.observacao || null,
  };
  const dia = new Date(`${dados.data.dia}T12:00:00Z`);
  try {
    const salva = await comTransacao(async (tx) => {
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
        await auditar(tx, identidade.id, "parcial.corrigir", `parcial:${existente.id}`);
        return atualizada;
      }
      if (dados.data.revisao !== undefined && dados.data.revisao !== 0)
        throw new ErroHttp("O registro foi removido. Recarregue a lista antes de salvar.", 409);
      const aluno = await tx.aluno.findUnique({
        where: { id: dados.data.alunoId },
        include: { turma: { include: { serie: true } } },
      });
      if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
      if (
        !aluno.ativo ||
        (aluno.desistenteEm && aluno.desistenteEm.toISOString().slice(0, 10) <= dados.data.dia)
      )
        throw new ErroHttp("Este aluno está desativado ou desistente nesta data.", 409);
      if (dados.data.turmaId && dados.data.turmaId !== aluno.turmaId)
        throw new ErroHttp(
          "Este aluno mudou de turma. Recarregue a lista antes de registrar.",
          409,
        );
      const criada = await tx.frequenciaParcial.create({
        data: {
          ...valores,
          alunoId: aluno.id,
          dia,
          turmaId: aluno.turmaId,
          alunoNome: aluno.nome,
          turmaNome: `${aluno.turma.serie.nome} ${aluno.turma.nome}`,
          criadoPorId: identidade.id,
          atualizadoPorId: identidade.id,
        },
      });
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
    await auditar(tx, identidade.id, "parcial.remover", `parcial:${id}`);
  });
}
