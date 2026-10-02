// Integrações com Google Planilhas: helpers comuns das finalidades, cobrindo
// a linha da integração, conexão, token, modo completo, abas e cópias.
import { colunasDeNovaAba } from "@/domain/planilha-apresentacao";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { conferirSenhaDoAdmin } from "@/application/confirmacao-admin";
import { renovarAcesso } from "@/infra/google-oauth";
import { executarAcaoGoogle } from "@/infra/google-planilhas-api";
import { DURACOES_MODO_COMPLETO, FRASE_MODO_COMPLETO } from "@/domain/planilha";

/** Arquivos separados de frequência, movimentação e chamada parcial. */
export type FinalidadeIntegracao = "FREQUENCIA" | "SAIDAS" | "PARCIAL";

/** Cada finalidade tem a sua autorização Google, arquivo e modo próprios. */
const ID_POR_FINALIDADE: Record<FinalidadeIntegracao, string> = {
  FREQUENCIA: "principal",
  SAIDAS: "saidas",
  PARCIAL: "parcial",
};

export function idDaIntegracao(finalidade: FinalidadeIntegracao): string {
  return ID_POR_FINALIDADE[finalidade];
}

export interface LinhaIntegracao {
  ativa: boolean;
  googleRefreshToken: string | null;
  googlePlanilhaId: string | null;
  googlePlanilhaNome: string | null;
  esquema: unknown;
  assinaturaEsquema: string | null;
  esquemaEm: Date | null;
  modo: "CONSERVADOR" | "COMPLETO";
  modoCompletoAte: Date | null;
  envioAutomatico: boolean;
  atualizadoEm: Date;
}

const CAMPOS = {
  ativa: true,
  googleRefreshToken: true,
  googlePlanilhaId: true,
  googlePlanilhaNome: true,
  esquema: true,
  assinaturaEsquema: true,
  esquemaEm: true,
  modo: true,
  modoCompletoAte: true,
  envioAutomatico: true,
  atualizadoEm: true,
} as const;

/** Lê a linha da finalidade, criando-a se a migração não tiver criado. */
export async function lerLinha(finalidade: FinalidadeIntegracao): Promise<LinhaIntegracao> {
  const id = idDaIntegracao(finalidade);
  const existente = await banco().integracaoPlanilha.findUnique({
    where: { id },
    select: CAMPOS,
  });
  if (existente) return existente as LinhaIntegracao;
  try {
    const criada = await banco().integracaoPlanilha.create({
      data: { id, finalidade },
      select: CAMPOS,
    });
    return criada as LinhaIntegracao;
  } catch {
    // Duas requisições podem criar a linha ao mesmo tempo; a segunda lê a
    // versão vencedora em vez de falhar.
    const linha = await banco().integracaoPlanilha.findUnique({
      where: { id },
      select: CAMPOS,
    });
    if (linha) return linha as LinhaIntegracao;
    throw new ErroHttp("Não foi possível preparar a integração com a planilha.", 500);
  }
}

export function modoCompletoAtivo(linha: LinhaIntegracao): boolean {
  return (
    linha.modo === "COMPLETO" &&
    linha.modoCompletoAte !== null &&
    linha.modoCompletoAte.getTime() > Date.now()
  );
}

/** Executa a ação na planilha autorizada pela conta Google. */
export async function chamarIntegracao<T>(
  linha: LinhaIntegracao,
  corpo: Record<string, unknown>,
): Promise<T> {
  if (!linha.ativa || !linha.googleRefreshToken || !linha.googlePlanilhaId) {
    throw new ErroHttp("Conecte a conta Google e escolha a planilha na Gestão.", 400);
  }
  const acesso = await renovarAcesso(linha.googleRefreshToken);
  return (await executarAcaoGoogle(linha.googlePlanilhaId, acesso, corpo)) as T;
}

export const esquemaSenha = z.object({
  senha: z.string().min(1, "Informe a senha do administrador."),
});

export const esquemaConfiguracao = z
  .object({
    ativa: z.boolean().optional(),
    envioAutomatico: z.boolean().optional(),
  })
  .strict()
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

/** Salva as preferências da planilha conectada pela conta Google. */
export async function salvarConfiguracao(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
): Promise<void> {
  const dados = esquemaConfiguracao.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp("Configuração inválida. Use a conexão Google na Gestão.", 400);
  }
  const linha = await lerLinha(finalidade);
  if (
    (dados.data.ativa || dados.data.envioAutomatico) &&
    (!linha.googleRefreshToken || !linha.googlePlanilhaId)
  ) {
    throw new ErroHttp("Conecte a conta Google e escolha a planilha antes de ativar.", 400);
  }
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id },
      data: { ...dados.data, atualizadoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.salvar", `integracao:${id}`);
  });
}

/** Desliga a integração e apaga autorização Google e esquema. A planilha fica intacta. */
export async function desconectar(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
): Promise<{ ok: boolean }> {
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id },
      data: {
        ativa: false,
        googleRefreshToken: null,
        googlePlanilhaId: null,
        googlePlanilhaNome: null,
        envioAutomatico: false,
        esquema: Prisma.DbNull,
        assinaturaEsquema: null,
        esquemaEm: null,
        modo: "CONSERVADOR",
        modoCompletoAte: null,
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.desconectar", `integracao:${id}`);
  });
  return { ok: true };
}

const esquemaModoCompleto = z.object({
  frase: z.string().trim().min(1, "Digite a frase de confirmação."),
  senha: z.string().min(1, "Informe a senha do administrador."),
  duracaoMinutos: z.number().int().optional(),
});

