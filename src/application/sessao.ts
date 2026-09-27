// Casos de uso de sessão: entrada, saída, identidade corrente e troca
// da própria senha. A equipe entra por e-mail; o diretor de turma, pelo
// identificador e pela palavra-chave, dentro do ciclo de vida da ADR-021.
import { randomBytes } from "node:crypto";
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
import {
  credencialPermiteEntrada,
  estadoDaCredencial,
  mensagemDeCredencialRecusada,
  normalizarLogin,
} from "@/domain/diretores";
import { lerParametrosAcesso } from "@/application/parametros-acesso";

const MINUTO_MS = 60 * 1000;
const HORA_MS = 60 * MINUTO_MS;
const DIA_MS = 24 * HORA_MS;

/**
 * Entrada por e-mail (equipe) ou identificador (diretor de turma). O campo
 * novo é `login`; `email` continua aceito para clientes antigos.
 */
export const esquemaEntrada = z
  .object({
    login: z.string().optional(),
    email: z.string().optional(),
    senha: z.string().min(1, "Informe a senha."),
    // Sem o campo, a sessão continua lembrada por 30 dias, como antes.
    lembrar: z.boolean().optional().default(true),
  })
  .transform((dados, contexto) => {
    const login = normalizarLogin(dados.login ?? dados.email ?? "");
    if (login.length < 3 || login.length > 200) {
      contexto.addIssue({ code: "custom", message: "Informe o e-mail ou o identificador." });
      return z.NEVER;
    }
    return { login, senha: dados.senha, lembrar: dados.lembrar };
  });

export const esquemaTrocarSenha = z.object({
  senhaAtual: z.string().min(1, "Informe a senha atual."),
  senhaNova: z.string().min(1, "Informe a nova senha."),
});

// Hash descartável usado quando o e-mail não existe: mantém o custo do scrypt
// e evita revelar a existência da conta pelo tempo de resposta.
let hashDescartavel: Promise<string> | null = null;
function hashDeComparacao(): Promise<string> {
  hashDescartavel ??= hashearSenha(randomBytes(16).toString("hex"));
  return hashDescartavel;
}

/** Autentica o usuário e cria a sessão (cookie HttpOnly). */
export async function entrar(
  entrada: unknown,
  segredo: string,
  cookiesSeguros: boolean,
  origem: string,
): Promise<{ ok: true; usuario: Identidade } | { ok: false; erro: string; status: number }> {
  const dados = esquemaEntrada.safeParse(entrada);
  if (!dados.success) {
    return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos.", status: 400 };
  }
  const parametros = await lerParametrosAcesso();
  const janelaMs = parametros.janelaMinutos * MINUTO_MS;
  const chaveOrigem = `entrada:ip:${origem}:${dados.data.login}`;
  const chaveEmail = `entrada:email:${dados.data.login}`;
  if (
    !(await limiteDeTentativas(chaveOrigem, parametros.tentativasPorOrigem, janelaMs)) ||
    !(await limiteDeTentativas(chaveEmail, parametros.tentativasPorLogin, janelaMs))
  ) {
    return {
      ok: false,
      erro: "Muitas tentativas incorretas. Aguarde alguns minutos e tente novamente.",
      status: 429,
    };
  }
  const usuario = await banco().usuario.findFirst({ where: { email: dados.data.login } });
  if (!usuario) {
    await conferirSenha(dados.data.senha, await hashDeComparacao());
    return { ok: false, erro: "E-mail, identificador ou senha incorretos.", status: 401 };
  }
  if (!(await conferirSenha(dados.data.senha, usuario.senhaHash))) {
    return { ok: false, erro: "E-mail, identificador ou senha incorretos.", status: 401 };
  }
  if (!usuario.ativo) {
    return {
      ok: false,
      erro: "Esta conta está desativada. Procure o administrador da escola.",
      status: 403,
    };
  }
  // O estado da palavra-chave só é revelado a quem acertou a palavra.
  let expiraAte: Date | undefined;
  if (usuario.papel === "DIRETOR_TURMA") {
    const credencial = await banco().credencialDiretor.findUnique({
      where: { usuarioId: usuario.id },
    });
    const estado = estadoDaCredencial(credencial, new Date());
    if (!credencial || !credencialPermiteEntrada(estado)) {
      return { ok: false, erro: mensagemDeCredencialRecusada(estado), status: 403 };
    }
    const limiteDaSessao = Date.now() + parametros.sessaoDiretorHoras * HORA_MS;
    expiraAte = new Date(Math.min(limiteDaSessao, credencial.expiraEm.getTime()));
    if (!credencial.primeiroUsoEm) {
      await banco().credencialDiretor.update({
        where: { usuarioId: usuario.id },
        data: { primeiroUsoEm: new Date() },
      });
    }
  }
  await limparTentativas(chaveOrigem);
  await limparTentativas(chaveEmail);
  await criarSessao(usuario.id, segredo, cookiesSeguros, dados.data.lembrar, expiraAte);
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

export async function sair(segredo: string, cookiesSeguros: boolean): Promise<void> {
  await encerrarSessao(segredo, cookiesSeguros);
}

/** Identidade corrente ou null. */
export async function identidadeAtual(segredo: string): Promise<Identidade | null> {
  const sessao = await sessaoAtual(segredo);
  return sessao?.usuario ?? null;
}

/**
 * Troca a própria senha: exige a atual, aplica a política e encerra as
 * outras sessões abertas deste usuário em outros dispositivos.
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
  const ehDiretor = identidade.papel === "DIRETOR_TURMA";
  if (ehDiretor && dados.data.senhaNova === dados.data.senhaAtual) {
    throw new ErroHttp("A nova palavra-chave precisa ser diferente da atual.", 400);
  }
  const validadeDias = ehDiretor ? (await lerParametrosAcesso()).validadePalavraDias : 0;
  const senhaHash = await hashearSenha(dados.data.senhaNova);
  await comTransacao(async (tx) => {
    await tx.usuario.update({ where: { id: identidade.id }, data: { senhaHash } });
    // Trocar a palavra-chave encerra a troca obrigatória e renova a validade.
    if (ehDiretor) {
      await tx.credencialDiretor.update({
        where: { usuarioId: identidade.id },
        data: {
          trocaObrigatoria: false,
          expiraEm: new Date(Date.now() + validadeDias * DIA_MS),
        },
      });
    }
    await auditar(tx, identidade.id, "conta.trocarSenha", identidade.email);
  });
  await encerrarOutrasSessoes(segredo, identidade.id);
}
