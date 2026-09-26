// Configurações de recursos: leitura por qualquer sessão e escrita pela
// administração, com auditoria na mesma transação.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { CONFIGURACOES_PADRAO, type Configuracoes } from "@/domain/frequencia";

const ID = "principal";

export const esquemaAtualizarConfiguracoes = z
  .object({
    frequenciaPorAula: z.boolean().optional(),
    saidaAntecipada: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaConfiguracao {
  frequenciaPorAula: boolean;
  saidaAntecipada: boolean;
}

function paraConfiguracoes(linha: LinhaConfiguracao): Configuracoes {
  return {
    frequenciaPorAula: linha.frequenciaPorAula,
    saidaAntecipada: linha.saidaAntecipada,
  };
}

/** Lê as configurações, criando a linha única com os padrões se preciso. */
export async function lerConfiguracoes(): Promise<Configuracoes> {
  const linha = await banco().configuracao.upsert({
    where: { id: ID },
    update: {},
    create: { id: ID },
    select: { frequenciaPorAula: true, saidaAntecipada: true },
  });
  return paraConfiguracoes(linha);
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
    const atualizada = await tx.configuracao.upsert({
      where: { id: ID },
      update: {
        ...(dados.data.frequenciaPorAula !== undefined
          ? { frequenciaPorAula: dados.data.frequenciaPorAula }
          : {}),
        ...(dados.data.saidaAntecipada !== undefined
          ? { saidaAntecipada: dados.data.saidaAntecipada }
          : {}),
        atualizadoPorId: admin.id,
      },
      create: {
        id: ID,
        frequenciaPorAula: dados.data.frequenciaPorAula ?? CONFIGURACOES_PADRAO.frequenciaPorAula,
        saidaAntecipada: dados.data.saidaAntecipada ?? CONFIGURACOES_PADRAO.saidaAntecipada,
        atualizadoPorId: admin.id,
      },
      select: { frequenciaPorAula: true, saidaAntecipada: true },
    });
    await auditar(tx, admin.id, "configuracao.atualizar", `configuracao:${ID}`);
    return atualizada;
  });
  return paraConfiguracoes(linha);
}
