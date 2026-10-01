// Confirmação da senha administrativa em ações sensíveis, com limite
// de tentativas compartilhado entre as instâncias do aplicativo.
import { banco } from "@/infra/banco";
import { conferirSenha } from "@/infra/auth/hash";
import { limiteDeTentativas, limparTentativas } from "@/infra/auth/limite";
import { ErroHttp } from "@/infra/erros";

export async function conferirSenhaDoAdmin(
  usuarioId: string,
  senha: string,
  chaveLimite: string,
): Promise<void> {
  const chave = `${chaveLimite}:${usuarioId}`;
  if (!(await limiteDeTentativas(chave, 5))) {
    throw new ErroHttp("Muitas tentativas incorretas. Aguarde alguns minutos.", 429);
  }
  const usuario = await banco().usuario.findUnique({ where: { id: usuarioId } });
  if (!usuario || !(await conferirSenha(senha, usuario.senhaHash))) {
    throw new ErroHttp("A senha do administrador está incorreta.", 400);
  }
  await limparTentativas(chave);
}
