// Parâmetros de acesso: leitura para as regras de entrada e da visão do
// diretor, e escrita pela administração, com auditoria na mesma transação.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import {
  CATEGORIAS_DIRETOR,
  FAIXAS_PARAMETROS,
  categoriasValidas,
  type ParametroNumerico,
  type ParametrosAcesso,
} from "@/domain/diretores";

const ID = "principal";

function numero(chave: ParametroNumerico) {
  const faixa = FAIXAS_PARAMETROS[chave];
  const mensagem = `${faixa.rotulo}: use um valor entre ${faixa.minimo} e ${faixa.maximo}.`;
  return z.number().int(mensagem).min(faixa.minimo, mensagem).max(faixa.maximo, mensagem);
}

export const esquemaAtualizarParametros = z
  .object({
    validadePalavraDias: numero("validadePalavraDias").optional(),
    sessaoDiretorHoras: numero("sessaoDiretorHoras").optional(),
    tentativasPorOrigem: numero("tentativasPorOrigem").optional(),
    tentativasPorLogin: numero("tentativasPorLogin").optional(),
    janelaMinutos: numero("janelaMinutos").optional(),
    limiteRiscoPercentual: numero("limiteRiscoPercentual").optional(),
    categoriasDiretor: z
      .array(z.enum(CATEGORIAS_DIRETOR))
      .refine((lista) => lista.includes("faltas"), "As faltas ficam sempre visíveis.")
      .optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

const CAMPOS = {
  validadePalavraDias: true,
  sessaoDiretorHoras: true,
  tentativasPorOrigem: true,
  tentativasPorLogin: true,
  janelaMinutos: true,
  categoriasDiretor: true,
  limiteRiscoPercentual: true,
} as const;

type LinhaParametros = Omit<ParametrosAcesso, "categoriasDiretor"> & {
  categoriasDiretor: string[];
};

function paraParametros(linha: LinhaParametros): ParametrosAcesso {
  return { ...linha, categoriasDiretor: categoriasValidas(linha.categoriasDiretor) };
}

/** Lê os parâmetros, criando a linha única com os padrões se preciso. */
export async function lerParametrosAcesso(): Promise<ParametrosAcesso> {
  const linha = await banco().parametrosAcesso.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
    select: CAMPOS,
  });
  return paraParametros(linha);
}

/** Atualiza os parâmetros informados; os demais ficam como estão. */
export async function atualizarParametrosAcesso(
  admin: { id: string },
  entrada: unknown,
): Promise<ParametrosAcesso> {
  const dados = esquemaAtualizarParametros.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const mudancas = Object.entries(dados.data)
    .filter(([, valor]) => valor !== undefined)
    .map(([chave]) => chave);
  const linha = await comTransacao(async (tx) => {
    const atualizada = await tx.parametrosAcesso.upsert({
      where: { id: ID },
      update: { ...dados.data, atualizadoPorId: admin.id },
      create: { id: ID, ...dados.data, atualizadoPorId: admin.id },
      select: CAMPOS,
    });
    await auditar(tx, admin.id, "parametrosAcesso.atualizar", mudancas.join(", "));
    return atualizada;
  });
  return paraParametros(linha);
}