/** Destrava o modo completo com frase, senha e duração. */
export async function ativarModoCompleto(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
) {
  const dados = esquemaModoCompleto.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO) {
    throw new ErroHttp("A frase de confirmação não confere.", 400);
  }
  const duracao = dados.data.duracaoMinutos ?? 15;
  if (!(DURACOES_MODO_COMPLETO as readonly number[]).includes(duracao)) {
    throw new ErroHttp("Duração inválida.", 400);
  }
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, `planilha:modo:${finalidade}`);
  const ate = new Date(Date.now() + duracao * 60_000);
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id },
      update: { modo: "COMPLETO", modoCompletoAte: ate, modoCompletoPorId: admin.id },
      create: {
        id,
        finalidade,
        modo: "COMPLETO",
        modoCompletoAte: ate,
        modoCompletoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.modoCompleto.ativar", `duracao:${duracao}`);
  });
  return { modo: "completo" as const, modoCompletoAte: ate.toISOString() };
}

/** Volta ao conservador; qualquer sessão pode encerrar a janela. */
export async function desativarModoCompleto(
  usuario: { id: string },
  finalidade: FinalidadeIntegracao,
) {
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id },
      data: { modo: "CONSERVADOR", modoCompletoAte: null },
    });
    await auditar(tx, usuario.id, "planilha.modoCompleto.encerrar", `integracao:${id}`);
  });
  return { modo: "conservador" as const };
}

/** Lista as cópias ocultas de uma aba. */
export async function listarCopias(finalidade: FinalidadeIntegracao, entrada: unknown) {
  const dados = z.object({ aba: z.string().min(1).max(200) }).safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a aba.", 400);
  const linha = await lerLinha(finalidade);
  return chamarIntegracao<{ copias: { nome: string; criadaEm: string }[] }>(linha, {
    acao: "listarCopias",
    aba: dados.data.aba,
  });
}

/** Restaura uma cópia, com senha e frase; invalida o esquema salvo. */
export async function restaurarCopia(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
) {
  const dados = z
    .object({
      aba: z.string().min(1).max(200),
      copia: z.string().min(1).max(300),
      frase: z.string().trim().min(1, "Digite a frase de confirmação."),
      senha: z.string().min(1, "Informe a senha do administrador."),
    })
    .safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO) {
    throw new ErroHttp("A frase de confirmação não confere.", 400);
  }
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, `planilha:restaurar:${finalidade}`);
  const linha = await lerLinha(finalidade);
  const resultado = await chamarIntegracao<{ aba: string; copia: string }>(linha, {
    acao: "restaurarCopia",
    aba: dados.data.aba,
    copia: dados.data.copia,
  });
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.update({
      where: { id: idDaIntegracao(finalidade) },
      data: { esquema: Prisma.DbNull, assinaturaEsquema: null, esquemaEm: null },
    });
    await auditar(tx, admin.id, "planilha.restaurar", `aba:${dados.data.aba}`);
  });
  return resultado;
}

/** Cria uma aba nova com o cabeçalho informado, para turma ou registro sem aba. */
export async function criarAba(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
) {
  const dados = z
    .object({
      nome: z.string().trim().min(1, "Informe o nome da aba.").max(200),
      cabecalho: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
    })
    .safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const linha = await lerLinha(finalidade);
  const resultado = await chamarIntegracao<{ aba: string }>(linha, {
    acao: "criarAba",
    nome: dados.data.nome,
    cabecalho: dados.data.cabecalho,
    colunas: colunasDeNovaAba(
      dados.data.cabecalho?.length ? dados.data.cabecalho : ["Aluno", "Turma atual"],
    ),
  });
  await comTransacao(async (tx) => {
    await auditar(tx, admin.id, "planilha.criarAba", `aba:${dados.data.nome}`);
  });
  return resultado;
}

/** Remove uma aba criada pela integração, no modo completo, com senha e frase. */
export async function removerAba(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
) {
  const dados = z
    .object({
      aba: z.string().min(1).max(200),
      frase: z.string().trim().min(1, "Digite a frase de confirmação."),
      senha: z.string().min(1, "Informe a senha do administrador."),
    })
    .safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.frase.trim().toUpperCase() !== FRASE_MODO_COMPLETO) {
    throw new ErroHttp("A frase de confirmação não confere.", 400);
  }
  const linha = await lerLinha(finalidade);
  if (!modoCompletoAtivo(linha)) {
    throw new ErroHttp("O modo completo não está ativo.", 400);
  }
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, `planilha:remover:${finalidade}`);
  const resultado = await chamarIntegracao<{ aba: string }>(linha, {
    acao: "removerAba",
    aba: dados.data.aba,
  });
  await comTransacao(async (tx) => {
    await auditar(tx, admin.id, "planilha.removerAba", `aba:${dados.data.aba}`);
  });
  return resultado;
}

export type SituacaoEnvioMovimentacao =
  "enviado" | "desligado" | "pendente_manual" | "sem_confirmacao" | "falhou";

let filaDeEnvios: Promise<unknown> = Promise.resolve();

/**
 * Serializa os envios automáticos deste processo: dois registros em seguida
 * não leem a planilha ao mesmo tempo e não acrescentam a mesma linha duas
 * vezes. Não cobre instâncias separadas; o plano sempre pula linha já existente.
 */
export function emSequencia<T>(tarefa: () => Promise<T>): Promise<T> {
  const resultado = filaDeEnvios.then(tarefa, tarefa);
  filaDeEnvios = resultado.catch(() => undefined);
  return resultado;
}
