// Configurações de recursos: leitura por qualquer sessão e escrita pela
// administração, com auditoria na mesma transação.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { CONFIGURACOES_PADRAO, type Configuracoes } from "@/domain/frequencia";
import { listarFeriados } from "@/application/calendario-letivo";
import type { Feriado } from "@/domain/calendario-letivo";

const ID = "principal";

export const esquemaAtualizarConfiguracoes = z
  .object({
    frequenciaPorAula: z.boolean().optional(),
    saidaAntecipada: z.boolean().optional(),
    origemNaChamada: z.boolean("Informe se a indicação de origem está ligada.").optional(),
    origemNaChamadaSerieIds: z
      .array(z.uuid("Série inválida."), "Selecione as séries em uma lista.")
      .max(500, "Selecione até 500 séries.")
      .transform((ids) => [...new Set(ids)])
      .optional(),
    origemNaChamadaTurmaIds: z
      .array(z.uuid("Turma inválida."), "Selecione as turmas em uma lista.")
      .max(500, "Selecione até 500 turmas.")
      .transform((ids) => [...new Set(ids)])
      .optional(),
    infrequenciaAtencaoPercentual: z
      .number("Informe o limite de atenção em porcentagem.")
      .int("O limite de atenção deve ser um número inteiro.")
      .min(0, "O limite de atenção deve ficar entre 0 e 100.")
      .max(100, "O limite de atenção deve ficar entre 0 e 100.")
      .optional(),
    infrequenciaCriticaPercentual: z
      .number("Informe o limite crítico em porcentagem.")
      .int("O limite crítico deve ser um número inteiro.")
      .min(0, "O limite crítico deve ficar entre 0 e 100.")
      .max(100, "O limite crítico deve ficar entre 0 e 100.")
      .optional(),
    atualizadoEm: z.iso.datetime("Versão inválida.").optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaConfiguracao {
  frequenciaPorAula: boolean;
  saidaAntecipada: boolean;
  origemNaChamada: boolean;
  infrequenciaAtencaoPercentual: number;
  infrequenciaCriticaPercentual: number;
  origemSeries: { serieId: string }[];
  origemTurmas: { turmaId: string }[];
  atualizadoEm: Date;
}

const SELECAO = {
  frequenciaPorAula: true,
  saidaAntecipada: true,
  origemNaChamada: true,
  infrequenciaAtencaoPercentual: true,
  infrequenciaCriticaPercentual: true,
  origemSeries: { select: { serieId: true }, orderBy: { serieId: "asc" } },
  origemTurmas: { select: { turmaId: true }, orderBy: { turmaId: "asc" } },
  atualizadoEm: true,
} as const;

function paraConfiguracoes(linha: LinhaConfiguracao, feriados: Feriado[]): Configuracoes {
  return {
    frequenciaPorAula: linha.frequenciaPorAula,
    saidaAntecipada: linha.saidaAntecipada,
    origemNaChamada: linha.origemNaChamada,
    origemNaChamadaSerieIds: linha.origemSeries.map((item) => item.serieId),
    origemNaChamadaTurmaIds: linha.origemTurmas.map((item) => item.turmaId),
    infrequenciaAtencaoPercentual: linha.infrequenciaAtencaoPercentual,
    infrequenciaCriticaPercentual: linha.infrequenciaCriticaPercentual,
    feriados,
    atualizadoEm: linha.atualizadoEm.toISOString(),
  };
}

/** Lê as configurações, criando a linha única com os padrões se preciso. */
export async function lerConfiguracoes(): Promise<Configuracoes> {
  const linha = await banco().configuracao.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
    select: SELECAO,
  });
  return paraConfiguracoes(linha, await listarFeriados());
}

