// Saídas antecipadas: registro separado da chamada, com momento,
// justificativa (tipo ou texto) e o liberador do catálogo da Gestão.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { ambiente } from "@/infra/ambiente";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import {
  camposJustificativaSaida,
  diaLocal,
  ehDiaValido,
  ehLiberadorValido,
  ehMomentoValido,
  LIMITE_TEXTO_SAIDA,
  type SaidaAntecipada,
} from "@/domain/frequencia";
import { ehHorarioEntrada } from "@/domain/entradas";
import type { Identidade } from "@/domain/usuarios";

export const esquemaCriarSaida = z.object({
  alunoId: z.string().uuid("Aluno inválido."),
  dia: z.string().refine(ehDiaValido, "Data inválida."),
  momento: z
    .string()
    .trim()
    .max(20, "Momento da saída inválido.")
    .refine((codigo) => ehMomentoValido(codigo), "Momento da saída inválido."),
  horario: z.string().refine(ehHorarioEntrada, "Horário inválido. Informe hora e minuto."),
  justificativa: z.string().trim().max(10, "Justificativa inválida.").nullish(),
  texto: z
    .string()
    .trim()
    .max(
      LIMITE_TEXTO_SAIDA,
      `O texto da justificativa deve ter no máximo ${LIMITE_TEXTO_SAIDA} caracteres.`,
    )
    .nullish(),
  observacao: z
    .string()
    .trim()
    .max(200, "A observação deve ter no máximo 200 caracteres.")
    .nullish(),
  liberadoPorCodigo: z.preprocess(
    (valor) => (typeof valor === "string" ? valor : ""),
    z
      .string()
      .trim()
      .min(1, "Escolha quem liberou o estudante.")
      .max(20, "Responsável pela liberação inválido."),
  ),
});

export interface FiltrosSaidas {
  dia?: string;
  de?: string;
  ate?: string;
  alunoId?: string;
  turmaId?: string;
}

interface LinhaSaida {
  id: string;
  alunoId: string;
  dia: Date;
  momento: string;
  horario: string | null;
  justificativa: string | null;
  observacao: string | null;
  texto: string | null;
  liberadoPorId: string | null;
  liberadoPorCodigo: string | null;
  criadoEm: Date;
  liberadoPor: { nome: string } | null;
}

function paraSaida(
  linha: LinhaSaida,
  rotulosLiberador: ReadonlyMap<string, string>,
): SaidaAntecipada {
  return {
    id: linha.id,
    alunoId: linha.alunoId,
    dia: linha.dia.toISOString().slice(0, 10),
    momento: linha.momento,
    horario: linha.horario,
    justificativa: linha.justificativa,
    observacao: linha.observacao,
    texto: linha.texto,
    liberadoPorId: linha.liberadoPorId,
    liberadoPorCodigo: linha.liberadoPorCodigo,
    liberadoPorNome:
      (linha.liberadoPorCodigo ? rotulosLiberador.get(linha.liberadoPorCodigo) : null) ??
      linha.liberadoPor?.nome ??
      null,
    criadoEm: linha.criadoEm.toISOString(),
  };
}

const COMPLEMENTO = { include: { liberadoPor: { select: { nome: true } } } } as const;

/** Saídas por dia, período, aluno ou turma, em ordem cronológica. */
export async function listarSaidas(filtros: FiltrosSaidas = {}): Promise<SaidaAntecipada[]> {
  const [linhas, liberadores] = await Promise.all([
    banco().saidaAntecipada.findMany({
      where: {
        // De e até valem juntos: dois `dia` separados se sobrescreviam e o início sumia.
        ...(filtros.dia
          ? { dia: new Date(`${filtros.dia}T12:00:00Z`) }
          : filtros.de || filtros.ate
            ? {
                dia: {
                  ...(filtros.de ? { gte: new Date(`${filtros.de}T12:00:00Z`) } : {}),
                  ...(filtros.ate ? { lte: new Date(`${filtros.ate}T12:00:00Z`) } : {}),
                },
              }
            : {}),
        ...(filtros.alunoId ? { alunoId: filtros.alunoId } : {}),
        ...(filtros.turmaId ? { aluno: { turmaId: filtros.turmaId } } : {}),
      },
      orderBy: [{ dia: "asc" }, { criadoEm: "asc" }],
      ...COMPLEMENTO,
    }),
    banco().liberador.findMany({ select: { codigo: true, rotulo: true } }),
  ]);
  const rotulosLiberador = new Map(liberadores.map((item) => [item.codigo, item.rotulo]));
  return linhas.map((linha) => paraSaida(linha, rotulosLiberador));
}

