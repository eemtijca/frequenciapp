// Gestão de usuários pelo administrador: criar, editar, redefinir senha,
// ativar, desativar, atribuir turmas e excluir. Nunca sem admin ativo.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { hashearSenha } from "@/infra/auth/hash";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { problemaDeSenha } from "@/domain/usuarios";
import type { Identidade, UsuarioComTurmas } from "@/domain/usuarios";

const nomeUsuario = z
  .string()
  .trim()
  .min(2, "O nome deve ter ao menos 2 caracteres.")
  .max(100, "O nome deve ter no máximo 100 caracteres.");

const emailUsuario = z.string().trim().toLowerCase().email("E-mail inválido.");

const senhaForte = z.string().refine((senha) => problemaDeSenha(senha) === null, {
  message: "A senha deve ter ao menos 8 caracteres, com uma letra e um número.",
});

export const esquemaCriarUsuario = z
  .object({
    nome: nomeUsuario,
    email: emailUsuario,
    senha: senhaForte,
    papel: z.enum(["ADMIN", "PROFESSOR"]).default("PROFESSOR"),
    turmas: z.array(z.string().uuid()).default([]),
  })
  .refine((dados) => new Set(dados.turmas).size === dados.turmas.length, {
    message: "Há turmas repetidas na lista.",
  });

export const esquemaAtualizarUsuario = z
  .object({
    nome: nomeUsuario.optional(),
    email: emailUsuario.optional(),
    senha: senhaForte.optional(),
    papel: z.enum(["ADMIN", "PROFESSOR"]).optional(),
    ativo: z.boolean().optional(),
    turmas: z.array(z.string().uuid()).optional(),
  })
  .refine((dados) => Object.values(dados).some((valor) => valor !== undefined), {
    message: "Nada a atualizar.",
  })
  .refine(
    (dados) => dados.turmas === undefined || new Set(dados.turmas).size === dados.turmas.length,
    { message: "Há turmas repetidas na lista." },
  );

interface LinhaUsuario {
  id: string;
  nome: string;
  email: string;
  papel: "ADMIN" | "PROFESSOR";
  ativo: boolean;
  atribuicoes: { turmaId: string }[];
}

function paraUsuario(linha: LinhaUsuario): UsuarioComTurmas {
  return {
    id: linha.id,
    nome: linha.nome,
    email: linha.email,
    papel: linha.papel,
    ativo: linha.ativo,
    turmas: linha.atribuicoes.map((atribuicao) => atribuicao.turmaId),
  };
}

const COM_TURMAS = { include: { atribuicoes: { select: { turmaId: true } } } } as const;

/** Lista todos os usuários, com as turmas atribuídas. */
export async function listarUsuarios(): Promise<UsuarioComTurmas[]> {
  const linhas = await banco().usuario.findMany({
    orderBy: [{ ativo: "desc" }, { nome: "asc" }],
    ...COM_TURMAS,
  });
  return linhas.map(paraUsuario);
}

/** Conta administradores ativos (para guarda do último root). */
async function totalDeAdminsAtivos(): Promise<number> {
  return banco().usuario.count({ where: { papel: "ADMIN", ativo: true } });
}

/** Cria um usuário com senha e, quando professor, as turmas atribuídas. */
export async function criarUsuario(admin: Identidade, entrada: unknown): Promise<UsuarioComTurmas> {
  const dados = esquemaCriarUsuario.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }

  const existente = await banco().usuario.findFirst({ where: { email: dados.data.email } });
  if (existente) {
    throw new ErroHttp("Já existe uma conta com este e-mail.", 409);
  }
  if (dados.data.turmas.length > 0) {
    const validas = await banco().turma.findMany({
      where: { id: { in: dados.data.turmas } },
      select: { id: true },
    });
    if (validas.length !== new Set(dados.data.turmas).size) {
      throw new ErroHttp("Há turmas na lista que não existem.", 400);
    }
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
        atribuicoes: {
          create: dados.data.turmas.map((turmaId) => ({ turmaId })),
        },
      },
      ...COM_TURMAS,
    });
    await auditar(tx, admin.id, "usuario.criar", `${dados.data.email} (${dados.data.papel})`);
    return criado;
  });
  return paraUsuario(linha);
}

/**
 * Atualiza um usuário: dados, senha (redefinição pelo administrador),
 * papel, situação e o conjunto completo de turmas atribuídas. Bloqueia
 * qualquer ação que deixe a escola sem administrador ativo.
 */
