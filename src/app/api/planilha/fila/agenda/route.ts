// Recolhe os envios que sobraram na fila; autenticada por segredo, sem cookie.
import { processarFilaDaAgenda } from "@/application/fila-planilha";
import { erroApi, executarRota, json } from "@/infra/http";
import { segredoDaAgendaConfere } from "@/infra/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(requisicao: Request): Promise<Response> {
  return executarRota(async () => {
    if (!segredoDaAgendaConfere(requisicao.headers.get("authorization"))) {
      return erroApi("Acesso não permitido.", 403);
    }
    return json(await processarFilaDaAgenda());
  });
}