/**
 * Registra a saída de um aluno. A justificativa é um tipo do catálogo ou
 * um texto curto, e quem libera é uma pessoa do catálogo da Gestão. Uma
 * saída por aluno e dia, com remoção para correção.
 */
export async function criarSaida(
  identidade: Identidade,
  entrada: unknown,
): Promise<SaidaAntecipada> {
  const dados = esquemaCriarSaida.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const { alunoId, dia, momento, horario } = dados.data;
  const campos = camposJustificativaSaida(momento, dados.data);
  if (!campos.ok) throw new ErroHttp(campos.mensagem, 400);
  if (dia > diaLocal(new Date(), ambiente.fuso)) {
    throw new ErroHttp("Não é possível registrar saída em dia futuro.", 400);
  }
  // O catálogo de justificativas vem do banco e pode ser editado na Gestão.
  if (campos.campos.justificativa) {
    const justificativaNoCatalogo = await banco().justificativa.findFirst({
      where: { codigo: campos.campos.justificativa },
      select: { id: true },
    });
    if (!justificativaNoCatalogo) {
      throw new ErroHttp(
        `A justificativa ${campos.campos.justificativa} não está no catálogo. Atualize a página e confira.`,
        400,
      );
    }
  }
  const aluno = await banco().aluno.findUnique({ where: { id: alunoId } });
  if (!aluno) throw new ErroHttp("Aluno não encontrado.", 404);
  if (!aluno.ativo) {
    throw new ErroHttp(
      "Este aluno está desativado. Reative o cadastro antes de registrar a saída.",
      409,
    );
  }
  // O catálogo de quem libera vem do banco e pode ser editado na Gestão.
  const liberadores = await banco().liberador.findMany({
    select: { codigo: true, rotulo: true },
  });
  if (!ehLiberadorValido(dados.data.liberadoPorCodigo, liberadores)) {
    throw new ErroHttp("Escolha quem liberou o estudante.", 400);
  }
  const rotulosLiberador = new Map(liberadores.map((item) => [item.codigo, item.rotulo]));

  try {
    return await comTransacao(async (tx) => {
      const criada = await tx.saidaAntecipada.create({
        data: {
          alunoId,
          dia: new Date(`${dia}T12:00:00Z`),
          momento,
          horario,
          justificativa: campos.campos.justificativa,
          observacao: campos.campos.observacao,
          texto: campos.campos.texto,
          liberadoPorCodigo: dados.data.liberadoPorCodigo,
          criadoPorId: identidade.id,
        },
        ...COMPLEMENTO,
      });
      await auditar(tx, identidade.id, "saida.criar", `saida:${criada.id}`);
      return paraSaida(criada, rotulosLiberador);
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp(
        "Este aluno já tem uma saída nesta data. Remova o registro anterior para corrigir.",
        409,
      );
    }
    throw erro;
  }
}

/** Remove uma saída para correção, com auditoria. */
export async function removerSaida(identidade: Identidade, id: string): Promise<void> {
  const existente = await banco().saidaAntecipada.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Saída não encontrada.", 404);
  await comTransacao(async (tx) => {
    await tx.saidaAntecipada.delete({ where: { id } });
    await auditar(tx, identidade.id, "saida.remover", `saida:${id}`);
  });
}
