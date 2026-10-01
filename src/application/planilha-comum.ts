// Integrações com Google Planilhas: helpers comuns das finalidades, cobrindo
// a linha da integração, conexão, token, modo completo, abas e cópias.
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { ambiente } from "@/infra/ambiente";
import { conferirSenhaDoAdmin } from "@/application/confirmacao-admin";
import { chamarGas, type OpcoesGas } from "@/infra/planilha";
import { renovarAcesso } from "@/infra/google-oauth";
import { executarAcaoGoogle } from "@/infra/google-planilhas-api";
import {
  DURACOES_MODO_COMPLETO,
  FRASE_MODO_COMPLETO,
  VERSAO_SCRIPT,
  validarEndpoint,
} from "@/domain/planilha";

/** Finalidade da integração: frequência das turmas ou saídas antecipadas. */
export type FinalidadeIntegracao = "FREQUENCIA" | "SAIDAS";

/** Cada finalidade tem a sua linha, com endereço, token e modo próprios. */
const ID_POR_FINALIDADE: Record<FinalidadeIntegracao, string> = {
  FREQUENCIA: "principal",
  SAIDAS: "saidas",
};

export function idDaIntegracao(finalidade: FinalidadeIntegracao): string {
  return ID_POR_FINALIDADE[finalidade];
}

export interface LinhaIntegracao {
  ativa: boolean;
  provedor: string;
  endpoint: string | null;
  token: string | null;
  versaoScript: string | null;
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
  provedor: true,
  endpoint: true,
  token: true,
  versaoScript: true,
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

export function exigirConexao(linha: LinhaIntegracao): { endpoint: string; token: string } {
  if (!linha.ativa || !linha.endpoint || !linha.token) {
    throw new ErroHttp("A integração com a planilha não está ativa.", 400);
  }
  return { endpoint: linha.endpoint, token: linha.token };
}

/** Escolhe a fonte da finalidade: Sheets API ou protocolo legado. */
export async function chamarIntegracao<T>(
  linha: LinhaIntegracao,
  corpo: Record<string, unknown>,
  opcoes?: OpcoesGas,
): Promise<T> {
  if (linha.provedor === "GOOGLE") {
    if (!linha.ativa || !linha.googleRefreshToken || !linha.googlePlanilhaId) {
      throw new ErroHttp("A integração com a planilha não está ativa.", 400);
    }
    const acesso = await renovarAcesso(linha.googleRefreshToken);
    return (await executarAcaoGoogle(linha.googlePlanilhaId, acesso, corpo)) as T;
  }
  const { endpoint, token } = exigirConexao(linha);
  return chamarGas<T>(endpoint, token, corpo, opcoes);
}

export const esquemaSenha = z.object({
  senha: z.string().min(1, "Informe a senha do administrador."),
});

export const esquemaConfiguracao = z
  .object({
    ativa: z.boolean().optional(),
    endpoint: z.string().trim().max(500).optional(),
    envioAutomatico: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

/** Salva integração ativa e endereço do Web App, com validação de host. */
export async function salvarConfiguracao(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
): Promise<void> {
  const dados = esquemaConfiguracao.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  if (dados.data.endpoint !== undefined) {
    const problema = validarEndpoint(dados.data.endpoint, ambiente.permitirEndpointLocal);
    if (problema) throw new ErroHttp(problema, 400);
  }
  const id = idDaIntegracao(finalidade);
  const trocandoProvedor =
    dados.data.endpoint !== undefined && (await lerLinha(finalidade)).provedor === "GOOGLE";
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id },
      update: {
        ...(dados.data.ativa !== undefined ? { ativa: dados.data.ativa } : {}),
        ...(dados.data.envioAutomatico !== undefined
          ? { envioAutomatico: dados.data.envioAutomatico }
          : {}),
        ...(dados.data.endpoint !== undefined
          ? {
              endpoint: dados.data.endpoint.trim() || null,
              provedor: "GAS",
              ...(trocandoProvedor
                ? {
                    ativa: false,
                    esquema: Prisma.DbNull,
                    assinaturaEsquema: null,
                    esquemaEm: null,
                  }
                : {}),
            }
          : {}),
        atualizadoPorId: admin.id,
      },
      create: {
        id,
        finalidade,
        ativa: dados.data.ativa ?? false,
        endpoint: dados.data.endpoint?.trim() || null,
        atualizadoPorId: admin.id,
      },
    });
    await auditar(tx, admin.id, "planilha.salvar", `integracao:${id}`);
  });
}

