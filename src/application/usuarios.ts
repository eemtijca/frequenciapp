// Gestão de usuários pela administração: criar, editar, redefinir senha,
// ativar, desativar e excluir. Nunca sem administrador ativo.
import { z } from "zod";
import { Prisma } from "../../generated/prisma/client";
import { banco } from "@/infra/banco";
import { hashearSenha } from "@/infra/auth/hash";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { problemaDeSenha } from "@/domain/usuarios";
import type { Identidade, UsuarioDTO } from "@/domain/usuarios";

const nomeUsuario = z
  .string()
  .trim()
  .min(2, "O nome deve ter ao menos 2 caracteres.")
  .max(100, "O nome deve ter no máximo 100 caracteres.");

const emailUsuario = z.string().trim().toLowerCase().email("E-mail inválido.");

const senhaForte = z.string().refine((senha) => problemaDeSenha(senha) === null, {
  message: "A senha deve ter ao menos 8 caracteres, com uma letra e um número.",
});

export const esquemaCriarUsuario = z.object({
  nome: nomeUsuario,
  email: emailUsuario,
  senha: senhaForte,
  papel: z.enum(["ADMIN", "COORDENACAO"]).default("COORDENACAO"),
});

export const esquemaAtualizarUsuario = z
  .object({
    nome: nomeUsuario.optional(),
    email: emailUsuario.optional(),
    senha: senhaForte.optional(),
    papel: z.enum(["ADMIN", "COORDENACAO"]).optional(),
    ativo: z.boolean().optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  });

interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  papel: "ADMIN" | "COORDENACAO";
  ativo: boolean;
}

function paraUsuario(linha: LinhaUsuario): UsuarioDTO {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel,
    ativo: linha.ativo,
  };
}

/** Lista todos os usuários da equipe. */
export async function listarUsuarios(): Promise<UsuarioDTO[]> {
  const linhas = await banco().usuario.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
  });
  return linhas.map(paraUsuario);
}

/** Conta administradores ativos dentro do cliente informado (transação ou base). */
async function totalDeAdminsAtivos(
  cliente: Prisma.TransactionClient | ReturnType<typeof banco> = banco(),
): Promise<number> {
  return cliente.usuario.count({ where: { papel: "ADMIN", ativo: true } });
}

/** Cria um usuário com senha. */
export async function criarUsuario(admin: Identidade, entrada: unknown): Promise<UsuarioDTO> {
  const dados = esquemaCriarUsuario.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const existente = await banco().usuario.findFirst({
    where: { email: { equals: dados.data.email, mode: "insensitive" } },
  });
  if (existente) {
    throw new ErroHttp("Já existe uma conta com este e-mail.", 409);
  }

  const senhaHash = await hashearSenha(dados.data.senha);
  const linha = await comTransacao(async (tx) => {
    const criado = await tx.usuario.create({
      data: {
        nome: dados.data.nome,
        email: dados.data.email,
        senhaHash,
        papel: dados.data.papel,
        ativo: true,
      },
    });
    await auditar(tx, admin.id, "usuario.criar", `${dados.data.email} (${dados.data.papel})`);
    return criado;
  });
  return paraUsuario(linha);
}

/**
 * Atualiza um usuário: dados, senha (redefinição pelo administrador),
 * papel e situação. Bloqueia qualquer ação que deixe a escola sem
 * administrador ativo.
 */
export async function atualizarUsuario(
  admin: Identidade,
  id: string,
  entrada: unknown,
): Promise<UsuarioDTO> {
  if (id === admin.id && entrada !== null && typeof entrada === "object") {
    const pretendidoPapel = (entrada as Record<string, unknown>).papel;
    if (pretendidoPapel !== undefined && pretendidoPapel !== "ADMIN") {
      throw new ErroHttp("Você não pode remover o seu próprio acesso de administrador.", 400);
    }
    const pretendidoAtivo = (entrada as Record<string, unknown>).ativo;
    if (pretendidoAtivo === false) {
      throw new ErroHttp("Você não pode desativar a sua própria conta.", 400);
    }
  }

  const dados = esquemaAtualizarUsuario.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const alvo = await banco().usuario.findUnique({ where: { id } });
  if (!alvo) throw new ErroHttp("Usuário não encontrado.", 404);

  if (dados.data.email && dados.data.email !== alvo.email) {
    const duplicado = await banco().usuario.findFirst({
      where: { email: { equals: dados.data.email, mode: "insensitive" } },
    });
    if (duplicado) throw new ErroHttp("Já existe uma conta com este e-mail.", 409);
  }

  const senhaHash = dados.data.senha ? await hashearSenha(dados.data.senha) : undefined;

  const linha = await comTransacao(async (tx) => {
    // Guarda do último administrador dentro da transação: leitura e escrita
    // juntas impedem que duas alterações simultâneas deixem a escola sem root.
    if (alvo.papel === "ADMIN") {
      const rebaixa = dados.data.papel !== undefined && dados.data.papel !== "ADMIN";
      const desativa = dados.data.ativo === false;
      if (rebaixa || desativa) {
        const admins = await totalDeAdminsAtivos(tx);
        const semAlvo = admins - (alvo.ativo ? 1 : 0);
        if (semAlvo < 1) {
          throw new ErroHttp(
            "A escola precisa de ao menos um administrador ativo. Crie outro administrador antes.",
            409,
          );
        }
      }
    }
    const atualizado = await tx.usuario.update({
      where: { id },
      data: {
        ...(dados.data.nome !== undefined ? { nome: dados.data.nome } : {}),
        ...(dados.data.email !== undefined ? { email: dados.data.email } : {}),
        ...(dados.data.papel !== undefined ? { papel: dados.data.papel } : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
        ...(senhaHash !== undefined ? { senhaHash } : {}),
      },
    });
    if (dados.data.ativo === false) {
      await tx.sessao.deleteMany({ where: { usuarioId: id } });
    }
    const mudancas = [
      dados.data.nome !== undefined ? "nome" : null,
      dados.data.email !== undefined ? "e-mail" : null,
      dados.data.papel !== undefined ? "papel" : null,
      dados.data.ativo !== undefined ? "situação" : null,
      senhaHash !== undefined ? "senha" : null,
    ].filter((parte): parte is string => parte !== null);
    await auditar(tx, admin.id, "usuario.atualizar", `${alvo.email} (${mudancas.join(", ")})`);
    return atualizado;
  });
  return paraUsuario(linha);
}

/**
 * Exclui um usuário. O histórico de frequências é preservado: a autoria
 * fica anulável, então a exclusão não apaga registros da escola.
 */
export async function removerUsuario(admin: Identidade, id: string): Promise<void> {
  if (id === admin.id) {
    throw new ErroHttp("Você não pode excluir a sua própria conta. Use outro administrador.", 400);
  }
  const alvo = await banco().usuario.findUnique({ where: { id } });
  if (!alvo) throw new ErroHttp("Usuário não encontrado.", 404);
  await comTransacao(async (tx) => {
    if (alvo.papel === "ADMIN" && alvo.ativo) {
      const admins = await totalDeAdminsAtivos(tx);
      if (admins <= 1) {
        throw new ErroHttp(
          "A escola precisa de ao menos um administrador ativo. Crie outro administrador antes.",
          409,
        );
      }
    }
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await tx.usuario.delete({ where: { id } });
    await auditar(tx, admin.id, "usuario.excluir", alvo.email);
  });
}
