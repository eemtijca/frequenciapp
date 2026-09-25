// Verificação de saúde: confirma que a aplicação responde e que o banco atende.
import { banco } from "@/infra/banco";
import { erroApi, json } from "@/infra/http";

export async function GET(): Promise<Response> {
  try {
    await banco().$queryRaw`select 1`;
    return json({ ok: true });
  } catch {
    return erroApi("O banco de dados não respondeu. Tente novamente em instantes.", 503);
  }
}