/** Gera um token novo. Rotacionar invalida a conexão até atualizar o script. */
export async function gerarToken(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
): Promise<{ token: string }> {
  const dados = esquemaSenha.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a senha do administrador.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, `planilha:token:${finalidade}`);
  const token = randomBytes(32).toString("base64url");
  const id = idDaIntegracao(finalidade);
  await comTransacao(async (tx) => {
    await tx.integracaoPlanilha.upsert({
      where: { id },
      update: { token, ativa: false, atualizadoPorId: admin.id },
      create: { id, finalidade, token, atualizadoPorId: admin.id },
    });
    await auditar(tx, admin.id, "planilha.token.gerar", `integracao:${id}`);
  });
  return { token };
}

/** Revela o token com a senha, para reinstalar ou corrigir o script. */
export async function revelarToken(
  admin: { id: string },
  finalidade: FinalidadeIntegracao,
  entrada: unknown,
): Promise<{ token: string }> {
  const dados = esquemaSenha.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Informe a senha do administrador.", 400);
  await conferirSenhaDoAdmin(admin.id, dados.data.senha, `planilha:token:${finalidade}`);
  const linha = await lerLinha(finalidade);
  if (!linha.token) throw new ErroHttp("Ainda não há token gerado.", 404);
  return { token: linha.token };
}

/** Testa o Web App publicado: ping sem alterar a planilha. */
export async function testarConexao(finalidade: FinalidadeIntegracao, entrada: unknown) {
  const dados = esquemaConfiguracao.safeParse(entrada);
  if (!dados.success) throw new ErroHttp("Endereço inválido.", 400);
  const linha = await lerLinha(finalidade);
  const endpoint = dados.data.endpoint?.trim() || linha.endpoint;
  if (!endpoint) throw new ErroHttp("Informe o endereço do aplicativo da Web.", 400);
  const problema = validarEndpoint(endpoint, ambiente.permitirEndpointLocal);
  if (problema) throw new ErroHttp(problema, 400);
  if (!linha.token) throw new ErroHttp("Gere o token antes de testar.", 400);
  const ping = await chamarGas<{
    versao: number;
    planilha: { nome: string; url: string; fuso: string };
    abas: { nome: string; linhas: number; colunas: number; oculta: boolean }[];
  }>(endpoint, linha.token, { acao: "ping" });
  const avisos: string[] = [];
  if (ping.planilha.fuso !== ambiente.fuso) {
    avisos.push(
      `O script usa o fuso ${ping.planilha.fuso}, diferente do fuso da escola (${ambiente.fuso}). As datas podem sair deslocadas.`,
    );
  }
  if (ping.versao !== VERSAO_SCRIPT) {
    avisos.push(
      `O script publicado está na versão ${ping.versao}; a esperada é ${VERSAO_SCRIPT}. Publique a versão atual do gas/Codigo.gs.`,
    );
  }
  await banco().integracaoPlanilha.update({
    where: { id: idDaIntegracao(finalidade) },
    data: { endpoint, versaoScript: String(ping.versao) },
  });
  return { ...ping, avisos };
}

/** Desliga a integração e apaga token e esquema. A planilha fica intacta. */
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
        endpoint: null,
        token: null,
        googleRefreshToken: null,
        googlePlanilhaId: null,
        googlePlanilhaNome: null,
        envioAutomatico: false,
        provedor: "GAS",
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
  const resultado = await chamarIntegracao<{ aba: string; copia: string; anterior: string }>(
    linha,
    { acao: "restaurarCopia", aba: dados.data.aba, copia: dados.data.copia },
    { retentavel: false },
  );
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
  const resultado = await chamarIntegracao<{ aba: string }>(
    linha,
    { acao: "criarAba", nome: dados.data.nome, cabecalho: dados.data.cabecalho },
    { retentavel: false },
  );
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
  const resultado = await chamarIntegracao<{ aba: string }>(
    linha,
    { acao: "removerAba", aba: dados.data.aba },
    { retentavel: false },
  );
  await comTransacao(async (tx) => {
    await auditar(tx, admin.id, "planilha.removerAba", `aba:${dados.data.aba}`);
  });
  return resultado;
}