/** Atualiza os recursos ligados e desligados pela administração. */
export async function atualizarConfiguracoes(
  admin: { id: string },
  entrada: unknown,
): Promise<Configuracoes> {
  const dados = esquemaAtualizarConfiguracoes.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const linha = await comTransacao(async (tx) => {
    const serieIds = dados.data.origemNaChamadaSerieIds;
    const turmaIds = dados.data.origemNaChamadaTurmaIds;
    if (
      serieIds &&
      (await tx.serie.count({ where: { id: { in: serieIds } } })) !== serieIds.length
    ) {
      throw new ErroHttp("Uma série selecionada não existe mais. Atualize o cadastro.", 400);
    }
    if (
      turmaIds &&
      (await tx.turma.count({ where: { id: { in: turmaIds } } })) !== turmaIds.length
    ) {
      throw new ErroHttp("Uma turma selecionada não existe mais. Atualize o cadastro.", 400);
    }
    if (
      dados.data.infrequenciaAtencaoPercentual !== undefined ||
      dados.data.infrequenciaCriticaPercentual !== undefined
    ) {
      const atual = await tx.configuracao.findUnique({
        where: { id: ID },
        select: {
          infrequenciaAtencaoPercentual: true,
          infrequenciaCriticaPercentual: true,
        },
      });
      const atencao =
        dados.data.infrequenciaAtencaoPercentual ??
        atual?.infrequenciaAtencaoPercentual ??
        CONFIGURACOES_PADRAO.infrequenciaAtencaoPercentual;
      const critica =
        dados.data.infrequenciaCriticaPercentual ??
        atual?.infrequenciaCriticaPercentual ??
        CONFIGURACOES_PADRAO.infrequenciaCriticaPercentual;
      if (atencao >= critica) {
        throw new ErroHttp("O limite de atenção deve ser menor que o limite crítico.", 400);
      }
    }
    if (dados.data.atualizadoEm) {
      const atual = await tx.configuracao.findUnique({
        where: { id: ID },
        select: { atualizadoEm: true },
      });
      if (atual && atual.atualizadoEm.toISOString() !== dados.data.atualizadoEm) {
        throw new ErroHttp(
          "As configurações foram alteradas em outro acesso. Revise antes de salvar.",
          409,
          "CONFIGURACOES_ALTERADAS",
        );
      }
    }
    const atualizada = await tx.configuracao.upsert({
      where: { id: ID },
      update: {
        ...(dados.data.frequenciaPorAula !== undefined
          ? { frequenciaPorAula: dados.data.frequenciaPorAula }
          : {}),
        ...(dados.data.saidaAntecipada !== undefined
          ? { saidaAntecipada: dados.data.saidaAntecipada }
          : {}),
        ...(dados.data.origemNaChamada !== undefined
          ? { origemNaChamada: dados.data.origemNaChamada }
          : {}),
        ...(dados.data.infrequenciaAtencaoPercentual !== undefined
          ? { infrequenciaAtencaoPercentual: dados.data.infrequenciaAtencaoPercentual }
          : {}),
        ...(dados.data.infrequenciaCriticaPercentual !== undefined
          ? { infrequenciaCriticaPercentual: dados.data.infrequenciaCriticaPercentual }
          : {}),
        ...(serieIds !== undefined
          ? { origemSeries: { deleteMany: {}, create: serieIds.map((serieId) => ({ serieId })) } }
          : {}),
        ...(turmaIds !== undefined
          ? { origemTurmas: { deleteMany: {}, create: turmaIds.map((turmaId) => ({ turmaId })) } }
          : {}),
        atualizadoPorId: admin.id,
      },
      create: {
        id: ID,
        frequenciaPorAula: dados.data.frequenciaPorAula ?? CONFIGURACOES_PADRAO.frequenciaPorAula,
        saidaAntecipada: dados.data.saidaAntecipada ?? CONFIGURACOES_PADRAO.saidaAntecipada,
        origemNaChamada: dados.data.origemNaChamada ?? CONFIGURACOES_PADRAO.origemNaChamada,
        infrequenciaAtencaoPercentual:
          dados.data.infrequenciaAtencaoPercentual ??
          CONFIGURACOES_PADRAO.infrequenciaAtencaoPercentual,
        infrequenciaCriticaPercentual:
          dados.data.infrequenciaCriticaPercentual ??
          CONFIGURACOES_PADRAO.infrequenciaCriticaPercentual,
        origemSeries: { create: (serieIds ?? []).map((serieId) => ({ serieId })) },
        origemTurmas: { create: (turmaIds ?? []).map((turmaId) => ({ turmaId })) },
        atualizadoPorId: admin.id,
      },
      select: SELECAO,
    });
    await auditar(tx, admin.id, "configuracao.atualizar", `configuracao:${ID}`);
    return atualizada;
  });
  return paraConfiguracoes(linha, await listarFeriados());
}
