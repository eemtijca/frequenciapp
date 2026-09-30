// Verificação periódica autenticada por segredo, com horário e escopo
// definidos no servidor; cookies não autorizam disparos.
import { enviarAvisosDaAgenda } from "@/application/notificacoes-agenda";
import { erroApi, executarRota, json } from "@/infra/http";
import { segredoDaAgendaConfere } from "@/infra/web-push";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(requisicao: Request) {
  return executarRota(async () => {
    if (!segredoDaAgendaConfere(requisicao.headers.get("authorization"))) {
      return erroApi("Acesso não permitido.", 403);
    }
    const resultado = await enviarAvisosDaAgenda();
    return json(resultado, resultado.falhas > 0 ? 503 : 200);
  });
}
