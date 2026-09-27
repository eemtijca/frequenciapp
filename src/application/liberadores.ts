// Catálogo de quem pode liberar a saída antecipada: leitura para toda a
// sessão e gestão pela administração, com auditoria. O código é estável;
// rótulo e situação podem mudar. Não confundir com as contas da equipe.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp, ehDuplicidade } from "@/infra/erros";
import { ordenarPorRotulo, type LiberadorConfigurado } from "@/domain/frequencia";

const codigoLiberador = z
  .string()
  .trim()
  .min(1, "Informe o código de quem libera.")
  .max(20, "O código deve ter no máximo 20 caracteres.")
  .regex(/^[A-Za-z][A-Za-z0-9]*$/, "Use apenas letras e números, começando por uma letra.");

const rotuloLiberador = z
  .string()
  .trim()
  .min(2, "O rótulo deve ter ao menos 2 caracteres.")
  .max(60, "O rótulo deve ter no máximo 60 caracteres.");

export const esquemaCriarLiberador = z.object({
  codigo: codigoLiberador,
  rotulo: rotuloLiberador,
});

export const esquemaAtualizarLiberador = z
  .object({
    rotulo: rotuloLiberador.optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaLiberador {
  codigo: string;
  rotulo: string;
  ativo: boolean;
}

function paraLiberador(linha: LinhaLiberador): LiberadorConfigurado {
  return { codigo: linha.codigo, rotulo: linha.rotulo, ativo: linha.ativo };
}

const CAMPOS = { codigo: true, rotulo: true, ativo: true } as const;

/** Catálogo completo, em ordem alfabética pelo rótulo. */
export async function listarLiberadores(): Promise<LiberadorConfigurado[]> {
  const linhas = await banco().liberador.findMany({ select: CAMPOS });
  return ordenarPorRotulo(linhas);
}

/** Busca um liberador pelo código, sem diferenciar caixa. */
async function buscarPorCodigo(
  codigo: string,
): Promise<{ id: string; codigo: string; rotulo: string; ativo: boolean } | null> {
  return banco().liberador.findFirst({
    where: { codigo: { equals: codigo, mode: "insensitive" } },
    select: { id: true, ...CAMPOS },
  });
}

/** Cria quem libera no catálogo. O código vale para o histórico. */
export async function criarLiberador(
  admin: { id: string },
  entrada: unknown,
): Promise<LiberadorConfigurado> {
  const dados = esquemaCriarLiberador.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await buscarPorCodigo(dados.data.codigo);
  if (existente) {
    throw new ErroHttp("Já existe um responsável pela liberação com este código.", 409);
  }
  try {
    return await comTransacao(async (tx) => {
      const criado = await tx.liberador.create({ data: dados.data, select: CAMPOS });
      await auditar(tx, admin.id, "liberador.criar", `${dados.data.codigo} (${dados.data.rotulo})`);
      return paraLiberador(criado);
    });
  } catch (erro) {
    if (ehDuplicidade(erro)) {
      throw new ErroHttp("Já existe um responsável pela liberação com este código.", 409);
    }
    throw erro;
  }
}

/** Atualiza rótulo e situação de quem libera. O código não muda. */
export async function atualizarLiberador(
  admin: { id: string },
  codigo: string,
  entrada: unknown,
): Promise<LiberadorConfigurado> {
  const dados = esquemaAtualizarLiberador.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const existente = await buscarPorCodigo(codigo);
  if (!existente) throw new ErroHttp("Responsável pela liberação não encontrado.", 404);
  const linha = await comTransacao(async (tx) => {
    const atualizado = await tx.liberador.update({
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
    await auditar(tx, admin.id, "liberador.atualizar", `${existente.codigo} (${mudancas})`);
    return atualizado;
  });
  return paraLiberador(linha);
}

/**
 * Remove quem libera sem uso. Com histórico, o caminho é desativar: a
 * exclusão é barrada com a contagem de saídas que usam o código.
 */
export async function removerLiberador(admin: { id: string }, codigo: string): Promise<void> {
  const existente = await buscarPorCodigo(codigo);
  if (!existente) throw new ErroHttp("Responsável pela liberação não encontrado.", 404);
  const total = await banco().saidaAntecipada.count({
    where: { liberadoPorCodigo: existente.codigo },
  });
  if (total > 0) {
    throw new ErroHttp(
      `Este responsável está em uso em ${total} ${total === 1 ? "saída" : "saídas"}. Desative em vez de excluir para preservar o histórico.`,
      409,
    );
  }
  await comTransacao(async (tx) => {
    await tx.liberador.delete({ where: { id: existente.id } });
    await auditar(tx, admin.id, "liberador.excluir", existente.codigo);
  });
}
