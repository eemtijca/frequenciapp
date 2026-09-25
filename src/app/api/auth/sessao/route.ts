// Sessão corrente: identidade do usuário (com papel) ou null.
import { ambiente } from "@/infra/ambiente";
import { identidadeAtual } from "@/application/sessao";
import { json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const usuario = await identidadeAtual(ambiente.authSecret);
  return json({ usuario });
}
