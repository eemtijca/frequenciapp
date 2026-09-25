// Casos de uso de séries escolares: gestão completa pelo administrador.
// O restante da aplicação só lê.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import type { Serie } from "@/domain/frequencia";

const nomeSerie = z
  .string()
  .trim()
  .min(1, "Informe o nome da série.")
  .max(40, "O nome da série deve ter no máximo 40 caracteres.");

const ordemSerie = z
  .number({ message: "A ordem deve ser um número." })
  .int("A ordem deve ser um número inteiro.")
  .min(1, "A ordem deve ser ao menos 1.")
  .max(999, "A ordem deve ser no máximo 999.");

export const esquemaCriarSerie = z.object({
  nome: nomeSerie,
  ordem: ordemSerie,
});

export const esquemaAtualizarSerie = z
  .object({
    nome: nomeSerie.optional(),
    ordem: ordemSerie.optional(),
  })
  .refine((dados) => dados.nome !== undefined || dados.ordem !== undefined, {
    message: "Nada a atualizar.",
  });

function paraSerie(linha: { id: string; nome: string; ordem: number }): Serie {
  return { id: linha.id, nome: linha.nome, ordem: linha.ordem };
}

/** Lista as séries na ordem de exibição. */
export async function listarSeries(): Promise<Serie[]> {
  const linhas = await banco().serie.findMany({
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
  });
  return linhas.map(paraSerie);
}

export async function criarSerie(admin: { id: string }, entrada: unknown): Promise<Serie> {
  const dados = esquemaCriarSerie.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const duplicada = await banco().serie.findFirst({
    where: { nome: { equals: dados.data.nome, mode: "insensitive" } },
  });
  if (duplicada) throw new ErroHttp("Já existe uma série com este nome.", 409);
  const linha = await comTransacao(async (tx) => {
    const criada = await tx.serie.create({
      data: { nome: dados.data.nome, ordem: dados.data.ordem },
    });
    await auditar(tx, admin.id, "serie.criar", dados.data.nome);
    return criada;
  });
  return paraSerie(linha);
}

export async function atualizarSerie(
  admin: { id: string },
  id: string,
  entrada: unknown,
): Promise<Serie> {
  const dados = esquemaAtualizarSerie.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await banco().serie.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Série não encontrada.", 404);
  if (dados.data.nome !== undefined && dados.data.nome !== existente.nome) {
    const duplicada = await banco().serie.findFirst({
      where: { nome: { equals: dados.data.nome, mode: "insensitive" } },
    });
    if (duplicada) throw new ErroHttp("Já existe uma série com este nome.", 409);
  }
  const linha = await comTransacao(async (tx) => {
    const atualizada = await tx.serie.update({ where: { id }, data: dados.data });
    await auditar(tx, admin.id, "serie.atualizar", atualizada.nome);
    return atualizada;
  });
  return paraSerie(linha);
}

/** Exclui uma série sem turmas. Com turmas, o banco barra e explica. */
export async function removerSerie(admin: { id: string }, id: string): Promise<void> {
  const turmas = await banco().turma.count({ where: { serieId: id } });
  if (turmas > 0) {
    throw new ErroHttp(
      `Esta série tem ${turmas} ${turmas === 1 ? "turma" : "turmas"}. Exclua ou mova as turmas antes.`,
      409,
    );
  }
  const existente = await banco().serie.findUnique({ where: { id } });
  if (!existente) throw new ErroHttp("Série não encontrada.", 404);
  await comTransacao(async (tx) => {
    await tx.serie.delete({ where: { id } });
    await auditar(tx, admin.id, "serie.excluir", existente.nome);
  });
}
