// Verificação de saúde: confirma que a aplicação responde e que o banco atende.
import { banco } from "@/infra/banco";
import { erroApi, json } from "@/infra/http";
import { COMMIT, VERSAO } from "@/infra/versao";

export async function GET(): Promise<Response> {
  try {
    const cliente = banco();
    if (process.env.MIGRACAO_AUTOMATICA === "true") {
      // Usa o mesmo modelo que a aplicação lê na autenticação, sem devolver dados.
      await cliente.usuario.findUnique({
        where: { id: "00000000-0000-0000-0000-000000000000" },
        select: { id: true, email: true, ativo: true, papel: true },
      });
    } else {
      await cliente.$queryRaw`select 1`;
    }
    return json({ ok: true, versao: VERSAO, commit: COMMIT });
  } catch {
    return erroApi("O banco de dados não respondeu. Tente novamente em instantes.", 503);
  }
}
