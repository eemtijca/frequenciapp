// Verificação de saúde: confirma que a aplicação responde e que o banco atende.
import pacote from "../../../../package.json";
import { banco } from "@/infra/banco";
import { erroApi, json } from "@/infra/http";

// Revisão implantada, útil para conferir o deploy em qualquer provedor.
const COMMIT = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? "local";

export async function GET(): Promise<Response> {
  try {
    await banco().$queryRaw`select 1`;
    return json({ ok: true, versao: pacote.version, commit: COMMIT });
  } catch {
    return erroApi("O banco de dados não respondeu. Tente novamente em instantes.", 503);
  }
}
