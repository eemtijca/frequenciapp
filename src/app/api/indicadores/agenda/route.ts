// Atualiza o retrato agregado pela agenda, independentemente da fila operacional.
import { atualizarIndicadores } from "@/application/indicadores";
import { segredoDaAgendaConfere } from "@/infra/web-push";
import { erroApi, executarRota, json } from "@/infra/http";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(requisicao: Request) {
  return executarRota(async () => {
    if (!segredoDaAgendaConfere(requisicao.headers.get("authorization")))
      return erroApi("Acesso não permitido.", 403);
    return json(await atualizarIndicadores({ agenda: true }));
  });
}
