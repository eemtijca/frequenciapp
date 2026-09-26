// Catálogo de justificativas: leitura para toda a sessão e gestão pela
// administração, com auditoria. O código é estável; rótulo e situação podem
// mudar. Não confundir com o catálogo inicial de fábrica, em domain.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp, ehDuplicidade } from "@/infra/erros";
import { ordenarJustificativas, type JustificativaConfigurada } from "@/domain/frequencia";

const codigoJustificativa = z
  .string()
  .trim()
  .min(1, "Informe o código da justificativa.")
  .max(10, "O código deve ter no máximo 10 caracteres.")
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, "Use apenas letras e números, começando por uma letra.");

const rotuloJustificativa = z
  .string()
  .trim()
  .min(2, "O rótulo deve ter ao menos 2 caracteres.")
  .max(60, "O rótulo deve ter no máximo 60 caracteres.");

export const esquemaCriarJustificativa = z.object({
  codigo: codigoJustificativa,
  rotulo: rotuloJustificativa,
});

export const esquemaAtualizarJustificativa = z
  .object({
    rotulo: rotuloJustificativa.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaJustificativa {
  codigo: string;
  rotulo: string;
  ativo: boolean;
}

function paraJustificativa(linha: LinhaJustificativa): JustificativaConfigurada {
  return { codigo: linha.codigo, rotulo: linha.rotulo, ativo: linha.ativo };
}

const CAMPOS = { codigo: true, rotulo: true, ativo: true } as const;

/** Catálogo completo, em ordem alfabética pelo rótulo. */
export async function listarJustificativas(): Promise<JustificativaConfigurada[]> {
  const linhas = await banco().justificativa.findMany({ select: CAMPOS });
  return ordenarJustificativas(linhas);
}

/** Busca uma justificativa pelo código, sem diferenciar caixa. */
async function buscarPorCodigo(
  codigo: string,
): Promise<{ id: string; codigo: string; rotulo: string; ativo: boolean } | null> {
  return banco().justificativa.findFirst({
    where: { codigo: { equals: codigo, mode: "insensitive" } },
    select: { id: true, ...CAMPOS },
  });
}

/** Cria uma justificativa no catálogo. O código vale para o histórico. */
export async function criarJustificativa(
  admin: { id: string },
  entrada: unknown,
): Promise<JustificativaConfigurada> {
  const dados = esquemaCriarJustificativa.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await buscarPorCodigo(dados.data.codigo);
  if (existente) throw new ErroHttp("Já existe uma justificativa com este código.", 409);
  try {
    return await comTransacao(async (tx) => {
      const criada = await tx.justificativa.create({ data: dados.data, select: CAMPOS });
      await auditar(
        tx,
        admin.id,
        "justificativa.criar",
        `${dados.data.codigo} (${dados.data.rotulo})`,
      );
      return paraJustificativa(criada);
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp("Já existe uma justificativa com este código.", 409);
    }
    throw erro;
  }
}

/** Atualiza rótulo e situação de uma justificativa existente. */
export async function atualizarJustificativa(
  admin: { id: string },
  codigo: string,
  entrada: unknown,
): Promise<JustificativaConfigurada> {
  const dados = esquemaAtualizarJustificativa.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await buscarPorCodigo(codigo);
  if (!existente) throw new ErroHttp("Justificativa não encontrada.", 404);
  const linha = await comTransacao(async (tx) => {
    const atualizada = await tx.justificativa.update({
      where: { id: existente.id },
      data: {
        ...(dados.data.rotulo !== undefined ? { rotulo: dados.data.rotulo } : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
      },
      select: CAMPOS,
    });
    const mudancas = [
      dados.data.rotulo !== undefined ? "rótulo" : null,
      dados.data.ativo !== undefined ? "situação" : null,
    ]
      .filter((parte): parte is string => parte !== null)
      .join(", ");
    await auditar(tx, admin.id, "justificativa.atualizar", `${existente.codigo} (${mudancas})`);
    return atualizada;
  });
  return paraJustificativa(linha);
}

/**
 * Remove uma justificativa sem uso. Com histórico, o caminho é desativar:
 * a exclusão é barrada com a contagem de registros que a utilizam.
 */
export async function removerJustificativa(admin: { id: string }, codigo: string): Promise<void> {
  const existente = await buscarPorCodigo(codigo);
  if (!existente) throw new ErroHttp("Justificativa não encontrada.", 404);
  const [faltas, saidas] = await Promise.all([
    banco().falta.count({ where: { justificativa: existente.codigo } }),
    banco().saidaAntecipada.count({ where: { justificativa: existente.codigo } }),
  ]);
  const total = faltas + saidas;
  if (total > 0) {
    throw new ErroHttp(
      `Esta justificativa está em uso em ${total} ${total === 1 ? "registro" : "registros"}. Desative em vez de excluir para preservar o histórico.`,
      409,
    );
  }
  await comTransacao(async (tx) => {
    await tx.justificativa.delete({ where: { id: existente.id } });
    await auditar(tx, admin.id, "justificativa.excluir", existente.codigo);
  });
}