export async function atualizarUsuario(
  admin: Identidade,
  id: string,
  entrada: unknown,
): Promise<UsuarioComTurmas> {
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

  const alvo = await banco().usuario.findUnique({ where: { id }, ...COM_TURMAS });
  if (!alvo) throw new ErroHttp("Usuário não encontrado.", 404);

  if (alvo.papel === "ADMIN") {
    const rebaixa = dados.data.papel !== undefined && dados.data.papel !== "ADMIN";
    const desativa = dados.data.ativo === false;
    if (rebaixa || desativa) {
      const admins = await totalDeAdminsAtivos();
      const semAlvo = admins - (alvo.ativo ? 1 : 0);
      if (semAlvo < 1) {
        throw new ErroHttp(
          "A escola precisa de ao menos um administrador ativo. Crie outro administrador antes.",
          409,
        );
      }
    }
  }

  if (dados.data.email && dados.data.email !== alvo.email) {
    const duplicado = await banco().usuario.findFirst({ where: { email: dados.data.email } });
    if (duplicado) throw new ErroHttp("Já existe uma conta com este e-mail.", 409);
  }

  let novasTurmas: string[] | null = null;
  if (dados.data.turmas !== undefined) {
    if (dados.data.turmas.length > 0) {
      const validas = await banco().turma.findMany({
        where: { id: { in: dados.data.turmas } },
        select: { id: true },
      });
      if (validas.length !== new Set(dados.data.turmas).size) {
        throw new ErroHttp("Há turmas na lista que não existem.", 400);
      }
    }
    novasTurmas = dados.data.turmas;
  }

  const senhaHash = dados.data.senha ? await hashearSenha(dados.data.senha) : undefined;

  const linha = await comTransacao(async (tx) => {
    await tx.usuario.update({
      where: { id },
      data: {
        ...(dados.data.nome !== undefined ? { nome: dados.data.nome } : {}),
        ...(dados.data.email !== undefined ? { email: dados.data.email } : {}),
        ...(dados.data.papel !== undefined ? { papel: dados.data.papel } : {}),
        ...(dados.data.ativo !== undefined ? { ativo: dados.data.ativo } : {}),
        ...(senhaHash !== undefined ? { senhaHash } : {}),
      },
    });
    if (novasTurmas !== null) {
      const atuais = alvo.atribuicoes.map((atribuicao) => atribuicao.turmaId);
      const adicionar = novasTurmas.filter((turmaId) => !atuais.includes(turmaId));
      const remover = atuais.filter((turmaId) => !novasTurmas.includes(turmaId));
      if (adicionar.length > 0) {
        await tx.atribuicao.createMany({
          data: adicionar.map((turmaId) => ({ professorId: id, turmaId })),
        });
      }
      if (remover.length > 0) {
        await tx.atribuicao.deleteMany({
          where: { professorId: id, turmaId: { in: remover } },
        });
      }
    }
    if (dados.data.ativo === false) {
      await tx.sessao.deleteMany({ where: { usuarioId: id } });
    }
    const mudancas = [
      dados.data.nome !== undefined ? "nome" : null,
      dados.data.email !== undefined ? "e-mail" : null,
      dados.data.papel !== undefined ? "papel" : null,
      dados.data.ativo !== undefined ? "situação" : null,
      senhaHash !== undefined ? "senha" : null,
      novasTurmas !== null ? "turmas" : null,
    ].filter((parte): parte is string => parte !== null);
    await auditar(tx, admin.id, "usuario.atualizar", `${alvo.email} (${mudancas.join(", ")})`);
    // Releitura depois das atribuições: a resposta reflete o estado final.
    return tx.usuario.findUnique({ where: { id }, ...COM_TURMAS });
  });
  if (!linha) throw new ErroHttp("Usuário não encontrado.", 404);
  return paraUsuario(linha);
}

/**
 * Exclui um usuário. Bloqueado quando há frequências registradas: o
 * histórico da escola depende do professor que o registrou. Nesses
 * casos, o caminho é desativar a conta.
 */
export async function removerUsuario(admin: Identidade, id: string): Promise<void> {
  if (id === admin.id) {
    throw new ErroHttp("Você não pode excluir a sua própria conta. Use outro administrador.", 400);
  }
  const alvo = await banco().usuario.findUnique({
    where: { id },
    include: { _count: { select: { frequencias: true } } },
  });
  if (!alvo) throw new ErroHttp("Usuário não encontrado.", 404);
  if (alvo._count.frequencias > 0) {
    throw new ErroHttp(
      "Este professor tem frequências registradas e não pode ser excluído. Desative a conta para preservar o histórico.",
      409,
    );
  }
  if (alvo.papel === "ADMIN" && alvo.ativo) {
    const admins = await totalDeAdminsAtivos();
    if (admins <= 1) {
      throw new ErroHttp(
        "A escola precisa de ao menos um administrador ativo. Crie outro administrador antes.",
        409,
      );
    }
  }
  await comTransacao(async (tx) => {
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    await tx.atribuicao.deleteMany({ where: { professorId: id } });
    await tx.usuario.delete({ where: { id } });
    await auditar(tx, admin.id, "usuario.excluir", alvo.email);
  });
}
