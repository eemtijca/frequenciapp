// Sessão corrente: identidade ou null, com referência opaca sob demanda.
import { ambiente } from "@/infra/ambiente";
import { identidadeAtual, sessaoParaInterface } from "@/application/sessao";
import { executarRota, json } from "@/infra/http";

export const dynamic = "force-dynamic";

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (requisicao.headers.get("X-Frequenciapp-Referencia-Sessao") === "1") {
      const sessao = await sessaoParaInterface(ambiente.authSecret);
      return json(sessao ?? { usuario: null });
    }
    const usuario = await identidadeAtual(ambiente.authSecret);
    return json({ usuario });
  });
}
