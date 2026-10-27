// Confirmação da senha da própria conta para liberar ações sensíveis na interface.
import { z } from "zod";
import { banco } from "@/infra/banco";
import { conferirSenha } from "@/infra/auth/hash";
import { limiteDeTentativas, limparTentativas } from "@/infra/auth/limite";
import { ErroHttp } from "@/infra/erros";

const esquema = z.object({
  senha: z.string().min(1, "Informe a senha.").max(200, "A senha é longa demais."),
});

export async function confirmarSenhaDoUsuario(usuarioId: string, entrada: unknown): Promise<void> {
  const dados = esquema.safeParse(entrada);
  if (!dados.success) {
    throw new ErroHttp(dados.error.issues[0]?.message ?? "Informe a senha.", 400);
  }
  const chave = `conta:confirmar-senha:${usuarioId}`;
  if (!(await limiteDeTentativas(chave, 5))) {
    throw new ErroHttp("Muitas tentativas incorretas. Aguarde alguns minutos.", 429);
  }
  const usuario = await banco().usuario.findUnique({
    where: { id: usuarioId },
    select: { senhaHash: true },
  });
  if (!usuario || !(await conferirSenha(dados.data.senha, usuario.senhaHash))) {
    throw new ErroHttp("Senha incorreta.", 400);
  }
  await limparTentativas(chave);
}
