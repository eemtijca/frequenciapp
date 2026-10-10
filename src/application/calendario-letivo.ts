// Calendário anual de feriados, com bloqueio transacional de chamadas e auditoria.
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client";
import { ehAnoLetivoValido, type Feriado } from "@/domain/calendario-letivo";
import { ehDiaValido } from "@/domain/frequencia";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ehDuplicidade, ErroHttp } from "@/infra/erros";
import {
  comTravaPlanilhaFrequencia,
  controleTravaPlanilhaFrequencia,
} from "@/infra/trava-planilha-frequencia";

type Cliente = Prisma.TransactionClient | ReturnType<typeof banco>;

const diaDoCalendario = z
  .string("Informe a data do feriado.")
  .refine(ehDiaValido, "Data inválida.")
  .refine(
    (dia) => ehAnoLetivoValido(Number(dia.slice(0, 4))),
    "Informe uma data entre 1900 e 2199.",
  );

export const esquemaCriarFeriado = z
  .object({
    dia: diaDoCalendario,
    nome: z
      .string("Informe o nome do feriado.")
      .trim()
      .min(1, "Informe o nome do feriado.")
      .max(120, "O nome deve ter no máximo 120 caracteres."),
  })
  .strict();

const CAMPOS = { dia: true, nome: true } as const;

function apresentar(linha: { dia: Date; nome: string }): Feriado {
  return { dia: linha.dia.toISOString().slice(0, 10), nome: linha.nome };
}

/** Valida o ano recebido por consulta; a ausência permite ler todos os anos. */
export function anoDoCalendario(entrada: string | null): number | undefined {
  if (entrada === null) return undefined;
  const ano = Number(entrada);
  if (!/^\d{4}$/.test(entrada) || !ehAnoLetivoValido(ano)) {
    throw new ErroHttp("Informe um ano entre 1900 e 2199.", 400);
  }
  return ano;
}

/** Lista o calendário em ordem de data, opcionalmente limitado a um ano. */
export async function listarFeriados(ano?: number): Promise<Feriado[]> {
  if (ano !== undefined && !ehAnoLetivoValido(ano)) {
    throw new ErroHttp("Informe um ano entre 1900 e 2199.", 400);
  }
  const linhas = await banco().feriado.findMany({
    ...(ano !== undefined
      ? {
          where: {
            dia: {
              gte: new Date(`${ano}-01-01T12:00:00Z`),
              lte: new Date(`${ano}-12-31T12:00:00Z`),
            },
          },
        }
      : {}),
    select: CAMPOS,
    orderBy: { dia: "asc" },
  });
  return linhas.map(apresentar);
}

/** Consulta a data no banco; o cliente transacional permite proteger uma gravação. */
export async function feriadoDoDia(dia: string, tx: Cliente = banco()): Promise<Feriado | null> {
  if (!ehDiaValido(dia)) throw new ErroHttp("Data inválida.", 400);
  const linha = await tx.feriado.findUnique({
    where: { dia: new Date(`${dia}T12:00:00Z`) },
    select: CAMPOS,
  });
  return linha ? apresentar(linha) : null;
}

/** Recusa uma chamada em feriado dentro da mesma transação do salvamento. */
export async function exigirDiaLetivo(dia: string, tx: Prisma.TransactionClient): Promise<void> {
  if (await feriadoDoDia(dia, tx)) {
    throw new ErroHttp(
      "Esta data é feriado. Remova o feriado na Gestão para registrar chamadas.",
      400,
    );
  }
}

/** Cria um feriado sem ocultar ou apagar chamadas já salvas naquela data. */
export async function criarFeriado(admin: { id: string }, entrada: unknown): Promise<Feriado> {
  const dados = esquemaCriarFeriado.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const dia = new Date(`${dados.data.dia}T12:00:00Z`);
  try {
    return await comTravaPlanilhaFrequencia(() =>
      comTransacao(async (tx) => {
        if (await tx.feriado.findUnique({ where: { dia }, select: { dia: true } })) {
          throw new ErroHttp("Já existe um feriado nesta data.", 409);
        }
        const [chamada, parcial] = await Promise.all([
          tx.frequencia.findFirst({ where: { dia }, select: { id: true } }),
          tx.frequenciaParcial.findFirst({ where: { dia }, select: { id: true } }),
        ]);
        if (chamada || parcial) {
          throw new ErroHttp("Esta data já tem frequência salva e não pode virar feriado.", 409);
        }
        controleTravaPlanilhaFrequencia()?.conferir();
        const criada = await tx.feriado.create({
          data: { dia, nome: dados.data.nome, criadoPorId: admin.id },
          select: CAMPOS,
        });
        await auditar(tx, admin.id, "feriado.criar", `feriado:${dados.data.dia}`);
        controleTravaPlanilhaFrequencia()?.conferir();
        return apresentar(criada);
      }),
    );
  } catch (erro) {
    if (ehDuplicidade(erro)) throw new ErroHttp("Já existe um feriado nesta data.", 409);
    throw erro;
  }
}

/** Remove apenas o feriado, sem modificar chamadas, aulas ou a grade semanal. */
export async function removerFeriado(admin: { id: string }, entrada: string): Promise<void> {
  const dados = diaDoCalendario.safeParse(entrada);
  if (!dados.success) throw new ErroHttp(dados.error.issues[0]?.message ?? "Data inválida.", 400);
  const dia = new Date(`${dados.data}T12:00:00Z`);
  await comTravaPlanilhaFrequencia(() =>
    comTransacao(async (tx) => {
      if (!(await tx.feriado.findUnique({ where: { dia }, select: { dia: true } }))) {
        throw new ErroHttp("Feriado não encontrado.", 404);
      }
      controleTravaPlanilhaFrequencia()?.conferir();
      await tx.feriado.delete({ where: { dia } });
      await auditar(tx, admin.id, "feriado.excluir", `feriado:${dados.data}`);
      controleTravaPlanilhaFrequencia()?.conferir();
    }),
  );
}
