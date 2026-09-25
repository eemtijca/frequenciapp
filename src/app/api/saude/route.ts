// Verificação de saúde: confirma que a aplicação responde.
import { json } from "@/infra/http";

export async function GET(): Promise<Response> {
  return json({ ok: true });
}
