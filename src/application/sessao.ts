// Casos de uso de sessão: entrada, saída, identidade corrente e troca
// da própria senha.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { conferirSenha, hashearSenha } from "@/infra/auth/hash";
import {
  criarSessao,
  encerrarSessao,
  encerrarOutrasSessoes,
  sessaoAtual,
} from "@/infra/auth/sessao";
import { limiteDeTentativas, limparTentativas } from "@/infra/auth/limite";
import { comTransacao } from "@/infra/transacoes";
import { auditar } from "@/infra/auditoria";
import { ErroHttp } from "@/infra/erros";
import { problemaDeSenha } from "@/domain/usuarios";
import type { Identidade } from "@/domain/usuarios";

export const esquemaEntrada = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido."),
  senha: z.string().min(1, "Informe a senha."),
});

export const esquemaTrocarSenha = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  senhaNova: z.string().min(1, "Informe a nova senha."),
});

/** Autentica o usuário e cria a sessão (cookie HttpOnly). */
export async function entrar(
  entrada: unknown,
  segredo: string,
  ehProducao: boolean,
  origem: string,
): Promise<{ ok: true; usuario: Identidade } | { ok: false; erro: string; status: number }> {
  const dados = esquemaEntrada.safeParse(entrada);
  if (!dados.success) {
    return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos.", status: 400 };
  }
  const chave = `entrada:${origem}:${dados.data.email}`;
  if (!limiteDeTentativas(chave)) {
    return {
      ok: false,
      erro: "Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.",
      status: 429,
    };
  }
  const usuario = await banco().usuario.findFirst({ where: { email: dados.data.email } });
  if (!usuario || !(await conferirSenha(dados.data.senha, usuario.senhaHash))) {
    return { ok: false, erro: "E-mail ou senha incorretos.", status: 401 };
  }
  if (!usuario.ativo) {
    return {
      ok: false,
      erro: "Esta conta está desativada. Procure o administrador da escola.",
      status: 403,
    };
  }
  limparTentativas(chave);
  await criarSessao(usuario.id, segredo, ehProducao);
  return {
    ok: true,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      papel: usuario.papel,
      ativo: usuario.ativo,
    },
  };
}

export async function sair(segredo: string, ehProducao: boolean): Promise<void> {
  await encerrarSessao(segredo, ehProducao);
}

/** Identidade corrente ou null. */
export async function identidadeAtual(segredo: string): Promise<Identidade | null> {
  const sessao = await sessaoAtual(segredo);
  return sessao?.usuario ?? null;
}

/**
 * Troca a própria senha: exige a atual, aplica a política e encerra as
 * outras sessões abertas deste usuário em outros aparelhos.
 */
export async function trocarSenha(
  identidade: Identidade,
  entrada: unknown,
  segredo: string,
): Promise<void> {
  const dados = esquemaTrocarSenha.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Dados inválidos.", 400);
  }
  const problema = problemaDeSenha(dados.data.senhaNova);
  if (problema) throw new ErroHttp(problema, 400);

  const usuario = await banco().usuario.findUnique({ where: { id: identidade.id } });
  if (!usuario || !(await conferirSenha(dados.data.senhaAtual, usuario.senhaHash))) {
    throw new ErroHttp("A senha atual está incorreta.", 400);
  }
  const senhaHash = await hashearSenha(dados.data.senhaNova);
  await comTransacao(async (tx) => {
    await tx.usuario.update({ where: { id: identidade.id }, data: { senhaHash } });
    await auditar(tx, identidade.id, "conta.trocarSenha", identidade.email);
  });
  await encerrarOutrasSessoes(segredo, identidade.id);
}
